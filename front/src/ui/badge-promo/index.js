import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Badge de la promotion automatique (US PRO-c) : « Promo −20 % ».
let BadgePromoView = {
  /**
   * @param {number} pourcent - le pourcentage de remise annoncé par l'API.
   * @returns {DocumentFragment}
   */
  dom: function (pourcent) {
    return htmlToFragment(genericRenderer(template, { libelle: `−${pourcent} %` }));
  },
};

export { BadgePromoView };
