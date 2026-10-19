<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\UtilisateurModel;
use PDOException;

/**
 * Inscription, connexion, déconnexion et état de la session (US CMD-c).
 *
 * L'identité et le rôle de l'utilisateur connecté sont rangés en session,
 * côté serveur. Le client ne détient que l'identifiant de session, dans le
 * cookie PHPSESSID.
 */
final class AuthController
{
    /** Longueur maximale d'une adresse e-mail (limite de la norme SMTP). */
    private const EMAIL_MAX = 254;

    private const MDP_MIN = 8;

    // bcrypt ignore tout ce qui dépasse 72 octets : on refuse plutôt que de
    // tronquer en silence.
    private const MDP_MAX_OCTETS = 72;

    // Hachage d'un mot de passe aléatoire. Vérifié quand l'e-mail est inconnu,
    // pour que la réponse prenne le même temps que pour un e-mail existant :
    // le délai ne révèle pas quels comptes existent.
    private const HASH_LEURRE = '$2y$12$FiXX6Y2dMXI0elW3g2EHl.E3OIMAzBU9.gujknh5WROP6hA6BQiZa';

    /** Le modèle qui interroge la table utilisateur, fourni à la construction. */
    private UtilisateurModel $utilisateurs;

    public function __construct(UtilisateurModel $utilisateurs)
    {
        $this->utilisateurs = $utilisateurs;
    }

    /**
     * POST /api/login : ouvre une session.
     *
     * Corps : { email, mdp }
     * Réponse : { connecte: true, email, role }
     * Erreurs : 400 si un champ manque, 401 si les identifiants sont invalides.
     */
    public function login(Request $requete): void
    {
        $corps = $requete->corps();
        $email = $this->normaliserEmail($corps['email'] ?? null);
        $mdp   = is_string($corps['mdp'] ?? null) ? $corps['mdp'] : '';

        if ($email === '' || $mdp === '') {
            Response::erreur('Renseignez votre e-mail et votre mot de passe.', 400);
        }

        $compte = $this->utilisateurs->findByEmail($email);
        $valide = password_verify($mdp, $compte['motDePasse'] ?? self::HASH_LEURRE);

        // Même message dans les deux cas : on ne dit pas lequel des deux est faux.
        if ($compte === null || !$valide) {
            Response::erreur('E-mail ou mot de passe incorrect.', 401);
        }

        $this->ouvrirSession($compte['id'], $compte['email'], $compte['role']);

        Response::json(['connecte' => true, 'email' => $compte['email'], 'role' => $compte['role']]);
    }

    /**
     * POST /api/inscription : crée un compte client puis le connecte.
     *
     * Corps : { email, mdp, confirmation }
     * Réponse (201) : { connecte: true, email, role: "client" }
     * Erreurs : 400 si un champ est invalide, 409 si l'e-mail est déjà pris.
     */
    public function register(Request $requete): void
    {
        $corps        = $requete->corps();
        $email        = $this->normaliserEmail($corps['email'] ?? null);
        $mdp          = is_string($corps['mdp'] ?? null) ? $corps['mdp'] : '';
        $confirmation = is_string($corps['confirmation'] ?? null) ? $corps['confirmation'] : '';

        if (strlen($email) > self::EMAIL_MAX || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            Response::erreur('Saisissez une adresse e-mail valide.', 400);
        }

        if (mb_strlen($mdp) < self::MDP_MIN) {
            Response::erreur('Le mot de passe doit contenir au moins ' . self::MDP_MIN . ' caractères.', 400);
        }

        if (strlen($mdp) > self::MDP_MAX_OCTETS) {
            Response::erreur('Le mot de passe est trop long (72 caractères au maximum).', 400);
        }

        if ($mdp !== $confirmation) {
            Response::erreur('Les deux mots de passe ne sont pas identiques.', 400);
        }

        try {
            $id = $this->utilisateurs->create($email, password_hash($mdp, PASSWORD_DEFAULT));
        } catch (PDOException $e) {
            // 23000 : violation de contrainte, ici l'unicité de l'e-mail.
            if ($e->getCode() === '23000') {
                Response::erreur('Un compte existe déjà avec cet e-mail.', 409);
            }
            throw $e;
        }

        $this->ouvrirSession($id, $email, 'client');

        Response::json(['connecte' => true, 'email' => $email, 'role' => 'client'], 201);
    }

    /**
     * GET /api/me : l'utilisateur de la session courante.
     *
     * Réponse : { connecte: false } ou { connecte: true, email, role }.
     * Le rôle renvoyé sert à l'affichage ; chaque route protégée relit la session.
     */
    public function me(): void
    {
        if (!isset($_SESSION['utilisateurId'])) {
            Response::json(['connecte' => false]);
        }

        Response::json([
            'connecte' => true,
            'email'    => $_SESSION['utilisateur'],
            'role'     => $_SESSION['role'],
        ]);
    }

    /**
     * POST /api/logout : ferme la session.
     *
     * Réponse : { connecte: false }
     */
    public function logout(): void
    {
        $_SESSION = [];                               // vide la copie en mémoire

        // Supprime le cookie, avec le chemin sous lequel il a été posé : celui
        // que index.php a réglé avant session_start().
        setcookie(session_name(), '', [
            'expires' => time() - 3600,
            'path'    => session_get_cookie_params()['path'],
        ]);

        session_destroy();                            // efface le fichier serveur

        Response::json(['connecte' => false]);
    }

    /**
     * Met un e-mail reçu sous sa forme canonique : espaces retirés, minuscules.
     * Ainsi « Alice@Mail.fr » et « alice@mail.fr » désignent le même compte.
     *
     * @param mixed $valeur La valeur du corps JSON, de n'importe quel type.
     * @return string L'e-mail normalisé, ou '' si la valeur n'est pas un texte.
     */
    private function normaliserEmail(mixed $valeur): string
    {
        return is_string($valeur) ? mb_strtolower(trim($valeur)) : '';
    }

    /**
     * Range l'utilisateur authentifié dans une session neuve.
     */
    private function ouvrirSession(int $id, string $email, string $role): void
    {
        // L'utilisateur devient authentifié : on lui attribue un identifiant de
        // session neuf, et on détruit l'ancien (true). Aucun identifiant connu
        // avant ce point ne donne plus accès à la session.
        session_regenerate_id(true);

        $_SESSION['utilisateurId'] = $id;
        $_SESSION['utilisateur']   = $email;
        $_SESSION['role']          = $role;
    }
}
