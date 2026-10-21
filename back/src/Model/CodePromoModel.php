<?php

declare(strict_types=1);

namespace App\Model;

use DomainException;
use PDO;

/**
 * Accès aux codes promotionnels (US PRO-a).
 *
 * Un code est une chaîne en majuscules (lettres, chiffres, « - » et « _ »), choisie
 * par l'administrateur, qui donne un pourcentage de réduction sur le total d'une
 * commande. Cette couche lit les codes et calcule la réduction ; elle ne décide ni
 * quand un client y a droit ni comment le total est présenté. Elle sert aussi à la
 * gestion des codes par les administrateurs (US PRO-b) : liste avec statistiques
 * d'utilisation, création, modification et suppression.
 *
 * Une commande copie le code, son pourcentage et la réduction (pas de clé étrangère) :
 * c'est à partir de ces copies qu'on compte les utilisations.
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

    /**
     * Tous les codes, avec leurs statistiques d'utilisation, les plus utilisés d'abord
     * (les codes actifs avant les désactivés).
     *
     * Une utilisation est une commande qui a servi le code, commandes annulées exclues :
     * une annulation rend le stock et ne compte donc pas comme une vente.
     *
     * @return array<int, array{id:int, code:string, pourcentage:int, actif:bool, creeLe:string,
     *                          utilisations:int, reductionCents:int, chiffreAffairesCents:int,
     *                          derniereUtilisation:string|null, supprimable:bool}>
     *         reductionCents : réductions accordées ; chiffreAffairesCents : totaux payés des
     *         commandes concernées ; supprimable : vrai si aucune commande (annulée ou non)
     *         n'a jamais utilisé ce code.
     */
    public function lister(): array
    {
        $lignes = $this->pdo->query(
            "SELECT code_promo.id, code_promo.code, code_promo.pourcentage, code_promo.actif, code_promo.cree_le,
                    COALESCE(utilises.utilisations, 0)  AS utilisations,
                    COALESCE(utilises.reduction, 0)     AS reduction,
                    COALESCE(utilises.chiffre, 0)       AS chiffre,
                    utilises.derniere                   AS derniere,
                    COALESCE(toutes.nombre, 0)          AS commandes
               FROM code_promo
          LEFT JOIN (SELECT code_promo, COUNT(*) AS utilisations, SUM(reduction_cents) AS reduction,
                            SUM(total_cents) AS chiffre, MAX(cree_le) AS derniere
                       FROM commande
                      WHERE code_promo IS NOT NULL AND statut <> 'annulee'
                   GROUP BY code_promo) AS utilises ON utilises.code_promo = code_promo.code
          LEFT JOIN (SELECT code_promo, COUNT(*) AS nombre
                       FROM commande
                      WHERE code_promo IS NOT NULL
                   GROUP BY code_promo) AS toutes ON toutes.code_promo = code_promo.code
           ORDER BY code_promo.actif DESC, utilisations DESC, code_promo.code ASC"
        )->fetchAll();

        return array_map(
            static fn (array $ligne): array => [
                'id'                   => (int) $ligne['id'],
                'code'                 => $ligne['code'],
                'pourcentage'          => (int) $ligne['pourcentage'],
                'actif'                => (bool) $ligne['actif'],
                'creeLe'               => $ligne['cree_le'],
                'utilisations'         => (int) $ligne['utilisations'],
                'reductionCents'       => (int) $ligne['reduction'],
                'chiffreAffairesCents' => (int) $ligne['chiffre'],
                'derniereUtilisation'  => $ligne['derniere'],
                'supprimable'          => (int) $ligne['commandes'] === 0,
            ],
            $lignes
        );
    }

    /**
     * Crée un code. Le format et le pourcentage sont vérifiés par le contrôleur.
     *
     * Lève une PDOException (SQLSTATE 23000) si le code existe déjà.
     *
     * @param string $code Le code, déjà en majuscules.
     * @param int $pourcentage La remise, de 1 à 100.
     * @param bool $actif Faux pour créer un code déjà désactivé.
     * @return int L'identifiant du code créé.
     */
    public function creer(string $code, int $pourcentage, bool $actif): int
    {
        $this->pdo
            ->prepare('INSERT INTO code_promo (code, pourcentage, actif) VALUES (:code, :pourcentage, :actif)')
            ->execute(['code' => $code, 'pourcentage' => $pourcentage, 'actif' => $actif ? 1 : 0]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Modifie le pourcentage et l'état d'un code. Le code lui-même ne change jamais :
     * les commandes passées le citent, il faut le garder pour leurs statistiques.
     *
     * @param int $id Identifiant du code.
     * @param int $pourcentage La remise, de 1 à 100 ; les commandes passées gardent la leur.
     * @param bool $actif Vrai pour que le code soit accepté.
     * @return bool Faux si le code n'existe pas.
     */
    public function modifier(int $id, int $pourcentage, bool $actif): bool
    {
        $existe = $this->pdo->prepare('SELECT COUNT(*) FROM code_promo WHERE id = :id');
        $existe->execute(['id' => $id]);

        if ((int) $existe->fetchColumn() === 0) {
            return false;
        }

        $this->pdo
            ->prepare('UPDATE code_promo SET pourcentage = :pourcentage, actif = :actif WHERE id = :id')
            ->execute(['pourcentage' => $pourcentage, 'actif' => $actif ? 1 : 0, 'id' => $id]);

        return true;
    }

    /**
     * Supprime un code que personne n'a jamais utilisé. Un code déjà utilisé reste en
     * base, désactivé si besoin : le supprimer ferait disparaître ses statistiques.
     *
     * @param int $id Identifiant du code.
     * @throws DomainException Avec le code HTTP 404 si le code n'existe pas, 409 s'il a déjà servi.
     */
    public function supprimer(int $id): void
    {
        $this->pdo->beginTransaction();

        try {
            $requete = $this->pdo->prepare('SELECT code FROM code_promo WHERE id = :id FOR UPDATE');
            $requete->execute(['id' => $id]);
            $code = $requete->fetchColumn();

            if ($code === false) {
                throw new DomainException('Code promo introuvable.', 404);
            }

            $usage = $this->pdo->prepare('SELECT COUNT(*) FROM commande WHERE code_promo = :code');
            $usage->execute(['code' => $code]);

            if ((int) $usage->fetchColumn() > 0) {
                throw new DomainException(
                    'Ce code a déjà servi : désactive-le plutôt que de le supprimer, pour garder ses statistiques.',
                    409
                );
            }

            $this->pdo->prepare('DELETE FROM code_promo WHERE id = :id')->execute(['id' => $id]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
