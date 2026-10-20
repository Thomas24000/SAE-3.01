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

/**
 * Remet des lignes de panier d'accord avec le stock actuel (US STK-c) : une
 * quantité supérieure au stock est ramenée au stock, une variante épuisée est
 * retirée. Une ligne dont la variante est absente de `variantes` est laissée
 * telle quelle (c'est un autre contrôle qui la retire). Fonction pure : elle ne
 * modifie ni `lignes` ni `variantes`.
 *
 * @param {Array<{variantId: number, quantite: number}>} lignes - le panier du navigateur.
 * @param {Array<{variantId: number, libelle: string, stock: number, produit: {nom: string}}>} variantes
 *        les variantes relues auprès de l'API, avec leur stock actuel.
 * @returns {{lignes: Array<{variantId: number, quantite: number}>,
 *            ajustements: Array<{variantId: number, nom: string, libelle: string,
 *            type: "epuise"|"reduite", ancienneQuantite: number, quantite: number}>}}
 *          lignes : le panier ajusté ; ajustements : une entrée par ligne modifiée,
 *          avec la quantité d'origine et la quantité conservée (0 si épuisée).
 */
export function ajusterLignes(lignes, variantes) {
  let ajustements = [];

  let ajustees = lignes
    .map((ligne) => {
      let variante = variantes.find((autre) => autre.variantId === ligne.variantId);
      if (variante === undefined || ligne.quantite <= variante.stock) return ligne;

      ajustements.push({
        variantId: ligne.variantId,
        nom: variante.produit.nom,
        libelle: variante.libelle,
        type: variante.stock === 0 ? "epuise" : "reduite",
        ancienneQuantite: ligne.quantite,
        quantite: variante.stock,
      });

      return { variantId: ligne.variantId, quantite: variante.stock };
    })
    .filter((ligne) => ligne.quantite > 0);

  return { lignes: ajustees, ajustements: ajustements };
}

/**
 * Le message qui explique au client ce qui a changé dans son panier (US STK-c).
 *
 * @param {Array<{nom: string, libelle: string, type: "epuise"|"reduite",
 *        ancienneQuantite: number, quantite: number}>} ajustements - ceux d'ajusterLignes.
 * @param {number} retirees - nombre de lignes dont la variante n'existe plus.
 * @returns {string|null} le texte du message, ou null s'il n'y a rien à signaler.
 */
export function texteAjustements(ajustements, retirees) {
  let phrases = ajustements.map((ajustement) =>
    ajustement.type === "epuise"
      ? `« ${ajustement.nom} » (${ajustement.libelle}) est épuisé : il a été retiré de ton panier.`
      : `« ${ajustement.nom} » (${ajustement.libelle}) : seulement ${ajustement.quantite} en stock, la quantité est passée de ${ajustement.ancienneQuantite} à ${ajustement.quantite}.`
  );

  if (retirees > 0) {
    phrases.unshift("Un article qui n'est plus proposé a été retiré de ton panier.");
  }

  return phrases.length === 0 ? null : phrases.join(" ");
}
