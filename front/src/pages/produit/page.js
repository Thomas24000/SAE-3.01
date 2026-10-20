import { PanierData } from "../../data/panier.js";
import { ProduitData } from "../../data/produit.js";
import { htmlToFragment } from "../../lib/utils.js";
import { choixIds, defaultChoix, groupesAvecEtat, hasMissing, supplementCents, toggleChoix } from "../../lib/options.js";
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
  ajoutEnCours: false, // true entre le clic sur « Ajouter » et la réponse du serveur
};

/**
 * Coche ou décoche un choix d'option (règles dans lib/options.js).
 * . groupeId : l'identifiant du groupe
 * . choixId : l'identifiant du choix cliqué
 */
M.toggleChoix = function (groupeId, choixId) {
  M.choix = toggleChoix(M.produit.options, M.choix, groupeId, choixId);
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
 * Quantité de la variante choisie déjà présente dans le panier, toutes options
 * confondues (les lignes d'une même variante se partagent son stock).
 * > la quantité au panier, 0 si la variante n'y est pas
 */
M.quantityInCart = function () {
  return PanierData.read()
    .filter((ligne) => ligne.variantId === M.varianteId)
    .reduce((total, ligne) => total + ligne.quantite, 0);
};

/**
 * Quantité encore ajoutable : le stock de la variante choisie moins ce que le
 * panier en contient déjà (US STK-c).
 * > la quantité ajoutable, 0 au minimum
 */
M.maxAddable = function () {
  return Math.max(0, M.currentVariante().stock - M.quantityInCart());
};

/**
 * Ramène une quantité entre 1 et la quantité encore ajoutable de la variante
 * choisie (1 si plus rien n'est ajoutable : le refus est expliqué à l'ajout).
 * . quantite : la quantité souhaitée
 * > la quantité autorisée
 */
M.clampQuantite = function (quantite) {
  let max = Math.max(1, M.maxAddable());

  return Math.min(Math.max(quantite, 1), max);
};

/**
 * Remplace le stock des variantes du produit par celui que le serveur vient
 * de renvoyer, et le seuil « Bientôt épuisé ».
 * . reponse : la réponse de ProduitData.fetchVariantes ({ variantes, seuilBientotEpuise })
 */
M.applyFreshStock = function (reponse) {
  M.seuil = reponse.seuilBientotEpuise;
  M.produit = {
    ...M.produit,
    variantes: M.produit.variantes.map((variante) => {
      let fraiche = reponse.variantes.find((autre) => autre.variantId === variante.id);

      return fraiche === undefined ? variante : { ...variante, stock: fraiche.stock };
    }),
  };
};

/**
 * Ajoute au panier la quantité choisie de la variante choisie, après avoir relu
 * le stock auprès du serveur : rien n'est ajouté si le stock ne suffit pas, la
 * quantité est alors ramenée à ce qui reste ajoutable.
 * > { ajoute, message } : si l'ajout a eu lieu, et le message à montrer
 *   (lève une ErreurApi si le serveur ne répond pas)
 */
M.addToCart = async function () {
  let nom = M.produit.nom;
  let libelle = M.currentVariante().libelle;
  let reponse = await ProduitData.fetchVariantes([M.varianteId]);

  if (reponse.variantes.length === 0) {
    return { ajoute: false, message: { type: "erreur", texte: `« ${nom} » (${libelle}) n'est plus proposé.` } };
  }

  M.applyFreshStock(reponse);

  let restant = M.maxAddable();
  let deja = M.quantityInCart();

  if (M.currentVariante().stock === 0) {
    M.quantite = 1;
    return { ajoute: false, message: { type: "erreur", texte: `« ${nom} » (${libelle}) est épuisé.` } };
  }

  if (restant === 0) {
    M.quantite = 1;
    return {
      ajoute: false,
      message: {
        type: "erreur",
        texte: `Ton panier contient déjà ${deja} « ${nom} » (${libelle}) : c'est tout le stock disponible.`,
      },
    };
  }

  if (M.quantite > restant) {
    M.quantite = restant;
    return {
      ajoute: false,
      message: {
        type: "erreur",
        texte:
          `Il ne reste que ${M.currentVariante().stock} « ${nom} » (${libelle})` +
          (deja > 0 ? `, dont ${deja} déjà dans ton panier` : "") +
          `. La quantité est passée à ${restant} : valide-la pour l'ajouter.`,
      },
    };
  }

  PanierData.add(M.varianteId, M.quantite, choixIds(M.choix));
  return { ajoute: true, message: { type: "succes", texte: `${M.quantite} article(s) ajouté(s) au panier.` } };
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
  let unitCents = variante.prixCents + supplementCents(M.produit.options, M.choix);
  let optionsManquantes = hasMissing(M.produit.options, M.choix);

  return {
    produit: {
      ...M.produit,
      variantes: M.produit.variantes.map((item) => ({ ...item, statutStock: M.stockStatus(item) })),
      options: groupesAvecEtat(M.produit.options, M.choix),
    },
    varianteId: M.varianteId,
    imageIndex: M.imageIndex,
    quantite: M.quantite,
    statutStock: M.stockStatus(variante),
    unitCents: unitCents,
    totalCents: unitCents * M.quantite,
    moinsPossible: M.quantite > 1,
    plusPossible: M.quantite < M.maxAddable(),
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
  M.ajoutEnCours = false;

  try {
    let reponse = await ProduitData.fetchOne(slug);
    // Un back plus ancien ne renvoie pas « options » : la fiche reste utilisable sans.
    M.produit = { ...reponse.produit, options: reponse.produit.options ?? [] };
    M.seuil = reponse.seuilBientotEpuise;
    M.varianteId = M.defaultVarianteId(reponse.produit);
    M.choix = defaultChoix(M.produit.options);
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
 * Clic sur « Ajouter au panier » : relit le stock, range la sélection dans le
 * panier si le stock suffit et explique à l'utilisateur ce qui s'est passé.
 */
C.handler_addToCart = async function () {
  if (M.ajoutEnCours) return;
  M.ajoutEnCours = true;

  try {
    let resultat = await M.addToCart();
    M.message = resultat.message;
    M.quantite = M.clampQuantite(M.quantite);
  } catch (erreur) {
    M.message = { type: "erreur", texte: `Impossible de vérifier le stock : ${erreur.message}` };
  }

  M.ajoutEnCours = false;
  V.rafraichir('button[data-action="ajouter"]');
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
// Le focus est rendu par la fiche elle-même (voir ui/fiche-produit), sauf après
// une action asynchrone : la fiche l'a alors rendu avant la reconstruction, d'où
// le sélecteur facultatif.
V.rafraichir = function (focusSelector) {
  let fragment = V.createPageFragment();
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  if (focusSelector !== undefined) document.querySelector(focusSelector)?.focus();
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
