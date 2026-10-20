<?php

declare(strict_types=1);

namespace App\Model;

use App\Core\Televersement;
use DomainException;
use PDO;
use Throwable;

/**
 * Accès aux produits pour le back-office (US GOF-a) : lecture détaillée,
 * création, modification avec leurs formats, suppression et images.
 *
 * Les formats (variantes) portent le prix et le stock. Les écritures sont
 * transactionnelles : un produit n'est jamais à moitié enregistré.
 */
final class ProduitAdminModel
{
    /** Visuel d'un produit qui n'a encore aucune image téléversée. */
    private const IMAGE_DEFAUT = 'images/produits/placeholder.svg';

    /** Nombre maximal d'images par produit. */
    public const IMAGES_MAX = 10;

    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Tous les produits, avec leur catégorie, prix d'appel, stock total et
     * nombre de formats et d'images.
     *
     * @return array<int, array{id:int, nom:string, slug:string, categorieId:int, categorie:string,
     *         image:string, miniature:string, prixMin:int, stock:int, nombreFormats:int, nombreImages:int}>
     */
    public function lister(): array
    {
        $lignes = $this->pdo->query(
            'SELECT produit.id, produit.nom, produit.slug, produit.categorie_id,
                    categorie.libelle AS categorie, produit.image,
                    COALESCE(MIN(variante.prix_cents), 0) AS prix_min,
                    COALESCE(SUM(variante.stock), 0)      AS stock,
                    COUNT(variante.id)                    AS nombre_formats,
                    (SELECT COUNT(*) FROM produit_image WHERE produit_image.produit_id = produit.id) AS nombre_images
               FROM produit
         INNER JOIN categorie ON categorie.id = produit.categorie_id
          LEFT JOIN variante  ON variante.produit_id = produit.id
           GROUP BY produit.id, produit.nom, produit.slug, produit.categorie_id,
                    categorie.libelle, produit.image
           ORDER BY produit.id'
        )->fetchAll();

        return array_map(
            static fn (array $ligne): array => [
                'id'            => (int) $ligne['id'],
                'nom'           => $ligne['nom'],
                'slug'          => $ligne['slug'],
                'categorieId'   => (int) $ligne['categorie_id'],
                'categorie'     => $ligne['categorie'],
                'image'         => $ligne['image'],
                'miniature'     => Televersement::cheminMiniature($ligne['image']),
                'prixMin'       => (int) $ligne['prix_min'],
                'stock'         => (int) $ligne['stock'],
                'nombreFormats' => (int) $ligne['nombre_formats'],
                'nombreImages'  => (int) $ligne['nombre_images'],
            ],
            $lignes
        );
    }

    /**
     * Un produit avec tous ses champs, ses formats et ses images.
     *
     * @return array{id:int, nom:string, slug:string, categorieId:int, description:string,
     *         descriptionLongue:string, ingredients:string,
     *         variantes:array<int, array{id:int, libelle:string, prixCents:int, stock:int}>,
     *         images:array<int, array{id:int, chemin:string, miniature:string, principale:bool}>}|null
     *         null si le produit n'existe pas.
     */
    public function trouver(int $id): ?array
    {
        $requete = $this->pdo->prepare(
            'SELECT id, nom, slug, categorie_id, description, description_longue, ingredients
               FROM produit WHERE id = :id'
        );
        $requete->execute(['id' => $id]);
        $produit = $requete->fetch();

        if ($produit === false) {
            return null;
        }

        return [
            'id'                => (int) $produit['id'],
            'nom'               => $produit['nom'],
            'slug'              => $produit['slug'],
            'categorieId'       => (int) $produit['categorie_id'],
            'description'       => $produit['description'],
            'descriptionLongue' => $produit['description_longue'],
            'ingredients'       => $produit['ingredients'],
            'variantes'         => $this->lireVariantes($id),
            'images'            => $this->lireImages($id),
        ];
    }

