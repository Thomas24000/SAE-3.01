import { formaterPrix } from "../../lib/format.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { BadgeStatutCommandeView } from "../badge-statut-commande/index.js";
import template from "./template.html?raw";
import templateLigne from "./ligne.html?raw";
import templateVide from "./vide.html?raw";

// Historique des commandes : une ligne par commande (numéro, date, statut,
// montant) qui mène à son détail, avec un bouton « Commander à nouveau ».
// Liste vide gérée.
let ListeHistoriqueView = {
  /**
   * @param {{commandes: Array<{numero: string, statut: string, date: string, totalCents: number}>,
   *          texteVide: string, enCours: boolean}} data - statut est le code ("en_cours"…), date est
   *   déjà lisible, le montant est en centimes ; texteVide : le message si la liste est vide ;
   *   enCours : true pendant qu'une reprise s'exécute (les boutons sont alors désactivés).
   * @param {{surReprise: function(string): void}} actions - appelée avec le numéro de la commande
   *   à recommander.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
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
                desactive: data.enCours ? "disabled" : "",
              })
            );
            ligne.querySelector('slot[name="statut"]').replaceWith(BadgeStatutCommandeView.dom(commande.statut));
            return ligne;
          });
    fragment.querySelector('slot[name="lignes"]').replaceWith(...lignes);

    // Délégation : un seul écouteur sur la liste.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest('button[data-action="reprise"]');
      if (bouton === null || bouton.disabled) return;
      actions.surReprise(bouton.dataset.numero);
    });

    return fragment;
  },
};

export { ListeHistoriqueView };
