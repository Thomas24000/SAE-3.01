import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import template from "./template.html?raw";
import templateVariante from "./variante.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const ETATS = {
  defaut: "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-400",
  selectionne: "border-2 border-zinc-950 font-semibold dark:border-zinc-50",
  indisponible: "border-zinc-200 text-zinc-500 cursor-not-allowed dark:border-zinc-800 dark:text-zinc-400",
};

// Fiche détaillée d'un produit : visuel, prix de la variante choisie, description
// et choix du format.
let FicheProduitView = {
  /**
   * Un bouton de format. Une variante sans stock est désactivée et affiche
   * « Épuisé » à la place du prix.
   *
   * @param {{id: number, libelle: string, prixCents: number, stock: number}} variante
   * @param {boolean} selectionnee - true pour la variante actuellement choisie.
   * @returns {DocumentFragment}
   */
  domVariante: function (variante, selectionnee) {
    let epuisee = variante.stock === 0;
    let etat = epuisee ? "indisponible" : selectionnee ? "selectionne" : "defaut";

    return htmlToFragment(
      genericRenderer(templateVariante, {
        id: variante.id,
        libelle: variante.libelle,
        prix: epuisee ? "Épuisé" : formaterPrix(variante.prixCents),
        selectionnee: selectionnee,
        desactivee: epuisee ? "disabled" : "",
        classes: ETATS[etat],
      })
    );
  },

  /**
   * @param {{produit: {nom: string, description: string, teinte: number, image: string,
   *          categorie: {libelle: string}, variantes: Array<{id: number, libelle: string,
   *          prixCents: number, stock: number}>}, varianteId: number}} data
   *        varianteId désigne la variante choisie, dont le prix est affiché.
   * @param {{surVariante: function(number): void}} actions - appelée avec l'id de
   *        la variante sur laquelle l'utilisateur clique.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let produit = data.produit;
    let choisie = produit.variantes.find((variante) => variante.id === data.varianteId);

    let fragment = htmlToFragment(
      genericRenderer(template, {
        nom: produit.nom,
        description: produit.description,
        categorie: produit.categorie.libelle,
        teinte: produit.teinte,
        image: produit.image,
        prix: formaterPrix(choisie.prixCents),
      })
    );

    let boutons = produit.variantes.map((variante) =>
      FicheProduitView.domVariante(variante, variante.id === data.varianteId)
    );
    let slotVariantes = fragment.querySelector('slot[name="variantes"]');
    slotVariantes.replaceWith(...boutons);

    // Délégation : un seul écouteur sur la rangée, qui survit si les boutons
    // sont recréés.
    fragment.querySelector("fieldset > div").addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button[data-variante-id]");
      if (bouton === null || bouton.disabled) return;
      actions.surVariante(Number(bouton.dataset.varianteId));
    });

    return fragment;
  },
};

export { FicheProduitView };
