import { htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Onglets de l'espace personnel. Ce sont des liens `data-link` : le routeur
// navigue et marque lui-même l'onglet de la page affichée (aria-current).
let NavigationCompteView = {
  /**
   * @returns {DocumentFragment}
   */
  dom: function () {
    return htmlToFragment(template);
  },
};

export { NavigationCompteView };
