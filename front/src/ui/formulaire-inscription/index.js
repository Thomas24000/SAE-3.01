import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Formulaire de création de compte. Il transmet les trois champs saisis ; la
// validation est faite par la page, puis par le serveur.
let FormulaireInscriptionView = {
  /**
   * @param {{login: string}} data - identifiant à pré-remplir.
   * @param {{surInscription: function(string, string, string): void,
   *          surConnexion: function(): void}} actions
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(genericRenderer(template, { login: data.login }));
    let formulaire = fragment.firstElementChild;

    formulaire.addEventListener("submit", (ev) => {
      ev.preventDefault();
      actions.surInscription(
        formulaire.elements.login.value.trim(),
        formulaire.elements.mdp.value,
        formulaire.elements.confirmation.value
      );
    });

    formulaire.addEventListener("click", (ev) => {
      if (ev.target.closest('button[data-action="connexion"]') === null) return;
      actions.surConnexion();
    });

    return fragment;
  },
};

export { FormulaireInscriptionView };
