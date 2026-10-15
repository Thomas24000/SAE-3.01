import { ProduitData } from "../../data/produit.js";
import { htmlToFragment } from "../../lib/utils.js";
import { FicheProduitView } from "../../ui/fiche-produit/index.js";
import { MessageView } from "../../ui/message/index.js";
import { The404Page } from "../404/page.js";
import template from "./template.html?raw";

/**
 * Page « Détail produit » (US DEC-c), à l'adresse /produit/:slug.
 *
 * M : le produit reçu de l'API et la variante choisie. V : le template et la
 * fiche. C : charge le produit, choisit la variante par défaut, réagit au
 * choix d'un format.
 */

let M = {
  produit: null, // produit et ses variantes, ou null tant que le chargement n'a pas réussi
  varianteId: null, // identifiant de la variante choisie
  introuvable: false, // true si l'API a répondu 404
  message: null, // { type, texte }, ou null
};

/**
 * Variante proposée par défaut : la première en stock, ou à défaut la première.
 * . produit : le produit, avec sa liste de variantes (jamais vide)
 * > l'identifiant de la variante à sélectionner
 */
M.defaultVarianteId = function (produit) {
  let enStock = produit.variantes.find((variante) => variante.stock > 0);

  return (enStock ?? produit.variantes[0]).id;
};

let C = {};

/**
 * Charge le produit désigné par l'adresse et range la réponse dans le modèle.
 * . slug : le slug lu dans l'adresse
 */
C.charger = async function (slug) {
  M.produit = null;
  M.varianteId = null;
  M.introuvable = false;
  M.message = null;

  try {
    let reponse = await ProduitData.fetchOne(slug);
    M.produit = reponse.produit;
    M.varianteId = M.defaultVarianteId(reponse.produit);
  } catch (erreur) {
    if (erreur.statut === 404) {
      M.introuvable = true;
    } else {
      M.message = { type: "erreur", texte: `Impossible de charger ce produit : ${erreur.message}` };
    }
  }
};

/**
 * Clic sur un format : mémorise la variante choisie et reconstruit la page.
 * . id : l'identifiant de la variante choisie (la Vue ne signale que les formats en stock)
 */
C.handler_selectVariante = function (id) {
  M.varianteId = id;
  V.rafraichir();
};

C.init = async function (params) {
  await C.charger(params.slug);

  if (M.introuvable) {
    return The404Page();
  }

  return V.init();
};

let V = {};

V.racine = null; // élément racine de la page affichée

V.init = function () {
  let fragment = V.createPageFragment();
  V.racine = fragment.firstElementChild;
  return fragment;
};

// Toute la page se reconstruit à partir du modèle, comme la page Administration.
V.rafraichir = function () {
  let fragment = V.createPageFragment();
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  // Le bouton cliqué a été recréé : on rend le focus au format choisi pour que
  // la navigation au clavier ne reparte pas du début de la page.
  V.racine.querySelector('button[aria-pressed="true"]')?.focus();
};

V.createPageFragment = function () {
  let pageFragment = htmlToFragment(template);

  pageFragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(M.message));

  let slotFiche = pageFragment.querySelector('slot[name="fiche"]');

  if (M.produit === null) {
    slotFiche.remove();
  } else {
    slotFiche.replaceWith(
      FicheProduitView.dom({ produit: M.produit, varianteId: M.varianteId }, { surVariante: C.handler_selectVariante })
    );
  }

  return pageFragment;
};

export function ProduitPage(params) {
  return C.init(params);
}
