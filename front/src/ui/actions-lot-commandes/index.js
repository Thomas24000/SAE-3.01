import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateBouton from "./bouton.html?raw";

// Barre d'actions en lot, affichée quand au moins une commande est cochée.
let ActionsLotCommandesView = {
  /**
   * @param {{nombre: number, actions: Array<{statut: string, libelle: string}>}} data - nombre :
   *   les commandes cochées ; actions : les boutons à proposer.
   * @param {{surAction: function(string): void}} actions - appelée avec le statut visé.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        texte: `${data.nombre} ${data.nombre > 1 ? "commandes sélectionnées" : "commande sélectionnée"}`,
      })
    );
    fragment
      .querySelector('slot[name="boutons"]')
      .replaceWith(...data.actions.map((action) => htmlToFragment(genericRenderer(templateBouton, action))));

    // Délégation : un seul écouteur sur la racine.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button[data-statut]");
      if (bouton === null) return;
      actions.surAction(bouton.dataset.statut);
    });

    return fragment;
  },
};

export { ActionsLotCommandesView };
