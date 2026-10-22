<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Accès aux données des produits (parfums de glace) du catalogue.
 *
 * Cette couche exécute les requêtes demandées et renvoie des tableaux : elle
 * ne contient aucune règle métier.
 */
final class ProduitModel
{
    /** Visuel d'un produit qui n'a aucune image dans sa galerie. */
    public const IMAGE_DEFAUT = 'images/produits/placeholder.svg';

    /**
     * Visuel principal d'un produit : la première image de sa galerie, sinon le
     * visuel par défaut. Fragment SQL à placer dans un SELECT où « produit » est
     * la table des produits.
     */
    public const SQL_IMAGE_PRINCIPALE = "COALESCE((SELECT produit_image.chemin FROM produit_image
        WHERE produit_image.produit_id = produit.id ORDER BY produit_image.position LIMIT 1),
        '" . self::IMAGE_DEFAUT . "')";

    /**
     * Les deux groupes d'options présentés au client, dans l'ordre d'affichage,
     * indexés par le type des choix de option_choix. Le service porte le stock
     * (une variante par service) ; les toppings sont facultatifs.
     */
    public const GROUPES = [
        'service' => ['id' => 1, 'libelle' => 'Service', 'multiple' => false, 'obligatoire' => true],
        'topping' => ['id' => 2, 'libelle' => 'Toppings', 'multiple' => true, 'obligatoire' => false],
    ];

    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Tous les produits du catalogue, avec leur catégorie, le prix de leur
     * variante la moins chère (prix « à partir de ») et leur stock total
     * (somme des stocks de leurs variantes).
     *
     * @return array<int, array{id:int, nom:string, slug:string, description:string,
     *                          teinte:int, image:string, categorie:string,
     *                          categorieSlug:string, prixMin:int, stock:int,
     *                          promoPourcent:int|null, prixMinPromoCents:int|null}>
     *         promoPourcent et prixMinPromoCents valent null sauf pour le produit en promotion (US PRO-c).
     */
    public function lister(): array
    {
        $lignes = $this->pdo->query(
            'SELECT produit.id,
                    produit.nom,
                    produit.slug,
                    produit.description,
                    produit.teinte,
                    ' . self::SQL_IMAGE_PRINCIPALE . ' AS image,
                    categorie.libelle      AS categorie,
                    categorie.slug         AS categorie_slug,
                    MIN(variante.prix_cents) AS prix_min,
                    SUM(variante.stock)      AS stock
               FROM produit
         INNER JOIN categorie ON categorie.id = produit.categorie_id
         INNER JOIN variante  ON variante.produit_id = produit.id
           GROUP BY produit.id, produit.nom, produit.slug, produit.description,
                    produit.teinte, categorie.id, categorie.libelle,
                    categorie.slug
           ORDER BY categorie.id, produit.nom'
        )->fetchAll();

        $promoId = PromotionModel::produitEnPromotion($this->pdo);

        // MySQL renvoie les nombres sous forme de chaînes : on les convertit
        // pour que le JSON contienne de vrais nombres.
        return array_map(
            static fn (array $ligne): array => [
                'id'          => (int) $ligne['id'],
                'nom'         => $ligne['nom'],
                'slug'        => $ligne['slug'],
                'description' => $ligne['description'],
                'teinte'      => (int) $ligne['teinte'],
                'image'       => $ligne['image'],
                'categorie'   => $ligne['categorie'],
                'categorieSlug' => $ligne['categorie_slug'],
                'prixMin'     => (int) $ligne['prix_min'],
                'stock'       => (int) $ligne['stock'],
                'promoPourcent'     => (int) $ligne['id'] === $promoId ? PromotionModel::POURCENT : null,
                'prixMinPromoCents' => PromotionModel::prixPromo((int) $ligne['id'], (int) $ligne['prix_min'], $promoId),
            ],
            $lignes
        );
    }

    /**
     * Statistiques globales du catalogue, pour la zone d'administration.
     *
     * @return array{total:int, stockTotal:int, prixMoyenCents:int,
     *               parCategorie:array<int, array{categorie:string, nombre:int}>}
     *         prixMoyenCents : prix moyen des variantes, en centimes.
     */
    public function statistiques(): array
    {
        $global = $this->pdo->query(
            'SELECT (SELECT COUNT(*) FROM produit) AS total,
                    COALESCE(SUM(stock), 0)        AS stock_total,
                    COALESCE(AVG(prix_cents), 0)   AS prix_moyen
               FROM variante'
        )->fetch();

        $parCategorie = $this->pdo->query(
            'SELECT categorie.libelle AS categorie,
                    COUNT(produit.id) AS nombre
               FROM categorie
          LEFT JOIN produit ON produit.categorie_id = categorie.id
           GROUP BY categorie.id, categorie.libelle
           ORDER BY nombre DESC, categorie.libelle ASC'
        )->fetchAll();

        // MySQL renvoie les nombres sous forme de chaînes. On les convertit
        // ligne par ligne, pour que le JSON contienne bien des nombres.
        return [
            'total'          => (int) $global['total'],
            'stockTotal'     => (int) $global['stock_total'],
            'prixMoyenCents' => (int) round((float) $global['prix_moyen']),
            'parCategorie'   => array_map(
                static fn (array $ligne): array => [
                    'categorie' => $ligne['categorie'],
                    'nombre'    => (int) $ligne['nombre'],
                ],
                $parCategorie
            ),
        ];
    }

    /**
     * Nombre de produits « Bientôt épuisé » ou épuisés : leur stock total
     * (somme des variantes) est au plus égal au seuil.
     *
     * @param int $seuil Seuil « Bientôt épuisé » (inclus), lu dans la table parametre.
     * @return int
     */
    public function compterSousSeuil(int $seuil): int
    {
        $requete = $this->pdo->prepare(
            'SELECT COUNT(*)
               FROM (SELECT produit_id
                       FROM variante
                   GROUP BY produit_id
                     HAVING SUM(stock) <= :seuil) AS sous_seuil'
        );
        $requete->execute(['seuil' => $seuil]);

        return (int) $requete->fetchColumn();
    }

    /**
     * Le stock total de chaque produit (somme des stocks de ses variantes), du plus
     * faible au plus fort : de quoi dessiner l'histogramme des stocks (US PIL-a).
     *
     * @return array<int, array{produit:string, categorie:string, stock:int}>
     */
    public function stocksParProduit(): array
    {
        $lignes = $this->pdo->query(
            'SELECT produit.nom, categorie.libelle AS categorie, COALESCE(SUM(variante.stock), 0) AS stock
               FROM produit
         INNER JOIN categorie ON categorie.id = produit.categorie_id
          LEFT JOIN variante ON variante.produit_id = produit.id
           GROUP BY produit.id, produit.nom, categorie.libelle
           ORDER BY stock ASC, produit.nom ASC'
        )->fetchAll();

        return array_map(
            static fn (array $ligne): array => [
                'produit'   => $ligne['nom'],
                'categorie' => $ligne['categorie'],
                'stock'     => (int) $ligne['stock'],
            ],
            $lignes
        );
    }

    /**
     * Des variantes retrouvées par leur identifiant, avec le produit auquel elles
     * appartiennent : de quoi afficher les lignes d'un panier. Un identifiant
     * inconnu est simplement absent du résultat.
     *
     * @param array<int, int> $ids Identifiants de variantes (déjà validés comme entiers positifs).
     * @return array<int, array{variantId:int, libelle:string, choixId:int, prixCents:int,
     *                          prixPromoCents:int|null, stock:int,
     *                          produit:array{id:int, nom:string, slug:string, image:string, teinte:int}}>
     *         prixPromoCents : le prix remisé si le produit est en promotion (US PRO-c), sinon null.
     */
    public function findVariantesByIds(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        // Un « ? » par identifiant : les valeurs restent des paramètres liés,
        // seul le nombre de marqueurs est construit.
        $marqueurs = implode(',', array_fill(0, count($ids), '?'));

        $requete = $this->pdo->prepare(
            'SELECT variante.id,
                    format.libelle,
                    variante.service_id AS choix_id,
                    variante.prix_cents,
                    variante.stock,
                    produit.id AS produit_id,
                    produit.nom,
                    produit.slug,
                    ' . self::SQL_IMAGE_PRINCIPALE . ' AS image,
                    produit.teinte
               FROM variante
         INNER JOIN produit ON produit.id = variante.produit_id
         INNER JOIN format  ON format.id = variante.format_id
              WHERE variante.id IN (' . $marqueurs . ')
           ORDER BY variante.id'
        );
        $requete->execute(array_values($ids));
        $promoId = PromotionModel::produitEnPromotion($this->pdo);

        return array_map(
            static fn (array $ligne): array => [
                'variantId' => (int) $ligne['id'],
                'libelle'   => $ligne['libelle'],
                'choixId'   => (int) $ligne['choix_id'],
                'prixCents' => (int) $ligne['prix_cents'],
                'prixPromoCents' => PromotionModel::prixPromo((int) $ligne['produit_id'], (int) $ligne['prix_cents'], $promoId),
                'stock'     => (int) $ligne['stock'],
                'produit'   => [
                    'id'     => (int) $ligne['produit_id'],
                    'nom'    => $ligne['nom'],
                    'slug'   => $ligne['slug'],
                    'image'  => $ligne['image'],
                    'teinte' => (int) $ligne['teinte'],
                ],
            ],
            $requete->fetchAll()
        );
    }

    /**
     * Les groupes d'options des produits demandés (service, toppings...), chacun
     * avec ses choix et leur supplément de prix, dans l'ordre d'affichage.
     *
     * @param array<int, int> $produitIds Identifiants de produits (entiers positifs).
     * @return array<int, array<int, array{id:int, libelle:string, multiple:bool, obligatoire:bool,
     *                                     choix:array<int, array{id:int, libelle:string, supplementCents:int, stock:int|null}>}>>
     *         Les groupes de chaque produit, indexés par identifiant de produit ;
     *         un produit sans option est absent.
     */
    public function findOptionsByProduits(array $produitIds): array
    {
        if ($produitIds === []) {
            return [];
        }

        // Un « ? » par identifiant : les valeurs restent des paramètres liés.
        $marqueurs = implode(',', array_fill(0, count($produitIds), '?'));

        // Tous les services conviennent à tous les produits ; un topping n'est
        // proposé que si la catégorie du produit le propose.
        $requete = $this->pdo->prepare(
            'SELECT produit.id AS produit_id,
                    option_choix.type,
                    option_choix.id AS choix_id,
                    option_choix.libelle AS choix_libelle,
                    option_choix.supplement_cents,
                    option_choix.stock
               FROM produit
         INNER JOIN option_choix
                 ON option_choix.type = \'service\'
                 OR EXISTS (SELECT 1 FROM categorie_topping
                             WHERE categorie_topping.categorie_id = produit.categorie_id
                               AND categorie_topping.choix_id = option_choix.id)
              WHERE produit.id IN (' . $marqueurs . ')
           ORDER BY produit.id, option_choix.type, option_choix.position, option_choix.id'
        );
        $requete->execute(array_values($produitIds));

        // Les lignes arrivent à plat (une par choix) : on les regroupe par
        // produit puis par type, en conservant l'ordre de la requête.
        $parProduit = array_reduce(
            $requete->fetchAll(),
            static function (array $produits, array $ligne): array {
                $produitId = (int) $ligne['produit_id'];
                $produits[$produitId][$ligne['type']] ??= self::GROUPES[$ligne['type']] + ['choix' => []];
                $produits[$produitId][$ligne['type']]['choix'][] = [
                    'id'              => (int) $ligne['choix_id'],
                    'libelle'         => $ligne['choix_libelle'],
                    'supplementCents' => (int) $ligne['supplement_cents'],
                    // Doses restantes d'un topping ; null pour un service (stock porté par les variantes).
                    'stock'           => $ligne['stock'] === null ? null : (int) $ligne['stock'],
                ];

                return $produits;
            },
            []
        );

        return array_map(static fn (array $groupes): array => array_values($groupes), $parProduit);
    }

    /**
     * Toutes les variantes (combinaisons format + choix de service) des produits
     * demandés, avec leur stock : de quoi proposer, dans le panier, les
     * combinaisons voisines d'une ligne et savoir lesquelles sont épuisées.
     *
     * @param array<int, int> $produitIds Identifiants de produits (entiers positifs).
     * @return array<int, array<int, array{variantId:int, libelle:string, choixId:int, prixCents:int,
     *                                     prixPromoCents:int|null, stock:int}>>
     *         Les variantes de chaque produit, indexées par identifiant de produit.
     */
    public function findCombinaisonsByProduits(array $produitIds): array
    {
        if ($produitIds === []) {
            return [];
        }

        // Un « ? » par identifiant : les valeurs restent des paramètres liés.
        $marqueurs = implode(',', array_fill(0, count($produitIds), '?'));

        $requete = $this->pdo->prepare(
            'SELECT variante.id, variante.produit_id, format.libelle, variante.service_id AS choix_id,
                    variante.prix_cents, variante.stock
               FROM variante
         INNER JOIN format ON format.id = variante.format_id
              WHERE variante.produit_id IN (' . $marqueurs . ')
           ORDER BY variante.produit_id, variante.prix_cents, format.contenance_ml, variante.id'
        );
        $requete->execute(array_values($produitIds));
        $promoId = PromotionModel::produitEnPromotion($this->pdo);

        return array_reduce(
            $requete->fetchAll(),
            static function (array $produits, array $ligne) use ($promoId): array {
                $produits[(int) $ligne['produit_id']][] = [
                    'variantId' => (int) $ligne['id'],
                    'libelle'   => $ligne['libelle'],
                    'choixId'   => (int) $ligne['choix_id'],
                    'prixCents' => (int) $ligne['prix_cents'],
                    'prixPromoCents' => PromotionModel::prixPromo((int) $ligne['produit_id'], (int) $ligne['prix_cents'], $promoId),
                    'stock'     => (int) $ligne['stock'],
                ];

                return $produits;
            },
            []
        );
    }

    /**
     * Un produit retrouvé par son slug, avec sa catégorie, ses images et toutes
     * ses variantes, de la moins chère à la plus chère. Une variante est une
     * combinaison : un format (libelle) et un service (choixId, un choix de
     * type « service » de option_choix), chacune avec
     * son prix en centimes et son stock. Une combinaison absente de la liste
     * n'existe pas.
     *
     * @param string $slug Identifiant d'URL du produit (ex. « cookie-dough »).
     * @return array{id:int, nom:string, slug:string, description:string,
     *               descriptionLongue:string, ingredients:string,
     *               allergenes:array<int, array{id:int, code:string, libelle:string}>, teinte:int,
     *               image:string, images:array<int, string>,
     *               categorie:array{libelle:string, slug:string},
     *               promoPourcent:int|null,
     *               variantes:array<int, array{id:int, libelle:string, choixId:int, prixCents:int,
     *                                          prixPromoCents:int|null, stock:int}>,
     *               options:array<int, array{id:int, libelle:string, multiple:bool, obligatoire:bool,
     *                                        choix:array<int, array{id:int, libelle:string, supplementCents:int, stock:int|null}>}>}|null
     *         null si aucun produit ne porte ce slug.
     */
    public function findBySlug(string $slug): ?array
    {
        $requete = $this->pdo->prepare(
            'SELECT produit.id,
                    produit.nom,
                    produit.slug,
                    produit.description,
                    produit.description_longue,
                    produit.ingredients,
                    produit.teinte,
                    ' . self::SQL_IMAGE_PRINCIPALE . ' AS image,
                    categorie.libelle AS categorie_libelle,
                    categorie.slug    AS categorie_slug
               FROM produit
         INNER JOIN categorie ON categorie.id = produit.categorie_id
              WHERE produit.slug = :slug'
        );
        $requete->execute(['slug' => $slug]);
        $produit = $requete->fetch();

        if ($produit === false) {
            return null;
        }

        $requeteVariantes = $this->pdo->prepare(
            'SELECT variante.id, format.libelle, variante.service_id AS choix_id, variante.prix_cents, variante.stock
               FROM variante
         INNER JOIN format        ON format.id = variante.format_id
         INNER JOIN option_choix  ON option_choix.id = variante.service_id
              WHERE variante.produit_id = :produit_id
           ORDER BY variante.prix_cents, format.contenance_ml, option_choix.position, variante.id'
        );
        $requeteVariantes->execute(['produit_id' => (int) $produit['id']]);
        $variantes = $requeteVariantes->fetchAll();

        $requeteImages = $this->pdo->prepare(
            'SELECT chemin
               FROM produit_image
              WHERE produit_id = :produit_id
           ORDER BY position'
        );
        $requeteImages->execute(['produit_id' => (int) $produit['id']]);
        $images = $requeteImages->fetchAll(PDO::FETCH_COLUMN);

        $requeteAllergenes = $this->pdo->prepare(
            'SELECT allergene.id, allergene.code, allergene.libelle
               FROM produit_allergene
         INNER JOIN allergene ON allergene.id = produit_allergene.allergene_id
              WHERE produit_allergene.produit_id = :produit_id
           ORDER BY allergene.libelle'
        );
        $requeteAllergenes->execute(['produit_id' => (int) $produit['id']]);
        $allergenes = $requeteAllergenes->fetchAll();

        $promoId = PromotionModel::produitEnPromotion($this->pdo);
        $enPromo = (int) $produit['id'] === $promoId;

        return [
            'id'          => (int) $produit['id'],
            'nom'         => $produit['nom'],
            'slug'        => $produit['slug'],
            'description' => $produit['description'],
            'descriptionLongue' => $produit['description_longue'],
            'ingredients' => $produit['ingredients'],
            'allergenes'  => array_map(
                static fn (array $ligne): array => [
                    'id'      => (int) $ligne['id'],
                    'code'    => $ligne['code'],
                    'libelle' => $ligne['libelle'],
                ],
                $allergenes
            ),
            'teinte'      => (int) $produit['teinte'],
            'image'       => $produit['image'],
            // Un produit sans galerie garde son visuel par défaut.
            'images'      => $images === [] ? [$produit['image']] : $images,
            'categorie'   => [
                'libelle' => $produit['categorie_libelle'],
                'slug'    => $produit['categorie_slug'],
            ],
            'promoPourcent' => $enPromo ? PromotionModel::POURCENT : null,
            'variantes'   => array_map(
                static fn (array $ligne): array => [
                    'id'        => (int) $ligne['id'],
                    'libelle'   => $ligne['libelle'],
                    'choixId'   => (int) $ligne['choix_id'],
                    'prixCents' => (int) $ligne['prix_cents'],
                    'prixPromoCents' => $enPromo ? PromotionModel::prixRemise((int) $ligne['prix_cents']) : null,
                    'stock'     => (int) $ligne['stock'],
                ],
                $variantes
            ),
            'options'     => $this->findOptionsByProduits([(int) $produit['id']])[(int) $produit['id']] ?? [],
        ];
    }
}
