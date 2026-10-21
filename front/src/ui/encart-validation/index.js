import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import template from "./template.html?raw";
import templateReduction from "./reduction.html?raw";

// Encart de fin de récapitulatif : total, compte du client et bouton explicite
// « Confirmer ma commande ». Pendant l'envoi, le bouton reste focalisable mais
// ne réagit plus (aria-disabled), pour ne pas valider deux fois.
let EncartValidationView = {
  /**
   * @param {{totalCents: number, email: string, enCours: boolean,
   *          reduction: ({code: string, pourcentage: number, sousTotalCents: number, cents: number}|null)}} data
   *        totalCents : le total à payer en centimes, réduction déduite ; enCours vrai pendant l'envoi
   *        de la commande ; reduction : le code promo appliqué (US PRO-a), ou null — le sous-total et
   *        la ligne de réduction ne sont affichés que dans ce cas.
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

    let slotReduction = fragment.querySelector('slot[name="reduction"]');
    if (data.reduction === null) {
      slotReduction.remove();
    } else {
      slotReduction.replaceWith(
        htmlToFragment(
          genericRenderer(templateReduction, {
            sousTotal: formaterPrix(data.reduction.sousTotalCents),
            code: data.reduction.code,
            pourcentage: `−${data.reduction.pourcentage} %`,
            reduction: formaterPrix(data.reduction.cents),
          })
        )
      );
    }

    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest('button[data-action="confirmer"]');
      if (bouton === null || bouton.getAttribute("aria-disabled") === "true") return;

      actions.surConfirmation();
    });

    return fragment;
  },
};

export { EncartValidationView };
