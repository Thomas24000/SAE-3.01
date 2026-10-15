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
}
