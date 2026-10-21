import { getRequest, postRequest } from "../lib/api-request.js";
import { AdminData } from "./admin.js";

let CodePromoAdminData = {};

/**
 * En-têtes d'une écriture admin : le jeton CSRF reçu à la connexion.
 */
let entetes = function () {
  return { "X-CSRF-Token": AdminData.csrf ?? "" };
};

/**
 * Les codes promotionnels et leurs statistiques : GET /api/admin/codes-promo
 *
 * { codes: [{ id, code, pourcentage, actif, creeLe, utilisations, reductionCents,
 *   chiffreAffairesCents, derniereUtilisation, supprimable }],
 *   resume: { nombre, actifs, utilisations, reductionCents } }
 * Les utilisations ne comptent pas les commandes annulées ; les montants sont en
 * centimes ; derniereUtilisation vaut null pour un code jamais utilisé ;
 * supprimable est faux dès qu'une commande a cité le code.
 * Lève une ErreurApi (401 sans session administrateur).
 */
CodePromoAdminData.fetchAll = async function () {
  return getRequest("admin/codes-promo");
};

/**
 * Crée un code : POST /api/admin/codes-promo
 *
 * Réponse : { code: { id, code, pourcentage, actif } }
 * Lève une ErreurApi (400 code ou pourcentage invalide, 403 jeton CSRF, 409 code déjà pris).
 *
 * @param {string} code - le code, 3 à 30 caractères (le serveur le met en majuscules).
 * @param {number} pourcentage - la remise, de 1 à 100.
 * @param {boolean} actif - faux pour créer un code déjà désactivé.
 */
CodePromoAdminData.create = async function (code, pourcentage, actif) {
  return postRequest("admin/codes-promo", { code, pourcentage, actif }, entetes());
};

/**
 * Change le pourcentage et l'état d'un code : POST /api/admin/codes-promo/modifier
 * Le code lui-même ne se modifie jamais.
 *
 * Réponse : { code: { id, pourcentage, actif } }
 * Lève une ErreurApi (400, 403, 404 code inconnu).
 */
CodePromoAdminData.update = async function (id, pourcentage, actif) {
  return postRequest("admin/codes-promo/modifier", { id, pourcentage, actif }, entetes());
};

/**
 * Supprime un code jamais utilisé : POST /api/admin/codes-promo/supprimer
 *
 * Réponse : { supprime: true }
 * Lève une ErreurApi (400, 403, 404 code inconnu, 409 code déjà utilisé).
 */
CodePromoAdminData.remove = async function (id) {
  return postRequest("admin/codes-promo/supprimer", { id }, entetes());
};

export { CodePromoAdminData };
