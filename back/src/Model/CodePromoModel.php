<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Accès aux codes promotionnels (US PRO-a).
 *
 * Un code est une chaîne en majuscules (lettres, chiffres, « - » et « _ »), choisie
 * par l'administrateur, qui donne un pourcentage de réduction sur le total d'une
 * commande. Cette couche lit les codes et calcule la réduction ; elle ne décide ni
 * quand un client y a droit ni comment le total est présenté.
 */
final class CodePromoModel
{
    /** Longueur maximale d'un code (colonne code_promo.code). */
    public const LONGUEUR_MAX = 30;

    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Met un code saisi en forme canonique : espaces retirés aux extrémités et
     * majuscules, pour que « glace20 » et « GLACE20 » désignent le même code.
     *
     * @param string $saisie Le code tel que le client l'a tapé.
     * @return string Le code en majuscules.
     */
    public static function normaliser(string $saisie): string
    {
        return mb_strtoupper(trim($saisie));
    }

    /**
     * La réduction accordée par un pourcentage sur un total, arrondie au centime le
     * plus proche (la moitié vers le haut). Elle ne dépasse jamais le total.
     *
     * @param int $totalCents Le total avant réduction, en centimes.
     * @param int $pourcentage La remise, de 1 à 100.
     * @return int La réduction, en centimes.
     */
    public static function reduction(int $totalCents, int $pourcentage): int
    {
        return min($totalCents, intdiv($totalCents * $pourcentage + 50, 100));
    }

    /**
     * Le code actif qui porte ce nom, quelle que soit la casse saisie.
     *
     * @param string $saisie Le code tel que le client l'a tapé.
     * @return array{code:string, pourcentage:int}|null
     *         null si le code est inconnu, désactivé ou mal formé.
     */
    public function trouverActif(string $saisie): ?array
    {
        $code = self::normaliser($saisie);

        if ($code === '' || mb_strlen($code) > self::LONGUEUR_MAX) {
            return null;
        }

        $requete = $this->pdo->prepare(
            'SELECT code, pourcentage FROM code_promo WHERE code = :code AND actif = 1'
        );
        $requete->execute(['code' => $code]);
        $ligne = $requete->fetch();

        return $ligne === false ? null : ['code' => $ligne['code'], 'pourcentage' => (int) $ligne['pourcentage']];
    }
}
