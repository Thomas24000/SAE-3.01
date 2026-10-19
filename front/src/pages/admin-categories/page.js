import { AdminData } from "../../data/admin.js";
import { CategorieData } from "../../data/categories.js";
import { goTo, readQuery } from "../../lib/navigation.js";
import { htmlToFragment } from "../../lib/utils.js";
import { BandeauInfoView } from "../../ui/bandeau-info/index.js";
import { BarreAdminView } from "../../ui/barre-admin/index.js";
import { EnTetePageView } from "../../ui/en-tete-page/index.js";
import { ListeCategoriesView } from "../../ui/liste-categories/index.js";
import { MessageView } from "../../ui/message/index.js";
import { ModaleSuppressionView } from "../../ui/modale-suppression/index.js";
import template from "./template.html?raw";

/**
 * Page « Catégories » du back-office (US GOF-c), à l'adresse /admin/categories.
 *
 * Liste les catégories, et supprime après confirmation : une catégorie qui
 * contient des produits n'est supprimée qu'en réaffectant ses produits vers
 * une autre catégorie. La création et la modification ont leur propre page.
 *
 * M : catégories, suppression en cours, message. V : les gabarits.
 * C : charge, ouvre et ferme la modale, envoie la suppression.
 */

// Messages de réussite, désignés par ?ok=... dans l'adresse (jamais de texte libre).
const SUCCES = {
  creee: "La catégorie a été créée.",
  modifiee: "La catégorie a été modifiée.",
};

let M = {
  categories: [], // [{ id, libelle, slug, description, nombreProduits }]
  totalProduits: 0,
  suppression: null, // { id, libelle, nombreProduits, cible, enCours, message } ou null
  message: null, // { type, texte }, ou null
};

/**
 * La catégorie qui porte cet identifiant.
 * . id : l'identifiant cherché
 * > la catégorie, ou undefined si elle n'existe pas
 */
M.find = function (id) {
  return M.categories.find((categorie) => categorie.id === id);
};

/**
 * Les catégories où l'on peut réaffecter les produits de celle qu'on supprime.
 * > [{ id, libelle }] : toutes sauf la catégorie en cours de suppression
 */
M.targets = function () {
  return M.categories
    .filter((categorie) => categorie.id !== M.suppression.id)
    .map((categorie) => ({ id: categorie.id, libelle: categorie.libelle }));
};

/**
 * Le sous-titre de la page : nombre de catégories et de produits.
 * > un texte, par exemple « 3 catégories · 12 produits »
 */
M.subtitle = function () {
  let n = M.categories.length;
  let p = M.totalProduits;
  return `${n} ${n > 1 ? "catégories" : "catégorie"} · ${p} ${p > 1 ? "produits" : "produit"}`;
};

/**
 * Message de succès annoncé par l'adresse (?ok=creee).
 * . code : la valeur du paramètre
 * > { type: "succes", texte }, ou null si le code est inconnu
 */
M.flash = function (code) {
  if (code === null || !(code in SUCCES)) return null;
  return { type: "succes", texte: SUCCES[code] };
};

let C = {};

/**
 * Charge la session puis les catégories. Sans session admin, retour à la connexion.
 * > true si la page peut s'afficher, false si on a redirigé
 */
C.charger = async function () {
  try {
    let session = await AdminData.me();
    if (!session.connecte) {
      goTo("/admin");
      return false;
    }
    let reponse = await CategorieData.fetchAll();
    M.categories = reponse.categories;
    M.totalProduits = reponse.totalProduits;
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return false;
    }
    M.categories = [];
    M.totalProduits = 0;
    M.message = { type: "erreur", texte: erreur.message };
  }
  return true;
};

/**
 * Clic sur « Supprimer » : ouvre la modale de confirmation.
 * . id : la catégorie à supprimer
 */
C.handler_askDelete = function (id) {
  let categorie = M.find(id);
  if (categorie === undefined) return;

  M.message = null;
  M.suppression = {
    id: categorie.id,
    libelle: categorie.libelle,
    nombreProduits: categorie.nombreProduits,
    cible: "",
    enCours: false,
    message: null,
  };
  V.refresh(C.viewData(), null);
};

