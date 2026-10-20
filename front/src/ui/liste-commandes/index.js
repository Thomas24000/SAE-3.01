import { formaterPrix } from "../../lib/format.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { BadgeStatutCommandeView } from "../badge-statut-commande/index.js";
import template from "./template.html?raw";
import templateAction from "./action.html?raw";
import templateLigne from "./ligne.html?raw";
import templateVide from "./vide.html?raw";

// Liste des commandes du back-office (cartes empilées en mobile), avec une
// case à cocher par commande pour les actions en lot.
let ListeCommandesView = {
  /**
   * @param {{commandes: Array<{id: number, numero: string, client: string, date: string,
   *          articles: string, statut: string, totalCents: number, coche: boolean,
   *          actions: Array<{statut: string, libelle: string}>}>, toutCoche: boolean}} data -
   *   date et articles sont déjà mis en forme ; coche : la commande est sélectionnée.
   * @param {{surSelection: function(number): void, surToutSelectionner: function(): void,
   *          surChangement: function(number, string): void}} actions - surChangement reçoit
   *   l'id de la commande et le statut visé.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(genericRenderer(template, { toutCoche: data.toutCoche ? "checked" : "" }));

    let lignes =
      data.commandes.length === 0
        ? [htmlToFragment(templateVide)]
        : data.commandes.map((commande) => {
            let ligne = htmlToFragment(
              genericRenderer(templateLigne, {
                id: commande.id,
                numero: commande.numero,
                client: commande.client,
                date: commande.date,
                articles: commande.articles,
                total: formaterPrix(commande.totalCents),
                coche: commande.coche ? "checked" : "",
              })
            );
            ligne.querySelector('slot[name="badge"]').replaceWith(BadgeStatutCommandeView.dom(commande.statut));
            ligne.querySelector('slot[name="actions"]').replaceWith(
              ...commande.actions.map((action) =>
                htmlToFragment(
                  genericRenderer(templateAction, {
                    id: commande.id,
                    numero: commande.numero,
                    statut: action.statut,
                    libelle: action.libelle,
                  })
                )
              )
            );
            return ligne;
          });
    fragment.querySelector('slot[name="lignes"]').replaceWith(...lignes);

    // Délégation : un seul écouteur par type d'événement sur la racine.
    let racine = fragment.firstElementChild;
    racine.addEventListener("change", (ev) => {
      if (ev.target.matches("input[data-tout]")) actions.surToutSelectionner();
      if (ev.target.matches("input[data-id]")) actions.surSelection(Number(ev.target.dataset.id));
    });
    racine.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button[data-statut]");
      if (bouton === null) return;
      actions.surChangement(Number(bouton.dataset.id), bouton.dataset.statut);
    });

    return fragment;
  },
};

export { ListeCommandesView };
