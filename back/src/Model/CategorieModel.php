<?php

declare(strict_types=1);

namespace App\Model;

use DomainException;
use PDO;
use Throwable;

/**
 * Accès aux catégories du catalogue (US GOF-c).
 *
 * Cette couche lit et écrit la table categorie. Les formats (longueur du nom,
 * slug) sont vérifiés par le contrôleur ; ici on garantit la cohérence avec
 * les produits : une catégorie qui en contient ne disparaît qu'après leur
 * réaffectation, dans une transaction.
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
     * Toutes les catégories, avec le nombre de produits de chacune.
     *
     * @return array<int, array{id:int, libelle:string, slug:string,
     *                          description:string, nombreProduits:int}>
     */
    public function lister(): array
    {
        $lignes = $this->pdo->query(
            'SELECT categorie.id, categorie.libelle, categorie.slug, categorie.description,
                    COUNT(produit.id) AS nombre_produits
               FROM categorie
          LEFT JOIN produit ON produit.categorie_id = categorie.id
           GROUP BY categorie.id, categorie.libelle, categorie.slug, categorie.description
           ORDER BY categorie.id'
        )->fetchAll();

        return array_map(
            static fn (array $ligne): array => [
                'id'             => (int) $ligne['id'],
                'libelle'        => $ligne['libelle'],
                'slug'           => $ligne['slug'],
                'description'    => $ligne['description'],
                'nombreProduits' => (int) $ligne['nombre_produits'],
            ],
            $lignes
        );
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
     * Modifie une catégorie.
     *
     * Lève une PDOException (SQLSTATE 23000) si le nouveau slug appartient à une
     * autre catégorie.
     *
     * @return bool false si la catégorie n'existe pas.
     */
    public function modifier(int $id, string $libelle, string $slug, string $description): bool
    {
        if (!$this->existe($id)) {
            return false;
        }

        $requete = $this->pdo->prepare(
            'UPDATE categorie
                SET libelle = :libelle, slug = :slug, description = :description
              WHERE id = :id'
        );
        $requete->execute(['libelle' => $libelle, 'slug' => $slug, 'description' => $description, 'id' => $id]);

        return true;
    }

    /**
     * Supprime une catégorie, en réaffectant d'abord ses produits.
     *
     * Règle : une catégorie vide est supprimée directement ; une catégorie qui
     * contient des produits n'est supprimée que si on indique une autre
     * catégorie où les placer. Réaffectation et suppression forment une seule
     * transaction : aucun produit ne reste sans catégorie.
     *
     * @param int $id Catégorie à supprimer.
     * @param int|null $cibleId Catégorie qui reçoit les produits, ou null.
     * @return int Nombre de produits réaffectés.
     * @throws DomainException Si la catégorie est introuvable (code 404), si la
     *         cible manque, est identique ou inconnue (code 409 ou 400).
     */
    public function supprimer(int $id, ?int $cibleId): int
    {
        $this->pdo->beginTransaction();

        try {
            // Verrou : deux suppressions simultanées ne se croisent pas.
            $requete = $this->pdo->prepare('SELECT id FROM categorie WHERE id = :id FOR UPDATE');
            $requete->execute(['id' => $id]);
            if ($requete->fetchColumn() === false) {
                throw new DomainException('Catégorie introuvable.', 404);
            }

            $requete = $this->pdo->prepare('SELECT COUNT(*) FROM produit WHERE categorie_id = :id');
            $requete->execute(['id' => $id]);
            $nombre = (int) $requete->fetchColumn();

            if ($nombre > 0) {
                if ($cibleId === null) {
                    throw new DomainException(
                        'Cette catégorie contient des produits : choisissez la catégorie qui les accueillera.',
                        409
                    );
                }
                if ($cibleId === $id) {
                    throw new DomainException('La catégorie cible doit être différente de celle supprimée.', 400);
                }
                if (!$this->existe($cibleId)) {
                    throw new DomainException('La catégorie cible n\'existe pas.', 400);
                }

                $requete = $this->pdo->prepare(
                    'UPDATE produit SET categorie_id = :cible WHERE categorie_id = :id'
                );
                $requete->execute(['cible' => $cibleId, 'id' => $id]);
            }

            $requete = $this->pdo->prepare('DELETE FROM categorie WHERE id = :id');
            $requete->execute(['id' => $id]);

            $this->pdo->commit();

            return $nombre;
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Une catégorie existe-t-elle ?
     */
    private function existe(int $id): bool
    {
        $requete = $this->pdo->prepare('SELECT 1 FROM categorie WHERE id = :id');
        $requete->execute(['id' => $id]);

        return $requete->fetchColumn() !== false;
    }
}
