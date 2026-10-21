<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * La promotion automatique (US PRO-c) : le produit dont le stock est le plus élevé
 * est vendu 20 % moins cher.
 *
 * Le produit en promotion n'est jamais enregistré : il se déduit des stocks à
 * chaque lecture, donc il change quand les stocks changent. Les modèles qui
 * affichent ou facturent un prix passent tous par ici, pour que l'affichage et la
 * validation d'une commande appliquent la même règle. Les méthodes sont
 * statiques parce que la règle n'a pas d'état propre : elle a seulement besoin de
 * la connexion du modèle appelant.
 */
final class PromotionModel
{
    /** Pourcentage de remise du produit en promotion. */
    public const POURCENT = 20;

    /**
     * Le produit en promotion : celui dont le stock total (somme des stocks de ses
     * variantes) est le plus élevé. À égalité, le plus ancien (plus petit
     * identifiant). Un produit épuisé n'est jamais en promotion, donc personne ne
     * l'est quand tout est épuisé.
     *
     * @param PDO $pdo La connexion du modèle appelant.
     * @return int|null L'identifiant du produit, ou null s'il n'y en a pas.
     */
    public static function produitEnPromotion(PDO $pdo): ?int
    {
        $id = $pdo->query(
            'SELECT produit_id
               FROM variante
           GROUP BY produit_id
             HAVING SUM(stock) > 0
           ORDER BY SUM(stock) DESC, produit_id ASC
              LIMIT 1'
        )->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    /**
     * Le prix remisé, arrondi au centime le plus proche.
     *
     * @param int $prixCents Le prix plein, en centimes.
     * @return int Le prix après remise, en centimes.
     */
    public static function prixRemise(int $prixCents): int
    {
        return intdiv($prixCents * (100 - self::POURCENT) + 50, 100);
    }

    /**
     * Le prix promotionnel d'un format, ou null s'il n'est pas en promotion.
     *
     * @param int $produitId Le produit du format.
     * @param int $prixCents Le prix plein du format, en centimes.
     * @param int|null $promoId Le produit en promotion (voir produitEnPromotion).
     * @return int|null Le prix remisé en centimes, ou null si le produit n'est pas en promotion.
     */
    public static function prixPromo(int $produitId, int $prixCents, ?int $promoId): ?int
    {
        return $promoId !== null && $produitId === $promoId ? self::prixRemise($prixCents) : null;
    }
}
