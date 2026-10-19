import { AuthData } from "../../data/auth.js";
import { PanierData } from "../../data/panier.js";
import { reload } from "../../lib/navigation.js";
import { htmlToFragment } from "../../lib/utils.js";
import { FooterView } from "../../ui/footer/index.js";
import { HeaderView } from "../../ui/header/index.js";
import template from "./template.html?raw";

/**
 * Clic sur « Se déconnecter » dans le header : ferme la session puis réaffiche
 * la page courante, qui relit alors ce que le serveur autorise.
 */
async function handlerLogout() {
  try {
    await AuthData.logout();
  } catch (erreur) {
    // La page réaffichée relira la session réelle auprès du serveur.
  }
  reload();
}

/**
 * Layout principal : l'en-tête, la page affichée, puis le pied de page.
 *
 * Le header reçoit le nombre d'articles du panier, relu à chaque navigation, et
 * l'e-mail du visiteur connecté : celui qu'on connaît déjà s'affiche tout de
 * suite, puis le serveur confirme (ou corrige) en arrière-plan. Le bouton
 * « Se déconnecter » du header ferme la session, puis réaffiche la page.
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
    .replaceWith(
      HeaderView.dom(
        { panierCount: PanierData.count(), email: AuthData.knownEmail },
        { surDeconnexion: handlerLogout }
      )
    );
  AuthData.me().then(
    (session) => HeaderView.updateAccount(session.connecte ? session.email : null),
    () => {} // serveur injoignable : le header garde ce qu'il affiche
  );
  layout.querySelector('slot[name="footer"]').replaceWith(FooterView.dom());
  return layout;
}
