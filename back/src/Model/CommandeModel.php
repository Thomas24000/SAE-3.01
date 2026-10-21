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
    public const STATUTS = ['en_cours', 'prete', 'retiree', 'annulee'];

    /** Statuts atteignables depuis chaque statut : retrait en trois étapes, annulation avant le retrait. */
    private const TRANSITIONS = [
        'en_cours' => ['prete', 'annulee'],
        'prete'    => ['retiree', 'annulee'],
        'retiree'  => [],
        'annulee'  => [],
    ];

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
     * @param string|null $codePromo Code promotionnel saisi par le client (US PRO-a), ou null.
     *        Il est revérifié ici : sa réduction s'applique au total des lignes, remise
     *        automatique et suppléments compris.
     * @return array{numero:string, statut:string, totalCents:int, reductionCents:int, codePromo:string|null}
     *         totalCents : le total à payer, réduction déduite.
     * @throws CodePromoInvalideException Si le code est inconnu ou désactivé.
     * @throws DomainException Si une variante ou une option n'existe plus, ou si le stock manque.
     */
    public function creer(int $utilisateurId, array $lignes, ?string $codePromo = null): array
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
                            'Stock insuffisant pour « ' . $variantes[$id]['nom'] . ' » (' . $variantes[$id]['combinaison']
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

            // Le code promotionnel (US PRO-a) : lu dans la transaction, appliqué au
            // total des lignes. Le total enregistré est celui à payer.
            $code = null;

            if ($codePromo !== null) {
                $code = (new CodePromoModel($this->pdo))->trouverActif($codePromo);

                if ($code === null) {
                    throw new CodePromoInvalideException('Ce code promo n\'est pas valable.');
                }
            }

            $reduction = $code === null ? 0 : CodePromoModel::reduction($total, $code['pourcentage']);

            // Numéro provisoire unique : le vrai dépend de l'identifiant que la
            // base attribue à l'insertion.
            $insertion = $this->pdo->prepare(
                'INSERT INTO commande (numero, utilisateur_id, statut, total_cents, code_promo, reduction_pourcent, reduction_cents)
                 VALUES (:numero, :utilisateur, :statut, :total, :code, :pourcentage, :reduction)'
            );
            $insertion->execute([
                'numero'      => 'TMP-' . bin2hex(random_bytes(8)),
                'utilisateur' => $utilisateurId,
                'statut'      => self::STATUT_INITIAL,
                'total'       => $total - $reduction,
                'code'        => $code['code'] ?? null,
                'pourcentage' => $code['pourcentage'] ?? null,
                'reduction'   => $reduction,
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

        return [
            'numero'         => $numero,
            'statut'         => self::STATUT_INITIAL,
            'totalCents'     => $total - $reduction,
            'reductionCents' => $reduction,
            'codePromo'      => $code['code'] ?? null,
        ];
    }

    /**
     * Change le statut d'une commande : c'est la SEULE porte d'entrée pour le
     * faire, donc le seul endroit où le stock est recrédité (US STK-a).
     *
     * Les transitions suivent le parcours du retrait : en_cours, prete, retiree ;
     * l'annulation reste possible tant que la commande n'est pas retirée. Le
     * stock des lignes est rendu (et journalisé) uniquement au passage à
     * « annulee » ; tout autre changement laisse le stock intact. Tout se passe
     * dans une transaction : si un recrédit ou l'écriture du journal échoue, le
     * statut n'est pas changé. La commande est verrouillée, donc deux annulations
     * simultanées ne rendent le stock qu'une fois. Demander le statut déjà en
     * place ne fait rien.
     *
     * @param int $commandeId Identifiant de la commande.
     * @param string $statut Nouveau statut (en_cours, prete, retiree ou annulee).
     * @param int|null $adminId Administrateur à l'origine du changement : s'il est
     *                          donné, le changement est inscrit au journal (US PIL-b).
     * @return array{numero:string, ancien:string, change:bool}
     *         numero : numéro de la commande ; ancien : statut avant l'appel ;
     *         change : faux si la commande avait déjà ce statut.
     * @throws DomainException Si le statut est inconnu, la commande introuvable ou
     *                         la transition interdite.
     */
    public function changerStatut(int $commandeId, string $statut, ?int $adminId = null): array
    {
        if (!in_array($statut, self::STATUTS, true)) {
            throw new DomainException('Statut de commande inconnu.');
        }

        $this->pdo->beginTransaction();

        try {
            $requete = $this->pdo->prepare('SELECT numero, statut FROM commande WHERE id = :id FOR UPDATE');
            $requete->execute(['id' => $commandeId]);
            $commande = $requete->fetch();

            if ($commande === false) {
                throw new DomainException('Commande introuvable.');
            }

            $actuel = $commande['statut'];

            if ($actuel === $statut) {
                $this->pdo->commit();

                return ['numero' => $commande['numero'], 'ancien' => $actuel, 'change' => false];
            }

            if (!in_array($statut, self::TRANSITIONS[$actuel], true)) {
                throw new DomainException($this->motifRefus($commande['numero'], $actuel, $statut));
            }

            if ($statut === self::STATUT_ANNULEE) {
                $this->recrediter($commandeId);
            }

            $this->pdo
                ->prepare('UPDATE commande SET statut = :statut WHERE id = :id')
                ->execute(['statut' => $statut, 'id' => $commandeId]);

            if ($adminId !== null) {
                $this->pdo
                    ->prepare(
                        'INSERT INTO journal_commande (commande_id, admin_id, ancien_statut, nouveau_statut)
                         VALUES (:commande, :admin, :ancien, :nouveau)'
                    )
                    ->execute([
                        'commande' => $commandeId,
                        'admin'    => $adminId,
                        'ancien'   => $actuel,
                        'nouveau'  => $statut,
                    ]);
            }

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['numero' => $commande['numero'], 'ancien' => $actuel, 'change' => true];
    }

    /**
     * Toutes les commandes des clients, triées, pour le back-office (US PIL-b).
     *
     * Le tri passe par une liste blanche : jamais de nom de colonne issu de la
     * requête dans le SQL. À égalité, la plus récente d'abord.
     *
     * @param string $tri « date », « statut » ou « montant » (sinon « date »).
     * @param string $sens « asc » ou « desc » (sinon « desc »).
     * @param string|null $statut Ne garder que ce statut ; null pour tous (statut inconnu : tous).
     * @return array<int, array{id:int, numero:string, statut:string, totalCents:int, creeLe:string,
     *                          client:string, articles:int}>
     */
    public function listerAdmin(string $tri, string $sens, ?string $statut): array
    {
        $colonne = [
            'date'    => 'commande.cree_le',
            'statut'  => 'commande.statut',
            'montant' => 'commande.total_cents',
        ][$tri] ?? 'commande.cree_le';
        $direction = $sens === 'asc' ? 'ASC' : 'DESC';

        $filtre     = $statut !== null && in_array($statut, self::STATUTS, true);
        $parametres = $filtre ? ['statut' => $statut] : [];

        $requete = $this->pdo->prepare(
            'SELECT commande.id, commande.numero, commande.statut, commande.total_cents, commande.cree_le,
                    utilisateur.email,
                    COALESCE(SUM(ligne_commande.quantite), 0) AS articles
               FROM commande
         INNER JOIN utilisateur ON utilisateur.id = commande.utilisateur_id
          LEFT JOIN ligne_commande ON ligne_commande.commande_id = commande.id'
            . ($filtre ? ' WHERE commande.statut = :statut' : '')
            . ' GROUP BY commande.id, utilisateur.email
              ORDER BY ' . $colonne . ' ' . $direction . ', commande.id ' . $direction
        );
        $requete->execute($parametres);

        return array_map(
            static fn (array $ligne): array => [
                'id'         => (int) $ligne['id'],
                'numero'     => $ligne['numero'],
                'statut'     => $ligne['statut'],
                'totalCents' => (int) $ligne['total_cents'],
                'creeLe'     => $ligne['cree_le'],
                'client'     => $ligne['email'],
                'articles'   => (int) $ligne['articles'],
            ],
            $requete->fetchAll()
        );
    }

    /**
     * Le détail complet d'une commande pour le back-office : client, lignes avec
     * options, et historique des changements faits par les administrateurs.
     *
     * @param string $numero Numéro de la commande (ex. CC-2026-000123).
     * @return array{id:int, numero:string, statut:string, totalCents:int, creeLe:string, client:string,
     *               lignes:array<int, array<string, mixed>>,
     *               journal:array<int, array{admin:string, ancien:string, nouveau:string, creeLe:string}>}|null
     *         null si le numéro est inconnu.
     */
    public function findAdmin(string $numero): ?array
    {
        $requete = $this->pdo->prepare(
            'SELECT commande.id, commande.numero, commande.statut, commande.total_cents, commande.cree_le,
                    utilisateur.email
               FROM commande
         INNER JOIN utilisateur ON utilisateur.id = commande.utilisateur_id
              WHERE commande.numero = :numero'
        );
        $requete->execute(['numero' => $numero]);
        $commande = $requete->fetch();

        if ($commande === false) {
            return null;
        }

        $journal = $this->pdo->prepare(
            'SELECT utilisateur.email, journal_commande.ancien_statut, journal_commande.nouveau_statut,
                    journal_commande.cree_le
               FROM journal_commande
         INNER JOIN utilisateur ON utilisateur.id = journal_commande.admin_id
              WHERE journal_commande.commande_id = :commande
           ORDER BY journal_commande.id DESC'
        );
        $journal->execute(['commande' => $commande['id']]);

        return [
            'id'         => (int) $commande['id'],
            'numero'     => $commande['numero'],
            'statut'     => $commande['statut'],
            'totalCents' => (int) $commande['total_cents'],
            'creeLe'     => $commande['cree_le'],
            'client'     => $commande['email'],
            'lignes'     => $this->lireLignes((int) $commande['id']),
            'journal'    => array_map(
                static fn (array $entree): array => [
                    'admin'   => $entree['email'],
                    'ancien'  => $entree['ancien_statut'],
                    'nouveau' => $entree['nouveau_statut'],
                    'creeLe'  => $entree['cree_le'],
                ],
                $journal->fetchAll()
            ),
        ];
    }

    /**
     * Parmi ces identifiants, ceux qui correspondent à une commande existante.
     *
     * @param array<int, int> $ids Identifiants demandés.
     * @return array<int, int> Les identifiants qui existent réellement.
     */
    public function idsExistants(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $marqueurs = implode(',', array_fill(0, count($ids), '?'));
        $requete   = $this->pdo->prepare('SELECT id FROM commande WHERE id IN (' . $marqueurs . ') ORDER BY id');
        $requete->execute(array_values($ids));

        return array_map('intval', $requete->fetchAll(PDO::FETCH_COLUMN));
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
     * @return array{numero:string, statut:string, totalCents:int, codePromo:string|null,
     *               reductionPourcent:int|null, reductionCents:int, creeLe:string,
     *               lignes:array<int, array{produit:string, libelle:string, prixUnitaireCents:int,
     *               quantite:int, totalCents:int,
     *               options:array<int, array{groupe:string, libelle:string, supplementCents:int}>}>}|null
     *         null si le numéro est inconnu ou appartient à un autre client. Le prix
     *         unitaire d'une ligne comprend les suppléments de ses options ; totalCents
     *         est le total à payer, réduction du code promo (US PRO-a) déjà déduite.
     */
    public function findByNumero(string $numero, int $utilisateurId): ?array
    {
        $requete = $this->pdo->prepare(
            'SELECT id, numero, statut, total_cents, code_promo, reduction_pourcent, reduction_cents, cree_le
               FROM commande
              WHERE numero = :numero AND utilisateur_id = :utilisateur'
        );
        $requete->execute(['numero' => $numero, 'utilisateur' => $utilisateurId]);
        $commande = $requete->fetch();

        if ($commande === false) {
            return null;
        }

        return [
            'numero'     => $commande['numero'],
            'statut'     => $commande['statut'],
            'totalCents' => (int) $commande['total_cents'],
            'codePromo'  => $commande['code_promo'],
            'reductionPourcent' => $commande['reduction_pourcent'] === null ? null : (int) $commande['reduction_pourcent'],
            'reductionCents'    => (int) $commande['reduction_cents'],
            'creeLe'     => $commande['cree_le'],
            'lignes'     => $this->lireLignes((int) $commande['id']),
        ];
    }

    /**
     * Les lignes d'une commande, avec leurs options figées.
     *
     * @param int $commandeId Identifiant de la commande.
     * @return array<int, array{produit:string, libelle:string, prixUnitaireCents:int, quantite:int,
     *                          totalCents:int, options:array<int, array{groupe:string, libelle:string, supplementCents:int}>}>
     */
    private function lireLignes(int $commandeId): array
    {
        $lignes = $this->pdo->prepare(
            'SELECT id, produit_nom, variante_libelle, prix_unitaire_cents, quantite
               FROM ligne_commande
              WHERE commande_id = :commande
           ORDER BY id'
        );
        $lignes->execute(['commande' => $commandeId]);

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
        $options->execute(['commande' => $commandeId]);
        $toutesOptions = $options->fetchAll();

        return array_map(
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
        );
    }

    /**
     * Explique en français pourquoi une transition de statut est refusée.
     *
     * @param string $numero Numéro de la commande.
     * @param string $actuel Statut actuel.
     * @param string $demande Statut demandé.
     * @return string Le message à montrer à l'administrateur.
     */
    private function motifRefus(string $numero, string $actuel, string $demande): string
    {
        if ($actuel === self::STATUT_ANNULEE) {
            return 'La commande ' . $numero . ' est annulée : elle ne peut plus changer de statut.';
        }

        if ($actuel === 'retiree') {
            return 'La commande ' . $numero . ' est déjà retirée : elle ne peut plus changer de statut ni être annulée.';
        }

        return 'La commande ' . $numero . ' ne peut pas passer directement de « ' . $actuel . ' » à « ' . $demande . ' ».';
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
     * L'historique des commandes d'un client (US SUI-c), de la plus récente à la
     * plus ancienne, avec filtres et pagination.
     *
     * Les filtres sont facultatifs et se cumulent. Les dates sont inclusives (le
     * jour « au » compte en entier). Une page hors limites est ramenée à la
     * dernière page existante (au moins la première).
     *
     * @param int $utilisateurId Identifiant du client connecté.
     * @param string|null $statut Ne garder que ce statut ; null pour tous. Doit être dans STATUTS.
     * @param string|null $du Premier jour retenu (AAAA-MM-JJ), ou null.
     * @param string|null $au Dernier jour retenu (AAAA-MM-JJ), ou null.
     * @param int $page Numéro de page demandé, à partir de 1.
     * @param int $parPage Nombre de commandes par page.
     * @return array{commandes:array<int, array{numero:string, statut:string, totalCents:int, creeLe:string}>,
     *               total:int, page:int, pages:int}
     */
    public function listerClient(
        int $utilisateurId,
        ?string $statut,
        ?string $du,
        ?string $au,
        int $page,
        int $parPage
    ): array {
        $conditions = ['utilisateur_id = :utilisateur'];
        $parametres = ['utilisateur' => $utilisateurId];

        if ($statut !== null && in_array($statut, self::STATUTS, true)) {
            $conditions[]        = 'statut = :statut';
            $parametres['statut'] = $statut;
        }

        if ($du !== null) {
            $conditions[]    = 'cree_le >= :du';
            $parametres['du'] = $du . ' 00:00:00';
        }

        // Borne exclusive au lendemain : le jour « au » est pris en entier.
        if ($au !== null) {
            $conditions[]    = 'cree_le < DATE_ADD(:au, INTERVAL 1 DAY)';
            $parametres['au'] = $au;
        }

        $where = ' WHERE ' . implode(' AND ', $conditions);

        $compte = $this->pdo->prepare('SELECT COUNT(*) FROM commande' . $where);
        $compte->execute($parametres);
        $total = (int) $compte->fetchColumn();

        $pages = max(1, (int) ceil($total / $parPage));
        $page  = min(max(1, $page), $pages);

        $requete = $this->pdo->prepare(
            'SELECT numero, statut, total_cents, cree_le FROM commande' . $where
            . ' ORDER BY cree_le DESC, id DESC LIMIT :limite OFFSET :decalage'
        );
        $requete->bindValue('limite', $parPage, PDO::PARAM_INT);
        $requete->bindValue('decalage', ($page - 1) * $parPage, PDO::PARAM_INT);
        $requete->bindValue('utilisateur', $utilisateurId, PDO::PARAM_INT);

        // Les autres paramètres sont des chaînes ; l'identifiant est déjà lié en entier.
        $noms = array_keys($parametres);
        for ($i = 0; $i < count($noms); $i++) {
            if ($noms[$i] !== 'utilisateur') {
                $requete->bindValue($noms[$i], $parametres[$noms[$i]]);
            }
        }

        $requete->execute();

        return [
            'commandes' => array_map(
                static fn (array $ligne): array => [
                    'numero'     => $ligne['numero'],
                    'statut'     => $ligne['statut'],
                    'totalCents' => (int) $ligne['total_cents'],
                    'creeLe'     => $ligne['cree_le'],
                ],
                $requete->fetchAll()
            ),
            'total' => $total,
            'page'  => $page,
            'pages' => $pages,
        ];
    }

    /**
     * Le nombre de commandes et leur montant, jour par jour, sur les derniers jours
     * (aujourd'hui compris), commandes annulées exclues (US PIL-a). Un jour sans
     * commande figure avec des zéros. Les jours sont ceux de la base (CURDATE).
     *
     * @param int $jours Nombre de jours à couvrir, au moins 1.
     * @return array<int, array{jour:string, commandes:int, totalCents:int}>
     *         Du plus ancien au plus récent ; jour au format AAAA-MM-JJ.
     */
    public function revenusParJour(int $jours): array
    {
        $jours   = max(1, $jours);
        $requete = $this->pdo->prepare(
            "SELECT DATE(cree_le) AS jour, COUNT(*) AS commandes, SUM(total_cents) AS total
               FROM commande
              WHERE statut <> :annulee
                AND cree_le >= DATE_SUB(CURDATE(), INTERVAL :decalage DAY)
           GROUP BY DATE(cree_le)"
        );
        $requete->bindValue('annulee', self::STATUT_ANNULEE);
        $requete->bindValue('decalage', $jours - 1, PDO::PARAM_INT);
        $requete->execute();

        $parJour = array_column($requete->fetchAll(), null, 'jour');
        $aujourdhui = new \DateTimeImmutable((string) $this->pdo->query('SELECT CURDATE()')->fetchColumn());

        return array_map(
            static function (int $decalage) use ($aujourdhui, $parJour): array {
                $jour = $aujourdhui->modify('-' . $decalage . ' day')->format('Y-m-d');

                return [
                    'jour'       => $jour,
                    'commandes'  => (int) ($parJour[$jour]['commandes'] ?? 0),
                    'totalCents' => (int) ($parJour[$jour]['total'] ?? 0),
                ];
            },
            range($jours - 1, 0)
        );
    }

    /**
     * L'heure de la base de données, la même que celle des dates de commande.
     *
     * @return string Date et heure au format AAAA-MM-JJ HH:MM:SS.
     */
    public function maintenant(): string
    {
        return (string) $this->pdo->query('SELECT NOW()')->fetchColumn();
    }

    /**
     * Le nombre de commandes par statut, les quatre statuts toujours présents.
     *
     * @return array<string, int> Nombre de commandes, indexé par statut.
     */
    public function repartitionParStatut(): array
    {
        $lignes = $this->pdo->query('SELECT statut, COUNT(*) AS nombre FROM commande GROUP BY statut')->fetchAll();
        $nombres = array_column($lignes, 'nombre', 'statut');

        return array_combine(
            self::STATUTS,
            array_map(static fn (string $statut): int => (int) ($nombres[$statut] ?? 0), self::STATUTS)
        );
    }

    /**
     * Les produits les plus commandés, tous les temps confondus, commandes annulées
     * exclues. Le nom est celui figé dans les lignes de commande : un produit
     * supprimé du catalogue reste compté.
     *
     * @param int $limite Nombre de produits renvoyés.
     * @return array<int, array{produit:string, quantite:int, totalCents:int}>
     *         Du plus vendu au moins vendu.
     */
    public function produitsLesPlusVendus(int $limite): array
    {
        $requete = $this->pdo->prepare(
            'SELECT ligne_commande.produit_nom,
                    SUM(ligne_commande.quantite) AS quantite,
                    SUM(ligne_commande.quantite * ligne_commande.prix_unitaire_cents) AS total
               FROM ligne_commande
         INNER JOIN commande ON commande.id = ligne_commande.commande_id
              WHERE commande.statut <> :annulee
           GROUP BY ligne_commande.produit_nom
           ORDER BY quantite DESC, total DESC, ligne_commande.produit_nom ASC
              LIMIT :limite'
        );
        $requete->bindValue('annulee', self::STATUT_ANNULEE);
        $requete->bindValue('limite', $limite, PDO::PARAM_INT);
        $requete->execute();

        return array_map(
            static fn (array $ligne): array => [
                'produit'    => $ligne['produit_nom'],
                'quantite'   => (int) $ligne['quantite'],
                'totalCents' => (int) $ligne['total'],
            ],
            $requete->fetchAll()
        );
    }

    /**
     * Prépare la reprise d'une ancienne commande dans le panier (US SUI-a) : pour
     * chaque ligne, ce qui peut être commandé de nouveau, d'après le catalogue et le
     * stock d'aujourd'hui.
     *
     * Les options d'une commande sont des libellés figés : on les retrouve par leur
     * groupe et leur libellé parmi les choix actuels du produit, puis on applique les
     * mêmes règles que la validation d'une commande (detaillerLigne). Une ligne dont
     * la variante a disparu, dont une option a disparu ou changé de règles, ou dont la
     * variante est épuisée est écartée avec son motif ; si le stock couvre une partie
     * seulement, la quantité est réduite. Les lignes qui partagent une variante se
     * partagent aussi son stock. Rien n'est écrit en base.
     *
     * @param string $numero Numéro de la commande (ex. CC-2026-000123).
     * @param int $utilisateurId Client connecté : une commande d'un autre client est introuvable.
     * @return array{numero:string, lignes:array<int, array{variantId:int|null, nom:string, libelle:string,
     *               quantiteDemandee:int, quantite:int, options:array<int, int>,
     *               statut:string, motif:string|null}>}|null
     *         statut : « ok », « ajustee » (quantité réduite) ou « indisponible » (quantite vaut 0) ;
     *         null si la commande n'existe pas ou appartient à un autre client.
     */
    public function preparerReprise(string $numero, int $utilisateurId): ?array
    {
        $commande = $this->pdo->prepare(
            'SELECT id FROM commande WHERE numero = :numero AND utilisateur_id = :utilisateur'
        );
        $commande->execute(['numero' => $numero, 'utilisateur' => $utilisateurId]);
        $commandeId = $commande->fetchColumn();

        if ($commandeId === false) {
            return null;
        }

        $lignes = $this->pdo->prepare(
            'SELECT id, variante_id, produit_nom, variante_libelle, quantite
               FROM ligne_commande
              WHERE commande_id = :commande
           ORDER BY id'
        );
        $lignes->execute(['commande' => $commandeId]);
        $lignes = $lignes->fetchAll();

        $anciennes = $this->pdo->prepare(
            'SELECT ligne_commande_option.ligne_id, ligne_commande_option.groupe_libelle,
                    ligne_commande_option.choix_libelle
               FROM ligne_commande_option
         INNER JOIN ligne_commande ON ligne_commande.id = ligne_commande_option.ligne_id
              WHERE ligne_commande.commande_id = :commande
           ORDER BY ligne_commande_option.id'
        );
        $anciennes->execute(['commande' => $commandeId]);
        $anciennes = $anciennes->fetchAll();

        $varianteIds = array_values(array_unique(array_map(
            static fn (array $ligne): int => (int) $ligne['variante_id'],
            array_filter($lignes, static fn (array $ligne): bool => $ligne['variante_id'] !== null)
        )));
        $variantes = $varianteIds === [] ? [] : $this->lireVariantes($varianteIds);

        $produitIds = array_values(array_unique(array_map(
            static fn (array $variante): int => $variante['produit_id'],
            $variantes
        )));
        $actuels      = $this->lireChoixDesProduits($produitIds);
        $obligatoires = $this->lireGroupesObligatoires($produitIds);

        // Stock restant par variante, consommé ligne après ligne.
        $restant = array_map(static fn (array $variante): int => $variante['stock'], $variantes);
        $resultat = [];

        for ($i = 0; $i < count($lignes); $i++) {
            $ligne    = $lignes[$i];
            $varianteId = $ligne['variante_id'] === null ? null : (int) $ligne['variante_id'];
            $demande  = (int) $ligne['quantite'];
            $base     = [
                'variantId'        => $varianteId,
                'nom'              => $ligne['produit_nom'],
                'libelle'          => $ligne['variante_libelle'],
                'quantiteDemandee' => $demande,
                'quantite'         => 0,
                'options'          => [],
                'statut'           => 'indisponible',
                'motif'            => null,
            ];

            $variante = $varianteId === null ? null : ($variantes[$varianteId] ?? null);

            if ($variante === null) {
                $resultat[] = ['motif' => 'n\'est plus proposé'] + $base;
                continue;
            }

            // Retrouve chaque option d'alors parmi les choix actuels du produit.
            $ids = array_map(
                static fn (array $option): ?int => $actuels[$variante['produit_id'] . '|' . $option['groupe_libelle'] . '|' . $option['choix_libelle']] ?? null,
                array_values(array_filter(
                    $anciennes,
                    static fn (array $option): bool => (int) $option['ligne_id'] === (int) $ligne['id']
                ))
            );

            $valide = !in_array(null, $ids, true);

            if ($valide) {
                sort($ids);

                try {
                    $this->detaillerLigne(
                        ['variantId' => $varianteId, 'quantite' => $demande, 'options' => $ids],
                        $variantes,
                        $this->lireChoix($ids),
                        $obligatoires
                    );
                } catch (DomainException $e) {
                    $valide = false;
                }
            }

            if (!$valide) {
                $resultat[] = ['motif' => 'ses options ne sont plus proposées'] + $base;
                continue;
            }

            $dispo = $restant[$varianteId];

            if ($dispo < 1) {
                $resultat[] = ['motif' => 'est épuisé'] + $base;
                continue;
            }

            $quantite             = min($demande, $dispo);
            $restant[$varianteId] = $dispo - $quantite;
            $resultat[]           = [
                'quantite' => $quantite,
                'options'  => $ids,
                'statut'   => $quantite < $demande ? 'ajustee' : 'ok',
                'motif'    => $quantite < $demande ? 'n\'est plus disponible qu\'en ' . $quantite . ' exemplaire' . ($quantite > 1 ? 's' : '') : null,
            ] + $base;
        }

        return ['numero' => $numero, 'lignes' => $resultat];
    }

    /**
     * Les choix d'options actuels des produits demandés, retrouvables par leur
     * produit, leur groupe et leur libellé (ce que garde une commande passée).
     *
     * @param array<int, int> $produitIds Identifiants de produits.
     * @return array<string, int> Identifiant de choix, indexé par « produit|groupe|libellé ».
     */
    private function lireChoixDesProduits(array $produitIds): array
    {
        if ($produitIds === []) {
            return [];
        }

        $marqueurs = implode(',', array_fill(0, count($produitIds), '?'));

        $requete = $this->pdo->prepare(
            'SELECT option_choix.id, option_choix.libelle, option_groupe.libelle AS groupe_libelle,
                    option_groupe.produit_id
               FROM option_choix
         INNER JOIN option_groupe ON option_groupe.id = option_choix.groupe_id
              WHERE option_groupe.produit_id IN (' . $marqueurs . ')'
        );
        $requete->execute(array_values($produitIds));
        $lignes = $requete->fetchAll();

        return array_combine(
            array_map(
                static fn (array $ligne): string => $ligne['produit_id'] . '|' . $ligne['groupe_libelle'] . '|' . $ligne['libelle'],
                $lignes
            ),
            array_map(static fn (array $ligne): int => (int) $ligne['id'], $lignes)
        );
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
     * @return array<int, array{id:int, libelle:string, choix_id:int|null, combinaison:string, prix_cents:int, prix_facture_cents:int,
     *                          stock:int, produit_id:int, nom:string}>
     *         Indexé par identifiant de variante. combinaison : le format suivi du choix qui porte le
     *         stock (« Pot 465 ml, Cône gaufrette »), pour les messages.
     */
    private function lireVariantes(array $ids): array
    {
        // Un « ? » par identifiant : les valeurs restent des paramètres liés.
        $marqueurs = implode(',', array_fill(0, count($ids), '?'));

        $requete = $this->pdo->prepare(
            'SELECT variante.id, variante.libelle, variante.choix_id, variante.prix_cents, variante.stock,
                    produit.id AS produit_id, produit.nom,
                    (SELECT option_choix.libelle FROM option_choix WHERE option_choix.id = variante.choix_id) AS choix_libelle
               FROM variante
         INNER JOIN produit ON produit.id = variante.produit_id
              WHERE variante.id IN (' . $marqueurs . ')
           ORDER BY variante.id
                FOR UPDATE'
        );
        $requete->execute(array_values($ids));

        $lignes  = $requete->fetchAll();
        $promoId = PromotionModel::produitEnPromotion($this->pdo);

        return array_combine(
            array_map(static fn (array $ligne): int => (int) $ligne['id'], $lignes),
            array_map(
                static fn (array $ligne): array => [
                    'id'         => (int) $ligne['id'],
                    'libelle'    => $ligne['libelle'],
                    'choix_id'   => $ligne['choix_id'] === null ? null : (int) $ligne['choix_id'],
                    'combinaison' => $ligne['choix_libelle'] === null
                        ? $ligne['libelle']
                        : $ligne['libelle'] . ', ' . $ligne['choix_libelle'],
                    'prix_cents' => (int) $ligne['prix_cents'],
                    // Le prix facturé : remisé si le produit est en promotion (US PRO-c).
                    'prix_facture_cents' => PromotionModel::prixPromo((int) $ligne['produit_id'], (int) $ligne['prix_cents'], $promoId)
                        ?? (int) $ligne['prix_cents'],
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
     * @param array<int, array{id:int, libelle:string, choix_id:int|null, combinaison:string, prix_cents:int,
     *                         prix_facture_cents:int, stock:int, produit_id:int, nom:string}> $variantes
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
            'Les options de « ' . $variante['nom'] . ' » (' . $variante['combinaison']
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

        // OPT-b : la variante est une combinaison format + choix porteur de stock.
        // Le choix passé dans les options doit être celui de la variante, sinon le
        // stock décrémenté ne serait pas celui de ce que le client a choisi.
        if ($variante['choix_id'] !== null
            && !in_array($variante['choix_id'], array_map(static fn (array $c): int => $c['id'], $retenus), true)) {
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
            'prix_unitaire' => $variante['prix_facture_cents'] + $supplements,
        ];
    }
}
