import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import template from "./template.html?raw";

// Encart des totaux du panier : sous-total, retrait gratuit, total, et le
// bouton qui lance la validation de la commande.
let ResumeCommandeView = {
  /**
   * @param {{sousTotalCents: number, totalCents: number}} data - montants en centimes.
   * @param {{surValidation: function(): void}} actions
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        sousTotal: formaterPrix(data.sousTotalCents),
        total: formaterPrix(data.totalCents),
      })
    );

    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest('button[data-action="valider"]');
      if (bouton === null) return;

      actions.surValidation();
    });

    return fragment;
  },
};

export { ResumeCommandeView };
