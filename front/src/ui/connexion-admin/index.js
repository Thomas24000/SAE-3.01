import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { MessageView } from "../message/index.js";
import template from "./template.html?raw";

// Carte de connexion du back-office. Elle transmet les identifiants saisis ;
// c'est le serveur qui accepte ou refuse.
let ConnexionAdminView = {
  /**
   * @param {{email: string, message: ({type: string, texte: string}|null)}} data - email :
   *   à pré-remplir ; message : erreur à afficher, ou null.
   * @param {{surConnexion: function(string, string): void}} actions - appelée avec l'e-mail
   *   et le mot de passe saisis.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(genericRenderer(template, { email: data.email }));
    fragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

    let formulaire = fragment.querySelector("form");
    formulaire.addEventListener("submit", (ev) => {
      // Sans cela, le navigateur rechargerait la page.
      ev.preventDefault();
      actions.surConnexion(formulaire.elements.email.value.trim(), formulaire.elements.mdp.value);
    });

    return fragment;
  },
};

export { ConnexionAdminView };
