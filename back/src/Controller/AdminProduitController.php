<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Core\SessionAdmin;
use App\Core\Televersement;
use App\Core\Texte;
use App\Model\CategorieModel;
use App\Model\ParametreModel;
use App\Model\ProduitAdminModel;
use DomainException;
use PDOException;

/**
 * Gestion des produits par les administrateurs (US GOF-a) : liste, détail,
 * création, modification (avec formats, prix et stocks), suppression, images et
 * seuil « Bientôt épuisé ».
 *
 * Toute route exige une session administrateur ; les écritures exigent en plus
 * le jeton CSRF. Le serveur revalide tout : le formulaire du navigateur ne fait
 * pas foi (prix et stocks compris).
 */
final class AdminProduitController
{
    private const NOM_MIN = 2;
    private const NOM_MAX = 120;
    private const DESCRIPTION_MAX = 400;
    private const DESCRIPTION_LONGUE_MAX = 800;
    private const INGREDIENTS_MAX = 600;
    private const FORMATS_MAX = 10;
    private const SERVICES_MAX = 10; // services par format (combinaisons format + service)
    private const LIBELLE_FORMAT_MAX = 60;
    private const PRIX_MAX_CENTS = 1000000;
    private const STOCK_MAX = 1000000;
    private const SEUIL_MAX = 100000;

    /** Le modèle des produits, fourni à la construction. */
    private ProduitAdminModel $produits;

    /** Le modèle des catégories, fourni à la construction. */
    private CategorieModel $categories;

    /** Le modèle des paramètres (seuil « Bientôt épuisé »), fourni à la construction. */
    private ParametreModel $parametres;

    public function __construct(ProduitAdminModel $produits, CategorieModel $categories, ParametreModel $parametres)
    {
        $this->produits   = $produits;
        $this->categories = $categories;
        $this->parametres = $parametres;
    }

    /**
     * GET /api/admin/produits : tous les produits, les catégories (pour les
     * filtres et le formulaire) et le seuil « Bientôt épuisé ».
     *
     * Réponse : { produits: [{ id, nom, slug, categorieId, categorie, image, miniature,
     * prixMin, stock, nombreFormats, nombreImages }], categories: [{ id, libelle }],
     * seuilBientotEpuise }
     * Erreur : 401 sans session administrateur.
     */
    public function index(): void
    {
        SessionAdmin::exiger();

        Response::json([
            'produits'           => $this->produits->lister(),
            'categories'         => $this->listeCategories(),
            'seuilBientotEpuise' => $this->parametres->seuilBientotEpuise(),
        ]);
    }

    /**
     * GET /api/admin/produit?id= : un produit complet.
     *
     * Réponse : { produit: { id, nom, slug, categorieId, description, descriptionLongue,
     * ingredients, variantes: [{ id, libelle, choixId, prixCents, stock }],
     * services: [{ id, libelle }], images: [{ id, chemin, miniature, principale }] }, categories, seuilBientotEpuise }
     * Erreurs : 401, 400 (identifiant invalide), 404.
     */
    public function show(Request $requete): void
    {
        SessionAdmin::exiger();

        $produit = $this->produits->trouver($this->identifiant($requete->parametre('id')));
        if ($produit === null) {
            Response::erreur('Produit introuvable.', 404);
        }

        Response::json([
            'produit'            => $produit,
            'categories'         => $this->listeCategories(),
            'seuilBientotEpuise' => $this->parametres->seuilBientotEpuise(),
        ]);
    }

    /**
     * POST /api/admin/produits : crée un produit (sans image : on les ajoute
     * ensuite depuis sa page de modification).
     *
     * Corps : { nom, categorieId, description, descriptionLongue, ingredients,
     * variantes: [{ libelle, choixId?, prixCents, stock }] }
     * Réponse (201) : { produit: { id, nom, slug } }
     * Erreurs : 401, 403 (CSRF), 400 (champ invalide), 409 (nom ou format en double).
     */
    public function create(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);
        $donnees = $this->donneesValides($requete->corps());

