import { getRequest, postRequest } from "../lib/api-request.js";
import { AdminData } from "./admin.js";

let CommandeAdminData = {};

/**
 * En-têtes d'une écriture admin : le jeton CSRF reçu à la connexion.
 */
let entetes = function () {
  return { "X-CSRF-Token": AdminData.csrf ?? "" };
};

/**
 * Les commandes de tous les clients : GET /api/admin/commandes
 *
 * tri : "date", "statut" ou "montant" ; sens : "asc" ou "desc" ; statut : un
 * statut pour filtrer, "" pour tous. Le serveur trie (liste blanche).
 * Réponse : { commandes: [{ id, numero, statut, totalCents, creeLe, client, articles }], tri, sens, statut }
 * Lève une ErreurApi (401 sans session administrateur).
 */
CommandeAdminData.fetchAll = async function (tri, sens, statut) {
  let parametres = new URLSearchParams({ tri, sens });
  if (statut !== "") parametres.set("statut", statut);
  return getRequest("admin/commandes?" + parametres.toString());
};

/**
 * Le détail d'une commande : GET /api/admin/commande?numero=...
 *
 * Réponse : { commande: { id, numero, statut, totalCents, creeLe, client, lignes, journal } }
 * Lève une ErreurApi (401, 400 numéro invalide, 404 inconnue).
 */
CommandeAdminData.fetchOne = async function (numero) {
  return getRequest("admin/commande?numero=" + encodeURIComponent(numero));
};

/**
 * Change le statut d'une ou plusieurs commandes : POST /api/admin/commandes/statut
 *
 * Réponse : { modifiees: [numero], refusees: [message] }
 * Lève une ErreurApi (400, 403 jeton CSRF, 404 aucune commande connue, 409 aucune
 * commande modifiée : le message donne les motifs).
 */
CommandeAdminData.updateStatus = async function (ids, statut) {
  return postRequest("admin/commandes/statut", { ids, statut }, entetes());
};

export { CommandeAdminData };
