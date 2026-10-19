<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Accès aux catégories du catalogue (US GOF-c).
 *
 * Cette couche lit et écrit la table categorie : la validation des champs et
 * le contrôle des droits sont le rôle du contrôleur.
 */
final class CategorieModel
{
    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Toutes les catégories, avec le nombre de produits rattachés.
     *
     * @return array<int, array{id:int, libelle:string, slug:string,
     *                          description:string, nbProduits:int}>
     */
    public function lister(): array
    {
        $lignes = $this->pdo->query(
            'SELECT categorie.id, categorie.libelle, categorie.slug, categorie.description,
                    COUNT(produit.id) AS nb_produits
               FROM categorie
          LEFT JOIN produit ON produit.categorie_id = categorie.id
           GROUP BY categorie.id, categorie.libelle, categorie.slug, categorie.description
           ORDER BY categorie.libelle ASC'
        )->fetchAll();

        return array_map(
            fn (array $ligne): array => $this->hydrater($ligne),
            $lignes
        );
    }

    /**
     * Une catégorie par son identifiant.
     *
     * @return array{id:int, libelle:string, slug:string, description:string,
     *               nbProduits:int}|null null si elle n'existe pas.
     */
    public function trouver(int $id): ?array
    {
        $requete = $this->pdo->prepare(
            'SELECT categorie.id, categorie.libelle, categorie.slug, categorie.description,
                    COUNT(produit.id) AS nb_produits
               FROM categorie
          LEFT JOIN produit ON produit.categorie_id = categorie.id
              WHERE categorie.id = :id
           GROUP BY categorie.id, categorie.libelle, categorie.slug, categorie.description'
        );
        $requete->execute(['id' => $id]);
        $ligne = $requete->fetch();

        return $ligne === false ? null : $this->hydrater($ligne);
    }

    /**
     * Crée une catégorie.
     *
     * Lève une PDOException (SQLSTATE 23000) si le slug existe déjà : la
     * contrainte UNIQUE tranche même si deux créations arrivent en même temps.
     *
     * @return int Identifiant de la catégorie créée.
     */
    public function creer(string $libelle, string $slug, string $description): int
    {
        $requete = $this->pdo->prepare(
            'INSERT INTO categorie (libelle, slug, description)
             VALUES (:libelle, :slug, :description)'
        );
        $requete->execute(['libelle' => $libelle, 'slug' => $slug, 'description' => $description]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Modifie le libellé, le slug et la description d'une catégorie.
     *
     * Lève une PDOException (SQLSTATE 23000) si le slug est pris par une autre.
     */
    public function modifier(int $id, string $libelle, string $slug, string $description): void
    {
        $requete = $this->pdo->prepare(
            'UPDATE categorie
                SET libelle = :libelle, slug = :slug, description = :description
              WHERE id = :id'
        );
        $requete->execute([
            'id'          => $id,
            'libelle'     => $libelle,
            'slug'        => $slug,
            'description' => $description,
        ]);
    }

    /**
     * Supprime une catégorie.
     *
     * Lève une PDOException (SQLSTATE 23000) si des produits y sont encore
     * rattachés : la clé étrangère RESTRICT refuse, même si un produit a été
     * ajouté entre le contrôle du contrôleur et cette requête.
     */
    public function supprimer(int $id): void
    {
        $requete = $this->pdo->prepare('DELETE FROM categorie WHERE id = :id');
        $requete->execute(['id' => $id]);
    }

    /**
     * Convertit une ligne SQL (snake_case, textes) en tableau camelCase typé.
     *
     * @param array<string, mixed> $ligne
     * @return array{id:int, libelle:string, slug:string, description:string, nbProduits:int}
     */
    private function hydrater(array $ligne): array
    {
        return [
            'id'          => (int) $ligne['id'],
            'libelle'     => $ligne['libelle'],
            'slug'        => $ligne['slug'],
            'description' => $ligne['description'],
            'nbProduits'  => (int) $ligne['nb_produits'],
        ];
    }
}