/**
 * Choix de la catégorie cible dans la modale : on le garde pour les réaffichages.
 * . valeur : l'id choisi, en texte ("" si aucun)
 */
C.handler_chooseTarget = function (valeur) {
  if (M.suppression !== null) M.suppression.cible = valeur;
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
 * Confirmation : envoie la suppression au serveur, qui revérifie la règle.
 * . valeur : l'id de la catégorie cible choisie ("" pour une catégorie vide)
 */
C.handler_confirmDelete = async function (valeur) {
  let suppression = M.suppression;
  if (suppression === null) return;

  suppression.cible = valeur;
  suppression.message = null;

  if (suppression.nombreProduits > 0 && valeur === "") {
    suppression.message = { type: "erreur", texte: "Choisissez la catégorie qui accueillera les produits." };
    V.refresh(C.viewData(), null);
    return;
  }

  suppression.enCours = true;
  V.refresh(C.viewData(), null);

  try {
    let reponse = await CategorieData.remove(suppression.id, valeur === "" ? null : Number(valeur));
    let reaffectes = reponse.reaffectes;
    M.suppression = null;
    await C.charger();
    M.message = {
      type: "succes",
      texte:
        reaffectes > 0
          ? `La catégorie « ${suppression.libelle} » a été supprimée, ${reaffectes} ${reaffectes > 1 ? "produits ont été réaffectés" : "produit a été réaffecté"}.`
          : `La catégorie « ${suppression.libelle} » a été supprimée.`,
    };
    V.refresh(C.viewData(), "h1[data-titre]");
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    suppression.enCours = false;
    suppression.message = { type: "erreur", texte: erreur.message };
    // Catégorie déjà supprimée ailleurs : on referme et on relit la liste.
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
 * > { email, sousTitre, categories, message, suppression }
 */
C.viewData = function () {
  return {
    email: AdminData.knownEmail ?? "",
    sousTitre: M.subtitle(),
    categories: M.categories,
    message: M.message,
    suppression:
      M.suppression === null
        ? null
        : {
            nom: M.suppression.libelle,
            nombreProduits: M.suppression.nombreProduits,
            cibles: M.targets(),
            cible: M.suppression.cible,
            enCours: M.suppression.enCours,
            message: M.suppression.message,
          },
  };
};

C.init = async function () {
  M.message = M.flash(readQuery("ok"));
  M.suppression = null;

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
// rouverte (showModal) : le navigateur replace alors le focus dedans.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  let dialog = nouvelleRacine.querySelector("dialog");
  if (dialog !== null) {
    dialog.showModal();
  } else if (focusSelector !== null) {
    document.querySelector(focusSelector)?.focus();
  }
};

V.createPageFragment = function (data) {
  let page = htmlToFragment(template);

  page.querySelector('slot[name="barre"]').replaceWith(
    BarreAdminView.dom({ section: "Catégories", email: data.email })
  );
  page.querySelector('slot[name="entete"]').replaceWith(
    EnTetePageView.dom({
      titre: "Catégories",
      sousTitre: data.sousTitre,
      action: { libelle: "Nouvelle catégorie", href: "/admin/categories/nouvelle" },
    })
  );
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));
  page.querySelector('slot[name="bandeau"]').replaceWith(
    BandeauInfoView.dom({
      texte:
        "Une catégorie qui contient des produits ne peut être supprimée qu'après réaffectation de ses produits vers une autre catégorie.",
    })
  );
  page.querySelector('slot[name="liste"]').replaceWith(
    ListeCategoriesView.dom(data.categories, { surSuppression: C.handler_askDelete })
  );

  let slotModale = page.querySelector('slot[name="modale"]');
  if (data.suppression === null) {
    slotModale.remove();
  } else {
    slotModale.replaceWith(
      ModaleSuppressionView.dom(data.suppression, {
        surConfirmation: C.handler_confirmDelete,
        surChoixCible: C.handler_chooseTarget,
        surAnnulation: C.handler_cancelDelete,
      })
    );
  }

  return page;
};

export function AdminCategoriesPage() {
  return C.init();
}
