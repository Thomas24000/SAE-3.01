/**
 * Promotion automatique (US PRO-c) : le serveur décide quel produit est remisé et
 * renvoie, pour chaque format, son prix remisé (prixPromoCents, null sinon).
 * Ces fonctions ne calculent aucune remise : elles lisent ce que le serveur a dit.
 * Le serveur recalcule de toute façon le prix à la validation de la commande.
 */

/**
 * Le format est-il en promotion ?
 *
 * @param {{prixPromoCents?: number|null}} variante - un format renvoyé par l'API.
 * @returns {boolean} true si le serveur lui a donné un prix promotionnel.
 */
export function enPromotion(variante) {
  return typeof variante.prixPromoCents === "number";
}

/**
 * Le prix à payer pour un format : son prix promotionnel s'il en a un, sinon son prix plein.
 *
 * @param {{prixCents: number, prixPromoCents?: number|null}} variante - un format renvoyé par l'API.
 * @returns {number} le prix en centimes.
 */
export function prixEffectif(variante) {
  return enPromotion(variante) ? variante.prixPromoCents : variante.prixCents;
}
