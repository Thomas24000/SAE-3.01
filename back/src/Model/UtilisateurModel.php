<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Accès aux comptes utilisateurs (US CMD-c).
 *
 * Cette couche lit et écrit la table utilisateur : elle ne vérifie ni les
 * mots de passe ni les droits, c'est le rôle du contrôleur.
 */
final class UtilisateurModel
{
    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Le compte qui porte cet e-mail, avec son mot de passe haché.
     *
     * @return array{id:int, email:string, motDePasse:string, role:string}|null
     *         null si aucun compte ne porte cet e-mail.
     */
    public function findByEmail(string $email): ?array
    {
        $requete = $this->pdo->prepare(
            'SELECT id, email, mot_de_passe, role
               FROM utilisateur
              WHERE email = :email'
        );
        $requete->execute(['email' => $email]);
        $ligne = $requete->fetch();

        if ($ligne === false) {
            return null;
        }

        return [
            'id'         => (int) $ligne['id'],
            'email'      => $ligne['email'],
            'motDePasse' => $ligne['mot_de_passe'],
            'role'       => $ligne['role'],
        ];
    }

    /**
     * Crée un compte client.
     *
     * Lève une PDOException (SQLSTATE 23000) si l'e-mail est déjà pris : la
     * contrainte UNIQUE tranche même si deux inscriptions arrivent en même temps.
     *
     * @param string $hash Mot de passe déjà haché par password_hash().
     * @return int Identifiant du compte créé.
     */
    public function create(string $email, string $hash): int
    {
        $requete = $this->pdo->prepare(
            "INSERT INTO utilisateur (email, mot_de_passe, role)
             VALUES (:email, :mot_de_passe, 'client')"
        );
        $requete->execute(['email' => $email, 'mot_de_passe' => $hash]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Le profil d'un compte, sans son mot de passe.
     *
     * @param int $id Identifiant du compte.
     * @return array{id:int, email:string, nom:?string, role:string, creeLe:string}|null
     *         null si le compte n'existe plus.
     */
    public function findById(int $id): ?array
    {
        $requete = $this->pdo->prepare(
            'SELECT id, email, nom, role, cree_le FROM utilisateur WHERE id = :id'
        );
        $requete->execute(['id' => $id]);
        $ligne = $requete->fetch();

        if ($ligne === false) {
            return null;
        }

        return [
            'id'     => (int) $ligne['id'],
            'email'  => $ligne['email'],
            'nom'    => $ligne['nom'],
            'role'   => $ligne['role'],
            'creeLe' => $ligne['cree_le'],
        ];
    }

    /**
     * Le mot de passe haché d'un compte, pour vérifier l'ancien mot de passe.
     *
     * @return string|null null si le compte n'existe plus.
     */
    public function findHashById(int $id): ?string
    {
        $requete = $this->pdo->prepare('SELECT mot_de_passe FROM utilisateur WHERE id = :id');
        $requete->execute(['id' => $id]);
        $hash = $requete->fetchColumn();

        return $hash === false ? null : (string) $hash;
    }

    /**
     * Met à jour le nom et l'e-mail d'un compte.
     *
     * Lève une PDOException (SQLSTATE 23000) si l'e-mail est déjà pris.
     *
     * @param string|null $nom Nom d'affichage, ou null pour l'effacer.
     */
    public function updateProfile(int $id, ?string $nom, string $email): void
    {
        $requete = $this->pdo->prepare(
            'UPDATE utilisateur SET nom = :nom, email = :email WHERE id = :id'
        );
        $requete->execute(['nom' => $nom, 'email' => $email, 'id' => $id]);
    }

    /**
     * Remplace le mot de passe d'un compte.
     *
     * @param string $hash Nouveau mot de passe déjà haché par password_hash().
     */
    public function updatePassword(int $id, string $hash): void
    {
        $requete = $this->pdo->prepare(
            'UPDATE utilisateur SET mot_de_passe = :hash WHERE id = :id'
        );
        $requete->execute(['hash' => $hash, 'id' => $id]);
    }
}
