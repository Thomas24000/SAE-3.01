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
     * lignes. Le stock de chaque variante est décrémenté et journalisé dans la
     * même transaction (US STK-a). Le numéro est fabriqué avec l'identifiant de
     * la commande : CC-2026-000123.
     *
     * @param int $utilisateurId Identifiant du client connecté.
     * @param array<int, array{variantId:int, quantite:int}> $lignes Lignes déjà validées (entiers positifs, variantes distinctes).
     * @return array{numero:string, statut:string, totalCents:int}
     * @throws DomainException Si une variante n'existe plus ou n'a plus assez de stock.
     */
    public function creer(int $utilisateurId, array $lignes): array
    {
        $this->pdo->beginTransaction();

        try {
            $variantes = $this->lireVariantes(
                array_map(static fn (array $ligne): int => $ligne['variantId'], $lignes)
            );

            $detail = array_map(
                static function (array $ligne) use ($variantes): array {
                    $variante = $variantes[$ligne['variantId']] ?? null;

                    if ($variante === null) {
                        throw new DomainException(
                            'Un article de ton panier n\'est plus proposé. Retourne au panier pour le mettre à jour.'
                        );
                    }

                    if ($variante['stock'] < $ligne['quantite']) {
                        throw new DomainException(
                            'Stock insuffisant pour « ' . $variante['nom'] . ' » (' . $variante['libelle']
                            . ') : il en reste ' . $variante['stock'] . '. Retourne au panier pour ajuster la quantité.'
                        );
                    }

                    return $variante + ['quantite' => $ligne['quantite']];
                },
                $lignes
            );

            $total = array_reduce(
                $detail,
                static fn (int $somme, array $ligne): int => $somme + $ligne['prix_cents'] * $ligne['quantite'],
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
            array_map(
                static fn (array $ligne): bool => $ligneSql->execute([
                    'commande' => $commandeId,
                    'variante' => $ligne['id'],
                    'nom'      => $ligne['nom'],
                    'libelle'  => $ligne['libelle'],
                    'prix'     => $ligne['prix_cents'],
                    'quantite' => $ligne['quantite'],
                ]),
                $detail
            );

            array_map(
                fn (array $ligne) => $this->mouvementer($commandeId, $ligne['id'], 'sortie', $ligne['quantite']),
                $detail
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
     *               quantite:int, totalCents:int}>}|null
     *         null si le numéro est inconnu ou appartient à un autre client.
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
            'SELECT produit_nom, variante_libelle, prix_unitaire_cents, quantite
               FROM ligne_commande
              WHERE commande_id = :commande
           ORDER BY id'
        );
        $lignes->execute(['commande' => $commande['id']]);

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
                ],
                $lignes->fetchAll()
            ),
        ];
    }

    /**
     * Rend au stock les quantités d'une commande annulée, ligne par ligne.
     * À appeler dans une transaction ouverte.
     *
     * @param int $commandeId Identifiant de la commande annulée.
     */
    private function recrediter(int $commandeId): void
    {
        // Les lignes dont la variante a été supprimée n'ont plus de stock à rendre.
        $requete = $this->pdo->prepare(
            'SELECT variante_id, quantite
               FROM ligne_commande
              WHERE commande_id = :commande AND variante_id IS NOT NULL
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
     * @return array<int, array{id:int, libelle:string, prix_cents:int, stock:int, nom:string}> Indexé par identifiant de variante.
     */
    private function lireVariantes(array $ids): array
    {
        // Un « ? » par identifiant : les valeurs restent des paramètres liés.
        $marqueurs = implode(',', array_fill(0, count($ids), '?'));

        $requete = $this->pdo->prepare(
            'SELECT variante.id, variante.libelle, variante.prix_cents, variante.stock, produit.nom
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
                    'nom'        => $ligne['nom'],
                ],
                $lignes
            )
        );
    }
}
