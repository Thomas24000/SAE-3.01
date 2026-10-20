import { AuthData } from "../../data/auth.js";
import { PanierData } from "../../data/panier.js";
import { ProduitData } from "../../data/produit.js";
import { goTo } from "../../lib/navigation.js";
import { ajusterLignes, texteAjustements } from "../../lib/stock.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { HeaderView } from "../../ui/header/index.js";
import { LignePanierView } from "../../ui/ligne-panier/index.js";
import { MessageView } from "../../ui/message/index.js";
import { ResumeCommandeView } from "../../ui/resume-commande/index.js";
import template from "./template.html?raw";
import templateContenu from "./contenu.html?raw";
import templateVide from "./vide.html?raw";

/**
 * Page « Panier » (US CMD-b), à l'adresse /panier.
 *
 * M : les lignes du panier (variante et quantité, stockées dans le navigateur)
 * et les variantes relues auprès de l'API, d'où viennent noms, formats et prix.
 * V : le gabarit, les lignes et le résumé. C : charge, réagit aux clics.
 */

let M = {
  lignes: [], // [{ variantId, quantite }] : le panier du navigateur
  variantes: [], // les variantes de ces lignes, telles que l'API les renvoie
  session: null, // { connecte, email?, role? } renvoyé par le serveur, ou null
  echec: false, // true si l'API n'a pas pu répondre
  message: null, // { type, texte }, ou null
};

/**
 * La variante de l'API qui porte cet identifiant.
 * . variantId : l'identifiant de la variante
 * > la variante, ou undefined si le serveur ne la connaît plus
 */
M.findVariante = function (variantId) {
  return M.variantes.find((variante) => variante.variantId === variantId);
};

/**
 * Remet le panier d'accord avec le serveur : retire les lignes dont la variante
 * n'existe plus, puis ramène les quantités au stock (US STK-c) en retirant les
 * variantes épuisées.
 * > { retirees, ajustements } : le nombre de lignes disparues du serveur et les
 *   lignes de stock modifiées (voir ajusterLignes)
 */
M.reconcile = function () {
  let retirees = 0;

  for (let i = 0; i < M.lignes.length; i++) {
    if (M.findVariante(M.lignes[i].variantId) === undefined) {
      PanierData.remove(M.lignes[i].variantId);
      retirees++;
    }
  }

  let ajuste = ajusterLignes(PanierData.read(), M.variantes);
  PanierData.write(ajuste.lignes);

  M.lignes = PanierData.read();
  return { retirees: retirees, ajustements: ajuste.ajustements };
};

/**
 * Nombre d'articles du panier, quantités comprises.
 * > la somme des quantités
 */
M.count = function () {
  return M.lignes.reduce((total, ligne) => total + ligne.quantite, 0);
};

/**
 * Les lignes prêtes à afficher.
 * > un tableau de { variantId, nom, slug, libelle, image, teinte, quantite,
 *   totalCents, moinsPossible, plusPossible }
 */
M.articles = function () {
  return M.lignes.map((ligne) => {
    let variante = M.findVariante(ligne.variantId);

    return {
      variantId: ligne.variantId,
      nom: variante.produit.nom,
      slug: variante.produit.slug,
      libelle: variante.libelle,
      image: variante.produit.image,
      teinte: variante.produit.teinte,
      quantite: ligne.quantite,
      totalCents: variante.prixCents * ligne.quantite,
      moinsPossible: ligne.quantite > 1,
      plusPossible: ligne.quantite < variante.stock,
    };
  });
};

/**
 * Les montants du résumé. Le retrait en magasin est gratuit : le total est le
 * sous-total.
 * > { sousTotalCents, totalCents }
 */
M.summary = function () {
  let sousTotalCents = M.articles().reduce((total, article) => total + article.totalCents, 0);

  return { sousTotalCents: sousTotalCents, totalCents: sousTotalCents };
};

/**
 * Change la quantité d'une ligne : 1 au minimum, le stock de la variante au maximum.
 * . variantId : l'identifiant de la variante
 * . delta : -1 ou 1
 */
M.changeQuantity = function (variantId, delta) {
  let ligne = M.lignes.find((autre) => autre.variantId === variantId);
  if (ligne === undefined) return;

  let stock = M.findVariante(variantId).stock;

  PanierData.setQuantity(variantId, Math.min(Math.max(ligne.quantite + delta, 1), stock));
  M.lignes = PanierData.read();
};

/**
 * Retire une ligne du panier.
 * . variantId : l'identifiant de la variante
 */
