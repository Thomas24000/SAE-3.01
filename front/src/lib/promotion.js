/**
 * Promotion automatique (US PRO-c) : le serveur décide quel produit est remisé et
 * renvoie, pour chaque format, son prix remisé (prixPromoCents, null sinon).
 * Ces fonctions ne calculent aucune remise : elles lisent ce que le serveur a dit.
 * Le serveur recalcule de toute façon le prix à la validation de la commande.
 */

/**
 * La réduction d'un code promotionnel sur un total (US PRO-a), arrondie au centime
 * le plus proche (moitié vers le haut), sans jamais dépasser le total. C'est le
 * même calcul que le serveur (CodePromoModel::reduction) ; elle sert à afficher le
 * total avant la validation, le serveur restant seul juge du montant facturé.
 *
 * @param {number} totalCents - le total avant réduction, en centimes.
 * @param {number} pourcent - la remise du code, de 1 à 100.
 * @returns {number} la réduction, en centimes.
 */
export function reductionCents(totalCents, pourcent) {
  return Math.min(totalCents, Math.floor((totalCents * pourcent + 50) / 100));
}

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
