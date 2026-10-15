import { ProduitData } from "../../data/produit.js";
import { htmlToFragment } from "../../lib/utils.js";
import { GrilleProduitsView } from "../../ui/grille-produits/index.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";

/**
 * Page « Catalogue » des pots de glace (US DEC-b).
 *
 * M : la liste des produits reçue de l'API. V : le template et les composants.
 * C : charge les données puis demande l'affichage.
 */

let M = {
  produits: null, // tableau de produits, ou null tant que le chargement n'a pas réussi
  message: null, // { type, texte }, ou null
};

let C = {};

/**
 * Charge le catalogue et range la réponse dans le modèle.
 */
C.charger = async function () {
  try {
    let reponse = await ProduitData.fetchAll();
    M.produits = reponse.produits;
    M.message = null;
  } catch (erreur) {
    M.produits = null;
    M.message = { type: "erreur", texte: `Impossible de charger le catalogue : ${erreur.message}` };
  }
};

C.init = async function () {
  await C.charger();
  return V.init();
};

let V = {};

V.init = function () {
  return V.createPageFragment();
};

V.createPageFragment = function () {
  let pageFragment = htmlToFragment(template);

  pageFragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(M.message));

  let slotGrille = pageFragment.querySelector('slot[name="grille"]');

  if (M.produits === null) {
    slotGrille.remove();
  } else {
    slotGrille.replaceWith(GrilleProduitsView.dom(M.produits));
  }

  return pageFragment;
};

export function ProduitsPage() {
  return C.init();
}
