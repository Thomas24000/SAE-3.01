import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import { formaterOptions } from "../../lib/options.js";
import { SelecteurOptionsView } from "../selecteur-options/index.js";
import template from "./template.html?raw";
import templateEdition from "./edition.html?raw";

// Une ligne du panier : miniature, produit, format, quantité et prix de la ligne.
let LignePanierView = {
  /**
   * @param {{variantId: number, options: Array<{id: number, libelle: string, supplementCents: number}>,
   *          cle: string, nom: string, slug: string, libelle: string,
   *          image: string, teinte: number, quantite: number, totalCents: number,
   *          moinsPossible: boolean, plusPossible: boolean, modifiable: boolean,
   *          edition: null|{groupes: Array<Object>, manquants: boolean}}} data
   *        totalCents : prix de la ligne en centimes ((prix du format + suppléments
   *        des options) × quantité) ; cle : les identifiants des options séparés
   *        par des virgules, qui distinguent les lignes d'une même variante ;
   *        plusPossible : false quand la quantité atteint le stock de la variante ;
   *        modifiable : le produit a des options à changer ; edition : null, ou les
   *        groupes d'options (choix cochés compris, voir SelecteurOptionsView) quand
   *        la ligne est en cours de modification, avec manquants vrai si un groupe
   *        obligatoire est vide.
   * @param {{surQuantite: function(number, number[], number): void,
   *          surSuppression: function(number, number[]): void,
   *          surModification: function(number, number[]): void,
   *          surOption: function(number, number[], number, number): void,
   *          surEnregistrement: function(number, number[]): void,
   *          surAnnulation: function(): void}} actions
   *        Les actions de ligne reçoivent l'identifiant de la variante puis ses options ;
   *        surQuantite ajoute -1 ou 1 ; surOption ajoute l'id du groupe puis du choix.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        id: data.variantId,
        nom: data.nom,
        slug: data.slug,
        libelle: data.libelle,
        cle: data.cle,
        optionsTexte: formaterOptions(data.options),
        optionsCachees: data.options.length === 0 ? "hidden" : "",
        modifierCache: data.modifiable && data.edition === null ? "" : "hidden",
        image: data.image,
        teinte: data.teinte,
        quantite: data.quantite,
        prix: formaterPrix(data.totalCents),
        moinsDesactive: data.moinsPossible ? "" : "disabled",
        plusDesactive: data.plusPossible ? "" : "disabled",
        alerteStock: data.plusPossible ? "hidden" : "",
      })
    );

    let slotEdition = fragment.querySelector('slot[name="edition"]');
    if (data.edition === null) {
      slotEdition.remove();
    } else {
      let edition = htmlToFragment(
        genericRenderer(templateEdition, {
          id: data.variantId,
          cle: data.cle,
          enregistrerDesactive: data.edition.manquants ? "disabled" : "",
        })
      );
      edition
        .querySelector('slot[name="selecteur"]')
        .replaceWith(
          SelecteurOptionsView.dom(data.edition.groupes, (groupeId, choixId) =>
            actions.surOption(data.variantId, data.options.map((option) => option.id), groupeId, choixId)
          )
        );
      slotEdition.replaceWith(edition);
    }

    // Délégation : un seul écouteur sur la ligne.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button");
      if (bouton === null || bouton.disabled) return;

      let id = Number(bouton.dataset.varianteId);
      let options = bouton.dataset.options === "" ? [] : bouton.dataset.options.split(",").map(Number);
      if (bouton.dataset.quantiteDelta !== undefined) {
        actions.surQuantite(id, options, Number(bouton.dataset.quantiteDelta));
      } else if (bouton.dataset.action === "supprimer") {
        actions.surSuppression(id, options);
      } else if (bouton.dataset.action === "modifier") {
        actions.surModification(id, options);
      } else if (bouton.dataset.action === "enregistrer") {
        actions.surEnregistrement(id, options);
      } else if (bouton.dataset.action === "annuler") {
        actions.surAnnulation();
      }
    });

    return fragment;
  },
};

export { LignePanierView };
