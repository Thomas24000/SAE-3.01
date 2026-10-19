import { getRequest } from "../lib/api-request.js";

let StatsData = {};

/**
 * Indicateurs du back-office : GET /api/admin/stats, réservé aux
 * administrateurs (401 sans session administrateur).
 *
 * { total: 12, stockTotal: 480, prixMoyenCents: 520, commandes: 7,
 *   parCategorie: [ { categorie: "Pots classiques", nombre: 4 }, ... ] }
 * total = nombre de produits. Le prix moyen est celui des variantes, en centimes.
 */
StatsData.fetch = async function () {
  return getRequest("admin/stats");
};

export { StatsData };
