import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { BadgeStockView } from "../badge-stock/index.js";
import { MessageView } from "../message/index.js";
import template from "./template.html?raw";

// Panneau « Stock et alerte » d'un produit : le seuil « Bientôt épuisé » (un
// réglage commun à tout le catalogue) et le stock total du produit.
let PanneauSeuilView = {
  /**
   * @param {{seuil: string, stock: number, statut: "disponible"|"bientot"|"epuise", enCours: boolean,
   *          message: ({type: string, texte: string}|null)}} data - seuil : la valeur à afficher dans
   *   le champ ; stock : le stock total du produit ; statut : calculé par la page.
   * @param {{surEnregistrement: function(string): void}} actions - appelée avec le seuil saisi (texte).
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        seuil: data.seuil,
        stock: data.stock,
        unite: data.stock > 1 ? "pots" : "pot",
        enCours: String(data.enCours),
      })
    );
    fragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));
    fragment.querySelector('slot[name="badge"]').replaceWith(BadgeStockView.dom(data.statut));

    let racine = fragment.firstElementChild;
    let enregistrer = () => {
      if (!data.enCours) actions.surEnregistrement(racine.querySelector('input[name="seuil"]').value);
    };
    racine.querySelector('[data-action="seuil"]').addEventListener("click", enregistrer);
    // Entrée dans ce champ enregistre le seuil, et n'envoie pas le formulaire du produit.
    racine.querySelector('input[name="seuil"]').addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      enregistrer();
    });

    return fragment;
  },
};

export { PanneauSeuilView };
