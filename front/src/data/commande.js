import { getRequest, postRequest } from "../lib/api-request.js";

let CommandeData = {};

/**
 * Valide une commande : POST /api/commande
 *
 * Seuls les identifiants de variantes, d'options et les quantités partent au
 * serveur : il relit lui-même les prix, les suppléments et le total. Réponse : { commande: { numero, statut,
 * totalCents } }.
 *
 * Lève une ErreurApi (401 non connecté, 400 panier invalide, 409 article retiré
 * de la vente).
 *
 * @param {Array<{variantId: number, quantite: number, options: number[]}>} lignes - les lignes du panier.
 */
CommandeData.create = function (lignes) {
  return postRequest("commande", { lignes });
};

/**
 * Le détail d'une commande du client connecté : GET /api/commande?numero=…
 *
 * Réponse : { commande: { numero, statut, totalCents, creeLe, email, lignes:
 * [{ produit, libelle, prixUnitaireCents, quantite, totalCents, options: [{ groupe,
 * libelle, supplementCents }] }] } }. Les prix (suppléments des options compris)
 * et les options sont ceux du moment de la commande.
 *
 * Lève une ErreurApi (401 non connecté, 404 commande inconnue).
 *
 * @param {string} numero - le numéro de commande (ex. CC-2026-000123).
 */
CommandeData.fetchOne = function (numero) {
  return getRequest(`commande?numero=${encodeURIComponent(numero)}`);
};

/**
 * L'historique des commandes du client connecté : GET /api/commandes
 *
 * Réponse : { commandes: [{ numero, statut, totalCents, creeLe }], total, page,
 * pages }, de la plus récente à la plus ancienne. Un filtre vide n'est pas envoyé.
 *
 * Lève une ErreurApi (401 non connecté, 400 filtre invalide).
 *
 * @param {{statut: string, du: string, au: string}} filtres - statut ("" pour tous),
 *   dates AAAA-MM-JJ ("" si absentes).
 * @param {number} page - le numéro de page, à partir de 1.
 */
CommandeData.fetchAll = function (filtres, page) {
  let query = new URLSearchParams();
  if (filtres.statut !== "") query.set("statut", filtres.statut);
  if (filtres.du !== "") query.set("du", filtres.du);
  if (filtres.au !== "") query.set("au", filtres.au);
  query.set("page", String(page));

  return getRequest(`commandes?${query.toString()}`);
};

export { CommandeData };
