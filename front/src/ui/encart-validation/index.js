import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import template from "./template.html?raw";

// Encart de fin de récapitulatif : total, compte du client et bouton explicite
// « Confirmer ma commande ». Pendant l'envoi, le bouton reste focalisable mais
// ne réagit plus (aria-disabled), pour ne pas valider deux fois.
let EncartValidationView = {
  /**
   * @param {{totalCents: number, email: string, enCours: boolean}} data
   *        totalCents en centimes ; enCours vrai pendant l'envoi de la commande.
   * @param {{surConfirmation: function(): void}} actions
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        total: formaterPrix(data.totalCents),
        email: data.email,
        enCours: data.enCours ? "true" : "false",
        libelle: data.enCours ? "Validation en cours…" : "Confirmer ma commande",
      })
    );

    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest('button[data-action="confirmer"]');
      if (bouton === null || bouton.getAttribute("aria-disabled") === "true") return;

      actions.surConfirmation();
    });

    return fragment;
  },
};

export { EncartValidationView };
