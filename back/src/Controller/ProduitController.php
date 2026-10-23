<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\ParametreModel;
use App\Model\ProduitModel;

/**
 * Catalogue des produits (parfums de glace).
 */
final class ProduitController
{
    /** Nombre maximal de variantes différentes acceptées dans un panier. */
    private const PANIER_MAX_LIGNES = 50;

    /** Le modèle qui interroge la base, fourni à la construction. */
    private ProduitModel $produits;

    /** Le modèle des paramètres (seuil « Bientôt épuisé »), fourni à la construction. */
    private ParametreModel $parametres;

    public function __construct(ProduitModel $produits, ParametreModel $parametres)
    {
        $this->produits   = $produits;
        $this->parametres = $parametres;
    }

    /**
     * GET /api/produits : la liste des produits du catalogue.
     *
     * Réponse : { produits: [...], total: n, seuilBientotEpuise: n }
     */
    public function index(Request $requete): void
    {
        $produits = $this->produits->lister();

        Response::json([
            'produits' => $produits,
            'total'    => count($produits),
            'seuilBientotEpuise' => $this->parametres->seuilBientotEpuise(),
        ]);
    }

    /**
     * GET /api/produit?nom=cookie-dough : la fiche d'un produit.
     *
     * Réponse : { produit: { ..., categorie, variantes: [...] }, seuilBientotEpuise: n }
     * Erreurs : 400 si le nom est absent ou mal formé, 404 s'il est inconnu.
     */
    public function show(Request $requete): void
    {
        $nom = $requete->parametre('nom', '');

        // Ce nom (le slug du produit) ne contient que des minuscules, des chiffres et des tirets :
        // tout le reste est rejeté avant d'atteindre la base.
        if ($nom === '' || preg_match('/^[a-z0-9-]{1,120}$/', $nom) !== 1) {
            Response::erreur('Le paramètre « nom » est absent ou invalide.', 400);
        }

        $produit = $this->produits->findBySlug($nom);

        if ($produit === null) {
            Response::erreur('Ce produit n\'existe pas.', 404);
        }

        Response::json([
            'produit'            => $produit,
            'seuilBientotEpuise' => $this->parametres->seuilBientotEpuise(),
        ]);
    }

    /**
     * GET /api/panier?ids=3,5 : les variantes du panier, avec leur produit,
     * leur prix et leur stock actuels. Le panier du navigateur ne sert qu'à
     * l'affichage : prix et stock viennent toujours d'ici.
     *
     * Réponse : { variantes: [...], options: { idProduit: [groupes] }, combinaisons: { idProduit: [variantes] }, seuilBientotEpuise: n }.
     * Une variante inconnue est absente ; « options » donne tous les groupes
     * d'options (avec leurs choix et suppléments) des produits du panier, pour
     * chiffrer les lignes et en modifier les options ; « combinaisons » donne toutes les
     * variantes de ces produits (format + service, avec leur stock) pour changer de service.
     * Erreurs : 400 si « ids » est absent, mal formé ou trop long.
     */
    public function panier(Request $requete): void
    {
        $brut = $requete->parametre('ids', '');

        // Des entiers positifs séparés par des virgules, rien d'autre.
        if ($brut === '' || preg_match('/^[1-9][0-9]{0,9}(,[1-9][0-9]{0,9})*$/', $brut) !== 1) {
            Response::erreur('Le paramètre « ids » est absent ou invalide.', 400);
        }

        $ids = array_values(array_unique(array_map('intval', explode(',', $brut))));

        if (count($ids) > self::PANIER_MAX_LIGNES) {
            Response::erreur('Le panier contient trop de lignes.', 400);
        }

        $variantes = $this->produits->findVariantesByIds($ids);

        $produitIds = array_values(array_unique(array_map(
            static fn (array $variante): int => $variante['produit']['id'],
            $variantes
        )));

        // Les groupes d'options des produits du panier, pour modifier les options d'une ligne.
        $options = $this->produits->findOptionsByProduits($produitIds);

        // Toutes leurs variantes : changer le service d'une ligne change de variante.
        $combinaisons = $this->produits->findCombinaisonsByProduits($produitIds);

        Response::json([
            'variantes'          => $variantes,
            'options'            => $options,
            'combinaisons'       => $combinaisons,
            'seuilBientotEpuise' => $this->parametres->seuilBientotEpuise(),
        ]);
    }
}
