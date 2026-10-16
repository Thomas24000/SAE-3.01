import { ProduitData } from "../../data/produit.js";
import { htmlToFragment } from "../../lib/utils.js";
import { statutStock } from "../../lib/stock.js";
import { BandeauView } from "../../ui/bandeau/index.js";
import { FiltresCategoriesView } from "../../ui/filtres-categories/index.js";
import { GrilleProduitsView } from "../../ui/grille-produits/index.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";
import templateVoirPlus from "./voir-plus.html?raw";

/**
 * Page « Catalogue » des pots de glace (US DEC-b), avec l'affichage du stock
 * (US STK-b).
 *
 * M : la liste des produits reçue de l'API, la catégorie choisie et le nombre
 * de produits affichés. V : le template et les composants. C : charge les
 * données, réagit aux choix de l'utilisateur.
 */

// Nombre de produits affichés au départ, puis ajoutés à chaque « Voir plus ».
const PAGE_TAILLE = 8;

let M = {
  produits: null, // tableau de produits, ou null tant que le chargement n'a pas réussi
  categorieSlug: "", // catégorie choisie, "" pour tous les produits
  affiches: PAGE_TAILLE, // nombre de produits affichés
  message: null, // { type, texte }, ou null
};

/**
 * Les produits de la catégorie choisie.
 * > le tableau des produits filtrés (tous si aucune catégorie n'est choisie)
 */
M.produitsFiltres = function () {
  if (M.categorieSlug === "") return M.produits;

  return M.produits.filter((produit) => produit.categorieSlug === M.categorieSlug);
};

/**
 * Les produits actuellement visibles : le début de la liste filtrée.
 * > un tableau de produits, enrichis de leur statut de stock
 */
M.produitsVisibles = function () {
  return M.produitsFiltres()
    .slice(0, M.affiches)
    .map((produit) => ({ ...produit, statutStock: statutStock(produit.stock) }));
};

/**
 * Reste-t-il des produits à afficher ?
 * > true si la liste filtrée dépasse le nombre de produits affichés
 */
M.resteAAfficher = function () {
  return M.produitsFiltres().length > M.affiches;
};

/**
 * Les filtres : « Tous les produits » puis une entrée par catégorie, chacune
 * avec son nombre de produits.
 * > un tableau de { slug, libelle, selectionne }
 */
M.filtres = function () {
  let categories = M.produits
    .map((produit) => ({ slug: produit.categorieSlug, libelle: produit.categorie }))
    .filter((categorie, rang, toutes) => toutes.findIndex((autre) => autre.slug === categorie.slug) === rang);

  let entrees = [{ slug: "", libelle: "Tous les produits", total: M.produits.length }].concat(
    categories.map((categorie) => ({
      ...categorie,
      total: M.produits.filter((produit) => produit.categorieSlug === categorie.slug).length,
    }))
  );

  return entrees.map((entree) => ({
    slug: entree.slug,
    libelle: `${entree.libelle} (${entree.total})`,
    selectionne: entree.slug === M.categorieSlug,
  }));
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

/**
 * Clic sur un filtre : change de catégorie et repart des premiers produits.
 * . slug : le slug de la catégorie, "" pour tous les produits
 */
C.handler_selectCategorie = function (slug) {
  M.categorieSlug = slug;
  M.affiches = PAGE_TAILLE;
  V.rafraichir(`button[data-categorie="${CSS.escape(slug)}"]`);
};

/**
 * Clic sur « Voir plus de produits » : affiche une page de produits de plus.
 */
C.handler_voirPlus = function () {
  M.affiches += PAGE_TAILLE;
  V.rafraichir('button[data-action="voir-plus"]');
};

/**
 * Clic sur « Ajouter au panier » d'une carte. Le panier est l'objet de la US
 * CMD-b : en attendant, la page l'indique à l'utilisateur.
 */
C.handler_addToCart = function () {
  M.message = { type: "erreur", texte: "Le panier n'est pas encore disponible." };
  V.rafraichir();
};

/**
 * Clic sur « Découvrir nos glaces » : fait défiler jusqu'au catalogue.
 */
C.handler_decouvrir = function () {
  V.defilerVersCatalogue();
};

C.init = async function () {
  await C.charger();
  return V.init();
};

let V = {};

V.racine = null; // élément racine de la page affichée

V.init = function () {
  let fragment = V.createPageFragment();
  V.racine = fragment.firstElementChild;
  return fragment;
};

// Toute la page se reconstruit à partir du modèle, comme la fiche produit. Le
// bouton cliqué n'existe plus après la reconstruction : on rend le focus à son
// équivalent, pour que la navigation au clavier ne reparte pas du début.
V.rafraichir = function (selecteurFocus) {
  let fragment = V.createPageFragment();
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  if (selecteurFocus !== undefined) {
    document.querySelector(selecteurFocus)?.focus();
  }
};

V.defilerVersCatalogue = function () {
  document.getElementById("catalogue")?.scrollIntoView({ behavior: "smooth" });
};

V.createPageFragment = function () {
  let pageFragment = htmlToFragment(template);

  pageFragment
    .querySelector('slot[name="bandeau"]')
    .replaceWith(BandeauView.dom(import.meta.env.BASE_URL + "images/bandeau-accueil.png", C.handler_decouvrir));

  pageFragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(M.message));

  if (M.produits === null) {
    pageFragment.querySelector('slot[name="filtres"]').remove();
    pageFragment.querySelector('slot[name="grille"]').remove();
    pageFragment.querySelector('slot[name="voir-plus"]').remove();
    return pageFragment;
  }

  pageFragment
    .querySelector('slot[name="filtres"]')
    .replaceWith(FiltresCategoriesView.dom(M.filtres(), C.handler_selectCategorie));

  pageFragment
    .querySelector('slot[name="grille"]')
    .replaceWith(GrilleProduitsView.dom(M.produitsVisibles(), C.handler_addToCart));

  let slotVoirPlus = pageFragment.querySelector('slot[name="voir-plus"]');

  if (M.resteAAfficher()) {
    let voirPlus = htmlToFragment(templateVoirPlus);
    voirPlus.firstElementChild.addEventListener("click", C.handler_voirPlus);
    slotVoirPlus.replaceWith(voirPlus);
  } else {
    slotVoirPlus.remove();
  }

  return pageFragment;
};

export function ProduitsPage() {
  return C.init();
}
