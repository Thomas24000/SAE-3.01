import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateChip from "./chip.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const ETATS = {
  defaut: "border border-border-default bg-bg-default text-fg-default hover:border-border-strong",
  selectionne: "border border-border-brand bg-bg-brand text-fg-on-brand",
};

// Rangée de filtres par catégorie (« chips »). Une chip dont le slug est vide
// représente « tous les produits ».
let FiltresCategoriesView = {
  /**
   * @param {Array<{slug: string, libelle: string, selectionne: boolean}>} chips
   * @param {function(string): void} surChoix - reçoit le slug de la chip cliquée ("" pour tous).
   * @returns {DocumentFragment}
   */
  dom: function (chips, surChoix) {
    let fragment = htmlToFragment(template);

    let elements = chips.map((chip) =>
      htmlToFragment(
        genericRenderer(templateChip, {
          slug: chip.slug,
          libelle: chip.libelle,
          selectionne: chip.selectionne,
          classes: chip.selectionne ? ETATS.selectionne : ETATS.defaut,
        })
      )
    );
    fragment.querySelector('slot[name="chips"]').replaceWith(...elements);

    // Délégation : un seul écouteur sur la rangée.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button[data-categorie]");
      if (bouton === null) return;

      surChoix(bouton.dataset.categorie);
    });

    return fragment;
  },
};

export { FiltresCategoriesView };
