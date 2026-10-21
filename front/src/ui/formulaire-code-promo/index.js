import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { MessageView } from "../message/index.js";
import template from "./template.html?raw";

// Formulaire de création ou de modification d'un code promotionnel. Il transmet
// les champs saisis ; c'est le serveur qui valide.
let FormulaireCodePromoView = {
  /**
   * @param {{code: string, pourcentage: string, actif: boolean, modification: boolean, bouton: string,
   *          enCours: boolean, message: ({type: string, texte: string}|null)}} data -
   *   modification : vrai pour un code existant, dont le nom n'est plus modifiable ; bouton : le
   *   texte du bouton d'envoi ; enCours : vrai pendant l'envoi (le bouton est alors inactif).
   * @param {{surEnvoi: function(string, string, boolean): void}} actions - appelée avec le code,
   *   le pourcentage (en texte) et l'état saisis.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        code: data.code,
        pourcentage: data.pourcentage,
        codeFige: data.modification ? "readonly" : "",
        aideCode: data.modification
          ? "Un code ne se renomme pas : les commandes passées le citent. Crée un autre code si besoin."
          : "3 à 30 caractères : lettres, chiffres, « - » ou « _ ». Le code est enregistré en majuscules.",
        actifCoche: data.actif ? "checked" : "",
        bouton: data.bouton,
        enCours: String(data.enCours),
      })
    );
    fragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

    let formulaire = fragment.querySelector("form");
    formulaire.addEventListener("submit", (ev) => {
      // Sans cela, le navigateur rechargerait la page.
      ev.preventDefault();
      if (data.enCours) return;
      actions.surEnvoi(
        formulaire.elements.code.value,
        formulaire.elements.pourcentage.value,
        formulaire.elements.actif.checked
      );
    });

    return fragment;
  },
};

export { FormulaireCodePromoView };
