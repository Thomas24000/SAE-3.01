import { htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Formulaire de changement de mot de passe : l'ancien est exigé. Les champs
// ne sont jamais pré-remplis ; la validation est faite par la page, puis par
// le serveur.
let FormulaireMotDePasseView = {
  /**
   * @param {{surChangement: function(string, string, string): void}} actions - reçoit
   *   l'ancien mot de passe, le nouveau et sa confirmation.
   * @returns {DocumentFragment}
   */
  dom: function (actions) {
    let fragment = htmlToFragment(template);
    let formulaire = fragment.firstElementChild;

    formulaire.addEventListener("submit", (ev) => {
      ev.preventDefault();
      actions.surChangement(
        formulaire.elements.ancien.value,
        formulaire.elements.nouveau.value,
        formulaire.elements.confirmation.value
      );
    });

    return fragment;
  },
};

export { FormulaireMotDePasseView };
