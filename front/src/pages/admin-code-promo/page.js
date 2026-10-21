import { AdminData } from "../../data/admin.js";
import { CodePromoAdminData } from "../../data/codes-promo.js";
import { goTo } from "../../lib/navigation.js";
import { htmlToFragment } from "../../lib/utils.js";
import { BarreAdminView } from "../../ui/barre-admin/index.js";
import { EnTetePageView } from "../../ui/en-tete-page/index.js";
import { FormulaireCodePromoView } from "../../ui/formulaire-code-promo/index.js";
import template from "./template.html?raw";

/**
 * Page « Nouveau code promo » (/admin/codes-promo/nouveau) et « Modifier le code »
 * (/admin/codes-promo/:id/modifier) du back-office (US PRO-b).
 *
 * Le même formulaire sert aux deux : la présence de :id dans l'adresse décide. En
 * modification, seuls le pourcentage et l'état changent : le code lui-même est fixe.
 * Le contrôle des champs est refait par le serveur, qui fait foi.
 *
 * M : code en cours d'édition, champs saisis, message. V : les gabarits.
 * C : charge, valide avant l'envoi, envoie, redirige.
 */

const FORMAT_CODE = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

let M = {
  id: null, // identifiant du code modifié, ou null en création
  code: "",
  pourcentage: "",
  actif: true,
  enCours: false, // vrai pendant l'envoi
  message: null, // { type, texte }, ou null
};

/**
 * Vérifie les champs avant l'envoi. Le serveur revérifie : ce contrôle évite
 * seulement un aller-retour inutile.
 * . code : le code saisi
 * . pourcentage : la remise saisie, en texte
 * > un texte d'erreur, ou null si les champs sont valides
 */
M.validate = function (code, pourcentage) {
  if (!FORMAT_CODE.test(code.trim().toUpperCase())) {
    return "Le code doit contenir de 3 à 30 caractères : lettres, chiffres, « - » ou « _ ».";
  }
  if (!/^[0-9]{1,3}$/.test(pourcentage.trim()) || Number(pourcentage) < 1 || Number(pourcentage) > 100) {
    return "Le pourcentage doit être un nombre entier de 1 à 100.";
  }
  return null;
};

let C = {};

/**
 * Lit la session, puis le code à modifier le cas échéant.
 * . idTexte : le :id de l'adresse, ou undefined en création
 * > true si la page peut s'afficher, false si on a redirigé
 */
C.charger = async function (idTexte) {
  M.id = null;
  M.code = "";
  M.pourcentage = "";
  M.actif = true;
  M.enCours = false;
  M.message = null;

  try {
    let session = await AdminData.me();
    if (!session.connecte) {
      goTo("/admin");
      return false;
    }

    if (idTexte === undefined) return true;

    let reponse = await CodePromoAdminData.fetchAll();
    let code = reponse.codes.find((ligne) => String(ligne.id) === idTexte);
    if (code === undefined) {
      goTo("/admin/codes-promo");
      return false;
    }
    M.id = code.id;
    M.code = code.code;
    M.pourcentage = String(code.pourcentage);
    M.actif = code.actif;
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return false;
    }
    M.message = { type: "erreur", texte: erreur.message };
  }
  return true;
};

/**
 * Soumission du formulaire : crée ou modifie, puis retourne à la liste.
 * . code : le code saisi
 * . pourcentage : la remise saisie, en texte
 * . actif : l'état coché
 */
C.handler_submit = async function (code, pourcentage, actif) {
  M.code = M.id === null ? code.trim().toUpperCase() : M.code;
  M.pourcentage = pourcentage;
  M.actif = actif;
  M.message = null;

  let probleme = M.validate(M.code, pourcentage);
  if (probleme !== null) {
    M.message = { type: "erreur", texte: probleme };
    V.refresh(C.viewData(), M.id === null && !FORMAT_CODE.test(M.code) ? 'input[name="code"]' : 'input[name="pourcentage"]');
    return;
  }

  M.enCours = true;
  V.refresh(C.viewData(), null);

  try {
    if (M.id === null) {
      await CodePromoAdminData.create(M.code, Number(pourcentage), actif);
      goTo("/admin/codes-promo?ok=cree");
    } else {
      await CodePromoAdminData.update(M.id, Number(pourcentage), actif);
      goTo("/admin/codes-promo?ok=modifie");
    }
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    M.enCours = false;
    M.message = { type: "erreur", texte: erreur.message };
    V.refresh(C.viewData(), erreur.statut === 409 ? 'input[name="code"]' : 'input[name="pourcentage"]');
  }
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { email, titre, sousTitre, code, pourcentage, actif, modification, bouton, enCours, message }
 */
C.viewData = function () {
  let creation = M.id === null;
  return {
    email: AdminData.knownEmail ?? "",
    titre: creation ? "Nouveau code promo" : "Modifier le code",
    sousTitre: creation ? "Ajoutez un code de réduction" : "Changez la remise ou activez ou désactivez le code",
    code: M.code,
    pourcentage: M.pourcentage,
    actif: M.actif,
    modification: !creation,
    bouton: creation ? "Créer le code" : "Enregistrer",
    enCours: M.enCours,
    message: M.message,
  };
};

C.init = async function (params) {
  if (!(await C.charger(params.id))) return document.createDocumentFragment();
  return V.init(C.viewData());
};

let V = {};

V.racine = null; // élément racine de la page affichée

V.init = function (data) {
  let fragment = V.createPageFragment(data);
  V.racine = fragment.firstElementChild;
  return fragment;
};

// Toute la page se reconstruit à partir du modèle ; les champs saisis
// survivent parce qu'ils sont dans le modèle.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;
  if (focusSelector !== null) document.querySelector(focusSelector)?.focus();
};

V.createPageFragment = function (data) {
  let page = htmlToFragment(template);

  page.querySelector('slot[name="barre"]').replaceWith(
    BarreAdminView.dom({ section: "Codes promo", email: data.email })
  );
  page.querySelector('slot[name="entete"]').replaceWith(
    EnTetePageView.dom({ titre: data.titre, sousTitre: data.sousTitre, action: null })
  );
  page.querySelector('slot[name="formulaire"]').replaceWith(
    FormulaireCodePromoView.dom(
      {
        code: data.code,
        pourcentage: data.pourcentage,
        actif: data.actif,
        modification: data.modification,
        bouton: data.bouton,
        enCours: data.enCours,
        message: data.message,
      },
      { surEnvoi: C.handler_submit }
    )
  );

  return page;
};

export function AdminCodePromoPage(params) {
  return C.init(params);
}
