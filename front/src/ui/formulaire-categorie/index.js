import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { MessageView } from "../message/index.js";
import template from "./template.html?raw";

// Formulaire de création ou de modification d'une catégorie. Il transmet les
// champs saisis ; c'est le serveur qui valide.
let FormulaireCategorieView = {
  /**
   * @param {{libelle: string, description: string, bouton: string, enCours: boolean,
   *          message: ({type: string, texte: string}|null)}} data - bouton : le texte du bouton
   *   d'envoi ; enCours : vrai pendant l'envoi (le bouton est alors inactif).
   * @param {{surEnvoi: function(string, string): void}} actions - appelée avec le nom et la
   *   description saisis.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        libelle: data.libelle,
        description: data.description,
        bouton: data.bouton,
        enCours: String(data.enCours),
      })
    );
    fragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

    let formulaire = fragment.querySelector("form");
    formulaire.addEventListener("submit", (ev) => {
      // Sans cela, le navigateur rechargerait la page.
      ev.preventDefault();
      if (data.enCours) return;
      actions.surEnvoi(formulaire.elements.libelle.value, formulaire.elements.description.value);
    });

    return fragment;
  },
};

export { FormulaireCategorieView };
