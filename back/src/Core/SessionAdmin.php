<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Contrôles d'accès du back-office : session administrateur et jeton CSRF.
 *
 * Chaque route /api/admin/* qui ne sert pas à se connecter commence par un de
 * ces contrôles. Les méthodes terminent la requête (Response::erreur) si le
 * contrôle échoue.
 */
final class SessionAdmin
{
    /**
     * Génère le jeton CSRF de la session admin qui vient de s'ouvrir.
     *
     * @return string Le jeton (64 caractères hexadécimaux), aussi rangé en session.
     */
    public static function creerJeton(): string
    {
        $jeton = bin2hex(random_bytes(32));
        $_SESSION['admin']['csrf'] = $jeton;

        return $jeton;
    }

    /**
     * Le jeton CSRF de la session admin courante, ou '' s'il n'y en a pas.
     */
    public static function jeton(): string
    {
        $jeton = $_SESSION['admin']['csrf'] ?? '';

        return is_string($jeton) ? $jeton : '';
    }

    /**
     * Exige une session administrateur (401 sinon).
     */
    public static function exiger(): void
    {
        if (!isset($_SESSION['admin'])) {
            Response::erreur('Connexion administrateur requise.', 401);
        }
    }

    /**
     * Exige une session administrateur ET un jeton CSRF valide, pour une écriture.
     *
     * Le jeton est lu dans l'en-tête X-CSRF-Token : un site tiers ne peut pas
     * l'envoyer avec le cookie de session de l'administrateur.
     * Erreurs : 401 sans session admin, 403 si le jeton manque ou est faux.
     */
    public static function exigerEcriture(Request $requete): void
    {
        self::exiger();

        $recu = $requete->entete('X-CSRF-Token') ?? '';
        if (self::jeton() === '' || !hash_equals(self::jeton(), $recu)) {
            Response::erreur('Jeton de sécurité invalide : rechargez la page.', 403);
        }
    }
}
