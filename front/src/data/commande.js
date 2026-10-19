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

export { CommandeData };
