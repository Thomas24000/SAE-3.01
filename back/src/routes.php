<?php

declare(strict_types=1);

use App\Controller\AuthController;
use App\Controller\CommandeController;
use App\Controller\CompteController;
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
    'GET  /api/compte'              => [CompteController::class,    'show'],
    'POST /api/compte/profil'       => [CompteController::class,    'updateProfile'],
    'POST /api/compte/mot-de-passe' => [CompteController::class,    'updatePassword'],
    'GET  /api/admin/stats' => [StatsController::class,     'index'],
];
