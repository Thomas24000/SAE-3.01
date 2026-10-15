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
}
