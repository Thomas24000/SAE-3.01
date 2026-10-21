import { formaterPrix } from "../../lib/format.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import templateNormal from "./normal.html?raw";
import templatePromo from "./promo.html?raw";

// Un prix, ou un prix promotionnel avec l'ancien prix barré (US PRO-c). Les deux
// montants sont aussi annoncés en toutes lettres aux lecteurs d'écran : le barré
// seul ne dit pas lequel est le prix à payer. Présentatif : les montants viennent
// de l'API, ce composant ne calcule aucune remise.
let PrixPromoView = {
  /**
   * @param {{prixCents: number, prixPromoCents: (number|null)}} data - prixCents : le prix plein,
   *   en centimes ; prixPromoCents : le prix à payer s'il y a une promotion, sinon null.
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    if (data.prixPromoCents === null || data.prixPromoCents === undefined) {
      return htmlToFragment(genericRenderer(templateNormal, { prix: formaterPrix(data.prixCents) }));
    }

    return htmlToFragment(
      genericRenderer(templatePromo, {
        ancien: formaterPrix(data.prixCents),
        nouveau: formaterPrix(data.prixPromoCents),
      })
    );
  },
};

export { PrixPromoView };
