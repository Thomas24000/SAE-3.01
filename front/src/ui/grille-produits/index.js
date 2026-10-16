import { htmlToFragment } from "../../lib/utils.js";
import { CarteProduitView } from "../carte-produit/index.js";
import template from "./template.html?raw";
import templateVide from "./vide.html?raw";

// Grille de cartes produit : les cartes prennent la place du <slot name="cartes">.
let GrilleProduitsView = {
  /**
   * @param {Array<Object>} produits - les produits à afficher (voir CarteProduitView).
   * @param {function(string): void} surAjout - reçoit le slug du produit dont on a cliqué « Ajouter au panier ».
   * @returns {DocumentFragment}
   */
  dom: function (produits, surAjout) {
    if (produits.length === 0) {
      return htmlToFragment(templateVide);
    }

    let fragment = htmlToFragment(template);
    let cartes = produits.map((produit) => CarteProduitView.dom(produit));
    fragment.querySelector('slot[name="cartes"]').replaceWith(...cartes);

    // Délégation : un seul écouteur sur la grille.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest('button[data-action="ajouter"]');
      if (bouton === null || bouton.disabled) return;

      surAjout(bouton.dataset.slug);
    });

    return fragment;
  },
};

export { GrilleProduitsView };
