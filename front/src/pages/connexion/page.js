import { AuthData } from "../../data/auth.js";
import { goTo, readQuery, safeReturnPath } from "../../lib/navigation.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { FormulaireLoginView } from "../../ui/formulaire-login/index.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";
import templateConnecte from "./connecte.html?raw";

/**
 * Page « Connexion » (US CMD-c), à l'adresse /connexion.
 *
 * M : l'identifiant saisi, la session connue du serveur et le chemin où
 * retourner après la connexion. V : le gabarit et le formulaire (ou l'état
 * « connecté »). C : charge la session, réagit aux actions, redirige.
 */

let M = {
  login: "", // dernier identifiant saisi, pour pré-remplir le formulaire
  session: null, // { connecte, login?, role? } renvoyé par le serveur, ou null
  retour: "/", // chemin où aller une fois connecté
  message: null, // { type, texte }, ou null
};

/**
 * Le visiteur est-il connecté d'après le serveur ?
 * > true si une session est ouverte
 */
M.isConnected = function () {
  return M.session !== null && M.session.connecte === true;
};

/**
 * Vérifie les champs avant l'envoi. Le serveur revérifie : ce contrôle évite
 * seulement un aller-retour inutile.
 * . login : l'identifiant saisi
 * . mdp : le mot de passe saisi
 * > un texte d'erreur, ou null si les champs sont renseignés
 */
M.validate = function (login, mdp) {
  if (login === "" || mdp === "") return "Renseigne ton identifiant et ton mot de passe.";
  return null;
};

let C = {};

/**
 * Lit le chemin de retour puis demande au serveur si une session est ouverte.
 */
C.charger = async function () {
  M.message = null;
  M.retour = safeReturnPath(readQuery("retour"));

  try {
    M.session = await AuthData.me();
  } catch (erreur) {
    // Pas de session lisible : on propose le formulaire, la connexion dira le reste.
    M.session = null;
  }
};

/**
 * Soumission du formulaire : connecte puis renvoie vers la page demandée.
 * . login : l'identifiant saisi
 * . mdp : le mot de passe saisi
 */
C.handler_login = async function (login, mdp) {
  M.login = login;

  let probleme = M.validate(login, mdp);
  if (probleme !== null) {
    M.message = { type: "erreur", texte: probleme };
    V.refresh(C.viewData(), 'input[name="login"]');
    return;
  }

  try {
    await AuthData.login(login, mdp);
  } catch (erreur) {
    M.message = { type: "erreur", texte: erreur.message };
    V.refresh(C.viewData(), 'input[name="mdp"]');
    return;
  }

  goTo(M.retour);
};

/**
 * Clic sur « Créer un compte » : va à l'inscription en gardant le chemin de retour.
 */
C.handler_goRegister = function () {
  goTo("/inscription?retour=" + encodeURIComponent(M.retour));
};

/**
 * Clic sur « Se déconnecter » : ferme la session puis réaffiche le formulaire.
 */
C.handler_logout = async function () {
  try {
    await AuthData.logout();
    M.session = null;
    M.message = { type: "succes", texte: "Tu es déconnecté." };
  } catch (erreur) {
    M.message = { type: "erreur", texte: erreur.message };
  }

  V.refresh(C.viewData(), "h1[data-titre]");
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { login, message, connecte, loginConnecte }
 */
C.viewData = function () {
  return {
    login: M.login,
    message: M.message,
    connecte: M.isConnected(),
    loginConnecte: M.isConnected() ? M.session.login : "",
  };
};

C.init = async function () {
  await C.charger();
  return V.init(C.viewData());
};

let V = {};

V.racine = null; // élément racine de la page affichée

V.init = function (data) {
  let fragment = V.createPageFragment(data);
  V.racine = fragment.firstElementChild;
  return fragment;
};

// Toute la page se reconstruit à partir du modèle ; l'identifiant saisi
// survit parce qu'il est dans le modèle.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  document.querySelector(focusSelector)?.focus();
};

V.createPageFragment = function (data) {
  let page = htmlToFragment(template);

  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

  let slotFormulaire = page.querySelector('slot[name="formulaire"]');

  if (data.connecte) {
    let connecte = htmlToFragment(genericRenderer(templateConnecte, { login: data.loginConnecte }));
    connecte
      .querySelector('[data-action="deconnexion"]')
      .addEventListener("click", () => C.handler_logout());
    slotFormulaire.replaceWith(connecte);
  } else {
    slotFormulaire.replaceWith(
      FormulaireLoginView.dom(
        { login: data.login },
        { surConnexion: C.handler_login, surInscription: C.handler_goRegister }
      )
    );
  }

  return page;
};

export function ConnexionPage() {
  return C.init();
}
