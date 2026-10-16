import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import template from "./template.html?raw";
import templateLigne from "./ligne-categorie.html?raw";

// Tableau de bord de la zone d'administration.
// Un template par élément répété : la ligne de catégorie a le sien, et chaque
// ligne prend place dans le <slot name="categories">.
let StatistiquesView = {
  /**
   * @param {{total: number, stockTotal: number, prixMoyenCents: number,
   *          parCategorie: Array<{categorie: string, nombre: number}>}} stats
   * @returns {DocumentFragment}
   */
  dom: function (stats) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        total: stats.total,
        stockTotal: stats.stockTotal,
        prixMoyen: formaterPrix(stats.prixMoyenCents),
      })
    );

    let lignes = stats.parCategorie.map((ligne) => htmlToFragment(genericRenderer(templateLigne, ligne)));
    fragment.querySelector('slot[name="categories"]').replaceWith(...lignes);

    return fragment;
  },
};

export { StatistiquesView };
