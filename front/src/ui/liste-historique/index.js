import { formaterPrix } from "../../lib/format.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { BadgeStatutCommandeView } from "../badge-statut-commande/index.js";
import template from "./template.html?raw";
import templateLigne from "./ligne.html?raw";
import templateVide from "./vide.html?raw";

// Historique des commandes : une ligne par commande (numéro, date, statut,
// montant) qui mène à son détail. Lecture seule ; liste vide gérée.
let ListeHistoriqueView = {
  /**
   * @param {{commandes: Array<{numero: string, statut: string, date: string, totalCents: number}>,
   *          texteVide: string}} data - statut est le code ("en_cours"…), date est déjà lisible,
   *   le montant est en centimes ; texteVide : le message si la liste est vide.
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    let fragment = htmlToFragment(template);
    let lignes =
      data.commandes.length === 0
        ? [htmlToFragment(genericRenderer(templateVide, { texte: data.texteVide }))]
        : data.commandes.map((commande) => {
            let ligne = htmlToFragment(
              genericRenderer(templateLigne, {
                numero: commande.numero,
                date: commande.date,
                total: formaterPrix(commande.totalCents),
              })
            );
            ligne.querySelector('slot[name="statut"]').replaceWith(BadgeStatutCommandeView.dom(commande.statut));
            return ligne;
          });
    fragment.querySelector('slot[name="lignes"]').replaceWith(...lignes);
    return fragment;
  },
};

export { ListeHistoriqueView };
