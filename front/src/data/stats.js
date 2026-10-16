import { getRequest } from "../lib/api-request.js";

let StatsData = {};

/**
 * Statistiques du catalogue : GET /api/admin/stats, réservé aux
 * administrateurs (401 sans connexion, 403 sans le rôle admin).
 *
 * { total: 12, stockTotal: 480, prixMoyenCents: 520,
 *   parCategorie: [ { categorie: "Pots classiques", nombre: 4 }, ... ] }
 * Le prix moyen est celui des variantes, en centimes.
 */
StatsData.fetch = async function () {
  return getRequest("admin/stats");
};

export { StatsData };
