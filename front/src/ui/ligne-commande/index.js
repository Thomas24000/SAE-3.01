import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import template from "./template.html?raw";

// Une ligne de commande, en lecture seule : produit, format, quantité × prix
// unitaire et total de la ligne. Elle ne réagit à aucune action.
let LigneCommandeView = {
  /**
   * @param {{nom: string, libelle: string, quantite: number,
   *          prixUnitaireCents: number, totalCents: number}} data - montants en centimes.
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    return htmlToFragment(
      genericRenderer(template, {
        nom: data.nom,
        libelle: data.libelle,
        quantite: data.quantite,
        prixUnitaire: formaterPrix(data.prixUnitaireCents),
        total: formaterPrix(data.totalCents),
      })
    );
  },
};

export { LigneCommandeView };
