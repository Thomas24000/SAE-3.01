import { formaterPrix } from "../../lib/format.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLigne from "./ligne.html?raw";
import templateVide from "./vide.html?raw";

// Aperçu des commandes récentes : une ligne par commande, qui mène à sa
// confirmation. Lecture seule ; liste vide gérée.
let ApercuCommandesView = {
  /**
   * @param {{resume: string, commandes: Array<{numero: string, statut: string,
   *          date: string, totalCents: number}>}} data - resume : phrase d'introduction ;
   *   statut et date sont déjà lisibles, le montant est en centimes.
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    let fragment = htmlToFragment(genericRenderer(template, { resume: data.resume }));
    let lignes =
      data.commandes.length === 0
        ? [htmlToFragment(templateVide)]
        : data.commandes.map((commande) =>
            htmlToFragment(
              genericRenderer(templateLigne, {
                numero: commande.numero,
                statut: commande.statut,
                date: commande.date,
                total: formaterPrix(commande.totalCents),
              })
            )
          );
    fragment.querySelector('slot[name="lignes"]').replaceWith(...lignes);
    return fragment;
  },
};

export { ApercuCommandesView };
