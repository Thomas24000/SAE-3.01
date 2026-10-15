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
}
