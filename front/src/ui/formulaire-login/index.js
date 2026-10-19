import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Formulaire de connexion d'un client. Il ne valide ni ne décide de rien : il
// transmet l'e-mail et le mot de passe saisis, et signale le clic sur le
// lien vers l'inscription.
let FormulaireLoginView = {
  /**
   * @param {{email: string}} data - e-mail à pré-remplir.
   * @param {{surConnexion: function(string, string): void,
   *          surInscription: function(): void}} actions
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(genericRenderer(template, { email: data.email }));
    let formulaire = fragment.firstElementChild;

    formulaire.addEventListener("submit", (ev) => {
      // Sans cela, le navigateur rechargerait la page.
      ev.preventDefault();
      actions.surConnexion(formulaire.elements.email.value.trim(), formulaire.elements.mdp.value);
    });

    formulaire.addEventListener("click", (ev) => {
      if (ev.target.closest('button[data-action="inscription"]') === null) return;
      actions.surInscription();
    });

    return fragment;
  },
};

export { FormulaireLoginView };
