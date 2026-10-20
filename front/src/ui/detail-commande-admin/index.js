import { formaterPrix } from "../../lib/format.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { BadgeStatutCommandeView } from "../badge-statut-commande/index.js";
import template from "./template.html?raw";
import templateAction from "./action.html?raw";
import templateAucuneAction from "./aucune-action.html?raw";
import templateEntree from "./entree.html?raw";
import templateLigne from "./ligne.html?raw";
import templateOption from "./option.html?raw";
import templateVide from "./vide.html?raw";

// Détail complet d'une commande pour le back-office : informations, boutons de
// changement de statut, articles avec leurs options et journal des modifications.
let DetailCommandeAdminView = {
  /**
   * @param {{numero: string, statut: string, date: string, client: string, totalCents: number,
   *          actions: Array<{statut: string, libelle: string}>, aucuneAction: string,
   *          lignes: Array<{nom: string, libelle: string, quantite: number, prixUnitaireCents: number,
   *          totalCents: number, options: Array<{groupe: string, libelle: string, supplementCents: number}>}>,
   *          journal: Array<{ancien: string, nouveau: string, admin: string, date: string}>}} data -
   *   montants en centimes ; date, ancien et nouveau sont déjà mis en forme ; aucuneAction :
   *   le texte affiché quand aucun changement n'est possible.
   * @param {{surAction: function(string): void}} actions - appelée avec le statut visé.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        numero: data.numero,
        date: data.date,
        client: data.client,
        total: formaterPrix(data.totalCents),
      })
    );

    fragment.querySelector('slot[name="badge"]').replaceWith(BadgeStatutCommandeView.dom(data.statut));

    fragment
      .querySelector('slot[name="actions"]')
      .replaceWith(
        ...(data.actions.length === 0
          ? [htmlToFragment(genericRenderer(templateAucuneAction, { texte: data.aucuneAction }))]
          : data.actions.map((action) => htmlToFragment(genericRenderer(templateAction, action))))
      );

    fragment.querySelector('slot[name="lignes"]').replaceWith(
      ...data.lignes.map((ligne) => {
        let element = htmlToFragment(
          genericRenderer(templateLigne, {
            nom: ligne.nom,
            libelle: ligne.libelle,
            quantite: ligne.quantite,
            prixUnitaire: formaterPrix(ligne.prixUnitaireCents),
            total: formaterPrix(ligne.totalCents),
          })
        );
        element.querySelector('slot[name="options"]').replaceWith(
          ...ligne.options.map((option) =>
            htmlToFragment(
              genericRenderer(templateOption, {
                groupe: option.groupe,
                libelle: option.libelle,
                supplement: option.supplementCents > 0 ? ` (+${formaterPrix(option.supplementCents)})` : "",
              })
            )
          )
        );
        return element;
      })
    );

    fragment
      .querySelector('slot[name="journal"]')
      .replaceWith(
        ...(data.journal.length === 0
          ? [htmlToFragment(templateVide)]
          : data.journal.map((entree) => htmlToFragment(genericRenderer(templateEntree, entree))))
      );

    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button[data-statut]");
      if (bouton === null) return;
      actions.surAction(bouton.dataset.statut);
    });

    return fragment;
  },
};

export { DetailCommandeAdminView };
