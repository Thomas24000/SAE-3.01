import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { MessageView } from "../message/index.js";
import template from "./template.html?raw";
import templateSaisie from "./saisie.html?raw";
import templateAppliquee from "./appliquee.html?raw";

// Saisie d'un code promotionnel sur le récapitulatif de commande (US PRO-a) : un
// champ et « Appliquer », ou, une fois le code accepté, son rappel et « Retirer le
// code ». Présentatif : la page vérifie le code auprès du serveur et décide de l'état.
let CodePromoView = {
  /**
   * @param {{saisie: string, appliquee: ({code: string, pourcentage: number}|null),
   *          message: ({type: "erreur"|"succes", texte: string}|null), enCours: boolean}} data -
   *   saisie : le texte à remettre dans le champ ; appliquee : le code accepté, ou null ;
   *   message : le résultat de la dernière vérification ; enCours : vrai pendant la vérification.
   * @param {{surApplication: function(string): void, surRetrait: function(): void}} actions
   *   surApplication reçoit le code saisi.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(template);

    let contenu =
      data.appliquee === null
        ? htmlToFragment(
            genericRenderer(templateSaisie, {
              saisie: data.saisie,
              enCours: data.enCours ? "true" : "false",
              libelle: data.enCours ? "Vérification…" : "Appliquer",
            })
          )
        : htmlToFragment(
            genericRenderer(templateAppliquee, {
              code: data.appliquee.code,
              reduction: `−${data.appliquee.pourcentage} %`,
            })
          );
    fragment.querySelector('slot[name="contenu"]').replaceWith(contenu);

    // Le message est annoncé aux lecteurs d'écran quand il change.
    fragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

    let racine = fragment.firstElementChild;
    racine.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (data.enCours) return;

      actions.surApplication(racine.querySelector('input[name="code"]').value);
    });
    racine.addEventListener("click", (ev) => {
      if (ev.target.closest('button[data-action="retirer"]') !== null) actions.surRetrait();
    });

    return fragment;
  },
};

export { CodePromoView };
