// Stock à partir duquel un produit ou une variante est « Bientôt épuisé ».
// Valeur provisoire : elle ira dans la table de paramètres avec la US STK-b.
const SEUIL_BIENTOT_EPUISE = 5;

/**
 * Statut d'un stock.
 *
 * @param {number} stock - le stock de la variante, ou le stock total du produit.
 * @returns {"epuise"|"bientot"|"disponible"} "epuise" si le stock est nul,
 *          "bientot" s'il est sous le seuil, sinon "disponible".
 */
export function statutStock(stock) {
  if (stock === 0) return "epuise";
  if (stock <= SEUIL_BIENTOT_EPUISE) return "bientot";
  return "disponible";
}