    /**
     * Crée un produit et ses formats. Sans image : le visuel par défaut.
     *
     * Lève une PDOException (SQLSTATE 23000) si le slug existe déjà.
     *
     * @param array{nom:string, slug:string, categorieId:int, description:string,
     *        descriptionLongue:string, ingredients:string, teinte:int,
     *        variantes:array<int, array{libelle:string, prixCents:int, stock:int}>} $donnees
     * @return int Identifiant du produit créé.
     * @throws DomainException Si la catégorie n'existe pas (code 400).
     */
    public function creer(array $donnees): int
    {
        $this->pdo->beginTransaction();

        try {
            $this->verifierCategorie($donnees['categorieId']);

            $requete = $this->pdo->prepare(
                'INSERT INTO produit (categorie_id, nom, slug, description, teinte, image,
                                      description_longue, ingredients)
                 VALUES (:categorie_id, :nom, :slug, :description, :teinte, :image,
                         :description_longue, :ingredients)'
            );
            $requete->execute([
                'categorie_id'       => $donnees['categorieId'],
                'nom'                => $donnees['nom'],
                'slug'               => $donnees['slug'],
                'description'        => $donnees['description'],
                'teinte'             => $donnees['teinte'],
                'image'              => self::IMAGE_DEFAUT,
                'description_longue' => $donnees['descriptionLongue'],
                'ingredients'        => $donnees['ingredients'],
            ]);
            $id = (int) $this->pdo->lastInsertId();

            $this->synchroniserVariantes($id, $donnees['variantes']);
            $this->pdo->commit();

            return $id;
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Modifie un produit et remplace ses formats par ceux reçus : un format
     * avec identifiant est mis à jour, sans identifiant il est créé, et un
     * format absent de la liste est supprimé. Le slug ne change jamais, pour
     * garder des adresses stables.
     *
     * @param array{nom:string, categorieId:int, description:string, descriptionLongue:string,
     *        ingredients:string, variantes:array<int, array{id?:int, libelle:string,
     *        prixCents:int, stock:int}>} $donnees
     * @throws DomainException Produit introuvable (404), catégorie ou format invalide (400).
     */
    public function modifier(int $id, array $donnees): void
    {
        $this->pdo->beginTransaction();

        try {
            $this->verrouillerProduit($id);
            $this->verifierCategorie($donnees['categorieId']);

            $requete = $this->pdo->prepare(
                'UPDATE produit
                    SET categorie_id = :categorie_id, nom = :nom, description = :description,
                        description_longue = :description_longue, ingredients = :ingredients
                  WHERE id = :id'
            );
            $requete->execute([
                'categorie_id'       => $donnees['categorieId'],
                'nom'                => $donnees['nom'],
                'description'        => $donnees['description'],
                'description_longue' => $donnees['descriptionLongue'],
                'ingredients'        => $donnees['ingredients'],
                'id'                 => $id,
            ]);

            $this->synchroniserVariantes($id, $donnees['variantes']);
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Supprime un produit, ses formats et ses lignes d'images (en cascade). Les
     * commandes passées restent lisibles : elles gardent leur instantané.
     *
     * @return array<int, string>|null Les chemins de ses images (pour effacer les
     *         fichiers), ou null si le produit n'existe pas.
     */
    public function supprimer(int $id): ?array
    {
        $this->pdo->beginTransaction();

        try {
            $requete = $this->pdo->prepare('SELECT id FROM produit WHERE id = :id FOR UPDATE');
            $requete->execute(['id' => $id]);
            if ($requete->fetchColumn() === false) {
                $this->pdo->rollBack();
                return null;
            }

            $requete = $this->pdo->prepare('SELECT chemin FROM produit_image WHERE produit_id = :id');
            $requete->execute(['id' => $id]);
            $chemins = $requete->fetchAll(PDO::FETCH_COLUMN);

            $requete = $this->pdo->prepare('DELETE FROM produit WHERE id = :id');
            $requete->execute(['id' => $id]);
            $this->pdo->commit();

            return $chemins;
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Le produit existe-t-il ?
     */
    public function existe(int $id): bool
    {
        $requete = $this->pdo->prepare('SELECT 1 FROM produit WHERE id = :id');
        $requete->execute(['id' => $id]);

        return $requete->fetchColumn() !== false;
    }

    /**
     * Nombre d'images d'un produit.
     */
    public function compterImages(int $produitId): int
    {
        $requete = $this->pdo->prepare('SELECT COUNT(*) FROM produit_image WHERE produit_id = :id');
        $requete->execute(['id' => $produitId]);

        return (int) $requete->fetchColumn();
    }

    /**
     * Ajoute une image en dernière position. La première image d'un produit
     * devient son image principale.
     *
     * @param string $chemin Chemin relatif de l'image (voir Televersement).
     */
    public function ajouterImage(int $produitId, string $chemin): void
    {
        $this->pdo->beginTransaction();

        try {
            $this->verrouillerProduit($produitId);

            $requete = $this->pdo->prepare(
                'SELECT COALESCE(MAX(position), 0) + 1 FROM produit_image WHERE produit_id = :id'
            );
            $requete->execute(['id' => $produitId]);
            $position = (int) $requete->fetchColumn();

            $requete = $this->pdo->prepare(
                'INSERT INTO produit_image (produit_id, chemin, position)
                 VALUES (:produit_id, :chemin, :position)'
            );
            $requete->execute(['produit_id' => $produitId, 'chemin' => $chemin, 'position' => $position]);

            $this->synchroniserImagePrincipale($produitId);
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Retire une image d'un produit et renumérote les autres.
     *
     * @return string|null Le chemin de l'image retirée (pour effacer le fichier),
     *         ou null si elle n'appartient pas à ce produit.
     */
    public function supprimerImage(int $produitId, int $imageId): ?string
    {
        $this->pdo->beginTransaction();

        try {
            $this->verrouillerProduit($produitId);

            $requete = $this->pdo->prepare(
                'SELECT chemin FROM produit_image WHERE id = :id AND produit_id = :produit_id'
            );
            $requete->execute(['id' => $imageId, 'produit_id' => $produitId]);
            $chemin = $requete->fetchColumn();
            if ($chemin === false) {
                $this->pdo->rollBack();
                return null;
            }

            $requete = $this->pdo->prepare('DELETE FROM produit_image WHERE id = :id');
            $requete->execute(['id' => $imageId]);

            $this->renumeroterImages($produitId);
            $this->synchroniserImagePrincipale($produitId);
            $this->pdo->commit();

            return (string) $chemin;
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Place une image en première position : c'est l'image de la carte produit.
     *
     * @return bool false si l'image n'appartient pas à ce produit.
     */
    public function definirPrincipale(int $produitId, int $imageId): bool
    {
        $this->pdo->beginTransaction();

        try {
            $this->verrouillerProduit($produitId);

            $requete = $this->pdo->prepare(
                'SELECT position FROM produit_image WHERE id = :id AND produit_id = :produit_id'
            );
            $requete->execute(['id' => $imageId, 'produit_id' => $produitId]);
            $position = $requete->fetchColumn();
            if ($position === false) {
                $this->pdo->rollBack();
                return false;
            }

            // La clé unique (produit, position) interdit deux images à la même
            // place : on libère d'abord la position 0, puis on décale les
            // images qui précédaient, de la dernière à la première.
            $requete = $this->pdo->prepare('UPDATE produit_image SET position = 0 WHERE id = :id');
            $requete->execute(['id' => $imageId]);

            $requete = $this->pdo->prepare(
                'UPDATE produit_image SET position = position + 1
                  WHERE produit_id = :produit_id AND position < :position AND id <> :id
               ORDER BY position DESC'
            );
            $requete->execute(['produit_id' => $produitId, 'position' => (int) $position, 'id' => $imageId]);

            $requete = $this->pdo->prepare('UPDATE produit_image SET position = 1 WHERE id = :id');
            $requete->execute(['id' => $imageId]);

            $this->synchroniserImagePrincipale($produitId);
            $this->pdo->commit();

            return true;
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Les formats d'un produit, du moins cher au plus cher.
     *
     * @return array<int, array{id:int, libelle:string, prixCents:int, stock:int}>
     */
    private function lireVariantes(int $produitId): array
    {
        $requete = $this->pdo->prepare(
            'SELECT id, libelle, prix_cents, stock FROM variante
              WHERE produit_id = :id ORDER BY prix_cents, id'
        );
        $requete->execute(['id' => $produitId]);

        return array_map(
            static fn (array $ligne): array => [
                'id'        => (int) $ligne['id'],
                'libelle'   => $ligne['libelle'],
                'prixCents' => (int) $ligne['prix_cents'],
                'stock'     => (int) $ligne['stock'],
            ],
            $requete->fetchAll()
        );
    }

    /**
     * Les images d'un produit, de la principale à la dernière.
     *
     * @return array<int, array{id:int, chemin:string, miniature:string, principale:bool}>
     */
    private function lireImages(int $produitId): array
    {
        $requete = $this->pdo->prepare(
            'SELECT id, chemin FROM produit_image WHERE produit_id = :id ORDER BY position'
        );
        $requete->execute(['id' => $produitId]);
        $lignes = $requete->fetchAll();

        return array_map(
            static fn (array $ligne, int $index): array => [
                'id'         => (int) $ligne['id'],
                'chemin'     => $ligne['chemin'],
                'miniature'  => Televersement::cheminMiniature($ligne['chemin']),
                'principale' => $index === 0,
            ],
            $lignes,
            array_keys($lignes)
        );
    }

    /**
     * Verrouille la ligne du produit pour la durée de la transaction.
     *
     * @throws DomainException Si le produit n'existe pas (code 404).
     */
    private function verrouillerProduit(int $id): void
    {
        $requete = $this->pdo->prepare('SELECT id FROM produit WHERE id = :id FOR UPDATE');
        $requete->execute(['id' => $id]);

        if ($requete->fetchColumn() === false) {
            throw new DomainException('Produit introuvable.', 404);
        }
    }

    /**
     * @throws DomainException Si la catégorie n'existe pas (code 400).
     */
    private function verifierCategorie(int $categorieId): void
    {
        $requete = $this->pdo->prepare('SELECT 1 FROM categorie WHERE id = :id');
        $requete->execute(['id' => $categorieId]);

        if ($requete->fetchColumn() === false) {
            throw new DomainException('La catégorie choisie n\'existe pas.', 400);
        }
    }

    /**
     * Aligne les formats du produit sur la liste reçue (voir modifier()).
     *
     * @param array<int, array{id?:int, libelle:string, prixCents:int, stock:int}> $variantes
     * @throws DomainException Si un identifiant de format n'appartient pas au produit (code 400).
     */
    private function synchroniserVariantes(int $produitId, array $variantes): void
    {
        $requete = $this->pdo->prepare('SELECT id FROM variante WHERE produit_id = :id FOR UPDATE');
        $requete->execute(['id' => $produitId]);
        $existants = array_map('intval', $requete->fetchAll(PDO::FETCH_COLUMN));

        $conserves = [];
        for ($i = 0; $i < count($variantes); $i++) {
            if (isset($variantes[$i]['id'])) {
                if (!in_array($variantes[$i]['id'], $existants, true)) {
                    throw new DomainException('Un des formats n\'appartient pas à ce produit.', 400);
                }
                $conserves[] = $variantes[$i]['id'];
            }
        }

        // Les formats retirés d'abord : leur libellé redevient disponible.
        $retires = array_values(array_diff($existants, $conserves));
        for ($i = 0; $i < count($retires); $i++) {
            $requete = $this->pdo->prepare('DELETE FROM variante WHERE id = :id');
            $requete->execute(['id' => $retires[$i]]);
        }

        for ($i = 0; $i < count($variantes); $i++) {
            $variante = $variantes[$i];

            if (isset($variante['id'])) {
                $requete = $this->pdo->prepare(
                    'UPDATE variante SET libelle = :libelle, prix_cents = :prix, stock = :stock WHERE id = :id'
                );
                $requete->execute([
                    'libelle' => $variante['libelle'],
                    'prix'    => $variante['prixCents'],
                    'stock'   => $variante['stock'],
                    'id'      => $variante['id'],
                ]);
            } else {
                $requete = $this->pdo->prepare(
                    'INSERT INTO variante (produit_id, libelle, prix_cents, stock)
                     VALUES (:produit_id, :libelle, :prix, :stock)'
                );
                $requete->execute([
                    'produit_id' => $produitId,
                    'libelle'    => $variante['libelle'],
                    'prix'       => $variante['prixCents'],
                    'stock'      => $variante['stock'],
                ]);
            }
        }
    }

    /**
     * Renumérote les images de 1 à n, sans trou, dans l'ordre actuel. Chaque
     * nouvelle position est inférieure ou égale à l'ancienne : la clé unique
     * n'est jamais violée en cours de route.
     */
    private function renumeroterImages(int $produitId): void
    {
        $this->pdo->exec('SET @position = 0');
        $requete = $this->pdo->prepare(
            'UPDATE produit_image SET position = (@position := @position + 1)
              WHERE produit_id = :id ORDER BY position'
        );
        $requete->execute(['id' => $produitId]);
    }

    /**
     * Fait de la première image de la galerie l'image principale du produit
     * (colonne produit.image), ou remet le visuel par défaut s'il n'en reste aucune.
     */
    private function synchroniserImagePrincipale(int $produitId): void
    {
        $requete = $this->pdo->prepare(
            'SELECT chemin FROM produit_image WHERE produit_id = :id ORDER BY position LIMIT 1'
        );
        $requete->execute(['id' => $produitId]);
        $chemin = $requete->fetchColumn();

        $requete = $this->pdo->prepare('UPDATE produit SET image = :image WHERE id = :id');
        $requete->execute(['image' => $chemin === false ? self::IMAGE_DEFAUT : $chemin, 'id' => $produitId]);
    }
}
