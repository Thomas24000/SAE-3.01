/**
 * Statut d'un stock.
 *
 * @param {number} stock - le stock de la variante, ou le stock total du produit.
 * @param {number} seuil - le stock à partir duquel (inclus) on est « Bientôt épuisé »,
 *        fourni par l'API (table parametre).
 * @returns {"epuise"|"bientot"|"disponible"} "epuise" si le stock est nul,
 *          "bientot" s'il est au plus égal au seuil, sinon "disponible".
 */
export function statutStock(stock, seuil) {
  if (stock === 0) return "epuise";
  if (stock <= seuil) return "bientot";
  return "disponible";
}
