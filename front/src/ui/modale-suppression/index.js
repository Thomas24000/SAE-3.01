import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { BandeauInfoView } from "../bandeau-info/index.js";
import { MessageView } from "../message/index.js";
import template from "./template.html?raw";
import templateReaffectation from "./reaffectation.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

/**
 * « 4 produits » ou « 1 produit ».
 *
 * @param {number} nombre
 * @returns {string}
 */
function produits(nombre) {
  return `${nombre} ${nombre > 1 ? "produits" : "produit"}`;
}

// Modale de confirmation de suppression d'une catégorie. Une catégorie vide se
// supprime après confirmation ; une catégorie qui contient des produits exige
// de choisir la catégorie qui les accueillera. Elle est un <dialog> natif : la
// page l'ouvre (showModal), le navigateur gère le focus et la touche Échap.
let ModaleSuppressionView = {
  /**
   * @param {{nom: string, nombreProduits: number, cibles: Array<{id: number, libelle: string}>,
   *          cible: string, enCours: boolean, message: ({type: string, texte: string}|null)}} data -
   *   cibles : les autres catégories ; cible : l'id choisi (texte, "" si aucun).
   * @param {{surConfirmation: function(string): void, surChoixCible: function(string): void,
   *          surAnnulation: function(): void}} actions - surConfirmation reçoit l'id choisi ("" si
   *   la catégorie est vide) ; surAnnulation est aussi appelée à la fermeture par Échap.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let avecProduits = data.nombreProduits > 0;

    let fragment = htmlToFragment(
      genericRenderer(template, {
        images: IMAGES,
        nom: data.nom,
        explication: avecProduits
          ? "Une catégorie qui contient des produits ne peut pas être supprimée sans les réaffecter."
          : "Cette action est définitive.",
        bouton: avecProduits ? "Réaffecter et supprimer" : "Supprimer",
        enCours: String(data.enCours),
      })
    );

    fragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

    let slotReaffectation = fragment.querySelector('slot[name="reaffectation"]');
    if (!avecProduits) {
      slotReaffectation.remove();
    } else {
      let reaffectation = htmlToFragment(
        genericRenderer(templateReaffectation, { nombre: produits(data.nombreProduits) })
      );
      let select = reaffectation.querySelector("select");

      let options = [{ id: "", libelle: "Choisir une catégorie…" }, ...data.cibles].map((cible) => {
        let option = document.createElement("option");
        option.value = String(cible.id);
        option.textContent = cible.libelle;
        option.selected = String(cible.id) === data.cible;
        return option;
      });
      select.append(...options);
      select.addEventListener("change", () => actions.surChoixCible(select.value));

      slotReaffectation.replaceWith(
        BandeauInfoView.dom({ texte: `Cette catégorie contient ${produits(data.nombreProduits)}.`, attention: true }),
        reaffectation
      );
    }

    let dialog = fragment.firstElementChild;
    let formulaire = fragment.querySelector("form");

    formulaire.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (data.enCours) return;
      actions.surConfirmation(formulaire.elements.cible?.value ?? "");
    });
    fragment.querySelector('[data-action="annuler"]').addEventListener("click", () => dialog.close());
    // « close » couvre le bouton Annuler et la touche Échap.
    dialog.addEventListener("close", () => actions.surAnnulation());

    return fragment;
  },
};

export { ModaleSuppressionView };
