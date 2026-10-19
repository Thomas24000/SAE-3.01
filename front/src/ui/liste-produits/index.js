import { formaterPrix } from "../../lib/format.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { BadgeStockView } from "../badge-stock/index.js";
import template from "./template.html?raw";
import templateLigne from "./ligne.html?raw";
import templateVide from "./vide.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

/**
 * « 3 formats » ou « 1 format » ; même règle pour les images.
 *
 * @param {number} nombre
 * @param {string} nom - le nom au singulier.
 * @returns {string}
 */
function pluriel(nombre, nom) {
  return `${nombre} ${nom}${nombre > 1 ? "s" : ""}`;
}

// Tableau des produits du back-office (cartes empilées en mobile).
let ListeProduitsView = {
  /**
   * @param {Array<{id: number, nom: string, categorie: string, miniature: string, prixMin: number,
   *          stock: number, nombreFormats: number, nombreImages: number,
   *          statut: "disponible"|"bientot"|"epuise"}>} produits - prixMin en centimes ;
   *   statut : calculé par la page d'après le seuil.
   * @param {{surSuppression: function(number): void}} actions - appelée avec l'id du produit
   *   dont on a cliqué « Supprimer ».
   * @returns {DocumentFragment}
   */
  dom: function (produits, actions) {
    let fragment = htmlToFragment(template);

    let lignes =
      produits.length === 0
        ? [htmlToFragment(templateVide)]
        : produits.map((produit) => {
            let ligne = htmlToFragment(
              genericRenderer(templateLigne, {
                id: produit.id,
                nom: produit.nom,
                categorie: produit.categorie,
                miniature: produit.miniature,
                details: `${pluriel(produit.nombreFormats, "format")} · ${pluriel(produit.nombreImages, "image")}`,
                prix: `dès ${formaterPrix(produit.prixMin)}`,
                stock: produit.stock,
                href: `/admin/produits/${produit.id}/modifier`,
                images: IMAGES,
              })
            );
            ligne.querySelector('slot[name="badge"]').replaceWith(BadgeStockView.dom(produit.statut));
            return ligne;
          });
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

export { ListeProduitsView };
