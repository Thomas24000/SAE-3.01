<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Csrf;
use App\Core\Request;
use App\Core\Response;
use App\Model\CategorieModel;
use PDOException;

/**
 * Gestion des catégories par l'administrateur (US GOF-c).
 *
 * Toutes les routes exigent le rôle admin ; les écritures exigent en plus le
 * jeton CSRF. Une catégorie qui contient des produits ne peut pas être
 * supprimée : l'administrateur doit d'abord déplacer ces produits.
 */
final class CategorieController
{
    private const LIBELLE_MIN = 2;
    private const LIBELLE_MAX = 60;
    private const DESCRIPTION_MIN = 5;
    private const DESCRIPTION_MAX = 255;

    // La colonne categorie.id est un TINYINT UNSIGNED.
    private const ID_MAX = 255;

    /** Le modèle qui interroge la table categorie, fourni à la construction. */
    private CategorieModel $categories;

    public function __construct(CategorieModel $categories)
    {
        $this->categories = $categories;
    }

    /**
     * GET /api/admin/categories : toutes les catégories.
     *
     * Réponse : { categories: [{ id, libelle, slug, description, nbProduits }] }
     * Erreur : 403 si l'utilisateur n'est pas admin.
     */
    public function index(): void
    {
        $this->exigerAdmin();

        Response::json(['categories' => $this->categories->lister()]);
    }

    /**
     * POST /api/admin/categories : crée une catégorie.
     *
     * Corps : { libelle, description }
     * Réponse (201) : { categorie }
     * Erreurs : 400 validation, 403 droits ou CSRF, 409 nom déjà pris.
     */
    public function store(Request $requete): void
    {
        $this->exigerAdmin();
        Csrf::exiger($requete);

        $champs = $this->valider($requete);

        try {
            $id = $this->categories->creer($champs['libelle'], $champs['slug'], $champs['description']);
        } catch (PDOException $e) {
            $this->refuserSiDoublon($e);
            throw $e;
        }

        Response::json(['categorie' => $this->categories->trouver($id)], 201);
    }

    /**
     * PUT /api/admin/categories?id= : modifie une catégorie.
     *
     * Corps : { libelle, description }
     * Réponse : { categorie }
     * Erreurs : 400 id ou validation, 403 droits ou CSRF, 404 inconnue,
     *           409 nom déjà pris.
     */
    public function update(Request $requete): void
    {
        $this->exigerAdmin();
        Csrf::exiger($requete);

        $id = $this->lireId($requete);
        $this->exiger404($id);

        $champs = $this->valider($requete);

        try {
            $this->categories->modifier($id, $champs['libelle'], $champs['slug'], $champs['description']);
        } catch (PDOException $e) {
            $this->refuserSiDoublon($e);
            throw $e;
        }

        Response::json(['categorie' => $this->categories->trouver($id)]);
    }

    /**
     * DELETE /api/admin/categories?id= : supprime une catégorie vide.
     *
     * Réponse : { supprimee: true }
     * Erreurs : 400 id invalide, 403 droits ou CSRF, 404 inconnue,
     *           409 si des produits y sont rattachés.
     */
    public function destroy(Request $requete): void
    {
        $this->exigerAdmin();
        Csrf::exiger($requete);

        $id        = $this->lireId($requete);
        $categorie = $this->exiger404($id);

        if ($categorie['nbProduits'] > 0) {
            $this->refuserSuppression($categorie['nbProduits']);
        }

        try {
            $this->categories->supprimer($id);
        } catch (PDOException $e) {
            // Un produit a été rattaché entre le contrôle et la suppression.
            if ($e->getCode() === '23000') {
                $this->refuserSuppression(max(1, $categorie['nbProduits']));
            }
            throw $e;
        }

        Response::json(['supprimee' => true]);
    }

    /**
     * Refuse (403) si l'utilisateur connecté n'a pas le rôle admin.
     */
    private function exigerAdmin(): void
    {
        if (($_SESSION['role'] ?? '') !== 'admin') {
            Response::erreur('Accès réservé aux administrateurs', 403);
        }
    }

