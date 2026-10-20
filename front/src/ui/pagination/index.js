import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";
import templatePage from "./page.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

// Pagination numérotée avec flèches. Présentative : la page décide de la page
// affichée et de ce qu'elle contient.
let PaginationView = {
  /**
   * @param {{page: number, pages: number}} data - page : la page courante (à partir de 1) ;
   *   pages : le nombre total de pages.
   * @param {{surPage: function(number): void}} actions - appelée avec le numéro de page demandé.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        images: IMAGES,
        precedente: data.page - 1,
        suivante: data.page + 1,
        precedenteDesactivee: data.page <= 1 ? "disabled" : "",
        suivanteDesactivee: data.page >= data.pages ? "disabled" : "",
      })
    );

    let numeros = Array.from({ length: data.pages }, (_, index) => index + 1);
    fragment.querySelector('slot[name="pages"]').replaceWith(
      ...numeros.map((numero) =>
        htmlToFragment(genericRenderer(templatePage, { numero, courante: String(numero === data.page) }))
      )
    );

    // Délégation : un seul écouteur sur la racine.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button[data-page]");
      if (bouton === null || bouton.disabled) return;
      actions.surPage(Number(bouton.dataset.page));
    });

    return fragment;
  },
};

export { PaginationView };
