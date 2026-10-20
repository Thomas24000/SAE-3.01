import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import { formaterOptions } from "../../lib/options.js";
import template from "./template.html?raw";

// Une ligne de commande, en lecture seule : produit, format, options, quantité ×
// prix unitaire et total de la ligne. Elle ne réagit à aucune action.
let LigneCommandeView = {
  /**
   * @param {{nom: string, libelle: string,
   *          options: Array<{libelle: string, supplementCents: number}>, quantite: number,
   *          prixUnitaireCents: number, totalCents: number}} data - montants en centimes ;
   *        le prix unitaire comprend les suppléments des options.
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    return htmlToFragment(
      genericRenderer(template, {
        nom: data.nom,
        libelle: data.libelle,
        optionsTexte: formaterOptions(data.options),
        optionsCachees: data.options.length === 0 ? "hidden" : "",
        quantite: data.quantite,
        prixUnitaire: formaterPrix(data.prixUnitaireCents),
        total: formaterPrix(data.totalCents),
      })
    );
  },
};

export { LigneCommandeView };
