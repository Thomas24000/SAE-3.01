import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import template from "./template.html?raw";
import templateGroupe from "./groupe.html?raw";
import templateChoix from "./choix.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const ETATS = {
  defaut: "cursor-pointer border-border-default hover:border-border-strong",
  selectionne: "cursor-pointer border-2 border-border-strong font-semibold",
  indisponible: "cursor-not-allowed border-border-default text-fg-muted",
  selectionneIndisponible: "cursor-not-allowed border-2 border-border-default text-fg-muted font-semibold",
};

// Les options d'un produit (service, toppings...) : un groupe de boutons radio
// (un seul choix) ou de cases à cocher (plusieurs choix) par groupe.
let SelecteurOptionsView = {
  /**
   * Un choix d'option, avec son supplément de prix.
   *
   * @param {{id: number, libelle: string, supplementCents: number, selectionne: boolean,
   *          indisponible?: boolean, raison?: string}} choix
   *        indisponible : le choix n'est pas sélectionnable ; raison (« Épuisé »,
   *        « Indisponible ») le dit en toutes lettres à la place du supplément.
   * @param {{id: number, multiple: boolean}} groupe - le groupe auquel appartient le choix.
   * @returns {DocumentFragment}
   */
  domChoix: function (choix, groupe) {
    let indisponible = choix.indisponible === true;
    let etat = indisponible ? (choix.selectionne ? "selectionneIndisponible" : "indisponible") : choix.selectionne ? "selectionne" : "defaut";

    return htmlToFragment(
      genericRenderer(templateChoix, {
        id: choix.id,
        groupeId: groupe.id,
        libelle: choix.libelle,
        type: groupe.multiple ? "checkbox" : "radio",
        coche: choix.selectionne ? "checked" : "",
        desactive: indisponible ? "disabled" : "",
        supplement: indisponible
          ? choix.raison
          : choix.supplementCents > 0
            ? `+ ${formaterPrix(choix.supplementCents)}`
            : "Inclus",
        classes: ETATS[etat],
      })
    );
  },

  /**
   * Un groupe d'options et ses choix.
   *
   * @param {{id: number, libelle: string, multiple: boolean, obligatoire: boolean,
   *          choix: Array<{id: number, libelle: string, supplementCents: number, selectionne: boolean}>}} groupe
   * @returns {DocumentFragment}
   */
  domGroupe: function (groupe) {
    let fragment = htmlToFragment(
      genericRenderer(templateGroupe, {
        libelle: groupe.libelle,
        mention: groupe.obligatoire ? "obligatoire" : groupe.multiple ? "facultatif, plusieurs choix possibles" : "facultatif",
      })
    );

    fragment
      .querySelector('slot[name="choix"]')
      .replaceWith(...groupe.choix.map((choix) => SelecteurOptionsView.domChoix(choix, groupe)));

    return fragment;
  },

  /**
   * @param {Array<{id: number, libelle: string, multiple: boolean, obligatoire: boolean,
   *          choix: Array<{id: number, libelle: string, supplementCents: number, selectionne: boolean}>}>} groupes
   *        les groupes à afficher, jamais vide.
   * @param {function(number, number): void} onPick - appelée avec l'id du groupe puis l'id du choix cliqué.
   * @returns {DocumentFragment}
   */
  dom: function (groupes, onPick) {
    let fragment = htmlToFragment(template);

    fragment
      .querySelector('slot[name="groupes"]')
      .replaceWith(...groupes.map((groupe) => SelecteurOptionsView.domGroupe(groupe)));

    // Délégation : un seul écouteur, qui survit si les choix sont recréés.
    fragment.firstElementChild.addEventListener("change", (ev) => {
      let champ = ev.target;
      if (champ.dataset.choixId === undefined) return;

      onPick(Number(champ.dataset.groupeId), Number(champ.dataset.choixId));

      // La page est reconstruite par onPick : on rend le focus au même choix.
      document.querySelector(`input[data-choix-id="${CSS.escape(champ.dataset.choixId)}"]`)?.focus();
    });

    return fragment;
  },
};

export { SelecteurOptionsView };
