import { formaterPrix } from "../../lib/format.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { BadgeStockView } from "../badge-stock/index.js";
import { MessageView } from "../message/index.js";
import template from "./template.html?raw";
import templateLigne from "./ligne.html?raw";
import templateVide from "./vide.html?raw";

// Tableau des toppings du back-office : leurs doses en stock, avec un champ pour
// les réapprovisionner (cartes empilées en mobile).
let ListeToppingsView = {
  /**
   * @param {Array<{id: number, libelle: string, supplementCents: number, nombreCategories: number,
   *          stock: number, statut: "disponible"|"bientot"|"epuise", saisie: string, enCours: boolean,
   *          message: ({type: string, texte: string}|null)}>} toppings - stock : les doses enregistrées ;
   *   saisie : le texte du champ ; statut : calculé par la page.
   * @param {{surSaisie: function(number, string): void, surEnregistrement: function(number, string): void}} actions
   *   - surSaisie reçoit l'id du topping puis le texte tapé ; surEnregistrement l'id puis le texte du champ.
   * @returns {DocumentFragment}
   */
  dom: function (toppings, actions) {
    let fragment = htmlToFragment(template);

    let lignes =
      toppings.length === 0
        ? [htmlToFragment(templateVide)]
        : toppings.map((topping) => {
            let ligne = htmlToFragment(
              genericRenderer(templateLigne, {
                id: topping.id,
                libelle: topping.libelle,
                supplement: topping.supplementCents > 0 ? `+ ${formaterPrix(topping.supplementCents)}` : "",
                categories: `${topping.nombreCategories} ${topping.nombreCategories > 1 ? "catégories" : "catégorie"}`,
                stock: topping.stock,
                unite: topping.stock > 1 ? "doses" : "dose",
                saisie: topping.saisie,
                enCours: String(topping.enCours),
              })
            );
            ligne.querySelector('slot[name="badge"]').replaceWith(BadgeStockView.dom(topping.statut));
            ligne.querySelector('slot[name="message"]').replaceWith(MessageView.dom(topping.message));
            return ligne;
          });
    fragment.querySelector('slot[name="lignes"]').replaceWith(...lignes);

    // Délégation : un seul écouteur par type d'événement sur la racine.
    let racine = fragment.firstElementChild;
    racine.addEventListener("input", (ev) => {
      if (ev.target.name !== "stock") return;
      actions.surSaisie(Number(ev.target.closest("li").dataset.id), ev.target.value);
    });
    racine.addEventListener("click", (ev) => {
      let bouton = ev.target.closest('button[data-action="enregistrer"]');
      if (bouton === null || bouton.getAttribute("aria-disabled") === "true") return;
      let id = Number(bouton.dataset.id);
      actions.surEnregistrement(id, bouton.closest("li").querySelector('input[name="stock"]').value);
    });
    racine.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || ev.target.name !== "stock") return;
      ev.preventDefault();
      ev.target.closest("li").querySelector('button[data-action="enregistrer"]').click();
    });

    return fragment;
  },
};

export { ListeToppingsView };
