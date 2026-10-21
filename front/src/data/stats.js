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

/**
 * Statistiques détaillées du back-office : GET /api/admin/statistiques, réservé
 * aux administrateurs (401 sans session). Relues à chaque appel, jamais en cache.
 *
 * { genereLe, seuilBientotEpuise, stocks: [{ produit, categorie, stock }],
 *   revenus: [{ jour, commandes, totalCents }], commandes: { total, parStatut },
 *   meilleuresVentes: [{ produit, quantite, totalCents }] }
 * revenus couvre les 7 derniers jours (annulées exclues) ; montants en centimes.
 */
StatsData.fetchDetail = async function () {
  return getRequest("admin/statistiques");
};

export { StatsData };
