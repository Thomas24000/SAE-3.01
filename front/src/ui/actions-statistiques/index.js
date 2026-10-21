import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Barre d'actions des statistiques : l'heure des chiffres affichés, un bouton
// pour les relire et un bouton pour les exporter. Présentatif.
let ActionsStatistiquesView = {
  /**
   * @param {{genereLe: string}} data - genereLe : le texte « Chiffres du … » déjà prêt.
   * @param {{surActualisation: function(): void, surExport: function(): void}} actions
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(genericRenderer(template, { genereLe: data.genereLe }));

    // Délégation : un seul écouteur sur la racine.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button[data-action]");
      if (bouton === null) return;

      if (bouton.dataset.action === "actualiser") actions.surActualisation();
      else if (bouton.dataset.action === "exporter") actions.surExport();
    });

    return fragment;
  },
};

export { ActionsStatistiquesView };
