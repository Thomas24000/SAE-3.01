import { htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Tri et filtre de la liste des commandes. Il transmet les valeurs choisies ;
// c'est la page qui interroge le serveur.
let FiltresCommandesView = {
  /**
   * @param {{tri: string, sens: string, statut: string}} data - tri : "date", "statut" ou
   *   "montant" ; sens : "asc" ou "desc" ; statut : "" pour tous, ou un statut de commande.
   * @param {{surChangement: function({tri: string, sens: string, statut: string, champ: string}): void}} actions -
   *   champ : le nom de la liste modifiée.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(template);
    let formulaire = fragment.firstElementChild;

    ["tri", "sens", "statut"].map((nom) => {
      formulaire.elements[nom].value = data[nom];
    });

    formulaire.addEventListener("submit", (ev) => ev.preventDefault());
    formulaire.addEventListener("change", (ev) => {
      actions.surChangement({
        tri: formulaire.elements.tri.value,
        sens: formulaire.elements.sens.value,
        statut: formulaire.elements.statut.value,
        champ: ev.target.name,
      });
    });

    return fragment;
  },
};

export { FiltresCommandesView };
