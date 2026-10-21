import { getRequest } from "../lib/api-request.js";

let CodePromoData = {};

/**
 * Vérifie un code promotionnel : GET /api/code-promo?code=…
 *
 * Réponse : { code, pourcentage }, le code en majuscules. Rien n'est réservé : la
 * commande revérifie le code au moment de la validation.
 *
 * Lève une ErreurApi (401 non connecté, 400 code vide, 404 code inconnu ou
 * désactivé, 429 trop d'essais ratés).
 *
 * @param {string} code - le code saisi par le client.
 */
CodePromoData.verify = function (code) {
  return getRequest(`code-promo?code=${encodeURIComponent(code)}`);
};

export { CodePromoData };
