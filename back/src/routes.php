<?php

declare(strict_types=1);

use App\Controller\AdminAuthController;
use App\Controller\AdminCategorieController;
use App\Controller\AdminCommandeController;
use App\Controller\AdminProduitController;
use App\Controller\AuthController;
use App\Controller\CommandeController;
use App\Controller\ProduitController;
use App\Controller\StatsController;

/**
 * Table des routes de l'API.
 *
 * Clé    : méthode HTTP et chemin, séparés par un ou plusieurs espaces.
 * Valeur : [classe du contrôleur, méthode à appeler].
 *
 * Toute instance de contrôleur utilisée ici doit également être enregistrée
 * dans back/index.php.
 */

return [
    'GET  /api/produits'    => [ProduitController::class,   'index'],
    'GET  /api/produit'     => [ProduitController::class,   'show'],
    'GET  /api/panier'      => [ProduitController::class,   'panier'],
    'POST /api/login'       => [AuthController::class,      'login'],
    'POST /api/inscription' => [AuthController::class,      'register'],
    'GET  /api/me'          => [AuthController::class,      'me'],
    'POST /api/logout'      => [AuthController::class,      'logout'],
    'POST /api/commande'    => [CommandeController::class,  'store'],
    'GET  /api/commande'    => [CommandeController::class,  'show'],
    'POST /api/admin/login'  => [AdminAuthController::class, 'login'],
    'GET  /api/admin/me'     => [AdminAuthController::class, 'me'],
    'POST /api/admin/logout' => [AdminAuthController::class, 'logout'],
    'GET  /api/admin/categories'            => [AdminCategorieController::class, 'index'],
    'POST /api/admin/categories'            => [AdminCategorieController::class, 'create'],
    'POST /api/admin/categories/modifier'   => [AdminCategorieController::class, 'update'],
    'POST /api/admin/categories/supprimer'  => [AdminCategorieController::class, 'delete'],
    'GET  /api/admin/produits'              => [AdminProduitController::class, 'index'],
    'GET  /api/admin/produit'               => [AdminProduitController::class, 'show'],
    'POST /api/admin/produits'              => [AdminProduitController::class, 'create'],
    'POST /api/admin/produits/modifier'     => [AdminProduitController::class, 'update'],
    'POST /api/admin/produits/supprimer'    => [AdminProduitController::class, 'delete'],
    'POST /api/admin/produits/images'            => [AdminProduitController::class, 'uploadImages'],
    'POST /api/admin/produits/images/supprimer' => [AdminProduitController::class, 'deleteImage'],
    'POST /api/admin/produits/images/principale' => [AdminProduitController::class, 'setMainImage'],
    'POST /api/admin/parametres/seuil'      => [AdminProduitController::class, 'updateThreshold'],
    'GET  /api/admin/commandes'             => [AdminCommandeController::class, 'index'],
    'GET  /api/admin/commande'              => [AdminCommandeController::class, 'show'],
    'POST /api/admin/commandes/statut'      => [AdminCommandeController::class, 'updateStatus'],
    'GET  /api/admin/stats' => [StatsController::class,     'index'],
];
