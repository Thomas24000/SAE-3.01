import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { MessageView } from "../message/index.js";
import template from "./template.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

// Modale de confirmation d'une suppression, sans choix à faire. Elle est un
// <dialog> natif : la page l'ouvre (showModal), le navigateur gère le focus et
// la touche Échap.
let ModaleConfirmationView = {
  /**
   * @param {{titre: string, texte: string, bouton: string, enCours: boolean,
   *          message: ({type: string, texte: string}|null)}} data - bouton : le texte du bouton
   *   de confirmation ; enCours : vrai pendant l'envoi (le bouton est alors inactif).
   * @param {{surConfirmation: function(): void, surAnnulation: function(): void}} actions -
   *   surAnnulation est aussi appelée à la fermeture par Échap.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        images: IMAGES,
        titre: data.titre,
        texte: data.texte,
        bouton: data.bouton,
        enCours: String(data.enCours),
      })
    );
    fragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

    let dialog = fragment.firstElementChild;
    fragment.querySelector("form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (!data.enCours) actions.surConfirmation();
    });
    fragment.querySelector('[data-action="annuler"]').addEventListener("click", () => dialog.close());
    // « close » couvre le bouton Annuler et la touche Échap.
    dialog.addEventListener("close", () => actions.surAnnulation());

    return fragment;
  },
};

export { ModaleConfirmationView };
