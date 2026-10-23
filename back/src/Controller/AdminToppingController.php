<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Core\SessionAdmin;
use App\Model\ParametreModel;
use App\Model\ToppingAdminModel;

/**
 * Gestion du stock des toppings par les administrateurs.
 *
 * Toute route exige une session administrateur ; l'écriture exige en plus le
 * jeton CSRF. Le serveur revalide tout : le navigateur ne fait pas foi.
 */
final class AdminToppingController
{
    private const STOCK_MAX = 1000000;

    /** Le modèle des toppings, fourni à la construction. */
    private ToppingAdminModel $toppings;

    /** Le modèle des paramètres (seuil « Bientôt épuisé »), fourni à la construction. */
    private ParametreModel $parametres;

    public function __construct(ToppingAdminModel $toppings, ParametreModel $parametres)
    {
        $this->toppings   = $toppings;
        $this->parametres = $parametres;
    }

    /**
     * GET /api/admin/toppings : les toppings et le seuil « Bientôt épuisé ».
     *
     * Réponse : { toppings: [{ id, libelle, supplementCents, stock, nombreCategories }],
     * seuilBientotEpuise }
     * Erreur : 401 sans session administrateur.
     */
    public function index(): void
    {
        SessionAdmin::exiger();

        Response::json([
            'toppings'           => $this->toppings->lister(),
            'seuilBientotEpuise' => $this->parametres->seuilBientotEpuise(),
        ]);
    }

    /**
     * POST /api/admin/toppings/stock : fixe le stock d'un topping.
     *
     * Corps : { id, stock } (stock : entier de 0 à 1 000 000)
     * Réponse : { topping: { id, libelle, supplementCents, stock, nombreCategories } }
     * Erreurs : 401, 403 (jeton CSRF), 400 (identifiant ou stock invalide), 404.
     */
    public function updateStock(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);

        $corps = $requete->corps();
        $id    = $corps['id'] ?? null;
        $stock = $corps['stock'] ?? null;

        if (!is_int($id) || $id < 1) {
            Response::erreur('Identifiant invalide.', 400);
        }
        if (!is_int($stock) || $stock < 0 || $stock > self::STOCK_MAX) {
            Response::erreur('Le stock doit être un nombre entier entre 0 et ' . self::STOCK_MAX . '.', 400);
        }

        if (!$this->toppings->definirStock($id, $stock)) {
            Response::erreur('Topping introuvable.', 404);
        }

        $topping = array_values(array_filter(
            $this->toppings->lister(),
            static fn (array $autre): bool => $autre['id'] === $id
        ))[0];

        Response::json(['topping' => $topping]);
    }
}
