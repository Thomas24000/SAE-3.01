import { AdminData } from "../../data/admin.js";
import { CategorieData } from "../../data/categories.js";
import { goTo } from "../../lib/navigation.js";
import { htmlToFragment } from "../../lib/utils.js";
import { BarreAdminView } from "../../ui/barre-admin/index.js";
import { EnTetePageView } from "../../ui/en-tete-page/index.js";
import { FormulaireCategorieView } from "../../ui/formulaire-categorie/index.js";
import template from "./template.html?raw";

/**
 * Page « Nouvelle catégorie » (/admin/categories/nouvelle) et « Modifier la
 * catégorie » (/admin/categories/:id/modifier) du back-office (US GOF-c).
 *
 * Le même formulaire sert aux deux : la présence de :id dans l'adresse décide.
 * Le contrôle des champs est refait par le serveur, qui fait foi.
 *
 * M : catégorie en cours d'édition, champs saisis, message. V : les gabarits.
 * C : charge, valide avant l'envoi, envoie, redirige.
 */

const LIBELLE_MIN = 2;
const LIBELLE_MAX = 60;
const DESCRIPTION_MAX = 255;

let M = {
  id: null, // identifiant de la catégorie modifiée, ou null en création
  libelle: "",
  description: "",
  enCours: false, // vrai pendant l'envoi
  message: null, // { type, texte }, ou null
};

/**
 * Vérifie les champs avant l'envoi. Le serveur revérifie : ce contrôle évite
 * seulement un aller-retour inutile.
 * . libelle : le nom saisi
 * . description : la description saisie
 * > un texte d'erreur, ou null si les champs sont valides
 */
M.validate = function (libelle, description) {
  let nom = libelle.trim();
  if (nom.length < LIBELLE_MIN || nom.length > LIBELLE_MAX) {
    return `Le nom doit contenir entre ${LIBELLE_MIN} et ${LIBELLE_MAX} caractères.`;
  }
  if (description.trim().length > DESCRIPTION_MAX) {
    return `La description est limitée à ${DESCRIPTION_MAX} caractères.`;
  }
  return null;
};

let C = {};

/**
 * Lit la session, puis la catégorie à modifier le cas échéant.
 * . idTexte : le :id de l'adresse, ou undefined en création
 * > true si la page peut s'afficher, false si on a redirigé
 */
C.charger = async function (idTexte) {
  M.id = null;
  M.libelle = "";
  M.description = "";
  M.enCours = false;
  M.message = null;

  try {
    let session = await AdminData.me();
    if (!session.connecte) {
      goTo("/admin");
      return false;
    }

    if (idTexte === undefined) return true;

    let reponse = await CategorieData.fetchAll();
    let categorie = reponse.categories.find((ligne) => String(ligne.id) === idTexte);
    if (categorie === undefined) {
      goTo("/admin/categories");
      return false;
    }
    M.id = categorie.id;
    M.libelle = categorie.libelle;
    M.description = categorie.description;
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
 * . libelle : le nom saisi
 * . description : la description saisie
 */
C.handler_submit = async function (libelle, description) {
  M.libelle = libelle;
  M.description = description;
  M.message = null;

  let probleme = M.validate(libelle, description);
  if (probleme !== null) {
    M.message = { type: "erreur", texte: probleme };
    V.refresh(C.viewData(), 'input[name="libelle"]');
    return;
  }

  M.enCours = true;
  V.refresh(C.viewData(), null);

  try {
    if (M.id === null) {
      await CategorieData.create(libelle, description);
      goTo("/admin/categories?ok=creee");
    } else {
      await CategorieData.update(M.id, libelle, description);
      goTo("/admin/categories?ok=modifiee");
    }
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    M.enCours = false;
    M.message = { type: "erreur", texte: erreur.message };
    V.refresh(C.viewData(), 'input[name="libelle"]');
  }
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { email, titre, sousTitre, libelle, description, bouton, enCours, message }
 */
C.viewData = function () {
  let creation = M.id === null;
  return {
    email: AdminData.knownEmail ?? "",
    titre: creation ? "Nouvelle catégorie" : "Modifier la catégorie",
    sousTitre: creation ? "Ajoutez une catégorie au catalogue" : "Modifiez le nom ou la description",
    libelle: M.libelle,
    description: M.description,
    bouton: creation ? "Créer la catégorie" : "Enregistrer",
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
    BarreAdminView.dom({ section: "Catégories", email: data.email })
  );
  page.querySelector('slot[name="entete"]').replaceWith(
    EnTetePageView.dom({ titre: data.titre, sousTitre: data.sousTitre, action: null })
  );
  page.querySelector('slot[name="formulaire"]').replaceWith(
    FormulaireCategorieView.dom(
      {
        libelle: data.libelle,
        description: data.description,
        bouton: data.bouton,
        enCours: data.enCours,
        message: data.message,
      },
      { surEnvoi: C.handler_submit }
    )
  );

  return page;
};

export function AdminCategoriePage(params) {
  return C.init(params);
}
