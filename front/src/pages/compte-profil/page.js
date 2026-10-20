import { CompteData } from "../../data/compte.js";
import { goTo } from "../../lib/navigation.js";
import { htmlToFragment } from "../../lib/utils.js";
import { FormulaireProfilView } from "../../ui/formulaire-profil/index.js";
import { HeaderView } from "../../ui/header/index.js";
import { MessageView } from "../../ui/message/index.js";
import { NavigationCompteView } from "../../ui/navigation-compte/index.js";
import template from "./template.html?raw";

/**
 * Page « Mon profil » (US SUI-b), à l'adresse /compte/profil : modification du
 * nom et de l'e-mail.
 *
 * M : le profil courant et le message. V : le gabarit, les onglets et le
 * formulaire. C : charge, valide, enregistre, renvoie vers la connexion sur 401.
 */

const NOM_MAX = 100;

let M = {
  profil: null, // { email, nom }, ou null tant que le chargement n'a pas réussi
  message: null, // { type, texte }, ou null
};

/**
 * Vérifie les champs avant l'envoi. Le serveur revérifie : ce contrôle évite
 * seulement un aller-retour inutile.
 * . nom : le nom saisi (peut être vide)
 * . email : l'e-mail saisi
 * > { texte, champ } décrivant le problème, ou null si tout est valide
 */
M.validate = function (nom, email) {
  if (nom.length > NOM_MAX) {
    return { texte: `Le nom est trop long (${NOM_MAX} caractères au maximum).`, champ: "nom" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { texte: "Saisis une adresse e-mail valide.", champ: "email" };
  }
  return null;
};

let C = {};

/**
 * Charge le profil. Sur un 401, renvoie vers la connexion puis revient ici.
 * > false si le visiteur a été redirigé, true sinon
 */
C.charger = async function () {
  M.message = null;

  try {
    M.profil = (await CompteData.fetch()).profil;
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/connexion?retour=" + encodeURIComponent("/compte/profil"));
      return false;
    }
    M.profil = null;
    M.message = { type: "erreur", texte: `Impossible de charger ton profil : ${erreur.message}` };
  }

  return true;
};

/**
 * Soumission du formulaire : enregistre le nom et l'e-mail.
 * . nom : le nom saisi
 * . email : l'e-mail saisi
 */
C.handler_save = async function (nom, email) {
  // Ce que le client vient de saisir reste affiché, même si l'envoi échoue.
  M.profil = { nom: nom === "" ? null : nom, email };

  let probleme = M.validate(nom, email);
  if (probleme !== null) {
    M.message = { type: "erreur", texte: probleme.texte };
    V.refresh(C.viewData(), `input[name="${probleme.champ}"]`);
    return;
  }

  try {
    M.profil = (await CompteData.updateProfile(nom, email)).profil;
    M.message = { type: "succes", texte: "Ton profil a bien été enregistré." };
    V.refresh(C.viewData(), "h1[data-titre]");
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/connexion?retour=" + encodeURIComponent("/compte/profil"));
      return;
    }
    M.message = { type: "erreur", texte: erreur.message };
    V.refresh(C.viewData(), 'input[name="email"]');
  }
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { message, formulaire } ; formulaire vaut null si le profil n'est pas chargé,
 *   sinon { nom, email }
 */
C.viewData = function () {
  return {
    message: M.message,
    formulaire: M.profil === null ? null : { nom: M.profil.nom ?? "", email: M.profil.email },
  };
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

// Toute la page se reconstruit à partir du modèle.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  // Le header est hors de la page : l'e-mail affiché a pu changer.
  if (data.formulaire !== null) HeaderView.updateAccount(data.formulaire.email);
  document.querySelector(focusSelector)?.focus();
};

V.createPageFragment = function (data) {
  let page = htmlToFragment(template);

  page.querySelector('slot[name="navigation"]').replaceWith(NavigationCompteView.dom());
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

  let slotFormulaire = page.querySelector('slot[name="formulaire"]');
  if (data.formulaire === null) {
    slotFormulaire.remove();
  } else {
    slotFormulaire.replaceWith(
      FormulaireProfilView.dom(data.formulaire, { surEnregistrement: C.handler_save })
    );
  }

  return page;
};

export function CompteProfilPage() {
  return C.init();
}
