import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import { BadgePromoView } from "../badge-promo/index.js";
import { BadgeStockView } from "../badge-stock/index.js";
import { PrixPromoView } from "../prix-promo/index.js";
import { SelecteurOptionsView } from "../selecteur-options/index.js";
import template from "./template.html?raw";
import templateVariante from "./variante.html?raw";
import templateVignette from "./vignette.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const ETATS = {
  defaut: "border-border-default hover:border-border-strong",
  selectionne: "border-2 border-border-strong font-semibold",
  indisponible: "border-border-default text-fg-muted cursor-not-allowed",
};

const ETATS_VIGNETTE = {
  defaut: "border-border-default hover:border-border-strong",
  selectionne: "border-2 border-border-strong",
};

// Attributs qui identifient un bouton de la fiche. Servent à retrouver le
// bouton cliqué dans la page reconstruite (voir rendreFocus).
const CLES_BOUTON = ["data-variante-id", "data-image-index", "data-quantite-delta", "data-action"];

/**
 * La page est reconstruite après chaque action : le bouton cliqué n'existe plus.
 * On rend le focus à son équivalent dans la nouvelle page, pour que la
 * navigation au clavier ne reparte pas du début.
 *
 * @param {HTMLElement} bouton - le bouton sur lequel l'utilisateur a cliqué.
 */
function rendreFocus(bouton) {
  let cle = CLES_BOUTON.find((nom) => bouton.hasAttribute(nom));
  if (cle === undefined) return;

  document.querySelector(`button[${cle}="${CSS.escape(bouton.getAttribute(cle))}"]`)?.focus();
}

