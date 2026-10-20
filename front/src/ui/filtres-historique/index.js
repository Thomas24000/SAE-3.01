import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

/**
 * Remplit la liste des statuts.
 *
 * @param {HTMLSelectElement} select - la liste à remplir.
 * @param {Array<{valeur: string, libelle: string}>} options - les choix.
 * @param {string} choisie - la valeur sélectionnée.
 */
function remplir(select, options, choisie) {
  select.append(
    ...options.map((option) => {
      let element = document.createElement("option");
      element.value = option.valeur;
      element.textContent = option.libelle;
      element.selected = option.valeur === choisie;
      return element;
    })
  );
}

// Filtres de l'historique : statut et période. Il transmet les valeurs saisies ;
// c'est la page qui interroge le serveur.
let FiltresHistoriqueView = {
  /**
   * @param {{statut: string, du: string, au: string,
   *          statuts: Array<{valeur: string, libelle: string}>, filtre: boolean}} data -
   *   statut : la valeur choisie ("" pour tous) ; du et au : dates AAAA-MM-JJ ("" si
   *   absentes) ; statuts : les choix de la liste ; filtre : true si un filtre est actif.
   * @param {{surChangement: function({statut: string, du: string, au: string, champ: string}): void,
   *          surReinitialisation: function(): void}} actions
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        du: data.du,
        au: data.au,
        reinitialiserDesactive: data.filtre ? "" : "disabled",
      })
    );
    remplir(fragment.querySelector('select[name="statut"]'), data.statuts, data.statut);

    let racine = fragment.firstElementChild;

    // « change » : la liste à son changement, une date quand elle est complète.
    racine.addEventListener("change", (ev) => {
      if (ev.target.name === undefined || ev.target.name === "") return;
      actions.surChangement({
        statut: racine.querySelector('select[name="statut"]').value,
        du: racine.querySelector('input[name="du"]').value,
        au: racine.querySelector('input[name="au"]').value,
        champ: ev.target.name,
      });
    });
    racine.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button[data-action]");
      if (bouton === null || bouton.disabled) return;
      actions.surReinitialisation();
    });

    return fragment;
  },
};

export { FiltresHistoriqueView };
