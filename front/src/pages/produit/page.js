import { PanierData } from "../../data/panier.js";
import { ProduitData } from "../../data/produit.js";
import { htmlToFragment } from "../../lib/utils.js";
import { statutStock } from "../../lib/stock.js";
import { FicheProduitView } from "../../ui/fiche-produit/index.js";
import { HeaderView } from "../../ui/header/index.js";
import { MessageView } from "../../ui/message/index.js";
import { The404Page } from "../404/page.js";
import template from "./template.html?raw";

/**
 * Page « Détail produit » (US DEC-c), à l'adresse /produit/:slug.
 *
 * M : le produit reçu de l'API, la variante, l'image et la quantité choisies.
 * V : le template et la fiche. C : charge le produit, réagit aux choix de
 * l'utilisateur.
 */

let M = {
  produit: null, // produit, ses images et ses variantes, ou null tant que le chargement n'a pas réussi
  varianteId: null, // identifiant de la variante choisie
  imageIndex: 0, // rang de l'image affichée en grand
  quantite: 1, // quantité choisie, entre 1 et le stock de la variante
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

/**
 * La variante actuellement choisie.
 * > la variante, ou undefined tant qu'aucun produit n'est chargé
 */
M.currentVariante = function () {
  return M.produit?.variantes.find((variante) => variante.id === M.varianteId);
};

/**
 * Statut de stock d'une variante.
 * . variante : la variante, avec son stock
 * > "epuise" si le stock est nul, "bientot" s'il est sous le seuil, sinon "disponible"
 */
M.stockStatus = function (variante) {
  return statutStock(variante.stock);
};

/**
 * Ramène une quantité entre 1 et le stock de la variante choisie.
 * . quantite : la quantité souhaitée
 * > la quantité autorisée
 */
M.clampQuantite = function (quantite) {
  let max = Math.max(1, M.currentVariante().stock);

  return Math.min(Math.max(quantite, 1), max);
};

/**
 * Ajoute au panier la quantité choisie de la variante choisie.
 */
M.addToCart = function () {
  PanierData.add(M.varianteId, M.quantite);
};

/**
 * Nombre d'articles du panier, quantités comprises.
 * > le nombre d'articles
 */
M.cartCount = function () {
  return PanierData.count();
};

/**
 * Les données dont la fiche a besoin pour s'afficher.
 * > { produit, varianteId, imageIndex, quantite, statutStock, totalCents,
 *     moinsPossible, plusPossible, achatPossible }
 */
M.ficheData = function () {
  let variante = M.currentVariante();

  return {
    produit: M.produit,
    varianteId: M.varianteId,
    imageIndex: M.imageIndex,
    quantite: M.quantite,
    statutStock: M.stockStatus(variante),
    totalCents: variante.prixCents * M.quantite,
    moinsPossible: M.quantite > 1,
    plusPossible: M.quantite < variante.stock,
    achatPossible: variante.stock > 0,
  };
};

let C = {};

/**
 * Charge le produit désigné par l'adresse et range la réponse dans le modèle.
 * . slug : le slug lu dans l'adresse
 */
C.charger = async function (slug) {
  M.produit = null;
  M.varianteId = null;
  M.imageIndex = 0;
  M.quantite = 1;
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
 * Clic sur un format : mémorise la variante choisie, ajuste la quantité à son
 * stock et reconstruit la page.
 * . id : l'identifiant de la variante choisie (la Vue ne signale que les formats en stock)
 */
C.handler_selectVariante = function (id) {
  M.varianteId = id;
  M.quantite = M.clampQuantite(M.quantite);
  M.message = null;
  V.rafraichir();
};

/**
 * Clic sur une vignette : affiche l'image choisie en grand.
 * . index : le rang de l'image dans la galerie
 */
C.handler_selectImage = function (index) {
  M.imageIndex = index;
  V.rafraichir();
};

/**
 * Clic sur « − » ou « + » : change la quantité, dans les limites du stock.
 * . delta : -1 ou 1
 */
C.handler_changeQuantite = function (delta) {
  M.quantite = M.clampQuantite(M.quantite + delta);
  M.message = null;
  V.rafraichir();
};

/**
 * Clic sur « Ajouter au panier » : range la sélection dans le panier et
 * l'indique à l'utilisateur.
 */
C.handler_addToCart = function () {
  M.addToCart();
  M.message = { type: "succes", texte: `${M.quantite} article(s) ajouté(s) au panier.` };

  V.rafraichir();
  V.refreshCartCount(M.cartCount());
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
// Le focus est rendu par la fiche elle-même (voir ui/fiche-produit).
V.rafraichir = function () {
  let fragment = V.createPageFragment();
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;
};

// Le header est hors de la page : on met son compteur à jour sans le reconstruire.
V.refreshCartCount = function (nombre) {
  HeaderView.updateCount(nombre);
};

V.createPageFragment = function () {
  let pageFragment = htmlToFragment(template);

  pageFragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(M.message));

  let slotFiche = pageFragment.querySelector('slot[name="fiche"]');

  if (M.produit === null) {
    slotFiche.remove();
  } else {
    slotFiche.replaceWith(
      FicheProduitView.dom(M.ficheData(), {
        surVariante: C.handler_selectVariante,
        surImage: C.handler_selectImage,
        surQuantite: C.handler_changeQuantite,
        surAjout: C.handler_addToCart,
      })
    );
  }

  return pageFragment;
};

export function ProduitPage(params) {
  return C.init(params);
}
