<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Core\SessionAdmin;
use App\Core\Texte;
use App\Model\CategorieModel;
use DomainException;
use PDOException;

/**
 * Gestion des catégories par les administrateurs (US GOF-c).
 *
 * Toute route exige une session administrateur ; les écritures exigent en plus
 * le jeton CSRF. Le serveur revalide tout : le formulaire du navigateur ne fait
 * pas foi.
 */
final class AdminCategorieController
{
    private const LIBELLE_MIN = 2;
    private const LIBELLE_MAX = 60;
    private const DESCRIPTION_MAX = 255;

    /** Le modèle qui interroge les catégories, fourni à la construction. */
    private CategorieModel $categories;

    public function __construct(CategorieModel $categories)
    {
        $this->categories = $categories;
    }

    /**
     * GET /api/admin/categories : les catégories et leur nombre de produits.
     *
     * Réponse : { categories: [{ id, libelle, slug, description, nombreProduits }],
     * totalProduits }
     * Erreur : 401 sans session administrateur.
     */
    public function index(): void
    {
        SessionAdmin::exiger();

        $categories = $this->categories->lister();

        Response::json([
            'categories'    => $categories,
            'totalProduits' => array_sum(array_column($categories, 'nombreProduits')),
        ]);
    }

    /**
     * POST /api/admin/categories : crée une catégorie.
     *
     * Corps : { libelle, description }
     * Réponse (201) : { categorie: { id, libelle, slug, description } }
     * Erreurs : 401, 403 (jeton CSRF), 400 (champ invalide), 409 (nom déjà pris).
     */
    public function create(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);
        $donnees = $this->donneesValides($requete->corps());

        try {
            $id = $this->categories->creer($donnees['libelle'], $donnees['slug'], $donnees['description']);
        } catch (PDOException $e) {
            $this->erreurDoublon($e);
        }

        Response::json(['categorie' => ['id' => $id] + $donnees], 201);
    }

    /**
     * POST /api/admin/categories/modifier : modifie une catégorie.
     *
     * Corps : { id, libelle, description }
     * Réponse : { categorie: { id, libelle, slug, description } }
     * Erreurs : 401, 403, 400 (champ invalide), 404 (inconnue), 409 (nom déjà pris).
     */
    public function update(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);
        $id      = $this->identifiant($requete->corps()['id'] ?? null);
        $donnees = $this->donneesValides($requete->corps());

        try {
            $trouvee = $this->categories->modifier($id, $donnees['libelle'], $donnees['slug'], $donnees['description']);
        } catch (PDOException $e) {
            $this->erreurDoublon($e);
        }

        if (!$trouvee) {
            Response::erreur('Catégorie introuvable.', 404);
        }

        Response::json(['categorie' => ['id' => $id] + $donnees]);
    }

    /**
     * POST /api/admin/categories/supprimer : supprime une catégorie.
     *
     * Corps : { id, reaffecterVers? }
     * Règle : si la catégorie contient des produits, reaffecterVers (autre
     * catégorie existante) est obligatoire ; sinon la suppression est refusée.
     * Réponse : { supprimee: true, reaffectes }
     * Erreurs : 401, 403, 400 (cible invalide), 404, 409 (réaffectation requise).
     */
    public function delete(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);
        $corps = $requete->corps();
        $id    = $this->identifiant($corps['id'] ?? null);
        $cible = isset($corps['reaffecterVers']) ? $this->identifiant($corps['reaffecterVers']) : null;

        try {
            $reaffectes = $this->categories->supprimer($id, $cible);
        } catch (DomainException $e) {
            Response::erreur($e->getMessage(), $e->getCode() > 0 ? $e->getCode() : 400);
        }

        Response::json(['supprimee' => true, 'reaffectes' => $reaffectes]);
    }

    /**
     * Vérifie et normalise le nom et la description reçus.
     *
     * @return array{libelle:string, slug:string, description:string}
     */
    private function donneesValides(array $corps): array
    {
        $libelle     = Texte::nettoyer($corps['libelle'] ?? null);
        $description = Texte::nettoyer($corps['description'] ?? null);

        if (mb_strlen($libelle) < self::LIBELLE_MIN || mb_strlen($libelle) > self::LIBELLE_MAX) {
            Response::erreur(
                'Le nom doit contenir entre ' . self::LIBELLE_MIN . ' et ' . self::LIBELLE_MAX . ' caractères.',
                400
            );
        }

        if (mb_strlen($description) > self::DESCRIPTION_MAX) {
            Response::erreur('La description est limitée à ' . self::DESCRIPTION_MAX . ' caractères.', 400);
        }

        $slug = Texte::slug($libelle);
        if ($slug === '') {
            Response::erreur('Le nom doit contenir au moins une lettre ou un chiffre.', 400);
        }

        return ['libelle' => $libelle, 'slug' => $slug, 'description' => $description];
    }

    /**
     * Identifiant de catégorie reçu : un entier positif (400 sinon).
     */
    private function identifiant(mixed $valeur): int
    {
        if (is_int($valeur) && $valeur > 0) {
            return $valeur;
        }
        if (is_string($valeur) && preg_match('/^[1-9][0-9]{0,2}$/', $valeur) === 1) {
            return (int) $valeur;
        }

        Response::erreur('Identifiant de catégorie invalide.', 400);
    }

    /**
     * Traduit une violation d'unicité (SQLSTATE 23000) en 409 ; relance toute autre erreur.
     */
    private function erreurDoublon(PDOException $e): never
    {
        if ($e->getCode() === '23000') {
            Response::erreur('Une catégorie porte déjà ce nom.', 409);
        }
        throw $e;
    }
}
