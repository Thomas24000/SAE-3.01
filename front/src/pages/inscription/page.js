import { AuthData } from "../../data/auth.js";
import { goTo, readQuery, safeReturnPath } from "../../lib/navigation.js";
import { htmlToFragment } from "../../lib/utils.js";
import { FormulaireInscriptionView } from "../../ui/formulaire-inscription/index.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";

/**
 * Page « Inscription » (US CMD-c), à l'adresse /inscription.
 *
 * M : l'identifiant saisi, les règles de validation et le chemin où aller
 * après l'inscription. V : le gabarit et le formulaire. C : valide, envoie,
 * redirige. Le serveur ouvre la session dès que le compte est créé.
 */

const LOGIN_REGEX = /^[A-Za-z0-9._-]{3,40}$/;
const MDP_MIN = 8;

let M = {
  login: "", // dernier identifiant saisi, pour pré-remplir le formulaire
  retour: "/", // chemin où aller une fois le compte créé
  message: null, // { type, texte }, ou null
};

/**
 * Vérifie les champs avant l'envoi. Mêmes règles que le serveur, qui les
 * revérifie : ce contrôle évite seulement un aller-retour inutile.
 * . login : l'identifiant saisi
 * . mdp : le mot de passe saisi
 * . confirmation : la confirmation du mot de passe
 * > { texte, champ } pour la première erreur trouvée, ou null si tout est valide
 */
M.validate = function (login, mdp, confirmation) {
  if (!LOGIN_REGEX.test(login)) {
    return {
      texte: "L'identifiant doit faire de 3 à 40 caractères : lettres, chiffres, point, tiret ou souligné.",
      champ: "login",
    };
  }
  if (mdp.length < MDP_MIN) {
    return { texte: `Le mot de passe doit contenir au moins ${MDP_MIN} caractères.`, champ: "mdp" };
  }
  if (new TextEncoder().encode(mdp).length > 72) {
    return { texte: "Le mot de passe est trop long (72 caractères au maximum).", champ: "mdp" };
  }
  if (mdp !== confirmation) {
    return { texte: "Les deux mots de passe ne sont pas identiques.", champ: "confirmation" };
  }
  return null;
};

let C = {};

C.charger = function () {
  M.message = null;
  M.retour = safeReturnPath(readQuery("retour"));
};

/**
 * Soumission du formulaire : valide, crée le compte puis renvoie vers la
 * page demandée (le compte est déjà connecté).
 * . login : l'identifiant saisi
 * . mdp : le mot de passe saisi
 * . confirmation : la confirmation du mot de passe
 */
C.handler_register = async function (login, mdp, confirmation) {
  M.login = login;

  let probleme = M.validate(login, mdp, confirmation);
  if (probleme !== null) {
    M.message = { type: "erreur", texte: probleme.texte };
    V.refresh(C.viewData(), `input[name="${probleme.champ}"]`);
    return;
  }

  try {
    await AuthData.register(login, mdp, confirmation);
  } catch (erreur) {
    M.message = { type: "erreur", texte: erreur.message };
    V.refresh(C.viewData(), 'input[name="login"]');
    return;
  }

  goTo(M.retour);
};

/**
 * Clic sur « Se connecter » : va à la connexion en gardant le chemin de retour.
 */
C.handler_goLogin = function () {
  goTo("/connexion?retour=" + encodeURIComponent(M.retour));
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { login, message }
 */
C.viewData = function () {
  return { login: M.login, message: M.message };
};

C.init = function () {
  C.charger();
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
// survit parce qu'il est dans le modèle (les mots de passe, jamais).
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
  page.querySelector('slot[name="formulaire"]').replaceWith(
    FormulaireInscriptionView.dom(
      { login: data.login },
      { surInscription: C.handler_register, surConnexion: C.handler_goLogin }
    )
  );

  return page;
};

export function InscriptionPage() {
  return C.init();
}
