<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Accès aux toppings pour le back-office : leur liste avec leurs doses en stock
 * et le réapprovisionnement. Un topping est un choix de type « topping » de la
 * table option_choix, commun à tous les produits.
 */
final class ToppingAdminModel
{
    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Tous les toppings, par ordre alphabétique, avec le nombre de catégories
     * qui les proposent.
     *
     * @return array<int, array{id:int, libelle:string, supplementCents:int, stock:int, nombreCategories:int}>
     */
    public function lister(): array
    {
        $lignes = $this->pdo->query(
            'SELECT option_choix.id, option_choix.libelle, option_choix.supplement_cents, option_choix.stock,
                    (SELECT COUNT(*) FROM categorie_topping WHERE categorie_topping.choix_id = option_choix.id) AS nombre_categories
               FROM option_choix
              WHERE option_choix.type = \'topping\'
           ORDER BY option_choix.libelle, option_choix.id'
        )->fetchAll();

        return array_map(
            static fn (array $ligne): array => [
                'id'               => (int) $ligne['id'],
                'libelle'          => $ligne['libelle'],
                'supplementCents'  => (int) $ligne['supplement_cents'],
                'stock'            => (int) $ligne['stock'],
                'nombreCategories' => (int) $ligne['nombre_categories'],
            ],
            $lignes
        );
    }

    /**
     * Fixe le stock d'un topping. Le stock saisi remplace l'ancien : il n'est pas
     * journalisé (comme celui des variantes saisi en back-office).
     *
     * @param int $id Identifiant du topping.
     * @param int $stock Doses en stock, positif ou nul.
     * @return bool false si le topping n'existe pas.
     */
    public function definirStock(int $id, int $stock): bool
    {
        $requete = $this->pdo->prepare('SELECT 1 FROM option_choix WHERE id = :id AND type = \'topping\' FOR UPDATE');
        $requete->execute(['id' => $id]);

        if ($requete->fetchColumn() === false) {
            return false;
        }

        $this->pdo
            ->prepare('UPDATE option_choix SET stock = :stock WHERE id = :id')
            ->execute(['stock' => $stock, 'id' => $id]);

        return true;
    }
}
