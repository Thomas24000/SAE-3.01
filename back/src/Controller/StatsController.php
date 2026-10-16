<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Response;
use App\Model\ProduitModel;

/**
 * Statistiques du catalogue, réservées aux administrateurs.
 */
final class StatsController
{
    /** Le modèle qui interroge la base, fourni à la construction. */
    private ProduitModel $produits;

    public function __construct(ProduitModel $produits)
    {
        $this->produits = $produits;
    }

    /**
     * GET /api/admin/stats : les statistiques du catalogue.
     *
     * Réponse : { total, stockTotal, prixMoyenCents, parCategorie: [...] }
     * Erreur : 403 si l'utilisateur connecté n'a pas le rôle admin.
     */
    public function index(): void
    {
        // La session est déjà ouverte par index.php.
        if (($_SESSION['role'] ?? '') !== 'admin') {
            Response::erreur('Accès réservé aux administrateurs', 403);
        }

        Response::json($this->produits->statistiques());
    }
}
