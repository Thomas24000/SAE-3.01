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
    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Tous les produits du catalogue, avec leur catégorie et le prix de leur
     * variante la moins chère (prix « à partir de »).
     *
     * @return array<int, array{id:int, nom:string, slug:string, description:string,
     *                          teinte:int, image:string, categorie:string, prixMin:int}>
     */
    public function lister(): array
    {
        $lignes = $this->pdo->query(
            'SELECT produit.id,
                    produit.nom,
                    produit.slug,
                    produit.description,
                    produit.teinte,
                    produit.image,
                    categorie.libelle      AS categorie,
                    MIN(variante.prix_cents) AS prix_min
               FROM produit
         INNER JOIN categorie ON categorie.id = produit.categorie_id
         INNER JOIN variante  ON variante.produit_id = produit.id
           GROUP BY produit.id, produit.nom, produit.slug, produit.description,
                    produit.teinte, produit.image, categorie.id, categorie.libelle
           ORDER BY categorie.id, produit.nom'
        )->fetchAll();

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
                'prixMin'     => (int) $ligne['prix_min'],
            ],
            $lignes
        );
    }

    /**
     * Un produit retrouvé par son slug, avec sa catégorie, ses images et toutes
     * ses variantes (format, prix en centimes, stock), de la moins chère à la
     * plus chère.
     *
     * @param string $slug Identifiant d'URL du produit (ex. « cookie-dough »).
     * @return array{id:int, nom:string, slug:string, description:string,
     *               descriptionLongue:string, ingredients:string, teinte:int,
     *               image:string, images:array<int, string>,
     *               categorie:array{libelle:string, slug:string},
     *               variantes:array<int, array{id:int, libelle:string, prixCents:int, stock:int}>}|null
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
                    produit.image,
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
            'SELECT id, libelle, prix_cents, stock
               FROM variante
              WHERE produit_id = :produit_id
           ORDER BY prix_cents, id'
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

        return [
            'id'          => (int) $produit['id'],
            'nom'         => $produit['nom'],
            'slug'        => $produit['slug'],
            'description' => $produit['description'],
            'descriptionLongue' => $produit['description_longue'],
            'ingredients' => $produit['ingredients'],
            'teinte'      => (int) $produit['teinte'],
            'image'       => $produit['image'],
            // Un produit sans galerie garde son visuel principal.
            'images'      => $images === [] ? [$produit['image']] : $images,
            'categorie'   => [
                'libelle' => $produit['categorie_libelle'],
                'slug'    => $produit['categorie_slug'],
            ],
            'variantes'   => array_map(
                static fn (array $ligne): array => [
                    'id'        => (int) $ligne['id'],
                    'libelle'   => $ligne['libelle'],
                    'prixCents' => (int) $ligne['prix_cents'],
                    'stock'     => (int) $ligne['stock'],
                ],
                $variantes
            ),
        ];
    }
}