// Fiche détaillée d'un produit : galerie, prix, stock, format, quantité,
// description et ingrédients.
let FicheProduitView = {
  /**
   * Un bouton de format, avec le badge de stock de sa variante. Une variante
   * sans stock est désactivée.
   *
   * @param {{id: number, libelle: string, prixCents: number, prixPromoCents?: (number|null), stock: number,
   *          statutStock: "disponible"|"bientot"|"epuise"}} variante
   * @param {boolean} selectionnee - true pour la variante actuellement choisie.
   * @returns {DocumentFragment}
   */
  domVariante: function (variante, selectionnee) {
    let epuisee = variante.stock === 0;
    let etat = epuisee ? "indisponible" : selectionnee ? "selectionne" : "defaut";

    let fragment = htmlToFragment(
      genericRenderer(templateVariante, {
        id: variante.id,
        libelle: variante.libelle,
        selectionnee: selectionnee,
        desactivee: epuisee ? "disabled" : "",
        classes: ETATS[etat],
      })
    );

    fragment
      .querySelector('slot[name="prix"]')
      .replaceWith(PrixPromoView.dom({ prixCents: variante.prixCents, prixPromoCents: variante.prixPromoCents ?? null }));
    fragment.querySelector('slot[name="badge"]').replaceWith(BadgeStockView.dom(variante.statutStock));

    return fragment;
  },

  /**
   * La vignette d'une image de la galerie.
   *
   * @param {string} image - adresse de l'image.
   * @param {number} index - rang de l'image dans la galerie, à partir de 0.
   * @param {boolean} selectionnee - true pour l'image affichée en grand.
   * @returns {DocumentFragment}
   */
  domVignette: function (image, index, selectionnee) {
    return htmlToFragment(
      genericRenderer(templateVignette, {
        index: index,
        numero: index + 1,
        image: image,
        selectionnee: selectionnee,
        classes: selectionnee ? ETATS_VIGNETTE.selectionne : ETATS_VIGNETTE.defaut,
      })
    );
  },

  /**
   * @param {{produit: {nom: string, description: string, descriptionLongue: string,
   *          ingredients: string, teinte: number, images: string[],
   *          categorie: {libelle: string}, variantes: Array<{id: number, libelle: string,
   *          prixCents: number, stock: number,
   *          statutStock: "disponible"|"bientot"|"epuise"}>},
   *          varianteId: number, imageIndex: number, quantite: number,
   *          statutStock: "disponible"|"bientot"|"epuise", totalCents: number,
   *          moinsPossible: boolean, plusPossible: boolean, achatPossible: boolean,
   *          unitCents: number, unitPleinCents: number, promoPourcent: (number|null),
   *          optionsManquantes: boolean}} data
   *        varianteId désigne la variante choisie ; unitCents est son prix à payer
   *        avec les suppléments des options, affiché en grand ; unitPleinCents le même
   *        prix sans la promotion (barré si promoPourcent n'est pas null, le pourcentage
   *        de la promotion automatique) ; imageIndex
   *        l'image affichée en grand. produit.options (facultatif) liste les
   *        groupes d'options, chaque choix portant son état `selectionne`.
   * @param {{surVariante: function(number): void, surImage: function(number): void,
   *          surQuantite: function(number): void, surAjout: function(): void,
   *          surOption: function(number, number): void}} actions
   *        surQuantite reçoit -1 ou 1 ; surOption reçoit l'id du groupe puis du choix.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let produit = data.produit;
    let fragment = htmlToFragment(
      genericRenderer(template, {
        nom: produit.nom,
        description: produit.description,
        descriptionLongue: produit.descriptionLongue,
        ingredients: produit.ingredients,
        categorie: produit.categorie.libelle,
        teinte: produit.teinte,
        image: produit.images[data.imageIndex],
        quantite: data.quantite,
        moinsDesactive: !data.moinsPossible,
        plusDesactive: !data.plusPossible,
        achatDesactive: data.achatPossible ? "" : "disabled",
        libelleAchat: data.achatPossible
          ? `Ajouter au panier · ${formaterPrix(data.totalCents)}`
          : data.optionsManquantes
            ? "Choisissez vos options"
            : "Produit indisponible",
      })
    );

    fragment
      .querySelector('slot[name="prix"]')
      .replaceWith(
        PrixPromoView.dom({
          prixCents: data.unitPleinCents,
          prixPromoCents: data.promoPourcent === null ? null : data.unitCents,
        })
      );
    let slotPromo = fragment.querySelector('slot[name="promo"]');
    if (data.promoPourcent === null) slotPromo.remove();
    else slotPromo.replaceWith(BadgePromoView.dom(data.promoPourcent));
    fragment.querySelector('slot[name="badge"]').replaceWith(BadgeStockView.dom(data.statutStock));

    let vignettes = produit.images.map((image, index) =>
      FicheProduitView.domVignette(image, index, index === data.imageIndex)
    );
    // Une galerie d'une seule image n'a pas besoin de vignettes.
    if (vignettes.length > 1) {
      fragment.querySelector('slot[name="vignettes"]').replaceWith(...vignettes);
    } else {
      fragment.querySelector('slot[name="vignettes"]').parentElement.remove();
    }

    let boutons = produit.variantes.map((variante) =>
      FicheProduitView.domVariante(variante, variante.id === data.varianteId)
    );
    fragment.querySelector('slot[name="variantes"]').replaceWith(...boutons);

    let slotOptions = fragment.querySelector('slot[name="options"]');
    if (produit.options?.length > 0) {
      slotOptions.replaceWith(SelecteurOptionsView.dom(produit.options, actions.surOption));
    } else {
      slotOptions.remove();
    }

    // Délégation : un seul écouteur sur la fiche, qui survit si les boutons
    // sont recréés. Les actions reconstruisent la page : le focus est rendu
    // juste après.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button");
      if (bouton === null || bouton.disabled) return;

      if (bouton.dataset.varianteId !== undefined) {
        actions.surVariante(Number(bouton.dataset.varianteId));
      } else if (bouton.dataset.imageIndex !== undefined) {
        actions.surImage(Number(bouton.dataset.imageIndex));
      } else if (bouton.dataset.quantiteDelta !== undefined) {
        actions.surQuantite(Number(bouton.dataset.quantiteDelta));
      } else if (bouton.dataset.action === "ajouter") {
        actions.surAjout();
      } else {
        return;
      }

      rendreFocus(bouton);
    });

    return fragment;
  },
};

export { FicheProduitView };
