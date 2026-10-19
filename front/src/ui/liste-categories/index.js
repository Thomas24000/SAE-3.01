import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLigne from "./ligne.html?raw";
import templateVide from "./vide.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

// Tableau des catégories du back-office (cartes empilées en mobile).
let ListeCategoriesView = {
  /**
   * @param {Array<{id: number, libelle: string, description: string, nombreProduits: number}>} categories
   * @param {{surSuppression: function(number): void}} actions - appelée avec l'id de la catégorie
   *   dont on a cliqué « Supprimer ».
   * @returns {DocumentFragment}
   */
  dom: function (categories, actions) {
    let fragment = htmlToFragment(template);

    let lignes =
      categories.length === 0
        ? [htmlToFragment(templateVide)]
        : categories.map((categorie) =>
            htmlToFragment(
              genericRenderer(templateLigne, {
                id: categorie.id,
                libelle: categorie.libelle,
                description: categorie.description === "" ? "Aucune description" : categorie.description,
                produits: `${categorie.nombreProduits} ${categorie.nombreProduits > 1 ? "produits" : "produit"}`,
                href: `/admin/categories/${categorie.id}/modifier`,
                images: IMAGES,
              })
            )
          );
    fragment.querySelector('slot[name="lignes"]').replaceWith(...lignes);

    // Délégation : un seul écouteur sur la racine.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest('button[data-action="supprimer"]');
      if (bouton === null) return;
      actions.surSuppression(Number(bouton.dataset.id));
    });

    return fragment;
  },
};

export { ListeCategoriesView };
