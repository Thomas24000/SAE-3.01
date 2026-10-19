import { AdminData } from "../../data/admin.js";
import { ProduitAdminData } from "../../data/produit-admin.js";
import { goTo, readQuery } from "../../lib/navigation.js";
import { statutStock } from "../../lib/stock.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { BarreAdminView } from "../../ui/barre-admin/index.js";
import { EnTetePageView } from "../../ui/en-tete-page/index.js";
import { FiltresProduitsView } from "../../ui/filtres-produits/index.js";
import { ListeProduitsView } from "../../ui/liste-produits/index.js";
import { MessageView } from "../../ui/message/index.js";
import { ModaleConfirmationView } from "../../ui/modale-confirmation/index.js";
import { PaginationView } from "../../ui/pagination/index.js";
import template from "./template.html?raw";

/**
 * Page « Produits » du back-office (US GOF-a), à l'adresse /admin/produits.
 *
 * Liste les produits avec recherche, filtres (catégorie, stock) et pagination,
 * et supprime après confirmation. La création et la modification ont leur
 * propre page. Les filtres s'appliquent dans le navigateur, sur la liste complète.
 *
 * M : produits, filtres, page, suppression en cours, message. V : les gabarits.
 * C : charge, filtre, pagine, ouvre et ferme la modale, envoie la suppression.
 */

const PAR_PAGE = 6;

// Messages de réussite, désignés par ?ok=... dans l'adresse (jamais de texte libre).
const SUCCES = {
  cree: "Le produit a été ajouté au catalogue.",
  modifie: "Le produit a été modifié.",
  supprime: "Le produit a été supprimé.",
};

let M = {
  produits: [], // voir ProduitAdminData.fetchAll
  categories: [], // [{ id, libelle }]
  seuil: 5, // seuil « Bientôt épuisé »
  filtres: { recherche: "", categorieId: "", stock: "" },
  page: 1,
  suppression: null, // { id, nom, enCours, message } ou null
  message: null, // { type, texte }, ou null
};

/**
 * Le statut de stock d'un produit d'après le seuil.
 * . produit : un produit de la liste
 * > "disponible", "bientot" ou "epuise"
 */
M.statut = function (produit) {
  return statutStock(produit.stock, M.seuil);
};

/**
 * Les produits qui passent les filtres (nom, catégorie, stock).
 * > [produit]
 */
M.filtered = function () {
  let recherche = M.filtres.recherche.trim().toLowerCase();

  return M.produits.filter(
    (produit) =>
      produit.nom.toLowerCase().includes(recherche) &&
      (M.filtres.categorieId === "" || String(produit.categorieId) === M.filtres.categorieId) &&
      (M.filtres.stock === "" || M.statut(produit) === M.filtres.stock)
  );
};

/**
 * Le nombre de pages de la liste filtrée (au moins une).
 * > un entier >= 1
 */
M.pageCount = function () {
  return Math.max(1, Math.ceil(M.filtered().length / PAR_PAGE));
};

/**
 * Les produits de la page courante, avec leur statut.
 * > [{ ...produit, statut }]
 */
M.pageItems = function () {
  let debut = (M.page - 1) * PAR_PAGE;
  return M.filtered()
    .slice(debut, debut + PAR_PAGE)
    .map((produit) => ({ ...produit, statut: M.statut(produit) }));
};

/**
 * Le produit qui porte cet identifiant.
 * . id : l'identifiant cherché
 * > le produit, ou undefined
 */
M.find = function (id) {
  return M.produits.find((produit) => produit.id === id);
};

/**
 * Message de succès annoncé par l'adresse (?ok=cree).
 * . code : la valeur du paramètre
 * > { type: "succes", texte }, ou null si le code est inconnu
 */
M.flash = function (code) {
  if (code === null || !(code in SUCCES)) return null;
  return { type: "succes", texte: SUCCES[code] };
};

let C = {};

/**
 * Charge la session puis les produits. Sans session admin, retour à la connexion.
 * > true si la page peut s'afficher, false si on a redirigé
 */
C.charger = async function () {
  try {
    let session = await AdminData.me();
    if (!session.connecte) {
      goTo("/admin");
      return false;
    }
    let reponse = await ProduitAdminData.fetchAll();
    M.produits = reponse.produits;
    M.categories = reponse.categories;
    M.seuil = reponse.seuilBientotEpuise;
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return false;
    }
    M.produits = [];
    M.message = { type: "erreur", texte: erreur.message };
  }
  return true;
};

/**
 * Changement de la recherche ou d'un filtre : on revient à la première page.
 * . filtres : { recherche, categorieId, stock } saisis
 */
C.handler_filter = function (filtres) {
  M.filtres = filtres;
  M.page = 1;
  V.refresh(C.viewData(), 'input[name="recherche"]');
};

/**
 * Clic sur un numéro de page ou une flèche.
 * . page : le numéro demandé
 */
C.handler_page = function (page) {
  M.page = Math.min(Math.max(1, page), M.pageCount());
  V.refresh(C.viewData(), "h1[data-titre]");
};

/**
 * Clic sur « Supprimer » : ouvre la modale de confirmation.
 * . id : le produit à supprimer
 */
