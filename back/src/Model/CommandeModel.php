<?php

declare(strict_types=1);

namespace App\Model;

use DomainException;
use PDO;
use Throwable;

/**
 * Accès aux données des commandes et de leurs lignes (US CMD-a).
 *
 * C'est ici que la commande est enregistrée, en une seule transaction : les
 * prix sont relus en base, jamais pris dans la requête.
 */
final class CommandeModel
{
    /** Statut d'une commande qui vient d'être validée. */
    private const STATUT_INITIAL = 'en_cours';

    /** Statut qui rend le stock des lignes (US STK-a). */
    private const STATUT_ANNULEE = 'annulee';

    /** Statuts qu'une commande peut prendre (liste blanche). */
    private const STATUTS = ['en_cours', 'prete', 'retiree', 'annulee'];

    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Enregistre une commande : la commande et toutes ses lignes, ou rien.
     *
     * Les variantes sont relues dans la transaction (avec un verrou d'écriture :
     * deux commandes simultanées se mettent en file, la seconde voit le stock
     * laissé par la première) et leur nom, format et prix sont copiés dans les
     * lignes. Les options de chaque ligne (US OPT-a) sont contrôlées d'après la
     * base : elles doivent appartenir au produit, un groupe à choix unique n'en
     * reçoit qu'un, un groupe obligatoire en reçoit au moins un. Leur libellé et
     * leur supplément sont figés avec la ligne, le prix unitaire les comprend.
     * Une même variante peut figurer sur plusieurs lignes (options différentes) :
     * le stock est contrôlé, décrémenté et journalisé une fois par variante, sur
     * la somme des quantités (US STK-a). Le numéro est fabriqué avec
     * l'identifiant de la commande : CC-2026-000123.
     *
     * @param int $utilisateurId Identifiant du client connecté.
     * @param array<int, array{variantId:int, quantite:int, options?:array<int, int>}> $lignes
     *        Lignes déjà validées (entiers positifs, couples variante + options distincts).
     * @return array{numero:string, statut:string, totalCents:int}
     * @throws DomainException Si une variante ou une option n'existe plus, ou si le stock manque.
     */
    public function creer(int $utilisateurId, array $lignes): array
    {
        $this->pdo->beginTransaction();

        try {
            $variantes = $this->lireVariantes(
                array_values(array_unique(array_map(static fn (array $ligne): int => $ligne['variantId'], $lignes)))
            );
            $choix = $this->lireChoix(
                array_values(array_unique(array_merge([], ...array_map(
                    static fn (array $ligne): array => $ligne['options'] ?? [],
                    $lignes
                ))))
            );
            $obligatoires = $this->lireGroupesObligatoires(
                array_values(array_unique(array_map(
                    static fn (array $variante): int => $variante['produit_id'],
                    $variantes
                )))
            );

            $detail = array_map(
                fn (array $ligne): array => $this->detaillerLigne($ligne, $variantes, $choix, $obligatoires),
                $lignes
            );

            // Le stock est porté par la variante : on additionne les lignes qui la partagent.
            $demandes = array_reduce(
                $detail,
                static function (array $somme, array $ligne): array {
                    $somme[$ligne['variante']['id']] = ($somme[$ligne['variante']['id']] ?? 0) + $ligne['quantite'];

                    return $somme;
                },
                []
            );
            ksort($demandes);

            array_map(
                static function (int $id, int $demande) use ($variantes): void {
                    if ($variantes[$id]['stock'] < $demande) {
                        throw new DomainException(
                            'Stock insuffisant pour « ' . $variantes[$id]['nom'] . ' » (' . $variantes[$id]['libelle']
                            . ') : il en reste ' . $variantes[$id]['stock'] . '. Retourne au panier pour ajuster la quantité.'
                        );
                    }
                },
                array_keys($demandes),
                $demandes
            );

            $total = array_reduce(
                $detail,
                static fn (int $somme, array $ligne): int => $somme + $ligne['prix_unitaire'] * $ligne['quantite'],
                0
            );

            // Numéro provisoire unique : le vrai dépend de l'identifiant que la
            // base attribue à l'insertion.
            $insertion = $this->pdo->prepare(
                'INSERT INTO commande (numero, utilisateur_id, statut, total_cents)
                 VALUES (:numero, :utilisateur, :statut, :total)'
            );
            $insertion->execute([
                'numero'      => 'TMP-' . bin2hex(random_bytes(8)),
                'utilisateur' => $utilisateurId,
                'statut'      => self::STATUT_INITIAL,
                'total'       => $total,
            ]);
            $commandeId = (int) $this->pdo->lastInsertId();
            $numero     = sprintf('CC-%s-%06d', date('Y'), $commandeId);

            $this->pdo
                ->prepare('UPDATE commande SET numero = :numero WHERE id = :id')
                ->execute(['numero' => $numero, 'id' => $commandeId]);

            $ligneSql = $this->pdo->prepare(
                'INSERT INTO ligne_commande
                        (commande_id, variante_id, produit_nom, variante_libelle, prix_unitaire_cents, quantite)
                 VALUES (:commande, :variante, :nom, :libelle, :prix, :quantite)'
            );
            $optionSql = $this->pdo->prepare(
                'INSERT INTO ligne_commande_option (ligne_id, groupe_libelle, choix_libelle, supplement_cents)
                 VALUES (:ligne, :groupe, :choix, :supplement)'
            );

            // Une boucle for : il faut l'identifiant de chaque ligne pour lui rattacher ses options.
            for ($i = 0; $i < count($detail); $i++) {
                $ligne = $detail[$i];
                $ligneSql->execute([
                    'commande' => $commandeId,
                    'variante' => $ligne['variante']['id'],
                    'nom'      => $ligne['variante']['nom'],
                    'libelle'  => $ligne['variante']['libelle'],
                    'prix'     => $ligne['prix_unitaire'],
                    'quantite' => $ligne['quantite'],
                ]);
                $ligneId = (int) $this->pdo->lastInsertId();

                array_map(
                    static fn (array $option): bool => $optionSql->execute([
                        'ligne'      => $ligneId,
                        'groupe'     => $option['groupe_libelle'],
                        'choix'      => $option['libelle'],
                        'supplement' => $option['supplement_cents'],
                    ]),
                    $ligne['choix']
                );
            }

            array_map(
                fn (int $id, int $demande) => $this->mouvementer($commandeId, $id, 'sortie', $demande),
                array_keys($demandes),
                $demandes
            );

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['numero' => $numero, 'statut' => self::STATUT_INITIAL, 'totalCents' => $total];
    }

    /**
     * Change le statut d'une commande : c'est la SEULE porte d'entrée pour le
     * faire, donc le seul endroit où le stock est recrédité (US STK-a).
     *
     * Le stock des lignes est rendu (et journalisé) uniquement au passage à
     * « annulee » ; tout autre changement laisse le stock intact. Tout se passe
     * dans une transaction : si un recrédit échoue, le statut n'est pas changé.
     * La commande est verrouillée, donc deux annulations simultanées ne rendent
     * le stock qu'une fois.
     *
     * @param int $commandeId Identifiant de la commande.
     * @param string $statut Nouveau statut (en_cours, prete, retiree ou annulee).
     * @throws DomainException Si le statut est inconnu, la commande introuvable ou
     *                         la transition interdite (une commande annulée ou
     *                         déjà retirée ne peut plus être annulée).
     */
    public function changerStatut(int $commandeId, string $statut): void
    {
        if (!in_array($statut, self::STATUTS, true)) {
            throw new DomainException('Statut de commande inconnu.');
        }

        $this->pdo->beginTransaction();

        try {
            $requete = $this->pdo->prepare('SELECT statut FROM commande WHERE id = :id FOR UPDATE');
            $requete->execute(['id' => $commandeId]);
            $actuel = $requete->fetchColumn();

            if ($actuel === false) {
                throw new DomainException('Commande introuvable.');
            }

            if ($actuel === self::STATUT_ANNULEE && $statut !== self::STATUT_ANNULEE) {
                throw new DomainException('Une commande annulée ne peut plus changer de statut.');
            }

            if ($statut === self::STATUT_ANNULEE && $actuel !== self::STATUT_ANNULEE) {
                if ($actuel === 'retiree') {
                    throw new DomainException('Une commande déjà retirée ne peut pas être annulée.');
                }

                $this->recrediter($commandeId);
            }

            $this->pdo
                ->prepare('UPDATE commande SET statut = :statut WHERE id = :id')
                ->execute(['statut' => $statut, 'id' => $commandeId]);

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Compteurs des commandes pour le tableau de bord du back-office.
     *
     * @return array{total:int, aujourdhui:int, enCours:int}
     *         total : toutes les commandes ; aujourdhui : créées aujourd'hui ;
     *         enCours : encore au statut « en_cours » (à préparer).
     */
    public function statistiques(): array
    {
        $ligne = $this->pdo->query(
            "SELECT COUNT(*)                                          AS total,
                    COALESCE(SUM(DATE(cree_le) = CURDATE()), 0)       AS aujourdhui,
                    COALESCE(SUM(statut = 'en_cours'), 0)             AS en_cours
               FROM commande"
        )->fetch();

        return [
            'total'      => (int) $ligne['total'],
            'aujourdhui' => (int) $ligne['aujourdhui'],
            'enCours'    => (int) $ligne['en_cours'],
        ];
    }

    /**
     * Une commande et ses lignes, retrouvées par leur numéro. Seul le client qui
     * l'a passée peut la lire : pour tout autre, elle n'existe pas.
     *
     * @param string $numero Numéro de la commande (ex. CC-2026-000123).
     * @param int $utilisateurId Identifiant du client connecté.
     * @return array{numero:string, statut:string, totalCents:int, creeLe:string,
     *               lignes:array<int, array{produit:string, libelle:string, prixUnitaireCents:int,
     *               quantite:int, totalCents:int,
     *               options:array<int, array{groupe:string, libelle:string, supplementCents:int}>}>}|null
     *         null si le numéro est inconnu ou appartient à un autre client. Le prix
     *         unitaire d'une ligne comprend les suppléments de ses options.
     */
    public function findByNumero(string $numero, int $utilisateurId): ?array
    {
        $requete = $this->pdo->prepare(
            'SELECT id, numero, statut, total_cents, cree_le
               FROM commande
              WHERE numero = :numero AND utilisateur_id = :utilisateur'
        );
        $requete->execute(['numero' => $numero, 'utilisateur' => $utilisateurId]);
        $commande = $requete->fetch();

        if ($commande === false) {
            return null;
        }

        $lignes = $this->pdo->prepare(
            'SELECT id, produit_nom, variante_libelle, prix_unitaire_cents, quantite
               FROM ligne_commande
              WHERE commande_id = :commande
           ORDER BY id'
        );
        $lignes->execute(['commande' => $commande['id']]);

        $options = $this->pdo->prepare(
            'SELECT ligne_commande_option.ligne_id,
                    ligne_commande_option.groupe_libelle,
                    ligne_commande_option.choix_libelle,
                    ligne_commande_option.supplement_cents
               FROM ligne_commande_option
         INNER JOIN ligne_commande ON ligne_commande.id = ligne_commande_option.ligne_id
              WHERE ligne_commande.commande_id = :commande
           ORDER BY ligne_commande_option.id'
        );
        $options->execute(['commande' => $commande['id']]);
        $toutesOptions = $options->fetchAll();

        return [
            'numero'     => $commande['numero'],
            'statut'     => $commande['statut'],
            'totalCents' => (int) $commande['total_cents'],
            'creeLe'     => $commande['cree_le'],
            'lignes'     => array_map(
                static fn (array $ligne): array => [
                    'produit'           => $ligne['produit_nom'],
                    'libelle'           => $ligne['variante_libelle'],
                    'prixUnitaireCents' => (int) $ligne['prix_unitaire_cents'],
                    'quantite'          => (int) $ligne['quantite'],
                    'totalCents'        => (int) $ligne['prix_unitaire_cents'] * (int) $ligne['quantite'],
                    'options'           => array_values(array_map(
                        static fn (array $option): array => [
                            'groupe'          => $option['groupe_libelle'],
                            'libelle'         => $option['choix_libelle'],
                            'supplementCents' => (int) $option['supplement_cents'],
                        ],
                        array_filter(
                            $toutesOptions,
                            static fn (array $option): bool => (int) $option['ligne_id'] === (int) $ligne['id']
                        )
                    )),
                ],
                $lignes->fetchAll()
            ),
        ];
    }

    /**
     * Les dernières commandes d'un client, de la plus récente à la plus ancienne.
     *
     * @param int $utilisateurId Identifiant du client connecté.
     * @param int $limite Nombre maximal de commandes renvoyées.
     * @return array<int, array{numero:string, statut:string, totalCents:int, creeLe:string}>
     */
    public function findRecentes(int $utilisateurId, int $limite): array
    {
        $requete = $this->pdo->prepare(
            'SELECT numero, statut, total_cents, cree_le
               FROM commande
              WHERE utilisateur_id = :utilisateur
           ORDER BY cree_le DESC, id DESC
              LIMIT :limite'
        );
        $requete->bindValue('utilisateur', $utilisateurId, PDO::PARAM_INT);
        $requete->bindValue('limite', $limite, PDO::PARAM_INT);
        $requete->execute();

        return array_map(
            static fn (array $ligne): array => [
                'numero'     => $ligne['numero'],
                'statut'     => $ligne['statut'],
                'totalCents' => (int) $ligne['total_cents'],
                'creeLe'     => $ligne['cree_le'],
            ],
            $requete->fetchAll()
        );
    }

    /**
     * Le nombre total de commandes d'un client.
     */
    public function countByUtilisateur(int $utilisateurId): int
    {
        $requete = $this->pdo->prepare(
            'SELECT COUNT(*) FROM commande WHERE utilisateur_id = :utilisateur'
        );
        $requete->execute(['utilisateur' => $utilisateurId]);

        return (int) $requete->fetchColumn();
    }

    /**
     * Rend au stock les quantités d'une commande annulée, variante par variante
     * (les lignes qui partagent une variante, avec des options différentes, sont additionnées).
     * À appeler dans une transaction ouverte.
     *
     * @param int $commandeId Identifiant de la commande annulée.
     */
    private function recrediter(int $commandeId): void
    {
        // Les lignes dont la variante a été supprimée n'ont plus de stock à rendre.
        $requete = $this->pdo->prepare(
            'SELECT variante_id, SUM(quantite) AS quantite
               FROM ligne_commande
              WHERE commande_id = :commande AND variante_id IS NOT NULL
           GROUP BY variante_id
           ORDER BY variante_id'
        );
        $requete->execute(['commande' => $commandeId]);

        array_map(
            fn (array $ligne) => $this->mouvementer(
                $commandeId,
                (int) $ligne['variante_id'],
                'retour',
                (int) $ligne['quantite']
            ),
            $requete->fetchAll()
        );
    }

    /**
     * Déplace le stock d'une variante et l'inscrit au journal, dans la
     * transaction en cours : c'est l'unique endroit qui écrit le stock.
     *
     * La variante est verrouillée avant la lecture. Une sortie n'est exécutée
     * que si le stock suffit (`stock >= quantité`), sinon rien n'est écrit.
     *
     * @param int $commandeId Commande à l'origine du mouvement.
     * @param int $varianteId Variante dont le stock bouge.
     * @param string $type « sortie » (validation) ou « retour » (annulation).
     * @param int $quantite Quantité déplacée, toujours positive.
     * @throws DomainException Si le stock est insuffisant ou la variante absente.
     */
    private function mouvementer(int $commandeId, int $varianteId, string $type, int $quantite): void
    {
        $lecture = $this->pdo->prepare('SELECT stock FROM variante WHERE id = :id FOR UPDATE');
        $lecture->execute(['id' => $varianteId]);
        $avant = $lecture->fetchColumn();

        if ($avant === false) {
            throw new DomainException('Une variante de la commande n\'existe plus.');
        }

        $avant = (int) $avant;
        $apres = $type === 'sortie' ? $avant - $quantite : $avant + $quantite;

        if ($apres < 0) {
            throw new DomainException('Stock insuffisant : la commande ne peut pas être validée.');
        }

        // La condition « stock = :avant » est redondante avec le verrou : elle
        // garantit qu'aucune autre écriture n'a glissé entre lecture et mise à jour.
        $miseAJour = $this->pdo->prepare('UPDATE variante SET stock = :apres WHERE id = :id AND stock = :avant');
        $miseAJour->execute(['apres' => $apres, 'id' => $varianteId, 'avant' => $avant]);

        if ($miseAJour->rowCount() !== 1) {
            throw new DomainException('Le stock a changé pendant la commande, réessaie.');
        }

        $this->pdo
            ->prepare(
                'INSERT INTO mouvement_stock (variante_id, commande_id, type, quantite, stock_avant, stock_apres)
                 VALUES (:variante, :commande, :type, :quantite, :avant, :apres)'
            )
            ->execute([
                'variante' => $varianteId,
                'commande' => $commandeId,
                'type'     => $type,
                'quantite' => $quantite,
                'avant'    => $avant,
                'apres'    => $apres,
            ]);
    }

    /**
     * Les variantes demandées, avec le nom de leur produit, verrouillées en
     * écriture jusqu'à la fin de la transaction (par identifiant croissant, pour
     * que deux commandes ne s'attendent jamais l'une l'autre).
     *
     * @param array<int, int> $ids Identifiants de variantes.
     * @return array<int, array{id:int, libelle:string, prix_cents:int, stock:int, produit_id:int, nom:string}>
     *         Indexé par identifiant de variante.
     */
    private function lireVariantes(array $ids): array
    {
        // Un « ? » par identifiant : les valeurs restent des paramètres liés.
        $marqueurs = implode(',', array_fill(0, count($ids), '?'));

        $requete = $this->pdo->prepare(
            'SELECT variante.id, variante.libelle, variante.prix_cents, variante.stock,
                    produit.id AS produit_id, produit.nom
               FROM variante
         INNER JOIN produit ON produit.id = variante.produit_id
              WHERE variante.id IN (' . $marqueurs . ')
           ORDER BY variante.id
                FOR UPDATE'
        );
        $requete->execute(array_values($ids));

        $lignes = $requete->fetchAll();

        return array_combine(
            array_map(static fn (array $ligne): int => (int) $ligne['id'], $lignes),
            array_map(
                static fn (array $ligne): array => [
                    'id'         => (int) $ligne['id'],
                    'libelle'    => $ligne['libelle'],
                    'prix_cents' => (int) $ligne['prix_cents'],
                    'stock'      => (int) $ligne['stock'],
                    'produit_id' => (int) $ligne['produit_id'],
                    'nom'        => $ligne['nom'],
                ],
                $lignes
            )
        );
    }

    /**
     * Les choix d'options demandés, avec leur groupe et le produit auquel ils
     * appartiennent. Un identifiant inconnu est simplement absent du résultat.
     *
     * @param array<int, int> $ids Identifiants de choix.
     * @return array<int, array{id:int, libelle:string, supplement_cents:int, groupe_id:int,
     *                          groupe_libelle:string, multiple:bool, produit_id:int}>
     *         Indexé par identifiant de choix.
     */
    private function lireChoix(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        // Un « ? » par identifiant : les valeurs restent des paramètres liés.
        $marqueurs = implode(',', array_fill(0, count($ids), '?'));

        $requete = $this->pdo->prepare(
            'SELECT option_choix.id,
                    option_choix.libelle,
                    option_choix.supplement_cents,
                    option_groupe.id        AS groupe_id,
                    option_groupe.libelle   AS groupe_libelle,
                    option_groupe.multiple,
                    option_groupe.produit_id
               FROM option_choix
         INNER JOIN option_groupe ON option_groupe.id = option_choix.groupe_id
              WHERE option_choix.id IN (' . $marqueurs . ')'
        );
        $requete->execute(array_values($ids));
        $lignes = $requete->fetchAll();

        return array_combine(
            array_map(static fn (array $ligne): int => (int) $ligne['id'], $lignes),
            array_map(
                static fn (array $ligne): array => [
                    'id'               => (int) $ligne['id'],
                    'libelle'          => $ligne['libelle'],
                    'supplement_cents' => (int) $ligne['supplement_cents'],
                    'groupe_id'        => (int) $ligne['groupe_id'],
                    'groupe_libelle'   => $ligne['groupe_libelle'],
                    'multiple'         => (bool) $ligne['multiple'],
                    'produit_id'       => (int) $ligne['produit_id'],
                ],
                $lignes
            )
        );
    }

    /**
     * Les groupes d'options obligatoires des produits demandés.
     *
     * @param array<int, int> $produitIds Identifiants de produits.
     * @return array<int, array{id:int, produit_id:int, libelle:string}>
     */
    private function lireGroupesObligatoires(array $produitIds): array
    {
        if ($produitIds === []) {
            return [];
        }

        $marqueurs = implode(',', array_fill(0, count($produitIds), '?'));

        $requete = $this->pdo->prepare(
            'SELECT id, produit_id, libelle
               FROM option_groupe
              WHERE obligatoire = 1 AND produit_id IN (' . $marqueurs . ')'
        );
        $requete->execute(array_values($produitIds));

        return array_map(
            static fn (array $ligne): array => [
                'id'         => (int) $ligne['id'],
                'produit_id' => (int) $ligne['produit_id'],
                'libelle'    => $ligne['libelle'],
            ],
            $requete->fetchAll()
        );
    }

    /**
     * Contrôle une ligne de commande d'après la base et calcule son prix.
     *
     * @param array{variantId:int, quantite:int, options?:array<int, int>} $ligne La ligne reçue.
     * @param array<int, array{id:int, libelle:string, prix_cents:int, stock:int, produit_id:int, nom:string}> $variantes
     *        Les variantes lues, indexées par identifiant.
     * @param array<int, array{id:int, libelle:string, supplement_cents:int, groupe_id:int,
     *                         groupe_libelle:string, multiple:bool, produit_id:int}> $choix
     *        Les choix lus, indexés par identifiant.
     * @param array<int, array{id:int, produit_id:int, libelle:string}> $obligatoires
     *        Les groupes obligatoires des produits commandés.
     * @return array{variante:array<string, mixed>, quantite:int, choix:array<int, array<string, mixed>>, prix_unitaire:int}
     *         prix_unitaire : prix du format plus suppléments, en centimes.
     * @throws DomainException Si la variante n'existe plus ou si les options sont invalides.
     */
    private function detaillerLigne(array $ligne, array $variantes, array $choix, array $obligatoires): array
    {
        $variante = $variantes[$ligne['variantId']] ?? null;

        if ($variante === null) {
            throw new DomainException(
                'Un article de ton panier n\'est plus proposé. Retourne au panier pour le mettre à jour.'
            );
        }

        $invalide = new DomainException(
            'Les options de « ' . $variante['nom'] . ' » (' . $variante['libelle']
            . ') ne sont plus valides. Retourne au panier pour les mettre à jour.'
        );

        $retenus = array_map(
            static fn (int $id): ?array => $choix[$id] ?? null,
            $ligne['options'] ?? []
        );

        // Un choix inconnu ou rattaché à un autre produit : refus.
        if (in_array(null, $retenus, true)
            || array_filter($retenus, static fn (array $c): bool => $c['produit_id'] !== $variante['produit_id']) !== []) {
            throw $invalide;
        }

        // Un groupe à choix unique n'accepte qu'un choix.
        $parGroupe = array_count_values(array_map(static fn (array $c): int => $c['groupe_id'], $retenus));
        $trop = array_filter(
            $retenus,
            static fn (array $c): bool => !$c['multiple'] && $parGroupe[$c['groupe_id']] > 1
        );

        // Un groupe obligatoire du produit doit avoir au moins un choix.
        $manquants = array_filter(
            $obligatoires,
            static fn (array $groupe): bool => $groupe['produit_id'] === $variante['produit_id']
                && !isset($parGroupe[$groupe['id']])
        );

        if ($trop !== [] || $manquants !== []) {
            throw $invalide;
        }

        $supplements = array_reduce(
            $retenus,
            static fn (int $somme, array $c): int => $somme + $c['supplement_cents'],
            0
        );

        return [
            'variante'      => $variante,
            'quantite'      => $ligne['quantite'],
            'choix'         => array_map(
                static fn (array $c): array => [
                    'groupe_libelle'   => $c['groupe_libelle'],
                    'libelle'          => $c['libelle'],
                    'supplement_cents' => $c['supplement_cents'],
                ],
                $retenus
            ),
            'prix_unitaire' => $variante['prix_cents'] + $supplements,
        ];
    }
}
