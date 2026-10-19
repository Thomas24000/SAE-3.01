import { AuthData } from "../../data/auth.js";
import { PanierData } from "../../data/panier.js";
import { htmlToFragment } from "../../lib/utils.js";
import { FooterView } from "../../ui/footer/index.js";
import { HeaderView } from "../../ui/header/index.js";
import template from "./template.html?raw";

/**
 * Layout principal : l'en-tête, la page affichée, puis le pied de page.
 *
 * Le header reçoit le nombre d'articles du panier, relu à chaque navigation, et
 * l'identifiant du visiteur connecté : celui qu'on connaît déjà s'affiche tout
 * de suite, puis le serveur confirme (ou corrige) en arrière-plan.
 *
 * Les slots nommés « header » et « footer » sont remplacés ici. Le slot sans nom est laissé au
 * routeur, qui y place la page.
 *
 * @returns {DocumentFragment}
 */
export function RootLayout() {
  let layout = htmlToFragment(template);
  layout
    .querySelector('slot[name="header"]')
    .replaceWith(HeaderView.dom({ panierCount: PanierData.count(), login: AuthData.knownLogin }));
  AuthData.me().then(
    (session) => HeaderView.updateAccount(session.connecte ? session.login : null),
    () => {} // serveur injoignable : le header garde ce qu'il affiche
  );
  layout.querySelector('slot[name="footer"]').replaceWith(FooterView.dom());
  return layout;
}
