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
                    categorie.libelle AS categorie, ' . ProduitModel::SQL_IMAGE_PRINCIPALE . ' AS image,
                    COALESCE(MIN(variante.prix_cents), 0) AS prix_min,
                    COALESCE(SUM(variante.stock), 0)      AS stock,
                    COUNT(DISTINCT variante.format_id)       AS nombre_formats,
                    (SELECT COUNT(*) FROM produit_image WHERE produit_image.produit_id = produit.id) AS nombre_images
               FROM produit
         INNER JOIN categorie ON categorie.id = produit.categorie_id
          LEFT JOIN variante  ON variante.produit_id = produit.id
           GROUP BY produit.id, produit.nom, produit.slug, produit.categorie_id,
                    categorie.libelle
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
     *         descriptionLongue:string, ingredients:string, allergeneIds:array<int, int>,
     *         variantes:array<int, array{id:int, libelle:string, choixId:int, prixCents:int, stock:int}>,
     *         services:array<int, array{id:int, libelle:string}>,
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
            'allergeneIds'      => $this->lireAllergeneIds($id),
            'variantes'         => $this->lireVariantes($id),
            'services'          => $this->services(),
            'images'            => $this->lireImages($id),
        ];
    }

    /**
     * Crée un produit et ses formats. Sans image : le visuel par défaut.
     *
     * Lève une PDOException (SQLSTATE 23000) si le slug existe déjà.
     *
     * @param array{nom:string, slug:string, categorieId:int, description:string,
     *        descriptionLongue:string, ingredients:string, teinte:int, allergeneIds?:array<int, int>,
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
                'INSERT INTO produit (categorie_id, nom, slug, description, teinte,
                                      description_longue, ingredients)
                 VALUES (:categorie_id, :nom, :slug, :description, :teinte,
                         :description_longue, :ingredients)'
            );
            $requete->execute([
                'categorie_id'       => $donnees['categorieId'],
                'nom'                => $donnees['nom'],
                'slug'               => $donnees['slug'],
                'description'        => $donnees['description'],
                'teinte'             => $donnees['teinte'],
                'description_longue' => $donnees['descriptionLongue'],
                'ingredients'        => $donnees['ingredients'],
            ]);
            $id = (int) $this->pdo->lastInsertId();

            $this->synchroniserVariantes($id, $donnees['variantes']);
            $this->synchroniserAllergenes($id, $donnees['allergeneIds'] ?? []);
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
     *        ingredients:string, allergeneIds?:array<int, int>, variantes:array<int, array{id?:int, libelle:string,
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
            $this->synchroniserAllergenes($id, $donnees['allergeneIds'] ?? []);
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
     * Les formats existants, du plus petit au plus grand : de quoi remplir la
     * liste déroulante du formulaire produit.
     *
     * @return array<int, array{id:int, libelle:string}>
     */
    public function formats(): array
    {
        $lignes = $this->pdo->query('SELECT id, libelle FROM format ORDER BY contenance_ml, id')->fetchAll();

        return array_map(
            static fn (array $ligne): array => ['id' => (int) $ligne['id'], 'libelle' => $ligne['libelle']],
            $lignes
        );
    }

    /**
     * Tous les allergènes déclarables, par ordre alphabétique : les cases à
     * cocher du formulaire produit.
     *
     * @return array<int, array{id:int, libelle:string}>
     */
    public function allergenes(): array
    {
        $lignes = $this->pdo->query('SELECT id, libelle FROM allergene ORDER BY libelle, id')->fetchAll();

        return array_map(
            static fn (array $ligne): array => ['id' => (int) $ligne['id'], 'libelle' => $ligne['libelle']],
            $lignes
        );
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
     * est son image principale.
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

            $this->pdo->commit();

            return true;
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Les variantes d'un produit, du format le moins cher au plus cher : une par
     * combinaison format + service.
     *
     * @return array<int, array{id:int, libelle:string, choixId:int|null, prixCents:int, stock:int}>
     */
    private function lireVariantes(int $produitId): array
    {
        $requete = $this->pdo->prepare(
            'SELECT variante.id, format.libelle, variante.service_id AS choix_id, variante.prix_cents, variante.stock
               FROM variante
         INNER JOIN format       ON format.id = variante.format_id
         INNER JOIN option_choix ON option_choix.id = variante.service_id
              WHERE variante.produit_id = :id
           ORDER BY variante.prix_cents, format.contenance_ml, option_choix.position, variante.id'
        );
        $requete->execute(['id' => $produitId]);

        return array_map(
            static fn (array $ligne): array => [
                'id'        => (int) $ligne['id'],
                'libelle'   => $ligne['libelle'],
                'choixId'   => (int) $ligne['choix_id'],
                'prixCents' => (int) $ligne['prix_cents'],
                'stock'     => (int) $ligne['stock'],
            ],
            $requete->fetchAll()
        );
    }

    /**
     * Les identifiants des allergènes d'un produit.
     *
     * @return array<int, int>
     */
    private function lireAllergeneIds(int $produitId): array
    {
        $requete = $this->pdo->prepare(
            'SELECT allergene_id FROM produit_allergene WHERE produit_id = :id ORDER BY allergene_id'
        );
        $requete->execute(['id' => $produitId]);

        return array_map('intval', $requete->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * Remplace les allergènes du produit par ceux reçus (une liste vide les
     * retire tous).
     *
     * @param array<int, int> $allergeneIds Identifiants d'allergènes, sans doublon.
     * @throws DomainException Si un allergène n'existe pas (code 400).
     */
    private function synchroniserAllergenes(int $produitId, array $allergeneIds): void
    {
        $existants = array_map(static fn (array $allergene): int => $allergene['id'], $this->allergenes());

        if (array_diff($allergeneIds, $existants) !== []) {
            throw new DomainException('Un des allergènes choisis n\'existe pas.', 400);
        }

        $requete = $this->pdo->prepare('DELETE FROM produit_allergene WHERE produit_id = :id');
        $requete->execute(['id' => $produitId]);

        for ($i = 0; $i < count($allergeneIds); $i++) {
            $requete = $this->pdo->prepare(
                'INSERT INTO produit_allergene (produit_id, allergene_id) VALUES (:produit, :allergene)'
            );
            $requete->execute(['produit' => $produitId, 'allergene' => $allergeneIds[$i]]);
        }
    }

    /**
     * Les services proposables : tous les choix de type « service », dans l'ordre
     * d'affichage. Ils sont communs à tous les produits.
     *
     * @return array<int, array{id:int, libelle:string}>
     */
    public function services(): array
    {
        $lignes = $this->pdo->query(
            'SELECT id, libelle FROM option_choix WHERE type = \'service\' ORDER BY position, id'
        )->fetchAll();

        return array_map(
            static fn (array $ligne): array => ['id' => (int) $ligne['id'], 'libelle' => $ligne['libelle']],
            $lignes
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
     * Aligne les variantes du produit sur la liste reçue (voir modifier()). Une
     * variante est une combinaison format + service : le format est retrouvé par
     * son libellé dans la table format, et choixId doit être un des services. Une
     * variante existante garde son service, seuls son format, son prix et son stock changent.
     *
     * @param array<int, array{id?:int, libelle:string, choixId:int|null, prixCents:int, stock:int}> $variantes
     * @throws DomainException Si un identifiant de variante n'appartient pas au produit, si un
     *         service est invalide ou si un format n'existe pas (code 400).
     */
    private function synchroniserVariantes(int $produitId, array $variantes): void
    {
        $services = array_map(static fn (array $service): int => $service['id'], $this->services());
        $formats  = $this->lireFormats();

        for ($i = 0; $i < count($variantes); $i++) {
            if (!in_array($variantes[$i]['choixId'] ?? null, $services, true)) {
                throw new DomainException('Chaque variante doit avoir un service existant.', 400);
            }
            if (!isset($formats[mb_strtolower($variantes[$i]['libelle'])])) {
                throw new DomainException('Le format « ' . $variantes[$i]['libelle'] . ' » n\'existe pas.', 400);
            }
        }

        $requete = $this->pdo->prepare('SELECT id, service_id FROM variante WHERE produit_id = :id FOR UPDATE');
        $requete->execute(['id' => $produitId]);
        $lignes = $requete->fetchAll();
        $existants = array_map(static fn (array $ligne): int => (int) $ligne['id'], $lignes);
        $servicesExistants = array_combine(
            $existants,
            array_map(static fn (array $ligne): int => (int) $ligne['service_id'], $lignes)
        );

        $conserves = [];
        for ($i = 0; $i < count($variantes); $i++) {
            if (isset($variantes[$i]['id'])) {
                if (!in_array($variantes[$i]['id'], $existants, true)) {
                    throw new DomainException('Un des formats n\'appartient pas à ce produit.', 400);
                }
                if ($servicesExistants[$variantes[$i]['id']] !== $variantes[$i]['choixId']) {
                    throw new DomainException('Le service d\'une variante ne peut pas être changé.', 400);
                }
                $conserves[] = $variantes[$i]['id'];
            }
        }

        // Les variantes retirées d'abord : leur combinaison redevient disponible.
        $retires = array_values(array_diff($existants, $conserves));
        for ($i = 0; $i < count($retires); $i++) {
            $requete = $this->pdo->prepare('DELETE FROM variante WHERE id = :id');
            $requete->execute(['id' => $retires[$i]]);
        }

        for ($i = 0; $i < count($variantes); $i++) {
            $variante = $variantes[$i];
            $formatId = $formats[mb_strtolower($variante['libelle'])];

            if (isset($variante['id'])) {
                $requete = $this->pdo->prepare(
                    'UPDATE variante SET format_id = :format, prix_cents = :prix, stock = :stock WHERE id = :id'
                );
                $requete->execute([
                    'format' => $formatId,
                    'prix'   => $variante['prixCents'],
                    'stock'  => $variante['stock'],
                    'id'     => $variante['id'],
                ]);
            } else {
                $requete = $this->pdo->prepare(
                    'INSERT INTO variante (produit_id, format_id, service_id, prix_cents, stock)
                     VALUES (:produit_id, :format, :service, :prix, :stock)'
                );
                $requete->execute([
                    'produit_id' => $produitId,
                    'format'     => $formatId,
                    'service'    => $variante['choixId'],
                    'prix'       => $variante['prixCents'],
                    'stock'      => $variante['stock'],
                ]);
            }
        }
    }

    /**
     * Les formats existants, retrouvables par leur libellé en minuscules.
     *
     * @return array<string, int> Identifiant du format, indexé par libellé en minuscules.
     */
    private function lireFormats(): array
    {
        $lignes = $this->pdo->query('SELECT id, libelle FROM format')->fetchAll();

        return array_combine(
            array_map(static fn (array $ligne): string => mb_strtolower($ligne['libelle']), $lignes),
            array_map(static fn (array $ligne): int => (int) $ligne['id'], $lignes)
        );
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
}
