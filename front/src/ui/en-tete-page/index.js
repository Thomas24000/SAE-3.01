import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateAction from "./action.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

// En-tête d'une page du back-office : titre, sous-titre et, si besoin, le
// bouton de l'action principale (un lien, comme « Nouvelle catégorie »).
let EnTetePageView = {
  /**
   * @param {{titre: string, sousTitre: string, action: ({libelle: string, href: string}|null)}} data -
   *   action : le lien d'action principale, ou null pour n'en afficher aucun.
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    let fragment = htmlToFragment(genericRenderer(template, { titre: data.titre, sousTitre: data.sousTitre }));
    let slotAction = fragment.querySelector('slot[name="action"]');

    if (data.action === null) {
      slotAction.remove();
    } else {
      slotAction.replaceWith(
        htmlToFragment(genericRenderer(templateAction, { ...data.action, images: IMAGES }))
      );
    }

    return fragment;
  },
};

export { EnTetePageView };
