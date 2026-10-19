<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Jeton CSRF des écritures d'administration.
 *
 * Le jeton vit dans la session serveur ; le front le lit via GET /api/admin/csrf
 * puis le renvoie dans l'en-tête X-CSRF-Token de chaque écriture. Un site tiers
 * peut déclencher une requête avec le cookie de session, mais pas lire ce jeton.
 */
final class Csrf
{
    /** Nom de l'en-tête HTTP qui transporte le jeton. */
    public const ENTETE = 'X-CSRF-Token';

    /**
     * Le jeton de la session courante (créé au premier appel).
     */
    public static function jeton(): string
    {
        if (!is_string($_SESSION['csrf'] ?? null)) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }

        return $_SESSION['csrf'];
    }

    /**
     * Refuse la requête (403) si son jeton ne correspond pas à celui de la session.
     */
    public static function exiger(Request $requete): void
    {
        $recu = $requete->entete(self::ENTETE) ?? '';

        if ($recu === '' || !hash_equals(self::jeton(), $recu)) {
            Response::erreur('Jeton de sécurité invalide. Rechargez la page et réessayez.', 403);
        }
    }
}