M.remove = function (variantId) {
  PanierData.remove(variantId);
  M.lignes = PanierData.read();
};

/**
 * Le visiteur est-il connecté d'après le serveur ?
 * > true si une session est ouverte
 */
M.isConnected = function () {
  return M.session !== null && M.session.connecte === true;
};

let C = {};

/**
 * Lit le panier, relit les variantes auprès de l'API puis remet le panier
 * d'accord avec elles.
 */
C.charger = async function () {
  M.message = null;
  M.echec = false;
  M.variantes = [];
  M.lignes = PanierData.read();

  if (M.lignes.length === 0) return;

  try {
    let reponse = await ProduitData.fetchVariantes(M.lignes.map((ligne) => ligne.variantId));
    M.variantes = reponse.variantes;

    let reconciliation = M.reconcile();
    let texte = texteAjustements(reconciliation.ajustements, reconciliation.retirees);
    if (texte !== null) {
      M.message = { type: "erreur", texte: texte };
    }
  } catch (erreur) {
    M.echec = true;
    M.message = { type: "erreur", texte: `Impossible de charger ton panier : ${erreur.message}` };
  }
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { message, echec, count, articles, resume }
 */
C.viewData = function () {
  return {
    message: M.message,
    echec: M.echec,
    count: M.count(),
    articles: M.echec ? [] : M.articles(),
    resume: M.summary(),
  };
};

/**
 * Clic sur « − » ou « + » : change la quantité de la ligne et reconstruit la page.
 * . variantId : l'identifiant de la variante
 * . delta : -1 ou 1
 */
C.handler_changeQuantity = function (variantId, delta) {
  M.changeQuantity(variantId, delta);
  M.message = null;
  V.refresh(C.viewData(), `button[data-variante-id="${variantId}"][data-quantite-delta]:not(:disabled)`);
};

/**
 * Clic sur « Supprimer » : retire la ligne. Le bouton disparaît avec elle : le
 * focus passe au titre de la page.
 * . variantId : l'identifiant de la variante
 */
C.handler_remove = function (variantId) {
  M.remove(variantId);
  M.message = null;
  V.refresh(C.viewData(), "h1[data-titre]");
};

/**
 * Clic sur « Valider ma commande ». Le serveur dit si le visiteur est connecté :
 * sinon on l'envoie à la connexion, avec retour au récapitulatif de commande
 * (US CMD-a) ; sinon on y va directement.
 */
C.handler_validate = async function () {
  try {
    M.session = await AuthData.me();
  } catch (erreur) {
    M.message = { type: "erreur", texte: `Impossible de vérifier ta connexion : ${erreur.message}` };
    V.refresh(C.viewData(), "h1[data-titre]");
    return;
  }

  if (!M.isConnected()) {
    goTo("/connexion?retour=" + encodeURIComponent("/commande"));
    return;
  }

  goTo("/commande");
};

C.init = async function () {
  await C.charger();
  return V.init(C.viewData());
};

let V = {};

V.racine = null; // élément racine de la page affichée

V.init = function (data) {
  let fragment = V.createPageFragment(data);
  V.racine = fragment.firstElementChild;
  return fragment;
};

// Toute la page se reconstruit à partir des données reçues de C. Le compteur du
// header est hors de la page : on le met à jour sans le reconstruire.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  HeaderView.updateCount(data.count);
  document.querySelector(focusSelector)?.focus();
};

V.titre = function (count) {
  if (count === 0) return "Mon panier";
  return `Mon panier (${count} ${count === 1 ? "article" : "articles"})`;
};

V.createPageFragment = function (data) {
  let pageFragment = htmlToFragment(genericRenderer(template, { titre: V.titre(data.count) }));

  pageFragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

  let slotContenu = pageFragment.querySelector('slot[name="contenu"]');

  if (data.echec) {
    slotContenu.remove();
  } else if (data.articles.length === 0) {
    slotContenu.replaceWith(htmlToFragment(templateVide));
  } else {
    let contenu = htmlToFragment(templateContenu);

    let lignes = data.articles.map((article) =>
      LignePanierView.dom(article, {
        surQuantite: C.handler_changeQuantity,
        surSuppression: C.handler_remove,
      })
    );
    contenu.querySelector('slot[name="lignes"]').replaceWith(...lignes);
    contenu
      .querySelector('slot[name="resume"]')
      .replaceWith(ResumeCommandeView.dom(data.resume, { surValidation: C.handler_validate }));

    slotContenu.replaceWith(contenu);
  }

  return pageFragment;
};

export function PanierPage() {
  return C.init();
}
