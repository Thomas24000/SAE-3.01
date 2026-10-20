<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Core\SessionAdmin;
use App\Model\UtilisateurModel;

/**
 * Connexion, déconnexion et état de la session des administrateurs (US GOF-b).
 *
 * L'authentification admin est séparée de celle des clients : elle a ses
 * propres routes et range l'identité dans $_SESSION['admin'], jamais dans les
 * clés du client. Se connecter ici ne connecte donc pas à la boutique, et
 * AuthController::login refuse les comptes admin.
 */
final class AdminAuthController
{
    // Hachage d'un mot de passe aléatoire, vérifié quand le compte n'existe pas
    // ou n'est pas admin : le temps de réponse ne révèle ni l'un ni l'autre.
    private const HASH_LEURRE = '$2y$12$FiXX6Y2dMXI0elW3g2EHl.E3OIMAzBU9.gujknh5WROP6hA6BQiZa';

    /** Le modèle qui interroge la table utilisateur, fourni à la construction. */
    private UtilisateurModel $utilisateurs;

    public function __construct(UtilisateurModel $utilisateurs)
    {
        $this->utilisateurs = $utilisateurs;
    }

    /**
     * POST /api/admin/login : ouvre une session administrateur.
     *
     * Corps : { email, mdp }
     * Réponse : { connecte: true, email, csrf }
     * Erreurs : 400 si un champ manque, 401 si les identifiants sont invalides
     * ou si le compte n'a pas le rôle admin (même message dans les deux cas).
     */
    public function login(Request $requete): void
    {
        $corps = $requete->corps();
        $email = is_string($corps['email'] ?? null) ? mb_strtolower(trim($corps['email'])) : '';
        $mdp   = is_string($corps['mdp'] ?? null) ? $corps['mdp'] : '';

        if ($email === '' || $mdp === '') {
            Response::erreur('Renseignez votre e-mail et votre mot de passe.', 400);
        }

        $compte = $this->utilisateurs->findByEmail($email);
        $valide = password_verify($mdp, $compte['motDePasse'] ?? self::HASH_LEURRE);

        if ($compte === null || !$valide || $compte['role'] !== 'admin') {
            Response::erreur('E-mail ou mot de passe incorrect.', 401);
        }

        // Élévation de privilège : nouvel identifiant de session.
        session_regenerate_id(true);
        $_SESSION['admin'] = ['id' => $compte['id'], 'email' => $compte['email']];

        Response::json(['connecte' => true, 'email' => $compte['email'], 'csrf' => SessionAdmin::creerJeton()]);
    }

    /**
     * GET /api/admin/me : l'administrateur de la session courante.
     *
     * Réponse : { connecte: false } ou { connecte: true, email, csrf }.
     * csrf : le jeton que le navigateur renvoie dans l'en-tête X-CSRF-Token
     * pour toute écriture admin.
     */
    public function me(): void
    {
        if (!isset($_SESSION['admin'])) {
            Response::json(['connecte' => false]);
        }

        Response::json(['connecte' => true, 'email' => $_SESSION['admin']['email'], 'csrf' => SessionAdmin::jeton()]);
    }

    /**
     * POST /api/admin/logout : ferme la session administrateur.
     *
     * Seule la clé admin est retirée : une éventuelle connexion client reste.
     * Réponse : { connecte: false }
     */
    public function logout(): void
    {
        unset($_SESSION['admin']);
        session_regenerate_id(true);

        Response::json(['connecte' => false]);
    }
}
