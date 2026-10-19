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
     * Le compte qui porte ce login, avec son mot de passe haché.
     *
     * @return array{id:int, login:string, motDePasse:string, role:string}|null
     *         null si aucun compte ne porte ce login.
     */
    public function findByLogin(string $login): ?array
    {
        $requete = $this->pdo->prepare(
            'SELECT id, login, mot_de_passe, role
               FROM utilisateur
              WHERE login = :login'
        );
        $requete->execute(['login' => $login]);
        $ligne = $requete->fetch();

        if ($ligne === false) {
            return null;
        }

        return [
            'id'         => (int) $ligne['id'],
            'login'      => $ligne['login'],
            'motDePasse' => $ligne['mot_de_passe'],
            'role'       => $ligne['role'],
        ];
    }

    /**
     * Crée un compte client.
     *
     * Lève une PDOException (SQLSTATE 23000) si le login est déjà pris : la
     * contrainte UNIQUE tranche même si deux inscriptions arrivent en même temps.
     *
     * @param string $hash Mot de passe déjà haché par password_hash().
     * @return int Identifiant du compte créé.
     */
    public function create(string $login, string $hash): int
    {
        $requete = $this->pdo->prepare(
            "INSERT INTO utilisateur (login, mot_de_passe, role)
             VALUES (:login, :mot_de_passe, 'client')"
        );
        $requete->execute(['login' => $login, 'mot_de_passe' => $hash]);

        return (int) $this->pdo->lastInsertId();
    }
}
