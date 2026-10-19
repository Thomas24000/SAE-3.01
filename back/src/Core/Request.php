<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Représente la requête HTTP entrante.
 *
 * Les cookies ne passent pas par cette classe : les contrôleurs lisent
 * $_COOKIE et appellent setcookie() directement.
 */
final class Request
{
    /** Méthode HTTP, en majuscules : GET, POST… */
    private string $methode;

    /** Chemin demandé, à partir de /api/. */
    private string $chemin;

    /** Paramètres de la chaîne de requête ($_GET). */
    private array $parametres;

    /** Corps de la requête, décodé depuis le JSON reçu. */
    private array $corps;

    /** En-têtes HTTP, clés en minuscules (ex. « x-csrf-token »). */
    private array $entetes;

    private function __construct(string $methode, string $chemin, array $parametres, array $corps, array $entetes)
    {
        $this->methode    = $methode;
        $this->chemin     = $chemin;
        $this->parametres = $parametres;
        $this->corps      = $corps;
        $this->entetes    = $entetes;
    }

    /**
     * Construit la requête à partir des variables du serveur.
     */
    public static function depuisGlobals(): self
    {
        // Deux opérateurs voisins, à ne pas confondre :
        //   ?? se déclenche si la valeur de gauche n'existe pas (ou vaut null) ;
        //   ?: se déclenche si elle existe mais est « fausse » — ici parse_url()
        //      renvoie false quand l'URL est inexploitable.
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

        // L'application est déployée dans un sous-dossier, donc l'URL reçue
        // ressemble à /~votre_login/SAE301-Starter/api/produits. On ne conserve que la partie
        // qui nous concerne, à partir du marqueur /api/.
        $position = strpos($uri, '/api/');
        $chemin   = $position === false ? '/' : substr($uri, $position);

        $corps = [];
        if (in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $brut    = file_get_contents('php://input') ?: '';
            $decode  = json_decode($brut, true);
            $corps   = is_array($decode) ? $decode : [];
        }

        // PHP range l'en-tête « X-CSRF-Token » dans $_SERVER['HTTP_X_CSRF_TOKEN'].
        $entetes = [];
        $cles    = array_keys($_SERVER);
        for ($i = 0; $i < count($cles); $i++) {
            if (str_starts_with($cles[$i], 'HTTP_') && is_string($_SERVER[$cles[$i]])) {
                $entetes[strtolower(str_replace('_', '-', substr($cles[$i], 5)))] = $_SERVER[$cles[$i]];
            }
        }

        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            $chemin,
            $_GET,
            $corps,
            $entetes,
        );
    }

    public function methode(): string
    {
        return $this->methode;
    }

    public function chemin(): string
    {
        return $this->chemin;
    }

    /**
     * Un paramètre de la chaîne de requête (?page=2).
     */
    public function parametre(string $cle, ?string $defaut = null): ?string
    {
        $valeur = $this->parametres[$cle] ?? null;

        return is_string($valeur) ? $valeur : $defaut;
    }

    /**
     * Le corps JSON de la requête, décodé en tableau associatif.
     */
    public function corps(): array
    {
        return $this->corps;
    }

    /**
     * Un en-tête HTTP de la requête.
     *
     * @param string $nom Nom de l'en-tête, casse indifférente (ex. « X-CSRF-Token »).
     * @return string|null La valeur, ou null si l'en-tête est absent.
     */
    public function entete(string $nom): ?string
    {
        return $this->entetes[strtolower($nom)] ?? null;
    }

    /**
     * Identifiant de route, par exemple « GET /api/produits ».
     */
    public function signature(): string
    {
        return $this->methode . ' ' . $this->chemin;
    }
}