C.handler_askDelete = function (id) {
  let produit = M.find(id);
  if (produit === undefined) return;

  M.message = null;
  M.suppression = { id: produit.id, nom: produit.nom, enCours: false, message: null };
  V.refresh(C.viewData(), null);
};

/**
 * Fermeture de la modale (Annuler ou Échap).
 */
C.handler_cancelDelete = function () {
  if (M.suppression === null) return;
  M.suppression = null;
  V.refresh(C.viewData(), "h1[data-titre]");
};

/**
 * Confirmation : envoie la suppression au serveur.
 */
C.handler_confirmDelete = async function () {
  let suppression = M.suppression;
  if (suppression === null) return;

  suppression.enCours = true;
  suppression.message = null;
  V.refresh(C.viewData(), null);

  try {
    await ProduitAdminData.remove(suppression.id);
    M.suppression = null;
    await C.charger();
    M.page = Math.min(M.page, M.pageCount());
    M.message = { type: "succes", texte: `Le produit « ${suppression.nom} » a été supprimé.` };
    V.refresh(C.viewData(), "h1[data-titre]");
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    suppression.enCours = false;
    suppression.message = { type: "erreur", texte: erreur.message };
    // Produit déjà supprimé ailleurs : on referme et on relit la liste.
    if (erreur.statut === 404) {
      M.suppression = null;
      await C.charger();
      M.message = suppression.message;
    }
    V.refresh(C.viewData(), null);
  }
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { email, sousTitre, resume, filtres, categories, produits, page, pages, message, suppression }
 */
C.viewData = function () {
  let filtres = M.filtered();
  let affiches = M.pageItems();

  return {
    email: AdminData.knownEmail ?? "",
    sousTitre: `${M.produits.length} ${M.produits.length > 1 ? "produits" : "produit"} au catalogue`,
    resume: `${affiches.length} ${affiches.length > 1 ? "produits affichés" : "produit affiché"} sur ${filtres.length}`,
    filtres: M.filtres,
    categories: M.categories,
    produits: affiches,
    page: M.page,
    pages: M.pageCount(),
    message: M.message,
    suppression: M.suppression,
  };
};

C.init = async function () {
  M.message = M.flash(readQuery("ok"));
  M.suppression = null;
  M.filtres = { recherche: "", categorieId: "", stock: "" };
  M.page = 1;

  if (!(await C.charger())) return document.createDocumentFragment();
  return V.init(C.viewData());
};

let V = {};

V.racine = null; // élément racine de la page affichée

V.init = function (data) {
  let fragment = V.createPageFragment(data);
  V.racine = fragment.firstElementChild;
  return fragment;
};

// Toute la page se reconstruit à partir du modèle. Une modale ouverte est
// rouverte (showModal) ; sinon le focus retourne à l'élément demandé, le
// curseur à la fin du texte pour le champ de recherche.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  let dialog = nouvelleRacine.querySelector("dialog");
  if (dialog !== null) {
    dialog.showModal();
    return;
  }

  let element = focusSelector === null ? null : document.querySelector(focusSelector);
  if (element === null) return;
  element.focus();
  if (element.setSelectionRange) element.setSelectionRange(element.value.length, element.value.length);
};

V.createPageFragment = function (data) {
  let page = htmlToFragment(genericRenderer(template, { resume: data.resume }));

  page.querySelector('slot[name="barre"]').replaceWith(
    BarreAdminView.dom({ section: "Produits", email: data.email })
  );
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));
  page.querySelector('slot[name="entete"]').replaceWith(
    EnTetePageView.dom({
      titre: "Produits",
      sousTitre: data.sousTitre,
      action: { libelle: "Ajouter un produit", href: "/admin/produits/nouveau" },
    })
  );
  page.querySelector('slot[name="filtres"]').replaceWith(
    FiltresProduitsView.dom(
      { ...data.filtres, categories: data.categories },
      { surChangement: C.handler_filter }
    )
  );
  page.querySelector('slot[name="liste"]').replaceWith(
    ListeProduitsView.dom(data.produits, { surSuppression: C.handler_askDelete })
  );

  let slotPagination = page.querySelector('slot[name="pagination"]');
  if (data.pages <= 1) {
    slotPagination.remove();
  } else {
    slotPagination.replaceWith(PaginationView.dom({ page: data.page, pages: data.pages }, { surPage: C.handler_page }));
  }

  let slotModale = page.querySelector('slot[name="modale"]');
  if (data.suppression === null) {
    slotModale.remove();
  } else {
    slotModale.replaceWith(
      ModaleConfirmationView.dom(
        {
          titre: `Supprimer le produit « ${data.suppression.nom} » ?`,
          texte: "Le produit, ses formats et ses images seront supprimés définitivement. Les commandes déjà passées restent consultables.",
          bouton: "Supprimer",
          enCours: data.suppression.enCours,
          message: data.suppression.message,
        },
        { surConfirmation: C.handler_confirmDelete, surAnnulation: C.handler_cancelDelete }
      )
    );
  }

  return page;
};

export function AdminProduitsPage() {
  return C.init();
}
