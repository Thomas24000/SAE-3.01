<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Accès aux paramètres de l'application, stockés en couples clé / valeur dans
 * la table « parametre ».
 */
final class ParametreModel
{
    /** Seuil utilisé si la ligne est absente ou invalide en base. */
    private const SEUIL_DEFAUT = 5;

    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Stock à partir duquel (inclus) un produit est « Bientôt épuisé ».
     *
     * @return int Un entier positif ou nul ; 5 si le paramètre est absent ou invalide.
     */
    public function seuilBientotEpuise(): int
    {
        $requete = $this->pdo->prepare('SELECT valeur FROM parametre WHERE cle = :cle');
        $requete->execute(['cle' => 'seuil_bientot_epuise']);
        $valeur = $requete->fetchColumn();

        if ($valeur === false || preg_match('/^[0-9]{1,9}$/', (string) $valeur) !== 1) {
            return self::SEUIL_DEFAUT;
        }

        return (int) $valeur;
    }
}
