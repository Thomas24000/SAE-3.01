import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import template from "./template.html?raw";

// Une ligne du panier : miniature, produit, format, quantité et prix de la ligne.
let LignePanierView = {
  /**
   * @param {{variantId: number, nom: string, slug: string, libelle: string,
   *          image: string, teinte: number, quantite: number, totalCents: number,
   *          moinsPossible: boolean, plusPossible: boolean}} data
   *        totalCents : prix de la ligne en centimes (prix du format × quantité) ;
   *        plusPossible : false quand la quantité atteint le stock de la variante.
   * @param {{surQuantite: function(number, number): void, surSuppression: function(number): void}} actions
   *        surQuantite reçoit l'identifiant de la variante puis -1 ou 1 ;
   *        surSuppression reçoit l'identifiant de la variante.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        id: data.variantId,
        nom: data.nom,
        slug: data.slug,
        libelle: data.libelle,
        image: data.image,
        teinte: data.teinte,
        quantite: data.quantite,
        prix: formaterPrix(data.totalCents),
        moinsDesactive: data.moinsPossible ? "" : "disabled",
        plusDesactive: data.plusPossible ? "" : "disabled",
        alerteStock: data.plusPossible ? "hidden" : "",
      })
    );

    // Délégation : un seul écouteur sur la ligne.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button");
      if (bouton === null || bouton.disabled) return;

      let id = Number(bouton.dataset.varianteId);
      if (bouton.dataset.quantiteDelta !== undefined) {
        actions.surQuantite(id, Number(bouton.dataset.quantiteDelta));
      } else if (bouton.dataset.action === "supprimer") {
        actions.surSuppression(id);
      }
    });

    return fragment;
  },
};

export { LignePanierView };
