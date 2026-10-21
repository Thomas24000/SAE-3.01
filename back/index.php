<?php

declare(strict_types=1);

/**
 * Point d'entrée unique de l'API.
 *
 * Toutes les requêtes commençant par /api/ aboutissent ici, redirigées par le
 * fichier .htaccess situé à la racine du projet.
 *
 * Ce fichier ne contient aucune logique métier : il assemble les pièces et
 * confie la requête au routeur.
 */

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Router;
use App\Controller\AdminAuthController;
use App\Controller\AdminCategorieController;
use App\Controller\AdminCommandeController;
use App\Controller\AdminProduitController;
use App\Controller\AuthController;
use App\Controller\CodePromoController;
use App\Controller\CommandeController;
use App\Controller\CompteController;
use App\Controller\ProduitController;
use App\Controller\StatsController;
use App\Model\CategorieModel;
use App\Model\CodePromoModel;
use App\Model\CommandeModel;
use App\Model\ParametreModel;
use App\Model\ProduitAdminModel;
use App\Model\ProduitModel;
use App\Model\UtilisateurModel;

// --- Chargement automatique des classes ------------------------------------
// App\Core\Router  ->  back/src/Core/Router.php
//
// Plutôt que d'écrire un require par classe, on confie à PHP la fonction
// ci-dessous. PHP la gardera de côté et l'appellera LUI-MÊME, chaque fois qu'il
// rencontrera un nom de classe qu'il ne connaît pas encore — en lui passant ce
// nom en paramètre. À charge pour elle de trouver le fichier correspondant et
// de l'inclure. Rien ici n'est exécuté maintenant : on prépare seulement ce qui
// servira plus tard.
spl_autoload_register(static function (string $classe): void {
    $prefixe = 'App\\';

    if (!str_starts_with($classe, $prefixe)) {
        return;
    }

    $relatif = substr($classe, strlen($prefixe));
    $fichier = __DIR__ . '/src/' . str_replace('\\', '/', $relatif) . '.php';

    if (is_file($fichier)) {
        require $fichier;
    }
});

$config = require __DIR__ . '/config/config.php';

// --- Affichage des erreurs --------------------------------------------------
// En développement, une erreur PHP brute casserait le JSON attendu par le front.
// On les capture pour toujours répondre un document exploitable.
error_reporting(E_ALL);
ini_set('display_errors', '0');

try {
    $pdo = Database::connexion($config['bdd']);

    // --- Assemblage ---------------------------------------------------------
    // Les dépendances sont créées explicitement : le modèle reçoit la connexion,
    // le contrôleur reçoit le modèle. Aucune magie, tout est lisible ici.
    $produits     = new ProduitModel($pdo);
    $parametres   = new ParametreModel($pdo);
    $utilisateurs = new UtilisateurModel($pdo);
    $commandes    = new CommandeModel($pdo);
    $codesPromo   = new CodePromoModel($pdo);
    $categories   = new CategorieModel($pdo);
    $produitsAdmin = new ProduitAdminModel($pdo);

    $controleurs = [
        ProduitController::class   => new ProduitController($produits, $parametres),
        AuthController::class      => new AuthController($utilisateurs),
        CommandeController::class  => new CommandeController($commandes),
        CodePromoController::class => new CodePromoController($codesPromo),
        CompteController::class    => new CompteController($utilisateurs, $commandes),
        StatsController::class     => new StatsController($produits, $commandes, $parametres),
        AdminAuthController::class => new AdminAuthController($utilisateurs),
        AdminCategorieController::class => new AdminCategorieController($categories),
        AdminCommandeController::class => new AdminCommandeController($commandes),
        AdminProduitController::class => new AdminProduitController($produitsAdmin, $categories, $parametres),
    ];

    $routes = require __DIR__ . '/src/routes.php';

    // --- Session : réglage unique, avant tout contrôleur --------------------
    // PHP n'envoie le cookie PHPSESSID qu'au moment où il crée la session : ses
    // paramètres doivent donc être fixés ici, avant session_start(), et nulle
    // part ailleurs.
    ini_set('session.use_strict_mode', '1');

    session_set_cookie_params([
        'path'     => $config['chemin'],
        'httponly' => true,
        'secure'   => true,
        'samesite' => 'Lax',
    ]);

    session_start();

    (new Router($routes, $controleurs))->traiter(Request::depuisGlobals());
} catch (Throwable $e) {
    Response::json(
        [
            'erreur' => $config['debug']
                ? $e->getMessage()
                : 'Une erreur interne est survenue.',
            'fichier' => $config['debug'] ? $e->getFile() . ':' . $e->getLine() : null,
        ],
        500,
    );
}
