<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
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

    public function __construct(ProduitModel $produits)
    {
        $this->produits = $produits;
    }

    /**
     * GET /api/produits : la liste des produits du catalogue.
     *
     * Réponse : { produits: [...], total: n }
     */
    public function index(Request $requete): void
    {
        $produits = $this->produits->lister();

        Response::json([
            'produits' => $produits,
            'total'    => count($produits),
        ]);
    }

    /**
     * GET /api/produit?slug=cookie-dough : la fiche d'un produit.
     *
     * Réponse : { produit: { ..., categorie, variantes: [...] } }
     * Erreurs : 400 si le slug est absent ou mal formé, 404 s'il est inconnu.
     */
    public function show(Request $requete): void
    {
        $slug = $requete->parametre('slug', '');

        // Un slug ne contient que des minuscules, des chiffres et des tirets :
        // tout le reste est rejeté avant d'atteindre la base.
        if ($slug === '' || preg_match('/^[a-z0-9-]{1,120}$/', $slug) !== 1) {
            Response::erreur('Le paramètre « slug » est absent ou invalide.', 400);
        }

        $produit = $this->produits->findBySlug($slug);

        if ($produit === null) {
            Response::erreur('Ce produit n\'existe pas.', 404);
        }

        Response::json(['produit' => $produit]);
    }

    /**
     * GET /api/panier?ids=3,5 : les variantes du panier, avec leur produit,
     * leur prix et leur stock actuels. Le panier du navigateur ne sert qu'à
     * l'affichage : prix et stock viennent toujours d'ici.
     *
     * Réponse : { variantes: [...] }. Une variante inconnue est absente.
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

        Response::json(['variantes' => $this->produits->findVariantesByIds($ids)]);
    }
}
