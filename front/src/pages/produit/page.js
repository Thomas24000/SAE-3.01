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
 * M : le produit reçu de l'API, la variante, l'image, la quantité et les
 * options choisies (US OPT-c).
 * V : le template et la fiche. C : charge le produit, réagit aux choix de
 * l'utilisateur.
 */

let M = {
  seuil: 0, // seuil « Bientôt épuisé », lu dans la table de paramètres via l'API
  produit: null, // produit, ses images et ses variantes, ou null tant que le chargement n'a pas réussi
  varianteId: null, // identifiant de la variante choisie
  imageIndex: 0, // rang de l'image affichée en grand
  quantite: 1, // quantité choisie, entre 1 et le stock de la variante
  choix: {}, // choix d'options retenus : { [idGroupe]: [idChoix, ...] }
  introuvable: false, // true si l'API a répondu 404
  message: null, // { type, texte }, ou null
};

/**
 * Choix d'options proposés par défaut : le premier choix de chaque groupe
 * obligatoire à choix unique (le moins cher d'après l'ordre d'affichage), rien ailleurs.
 * . produit : le produit, avec sa liste de groupes d'options
 * > { [idGroupe]: [idChoix, ...] }
 */
M.defaultChoix = function (produit) {
  return Object.fromEntries(
    produit.options.map((groupe) => [
      groupe.id,
      groupe.obligatoire && !groupe.multiple ? [groupe.choix[0].id] : [],
    ])
  );
};

/**
 * Coche ou décoche un choix d'option : dans un groupe à choix multiples le
 * choix s'ajoute ou se retire, sinon il remplace le précédent.
 * . groupeId : l'identifiant du groupe
 * . choixId : l'identifiant du choix cliqué
 */
M.toggleChoix = function (groupeId, choixId) {
  let groupe = M.produit.options.find((autre) => autre.id === groupeId);
  if (groupe === undefined || !groupe.choix.some((choix) => choix.id === choixId)) return;

  let actuels = M.choix[groupeId] ?? [];

  if (!groupe.multiple) {
    M.choix[groupeId] = [choixId];
  } else if (actuels.includes(choixId)) {
    M.choix[groupeId] = actuels.filter((id) => id !== choixId);
  } else {
    M.choix[groupeId] = [...actuels, choixId];
  }
};

/**
 * Identifiants de tous les choix d'options retenus.
 * > un tableau d'identifiants de choix, trié
 */
M.selectedChoixIds = function () {
  return Object.values(M.choix)
    .flat()
    .sort((a, b) => a - b);
};

/**
 * Supplément total des options retenues, par unité.
 * > le supplément en centimes
 */
M.supplementCents = function () {
  let retenus = M.selectedChoixIds();

  return M.produit.options
    .flatMap((groupe) => groupe.choix)
    .filter((choix) => retenus.includes(choix.id))
    .reduce((total, choix) => total + choix.supplementCents, 0);
};

/**
 * Indique si un groupe d'options obligatoire est resté sans choix.
 * > true s'il manque au moins un choix obligatoire
 */
M.hasMissingChoix = function () {
  return M.produit.options.some((groupe) => groupe.obligatoire && (M.choix[groupe.id] ?? []).length === 0);
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
  return statutStock(variante.stock, M.seuil);
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
  PanierData.add(M.varianteId, M.quantite, M.selectedChoixIds());
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
 * > { produit (variantes enrichies de leur statutStock, options de leur état `selectionne`), varianteId,
 *     imageIndex, quantite, statutStock, unitCents (prix unitaire avec suppléments), totalCents,
 *     moinsPossible, plusPossible, achatPossible, optionsManquantes }
 */
M.ficheData = function () {
  let variante = M.currentVariante();
  let unitCents = variante.prixCents + M.supplementCents();
  let optionsManquantes = M.hasMissingChoix();

  return {
    produit: {
      ...M.produit,
      variantes: M.produit.variantes.map((item) => ({ ...item, statutStock: M.stockStatus(item) })),
      options: M.produit.options.map((groupe) => ({
        ...groupe,
        choix: groupe.choix.map((choix) => ({
          ...choix,
          selectionne: (M.choix[groupe.id] ?? []).includes(choix.id),
        })),
      })),
    },
    varianteId: M.varianteId,
    imageIndex: M.imageIndex,
    quantite: M.quantite,
    statutStock: M.stockStatus(variante),
    unitCents: unitCents,
    totalCents: unitCents * M.quantite,
    moinsPossible: M.quantite > 1,
    plusPossible: M.quantite < variante.stock,
    achatPossible: variante.stock > 0 && !optionsManquantes,
    optionsManquantes: optionsManquantes,
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
  M.choix = {};
  M.introuvable = false;
  M.message = null;

  try {
    let reponse = await ProduitData.fetchOne(slug);
    // Un back plus ancien ne renvoie pas « options » : la fiche reste utilisable sans.
    M.produit = { ...reponse.produit, options: reponse.produit.options ?? [] };
    M.seuil = reponse.seuilBientotEpuise;
    M.varianteId = M.defaultVarianteId(reponse.produit);
    M.choix = M.defaultChoix(reponse.produit);
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
 * Choix d'une option : mémorise le choix et reconstruit la page, dont le prix
 * tient compte du supplément.
 * . groupeId : l'identifiant du groupe d'options
 * . choixId : l'identifiant du choix coché ou décoché
 */
C.handler_selectOption = function (groupeId, choixId) {
  M.toggleChoix(groupeId, choixId);
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
        surOption: C.handler_selectOption,
      })
    );
  }

  return pageFragment;
};

export function ProduitPage(params) {
  return C.init(params);
}
