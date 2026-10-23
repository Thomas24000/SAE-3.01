import { getRequest, postRequest } from "../lib/api-request.js";
import { AdminData } from "./admin.js";

let ToppingAdminData = {};

/**
 * Les toppings et leurs doses en stock : GET /api/admin/toppings
 *
 * { toppings: [{ id, libelle, supplementCents, stock, nombreCategories }], seuilBientotEpuise }
 * Les suppléments sont en centimes ; stock est un nombre de doses, commun à tous les produits.
 * Lève une ErreurApi (401 sans session administrateur).
 */
ToppingAdminData.fetchAll = async function () {
  return getRequest("admin/toppings");
};

/**
 * Fixe le stock d'un topping : POST /api/admin/toppings/stock
 *
 * Réponse : { topping } (voir fetchAll). Le jeton CSRF reçu à la connexion accompagne la requête.
 * Lève une ErreurApi (400 stock invalide, 403 jeton CSRF, 404 topping inconnu).
 */
ToppingAdminData.saveStock = async function (id, stock) {
  return postRequest("admin/toppings/stock", { id, stock }, { "X-CSRF-Token": AdminData.csrf ?? "" });
};

export { ToppingAdminData };
