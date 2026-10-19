import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLien from "./lien.html?raw";
import templateLienIndisponible from "./lien-indisponible.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

// Fichiers de public/images/admin/, par nom d'icône.
const ICONES = {
  tableau: "nav-tableau-de-bord.svg",
  produits: "nav-produits.svg",
  categories: "nav-categories.svg",
};

// Navigation du back-office : barre latérale (icônes et libellés) en desktop,
// icônes seules en tablette, barre supérieure avec menu repliable en mobile.
// Une section pas encore construite reste visible mais n'est pas un lien.
let NavigationAdminView = {
  /**
   * @param {{liens: Array<{libelle: string, href: string, icone: "tableau"|"produits"|"categories",
   *          disponible: boolean}>}} data - les sections à afficher.
   * @param {{surDeconnexion: function(): void}} actions - appelée au clic sur « Déconnexion ».
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(genericRenderer(template, { images: IMAGES }));

    let liens = data.liens.map((lien) =>
      htmlToFragment(
        genericRenderer(lien.disponible ? templateLien : templateLienIndisponible, {
          libelle: lien.libelle,
          href: lien.href,
          icone: IMAGES + ICONES[lien.icone],
        })
      )
    );
    fragment.querySelector('slot[name="liens"]').replaceWith(...liens);

    let racine = fragment.firstElementChild;
    racine.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button[data-action]");
      if (bouton === null) return;

      if (bouton.dataset.action === "menu") {
        let ouvert = racine.querySelector("[data-menu]").classList.toggle("hidden") === false;
        bouton.setAttribute("aria-expanded", String(ouvert));
        bouton.setAttribute("aria-label", ouvert ? "Fermer le menu" : "Ouvrir le menu");
      }
      if (bouton.dataset.action === "deconnexion") actions.surDeconnexion();
    });

    return fragment;
  },
};

export { NavigationAdminView };