        $slug = Texte::slug($donnees['nom']);
        if ($slug === '') {
            Response::erreur('Le nom doit contenir au moins une lettre ou un chiffre.', 400);
        }

        try {
            $id = $this->produits->creer($donnees + [
                'slug'   => $slug,
                // Teinte stable, déduite du nom : elle colore la carte produit.
                'teinte' => crc32(mb_strtolower($donnees['nom'])) % 360,
            ]);
        } catch (DomainException $e) {
            Response::erreur($e->getMessage(), $e->getCode() > 0 ? $e->getCode() : 400);
        } catch (PDOException $e) {
            $this->erreurDoublon($e);
        }

        Response::json(['produit' => ['id' => $id, 'nom' => $donnees['nom'], 'slug' => $slug]], 201);
    }

    /**
     * POST /api/admin/produits/modifier : modifie un produit et ses formats.
     *
     * Corps : { id, nom, categorieId, description, descriptionLongue, ingredients,
     * variantes: [{ id?, libelle, prixCents, stock }] } — un format absent est supprimé.
     * Réponse : { produit } (voir show)
     * Erreurs : 401, 403, 400, 404, 409.
     */
    public function update(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);
        $id      = $this->identifiant($requete->corps()['id'] ?? null);
        $donnees = $this->donneesValides($requete->corps());

        try {
            $this->produits->modifier($id, $donnees);
        } catch (DomainException $e) {
            Response::erreur($e->getMessage(), $e->getCode() > 0 ? $e->getCode() : 400);
        } catch (PDOException $e) {
            $this->erreurDoublon($e);
        }

        Response::json(['produit' => $this->produits->trouver($id)]);
    }

    /**
     * POST /api/admin/produits/supprimer : supprime un produit, ses formats et
     * ses images (fichiers compris).
     *
     * Corps : { id }
     * Réponse : { supprime: true }
     * Erreurs : 401, 403, 400, 404.
     */
    public function delete(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);

        $chemins = $this->produits->supprimer($this->identifiant($requete->corps()['id'] ?? null));
        if ($chemins === null) {
            Response::erreur('Produit introuvable.', 404);
        }

        array_map(static fn (string $chemin) => Televersement::supprimer($chemin), $chemins);

        Response::json(['supprime' => true]);
    }

    /**
     * POST /api/admin/produits/images?id= : téléverse une ou plusieurs images
     * (formulaire multipart, champ « images[] »). Chaque image est contrôlée,
     * redimensionnée (1200 px) et accompagnée d'une miniature.
     *
     * Réponse : { images: [{ id, chemin, miniature, principale }] }
     * Erreurs : 401, 403, 400 (aucun fichier, trop d'images, fichier refusé), 404.
     * Si un fichier est refusé, les images précédentes du même envoi restent ajoutées.
     */
    public function uploadImages(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);
        $id = $this->identifiant($requete->parametre('id'));
        if (!$this->produits->existe($id)) {
            Response::erreur('Produit introuvable.', 404);
        }

        $fichiers = $requete->fichiers('images');
        if ($fichiers === []) {
            Response::erreur('Aucune image reçue.', 400);
        }
        if ($this->produits->compterImages($id) + count($fichiers) > ProduitAdminModel::IMAGES_MAX) {
            Response::erreur('Un produit peut avoir ' . ProduitAdminModel::IMAGES_MAX . ' images au maximum.', 400);
        }

        for ($i = 0; $i < count($fichiers); $i++) {
            try {
                $chemin = Televersement::enregistrerImage($fichiers[$i]);
            } catch (DomainException $e) {
                Response::erreur($fichiers[$i]['name'] . ' : ' . $e->getMessage(), 400);
            }
            $this->produits->ajouterImage($id, $chemin);
        }

        Response::json(['images' => $this->produits->trouver($id)['images']]);
    }

    /**
     * POST /api/admin/produits/images/supprimer : retire une image.
     *
     * Corps : { id, imageId }
     * Réponse : { images }
     * Erreurs : 401, 403, 400, 404.
     */
    public function deleteImage(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);
        $id = $this->identifiant($requete->corps()['id'] ?? null);

        $chemin = $this->produits->supprimerImage($id, $this->identifiant($requete->corps()['imageId'] ?? null));
        if ($chemin === null) {
            Response::erreur('Image introuvable.', 404);
        }
        Televersement::supprimer($chemin);

        Response::json(['images' => $this->produits->trouver($id)['images']]);
    }

    /**
     * POST /api/admin/produits/images/principale : choisit l'image affichée sur
     * la carte produit.
     *
     * Corps : { id, imageId }
     * Réponse : { images }
     * Erreurs : 401, 403, 400, 404.
     */
    public function setMainImage(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);
        $id = $this->identifiant($requete->corps()['id'] ?? null);

        if (!$this->produits->definirPrincipale($id, $this->identifiant($requete->corps()['imageId'] ?? null))) {
            Response::erreur('Image introuvable.', 404);
        }

        Response::json(['images' => $this->produits->trouver($id)['images']]);
    }

    /**
     * POST /api/admin/parametres/seuil : fixe le seuil « Bientôt épuisé ».
     *
     * Corps : { seuil } (entier de 0 à 100000)
     * Réponse : { seuilBientotEpuise }
     * Erreurs : 401, 403, 400.
     */
    public function updateThreshold(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);

        $seuil = $requete->corps()['seuil'] ?? null;
        if (!is_int($seuil) || $seuil < 0 || $seuil > self::SEUIL_MAX) {
            Response::erreur('Le seuil doit être un nombre entier entre 0 et ' . self::SEUIL_MAX . '.', 400);
        }

        $this->parametres->definirSeuilBientotEpuise($seuil);

        Response::json(['seuilBientotEpuise' => $seuil]);
    }

    /**
     * Vérifie et normalise les champs d'un produit et de ses formats.
     *
     * @return array{nom:string, categorieId:int, description:string, descriptionLongue:string,
     *         ingredients:string, variantes:array<int, array{id?:int, libelle:string, choixId:int|null, prixCents:int, stock:int}>}
     */
    private function donneesValides(array $corps): array
    {
        $nom         = Texte::nettoyer($corps['nom'] ?? null);
        $description = Texte::nettoyer($corps['description'] ?? null);
        $longue      = Texte::nettoyer($corps['descriptionLongue'] ?? null);
        $ingredients = Texte::nettoyer($corps['ingredients'] ?? null);

        if (mb_strlen($nom) < self::NOM_MIN || mb_strlen($nom) > self::NOM_MAX) {
            Response::erreur('Le nom doit contenir entre ' . self::NOM_MIN . ' et ' . self::NOM_MAX . ' caractères.', 400);
        }
        if ($description === '' || mb_strlen($description) > self::DESCRIPTION_MAX) {
            Response::erreur('La description est obligatoire (' . self::DESCRIPTION_MAX . ' caractères au maximum).', 400);
        }
        if (mb_strlen($longue) > self::DESCRIPTION_LONGUE_MAX) {
            Response::erreur('La description détaillée est limitée à ' . self::DESCRIPTION_LONGUE_MAX . ' caractères.', 400);
        }
        if (mb_strlen($ingredients) > self::INGREDIENTS_MAX) {
            Response::erreur('Les ingrédients sont limités à ' . self::INGREDIENTS_MAX . ' caractères.', 400);
        }

        return [
            'nom'               => $nom,
            'categorieId'       => $this->identifiant($corps['categorieId'] ?? null),
            'description'       => $description,
            'descriptionLongue' => $longue,
            'ingredients'       => $ingredients,
            'variantes'         => $this->variantesValides($corps['variantes'] ?? null),
        ];
    }

    /**
     * Vérifie la liste des variantes (US OPT-b : une par combinaison format + service) :
     * de 1 à 10 formats, chacun avec au plus un stock par service, un couple
     * format + service unique dans le produit, prix en centimes strictement positif,
     * stock entier positif ou nul. L'appartenance du service au produit est vérifiée
     * par le modèle.
     *
     * @return array<int, array{id?:int, libelle:string, choixId:int|null, prixCents:int, stock:int}>
     */
    private function variantesValides(mixed $brutes): array
    {
        if (!is_array($brutes) || !array_is_list($brutes) || count($brutes) < 1
            || count($brutes) > self::FORMATS_MAX * self::SERVICES_MAX) {
            Response::erreur('Un produit doit avoir entre 1 et ' . self::FORMATS_MAX . ' formats.', 400);
        }

        $variantes = [];
        $couples   = [];
        for ($i = 0; $i < count($brutes); $i++) {
            $brute = is_array($brutes[$i]) ? $brutes[$i] : [];

            $libelle = Texte::nettoyer($brute['libelle'] ?? null);
            if ($libelle === '' || mb_strlen($libelle) > self::LIBELLE_FORMAT_MAX) {
                Response::erreur('Le nom d\'un format est obligatoire (' . self::LIBELLE_FORMAT_MAX . ' caractères au maximum).', 400);
            }
            $choixId = isset($brute['choixId']) ? $this->identifiant($brute['choixId']) : null;

            $couple = mb_strtolower($libelle) . '|' . ($choixId ?? '');
            if (in_array($couple, $couples, true)) {
                Response::erreur('Deux variantes portent le même format et le même service : « ' . $libelle . ' ».', 400);
            }
            $couples[] = $couple;

            $prix = $brute['prixCents'] ?? null;
            if (!is_int($prix) || $prix < 1 || $prix > self::PRIX_MAX_CENTS) {
                Response::erreur('Le prix du format « ' . $libelle . ' » doit être supérieur à 0 € et inférieur à 10 000 €.', 400);
            }

            $stock = $brute['stock'] ?? null;
            if (!is_int($stock) || $stock < 0 || $stock > self::STOCK_MAX) {
                Response::erreur('Le stock du format « ' . $libelle . ' » doit être un nombre entier positif ou nul.', 400);
            }

            $variante = ['libelle' => $libelle, 'choixId' => $choixId, 'prixCents' => $prix, 'stock' => $stock];
            if (isset($brute['id'])) {
                $variante['id'] = $this->identifiant($brute['id']);
            }
            $variantes[] = $variante;
        }

        // La limite porte sur les formats, pas sur leurs combinaisons avec les services.
        if (count(array_unique(array_map(static fn (array $v): string => mb_strtolower($v['libelle']), $variantes))) > self::FORMATS_MAX) {
            Response::erreur('Un produit doit avoir entre 1 et ' . self::FORMATS_MAX . ' formats.', 400);
        }

        return $variantes;
    }

    /**
     * Identifiant reçu : un entier positif (400 sinon).
     */
    private function identifiant(mixed $valeur): int
    {
        if (is_int($valeur) && $valeur > 0) {
            return $valeur;
        }
        if (is_string($valeur) && preg_match('/^[1-9][0-9]{0,8}$/', $valeur) === 1) {
            return (int) $valeur;
        }

        Response::erreur('Identifiant invalide.', 400);
    }

    /**
     * Les catégories sous la forme utile aux listes déroulantes.
     *
     * @return array<int, array{id:int, libelle:string}>
     */
    private function listeCategories(): array
    {
        return array_map(
            static fn (array $categorie): array => ['id' => $categorie['id'], 'libelle' => $categorie['libelle']],
            $this->categories->lister()
        );
    }

    /**
     * Traduit une violation d'unicité (SQLSTATE 23000) en 409 ; relance toute autre erreur.
     */
    private function erreurDoublon(PDOException $e): never
    {
        if ($e->getCode() === '23000') {
            $message = str_contains($e->getMessage(), 'uq_variante')
                ? 'Deux formats portent le même nom.'
                : 'Un produit porte déjà ce nom.';
            Response::erreur($message, 409);
        }
        throw $e;
    }
}
