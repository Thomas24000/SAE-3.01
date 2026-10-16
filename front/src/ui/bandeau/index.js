import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Bandeau d'accueil : accroche, bouton et visuel. Il reçoit l'adresse du visuel
// et signale le clic sur « Découvrir nos glaces » par surDecouvrir.
let BandeauView = {
  /**
   * @param {string} image - adresse du visuel.
   * @param {function(): void} surDecouvrir - appelée au clic sur le bouton.
   * @returns {DocumentFragment}
   */
  dom: function (image, surDecouvrir) {
    let fragment = htmlToFragment(genericRenderer(template, { image: image }));

    fragment.querySelector('[data-action="decouvrir"]').addEventListener("click", (ev) => {
      ev.preventDefault();
      surDecouvrir();
    });

    return fragment;
  },
};

export { BandeauView };
