import { AuthData } from "../../data/auth.js";
import { CompteData } from "../../data/compte.js";
import { goTo } from "../../lib/navigation.js";
import { htmlToFragment } from "../../lib/utils.js";
import { FormulaireMotDePasseView } from "../../ui/formulaire-mot-de-passe/index.js";
import { MessageView } from "../../ui/message/index.js";
import { NavigationCompteView } from "../../ui/navigation-compte/index.js";
import template from "./template.html?raw";

/**
 * Page « Mot de passe » (US SUI-b), à l'adresse /compte/mot-de-passe : changement
 * du mot de passe, qui exige l'ancien.
 *
 * M : la session connue et le message (jamais un mot de passe). V : le gabarit,
 * les onglets et le formulaire. C : vérifie la session, valide, envoie.
 */

const MDP_MIN = 8;
const MDP_MAX_OCTETS = 72;

let M = {
  session: null, // { connecte, email?, role? } renvoyé par le serveur, ou null
  message: null, // { type, texte }, ou null
};

/**
 * Vérifie les champs avant l'envoi. Le serveur revérifie : ce contrôle évite
 * seulement un aller-retour inutile.
 * . ancien : le mot de passe actuel saisi
 * . nouveau : le nouveau mot de passe saisi
 * . confirmation : le nouveau mot de passe resaisi
 * > { texte, champ } décrivant le problème, ou null si tout est valide
 */
M.validate = function (ancien, nouveau, confirmation) {
  if (ancien === "") return { texte: "Saisis ton mot de passe actuel.", champ: "ancien" };
  if (nouveau.length < MDP_MIN) {
    return { texte: `Le mot de passe doit contenir au moins ${MDP_MIN} caractères.`, champ: "nouveau" };
  }
  if (new TextEncoder().encode(nouveau).length > MDP_MAX_OCTETS) {
    return { texte: "Le mot de passe est trop long (72 caractères au maximum).", champ: "nouveau" };
  }
  if (nouveau !== confirmation) {
    return { texte: "Les deux mots de passe ne sont pas identiques.", champ: "confirmation" };
  }
  return null;
};

let C = {};

/**
 * Demande au serveur si une session est ouverte. Sinon, renvoie vers la connexion.
 * > false si le visiteur a été redirigé, true sinon
 */
C.charger = async function () {
  M.message = null;

  try {
    M.session = await AuthData.me();
  } catch (erreur) {
    // Pas de session lisible : la page s'affiche, l'envoi dira le reste.
    M.session = null;
    return true;
  }

  if (!M.session.connecte) {
    goTo("/connexion?retour=" + encodeURIComponent("/compte/mot-de-passe"));
    return false;
  }

  return true;
};

/**
 * Soumission du formulaire : change le mot de passe.
 * . ancien : le mot de passe actuel saisi
 * . nouveau : le nouveau mot de passe saisi
 * . confirmation : le nouveau mot de passe resaisi
 */
C.handler_change = async function (ancien, nouveau, confirmation) {
  let probleme = M.validate(ancien, nouveau, confirmation);
  if (probleme !== null) {
    M.message = { type: "erreur", texte: probleme.texte };
    V.refresh(C.viewData(), `input[name="${probleme.champ}"]`);
    return;
  }

  try {
    await CompteData.updatePassword(ancien, nouveau, confirmation);
    M.message = { type: "succes", texte: "Ton mot de passe a bien été modifié." };
    V.refresh(C.viewData(), "h1[data-titre]");
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/connexion?retour=" + encodeURIComponent("/compte/mot-de-passe"));
      return;
    }
    M.message = { type: "erreur", texte: erreur.message };
    V.refresh(C.viewData(), erreur.statut === 403 ? 'input[name="ancien"]' : 'input[name="nouveau"]');
  }
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { message }
 */
C.viewData = function () {
  return { message: M.message };
};

C.init = async function () {
  let afficher = await C.charger();
  // Visiteur non connecté : le routeur affiche déjà la page de connexion.
  if (!afficher) return htmlToFragment("");
  return V.init(C.viewData());
};

let V = {};

V.racine = null; // élément racine de la page affichée

V.init = function (data) {
  let fragment = V.createPageFragment(data);
  V.racine = fragment.firstElementChild;
  return fragment;
};

// Toute la page se reconstruit à partir du modèle ; les champs repartent vides.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  document.querySelector(focusSelector)?.focus();
};

V.createPageFragment = function (data) {
  let page = htmlToFragment(template);

  page.querySelector('slot[name="navigation"]').replaceWith(NavigationCompteView.dom());
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));
  page
    .querySelector('slot[name="formulaire"]')
    .replaceWith(FormulaireMotDePasseView.dom({ surChangement: C.handler_change }));

  return page;
};

export function CompteMotDePassePage() {
  return C.init();
}
