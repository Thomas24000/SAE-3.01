<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\CommandeModel;
use App\Model\UtilisateurModel;
use PDOException;

/**
 * Espace personnel du client connecté (US SUI-b) : profil, aperçu de l'activité
 * et changement de mot de passe.
 *
 * L'identité vient toujours de la session ; le corps de la requête ne désigne
 * jamais le compte à modifier.
 */
final class CompteController
{
    /** Nombre de commandes récentes montrées dans l'aperçu. */
    private const COMMANDES_RECENTES = 3;

    /** Longueur maximale d'une adresse e-mail (limite de la norme SMTP). */
    private const EMAIL_MAX = 254;

    /** Longueur maximale du nom, en caractères. */
    private const NOM_MAX = 100;

    private const MDP_MIN = 8;

    // bcrypt ignore tout ce qui dépasse 72 octets : on refuse plutôt que de
    // tronquer en silence.
    private const MDP_MAX_OCTETS = 72;

    /** Le modèle des comptes, fourni à la construction. */
    private UtilisateurModel $utilisateurs;

    /** Le modèle des commandes, fourni à la construction. */
    private CommandeModel $commandes;

    public function __construct(UtilisateurModel $utilisateurs, CommandeModel $commandes)
    {
        $this->utilisateurs = $utilisateurs;
        $this->commandes    = $commandes;
    }

    /**
     * GET /api/compte : le profil et l'aperçu de l'activité du client.
     *
     * Réponse : { profil: { email, nom, creeLe }, commandes: { total, recentes: [...] } }
     * Erreurs : 401 si personne n'est connecté.
     */
    public function show(): void
    {
        $id     = $this->utilisateurConnecte();
        $profil = $this->utilisateurs->findById($id);

        if ($profil === null) {
            Response::erreur('Compte introuvable.', 404);
        }

        Response::json([
            'profil'    => [
                'email'  => $profil['email'],
                'nom'    => $profil['nom'],
                'creeLe' => $profil['creeLe'],
            ],
            'commandes' => [
                'total'    => $this->commandes->countByUtilisateur($id),
                'recentes' => $this->commandes->findRecentes($id, self::COMMANDES_RECENTES),
            ],
        ]);
    }

    /**
     * POST /api/compte/profil : modifie le nom et l'e-mail.
     *
     * Corps : { nom, email } ; un nom vide l'efface.
     * Réponse : { profil: { email, nom } }
     * Erreurs : 401 non connecté, 400 champ invalide, 409 e-mail déjà pris.
     */
    public function updateProfile(Request $requete): void
    {
        $id    = $this->utilisateurConnecte();
        $corps = $requete->corps();
        $nom   = is_string($corps['nom'] ?? null) ? trim($corps['nom']) : '';
        $email = is_string($corps['email'] ?? null) ? mb_strtolower(trim($corps['email'])) : '';

        if (mb_strlen($nom) > self::NOM_MAX) {
            Response::erreur('Le nom est trop long (' . self::NOM_MAX . ' caractères au maximum).', 400);
        }

        if (strlen($email) > self::EMAIL_MAX || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            Response::erreur('Saisissez une adresse e-mail valide.', 400);
        }

        try {
            $this->utilisateurs->updateProfile($id, $nom === '' ? null : $nom, $email);
        } catch (PDOException $e) {
            // 23000 : violation de contrainte, ici l'unicité de l'e-mail.
            if ($e->getCode() === '23000') {
                Response::erreur('Un compte existe déjà avec cet e-mail.', 409);
            }
            throw $e;
        }

        // Le header lit l'e-mail de la session : on la garde alignée sur la base.
        $_SESSION['utilisateur'] = $email;

        Response::json(['profil' => ['email' => $email, 'nom' => $nom === '' ? null : $nom]]);
    }

    /**
     * POST /api/compte/mot-de-passe : change le mot de passe.
     *
     * Corps : { ancien, nouveau, confirmation }
     * Réponse : { modifie: true }
     * Erreurs : 401 non connecté, 400 champ invalide, 403 ancien mot de passe faux.
     */
    public function updatePassword(Request $requete): void
    {
        $id           = $this->utilisateurConnecte();
        $corps        = $requete->corps();
        $ancien       = is_string($corps['ancien'] ?? null) ? $corps['ancien'] : '';
        $nouveau      = is_string($corps['nouveau'] ?? null) ? $corps['nouveau'] : '';
        $confirmation = is_string($corps['confirmation'] ?? null) ? $corps['confirmation'] : '';

        if ($ancien === '') {
            Response::erreur('Saisissez votre mot de passe actuel.', 400);
        }

        if (mb_strlen($nouveau) < self::MDP_MIN) {
            Response::erreur('Le mot de passe doit contenir au moins ' . self::MDP_MIN . ' caractères.', 400);
        }

        if (strlen($nouveau) > self::MDP_MAX_OCTETS) {
            Response::erreur('Le mot de passe est trop long (72 caractères au maximum).', 400);
        }

        if ($nouveau !== $confirmation) {
            Response::erreur('Les deux mots de passe ne sont pas identiques.', 400);
        }

        $hash = $this->utilisateurs->findHashById($id);

        // 403 et non 401 : la session est valide, c'est la preuve demandée qui manque.
        if ($hash === null || !password_verify($ancien, $hash)) {
            Response::erreur('Le mot de passe actuel est incorrect.', 403);
        }

        $this->utilisateurs->updatePassword($id, password_hash($nouveau, PASSWORD_DEFAULT));

        // Les identifiants ont changé : on renouvelle l'identifiant de session.
        session_regenerate_id(true);

        Response::json(['modifie' => true]);
    }

    /**
     * L'identifiant du client connecté, lu dans la session.
     * Répond 401 et termine si personne n'est connecté.
     */
    private function utilisateurConnecte(): int
    {
        if (!isset($_SESSION['utilisateurId'])) {
            Response::erreur('Connecte-toi pour accéder à ton espace personnel.', 401);
        }

        return (int) $_SESSION['utilisateurId'];
    }
}