    /**
     * Lit et valide l'identifiant passé dans ?id=.
     */
    private function lireId(Request $requete): int
    {
        $brut = $requete->parametre('id', '') ?? '';

        if (!ctype_digit($brut) || (int) $brut < 1 || (int) $brut > self::ID_MAX) {
            Response::erreur('Identifiant de catégorie invalide.', 400);
        }

        return (int) $brut;
    }

    /**
     * La catégorie demandée, ou une réponse 404 si elle n'existe pas.
     *
     * @return array{id:int, libelle:string, slug:string, description:string, nbProduits:int}
     */
    private function exiger404(int $id): array
    {
        $categorie = $this->categories->trouver($id);

        if ($categorie === null) {
            Response::erreur('Catégorie introuvable.', 404);
        }

        return $categorie;
    }

    /**
     * Valide le corps de la requête et en déduit le slug.
     *
     * @return array{libelle:string, slug:string, description:string}
     */
    private function valider(Request $requete): array
    {
        $corps       = $requete->corps();
        $libelle     = $this->nettoyer($corps['libelle'] ?? null);
        $description = $this->nettoyer($corps['description'] ?? null);

        if (mb_strlen($libelle) < self::LIBELLE_MIN || mb_strlen($libelle) > self::LIBELLE_MAX) {
            Response::erreur(
                'Le nom doit contenir entre ' . self::LIBELLE_MIN . ' et ' . self::LIBELLE_MAX . ' caractères.',
                400
            );
        }

        // Lettres, chiffres, espaces, apostrophe, & et tiret : pas de balise ni de symbole.
        if (preg_match('/^[\p{L}\p{N}][\p{L}\p{N} \'’&-]*$/u', $libelle) !== 1) {
            Response::erreur('Le nom contient des caractères non autorisés.', 400);
        }

        $slug = $this->slugifier($libelle);

        if ($slug === '') {
            Response::erreur('Le nom doit contenir au moins une lettre ou un chiffre latin.', 400);
        }

        if (mb_strlen($description) < self::DESCRIPTION_MIN || mb_strlen($description) > self::DESCRIPTION_MAX) {
            Response::erreur(
                'La description doit contenir entre ' . self::DESCRIPTION_MIN . ' et '
                . self::DESCRIPTION_MAX . ' caractères.',
                400
            );
        }

        return ['libelle' => $libelle, 'slug' => $slug, 'description' => $description];
    }

    /**
     * Retire les espaces en trop d'un texte reçu (tout type accepté).
     *
     * @param mixed $valeur La valeur du corps JSON.
     * @return string Le texte nettoyé, ou '' si la valeur n'est pas un texte.
     */
    private function nettoyer(mixed $valeur): string
    {
        if (!is_string($valeur)) {
            return '';
        }

        return trim(preg_replace('/\s+/u', ' ', $valeur) ?? '');
    }

    /**
     * Transforme un libellé en slug d'URL : « Sans lactose » -> « sans-lactose ».
     */
    private function slugifier(string $libelle): string
    {
        $sansAccent = strtr(mb_strtolower($libelle), [
            'à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
            'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u',
            'ÿ' => 'y', 'ç' => 'c', 'œ' => 'oe', 'æ' => 'ae', 'ñ' => 'n',
        ]);
        $slug = preg_replace('/[^a-z0-9]+/', '-', $sansAccent) ?? '';

        return substr(trim($slug, '-'), 0, 60);
    }

    /**
     * Répond 409 si l'exception vient d'une violation d'unicité (nom déjà pris).
     */
    private function refuserSiDoublon(PDOException $e): void
    {
        if ($e->getCode() === '23000') {
            Response::erreur('Une catégorie porte déjà ce nom.', 409);
        }
    }

    /**
     * Répond 409 : la catégorie contient encore des produits.
     */
    private function refuserSuppression(int $nbProduits): void
    {
        $texte = $nbProduits === 1 ? '1 produit y est rattaché' : $nbProduits . ' produits y sont rattachés';

        Response::erreur(
            "Suppression impossible : {$texte}. Déplacez-les dans une autre catégorie d'abord.",
            409
        );
    }
}
