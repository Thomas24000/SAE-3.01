import { PanierData } from "../../data/panier.js";
import { htmlToFragment } from "../../lib/utils.js";
import { FooterView } from "../../ui/footer/index.js";
import { HeaderView } from "../../ui/header/index.js";
import template from "./template.html?raw";

/**
 * Layout principal : l'en-tête, la page affichée, puis le pied de page.
 *
 * Le header reçoit le nombre d'articles du panier, relu à chaque navigation.
 *
 * Les slots nommés « header » et « footer » sont remplacés ici. Le slot sans nom est laissé au
 * routeur, qui y place la page.
 *
 * @returns {DocumentFragment}
 */
export function RootLayout() {
  let layout = htmlToFragment(template);
  layout.querySelector('slot[name="header"]').replaceWith(HeaderView.dom({ panierCount: PanierData.count() }));
  layout.querySelector('slot[name="footer"]').replaceWith(FooterView.dom());
  return layout;
}
