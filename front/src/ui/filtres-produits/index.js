import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

const STOCKS = [
  { valeur: "", libelle: "Tous les stocks" },
  { valeur: "disponible", libelle: "En stock" },
  { valeur: "bientot", libelle: "Bientôt épuisé" },
  { valeur: "epuise", libelle: "Épuisé" },
];

/**
 * Remplit une liste déroulante avec ses options.
 *
 * @param {HTMLSelectElement} select - la liste à remplir.
 * @param {Array<{valeur: string, libelle: string}>} options - les choix.
 * @param {string} choisie - la valeur sélectionnée.
 */
function remplir(select, options, choisie) {
  select.append(
    ...options.map((option) => {
      let element = document.createElement("option");
      element.value = option.valeur;
      element.textContent = option.libelle;
      element.selected = option.valeur === choisie;
      return element;
    })
  );
}

// Recherche et filtres de la liste des produits. Il transmet les valeurs
// saisies ; c'est la page qui filtre.
let FiltresProduitsView = {
  /**
   * @param {{recherche: string, categorieId: string, stock: string,
   *          categories: Array<{id: number, libelle: string}>}} data - categorieId : l'id
   *   choisi en texte ("" pour toutes) ; stock : "", "disponible", "bientot" ou "epuise".
   * @param {{surChangement: function({recherche: string, categorieId: string, stock: string}): void}} actions
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(genericRenderer(template, { images: IMAGES, recherche: data.recherche }));

    remplir(
      fragment.querySelector('select[name="categorie"]'),
      [{ valeur: "", libelle: "Toutes les catégories" }].concat(
        data.categories.map((categorie) => ({ valeur: String(categorie.id), libelle: categorie.libelle }))
      ),
      data.categorieId
    );
    remplir(fragment.querySelector('select[name="stock"]'), STOCKS, data.stock);

    let racine = fragment.firstElementChild;
    let signaler = () =>
      actions.surChangement({
        recherche: racine.querySelector('input[name="recherche"]').value,
        categorieId: racine.querySelector('select[name="categorie"]').value,
        stock: racine.querySelector('select[name="stock"]').value,
      });

    // Le champ texte réagit à chaque frappe, les listes à leur changement : une
    // liste émet aussi « input », qu'on ignore pour ne pas signaler deux fois.
    racine.addEventListener("input", (ev) => {
      if (ev.target.name === "recherche") signaler();
    });
    racine.addEventListener("change", (ev) => {
      if (ev.target.tagName === "SELECT") signaler();
    });

    return fragment;
  },
};

export { FiltresProduitsView };
