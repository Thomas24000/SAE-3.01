import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Formulaire de modification du nom et de l'e-mail. Il transmet les valeurs
// saisies ; la validation est faite par la page, puis par le serveur.
let FormulaireProfilView = {
  /**
   * @param {{nom: string, email: string}} data - valeurs à pré-remplir.
   * @param {{surEnregistrement: function(string, string): void}} actions
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(genericRenderer(template, { nom: data.nom, email: data.email }));
    let formulaire = fragment.firstElementChild;

    formulaire.addEventListener("submit", (ev) => {
      ev.preventDefault();
      actions.surEnregistrement(
        formulaire.elements.nom.value.trim(),
        formulaire.elements.email.value.trim()
      );
    });

    return fragment;
  },
};

export { FormulaireProfilView };
