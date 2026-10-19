import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Barre supérieure du contenu du back-office : nom de la section et
// administrateur connecté. Masquée en mobile, où la barre de navigation
// remplit ce rôle.
let BarreAdminView = {
  /**
   * @param {{section: string, email: string}} data - section : le nom de la page affichée ;
   *   email : celui de l'administrateur connecté.
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    return htmlToFragment(
      genericRenderer(template, {
        section: data.section,
        email: data.email,
        avatar: import.meta.env.BASE_URL + "images/admin/avatar.svg",
      })
    );
  },
};

export { BarreAdminView };
