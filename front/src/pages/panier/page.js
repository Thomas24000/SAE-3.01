import { AuthData } from "../../data/auth.js";
import { PanierData } from "../../data/panier.js";
import { ProduitData } from "../../data/produit.js";
import { goTo } from "../../lib/navigation.js";
import {
  choixDeLigne,
  choixDepuisIds,
  choixIds,
  groupePorteurId,
  groupesAvecDisponibilite,
  groupesAvecEtat,
  hasMissing,
  ligneInvalide,
  toggleChoix,
  varianteDe,
} from "../../lib/options.js";
import { enPromotion, prixEffectif } from "../../lib/promotion.js";
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
 * M : les lignes du panier (variante, options et quantité, stockées dans le
 * navigateur), les variantes et les groupes d'options relus auprès de l'API, d'où
 * viennent noms, formats, options et prix, et la ligne en cours de modification.
 * V : le gabarit, les lignes et le résumé. C : charge, réagit aux clics.
 */

let M = {
  lignes: [], // [{ variantId, quantite, options }] : le panier du navigateur
  variantes: [], // les variantes de ces lignes, telles que l'API les renvoie
  groupes: {}, // les groupes d'options des produits du panier : { [idProduit]: [groupe] }
  combinaisons: {}, // toutes les variantes (format + service) de ces produits : { [idProduit]: [variante] }
  edition: null, // ligne dont on modifie les options : { variantId, options, choix }, ou null
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
 * Les groupes d'options du produit d'une variante.
 * . variante : la variante renvoyée par l'API
 * > un tableau de groupes (vide si le produit n'a pas d'option)
 */
M.produitGroupes = function (variante) {
  return M.groupes[variante.produit.id] ?? [];
};

/**
 * Les variantes (combinaisons format + service) du produit d'une variante.
 * . variante : la variante renvoyée par l'API
 * > un tableau de { variantId, libelle, choixId, prixCents, stock }
 */
M.produitCombinaisons = function (variante) {
  return M.combinaisons[variante.produit.id] ?? [];
};

/**
 * Les options d'une ligne que le serveur reconnaît pour ce produit : un choix
 * inconnu ou rattaché à un autre produit (localStorage modifié, option retirée
 * du catalogue) est ignoré.
 * . ligne : la ligne du panier
 * > un tableau de { id, libelle, supplementCents }
 */
M.lineChoix = function (ligne) {
  let variante = M.findVariante(ligne.variantId);

  return choixDeLigne(ligne.options, variante.produit.id, M.produitGroupes(variante));
};

/**
 * Une ligne ne pourrait-elle pas être commandée (option disparue, groupe
 * obligatoire sans choix) ?
 * . ligne : la ligne du panier
 * > true si elle doit être retirée du panier
 */
M.lineInvalid = function (ligne) {
  let variante = M.findVariante(ligne.variantId);

  return ligneInvalide(ligne.options, variante.produit.id, M.produitGroupes(variante), variante.choixId);
};

/**
 * Une ligne est-elle en cours de modification de ses options ?
 * . ligne : la ligne du panier
 * > true si c'est la ligne ouverte dans le sélecteur
 */
M.isEditing = function (ligne) {
  return (
    M.edition !== null &&
    M.edition.variantId === ligne.variantId &&
    M.edition.options.join(",") === ligne.options.join(",")
  );
};

/**
 * Quantité d'une variante dans tout le panier, toutes options confondues : les
 * lignes d'une même variante se partagent son stock.
 * . variantId : l'identifiant de la variante
 * > la somme des quantités
 */
M.variantQuantity = function (variantId) {
  return M.lignes
    .filter((ligne) => ligne.variantId === variantId)
    .reduce((total, ligne) => total + ligne.quantite, 0);
};

/**
 * Remet le panier d'accord avec le serveur : retire les lignes dont la variante
 * ou dont une option n'existe plus, puis ramène les quantités au stock
 * (US STK-c) en retirant les variantes épuisées.
 * > { retirees, ajustements } : le nombre de lignes disparues du serveur et les
 *   lignes de stock modifiées (voir ajusterLignes)
 */
M.reconcile = function () {
  let retirees = 0;

  for (let i = 0; i < M.lignes.length; i++) {
    if (M.findVariante(M.lignes[i].variantId) === undefined) {
      PanierData.remove(M.lignes[i].variantId);
      retirees++;
    } else if (M.lineInvalid(M.lignes[i])) {
      // Une option n'existe plus ou manque : le serveur refuserait la commande.
      PanierData.remove(M.lignes[i].variantId, M.lignes[i].options);
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
 * > un tableau de { variantId, options (choix reconnus), cle (identifiant des
 *   options de la ligne), nom, slug, libelle, image, teinte, quantite,
 *   totalCents (supplément des options compris), moinsPossible, plusPossible,
 *   modifiable, edition (null, ou { groupes, manquants } si la ligne est ouverte) }
 */
M.articles = function () {
  return M.lignes.map((ligne) => {
    let variante = M.findVariante(ligne.variantId);
    let choix = M.lineChoix(ligne);
    let supplement = choix.reduce((total, autre) => total + autre.supplementCents, 0);

    return {
      variantId: ligne.variantId,
      options: choix,
      cle: ligne.options.join(","),
      nom: variante.produit.nom,
      slug: variante.produit.slug,
      libelle: variante.libelle,
      image: variante.produit.image,
      teinte: variante.produit.teinte,
      quantite: ligne.quantite,
      totalCents: (prixEffectif(variante) + supplement) * ligne.quantite,
      totalPleinCents: enPromotion(variante) ? (variante.prixCents + supplement) * ligne.quantite : null,
      moinsPossible: ligne.quantite > 1,
      plusPossible: M.variantQuantity(ligne.variantId) < variante.stock,
      modifiable: M.produitGroupes(variante).length > 0,
      edition: M.isEditing(ligne)
        ? {
            groupes: groupesAvecEtat(
              groupesAvecDisponibilite(
                M.produitGroupes(variante),
                groupePorteurId(M.produitGroupes(variante), M.produitCombinaisons(variante)),
                M.produitCombinaisons(variante),
                variante.libelle
              ),
              M.edition.choix
            ),
            manquants: hasMissing(M.produitGroupes(variante), M.edition.choix),
          }
        : null,
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
 * Change la quantité d'une ligne : 1 au minimum, au maximum ce que le stock de
 * la variante laisse aux autres lignes de cette variante.
 * . variantId : l'identifiant de la variante
 * . options : les identifiants d'options de la ligne
 * . delta : -1 ou 1
 */
M.changeQuantity = function (variantId, options, delta) {
  let cle = options.join(",");
  let ligne = M.lignes.find((autre) => autre.variantId === variantId && autre.options.join(",") === cle);
  if (ligne === undefined) return;

  let autres = M.variantQuantity(variantId) - ligne.quantite;
  let max = Math.max(1, M.findVariante(variantId).stock - autres);

  PanierData.setQuantity(variantId, Math.min(Math.max(ligne.quantite + delta, 1), max), options);
  M.lignes = PanierData.read();
};

/**
 * Retire une ligne du panier.
 * . variantId : l'identifiant de la variante
 * . options : les identifiants d'options de la ligne
 */
M.remove = function (variantId, options) {
  PanierData.remove(variantId, options);
  M.lignes = PanierData.read();
};

/**
 * Ouvre le sélecteur d'options d'une ligne, avec ses options actuelles cochées.
 * . variantId : l'identifiant de la variante
 * . options : les identifiants d'options de la ligne
 */
M.startEdition = function (variantId, options) {
  let ligne = M.lignes.find((autre) => autre.variantId === variantId && autre.options.join(",") === options.join(","));
  if (ligne === undefined) return;

  M.edition = {
    variantId: variantId,
    options: ligne.options,
    choix: choixDepuisIds(M.produitGroupes(M.findVariante(variantId)), ligne.options),
  };
};

/**
 * Coche ou décoche un choix dans la ligne en cours de modification.
 * . groupeId : l'identifiant du groupe
 * . choixId : l'identifiant du choix cliqué
 */
M.toggleEditionChoix = function (groupeId, choixId) {
  if (M.edition === null) return;

  M.edition.choix = toggleChoix(M.produitGroupes(M.findVariante(M.edition.variantId)), M.edition.choix, groupeId, choixId);
};

/**
 * La ligne en cours de modification peut-elle être enregistrée ? Un groupe
 * obligatoire doit avoir un choix.
 * > true si aucun groupe obligatoire n'est vide
 */
M.canSaveEdition = function () {
  return M.edition !== null && !hasMissing(M.produitGroupes(M.findVariante(M.edition.variantId)), M.edition.choix);
};

/**
 * La variante que la ligne ouverte aura une fois enregistrée : le même format,
 * avec le service coché (US OPT-b).
 * > la variante cible { variantId, stock, ... }, ou undefined si cette combinaison n'existe pas
 */
M.editionTarget = function () {
  let variante = M.findVariante(M.edition.variantId);
  let combinaisons = M.produitCombinaisons(variante);
  let porteurId = groupePorteurId(M.produitGroupes(variante), combinaisons);
  let choixId = porteurId === null ? null : (M.edition.choix[porteurId]?.[0] ?? null);

  return varianteDe(combinaisons, variante.libelle, choixId);
};

/**
 * Place manquante dans la combinaison cible : la ligne ouverte y serait déplacée
 * avec sa quantité, en plus de ce que le panier en contient déjà.
 * > le nombre d'unités encore disponibles dans la cible si elle ne peut pas
 *   accueillir la ligne, ou null si elle le peut
 */
M.editionShortage = function () {
  let cible = M.editionTarget();
  if (cible === undefined) return 0;
  if (cible.variantId === M.edition.variantId) return null;

  let ligne = M.lignes.find((autre) => M.isEditing(autre));
  let restant = Math.max(0, cible.stock - M.variantQuantity(cible.variantId));

  return ligne.quantite > restant ? restant : null;
};

/**
 * Enregistre les nouvelles options de la ligne ouverte, en changeant sa variante
 * si le service a changé (elle fusionne avec une autre ligne qui aurait déjà
 * cette variante et ces options) et referme le sélecteur.
 */
M.saveEdition = function () {
  PanierData.changeOptions(
    M.edition.variantId,
    M.edition.options,
    choixIds(M.edition.choix),
    M.editionTarget().variantId
  );
  M.lignes = PanierData.read();
  M.edition = null;
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
  M.groupes = {};
  M.combinaisons = {};
  M.edition = null;
  M.lignes = PanierData.read();

  if (M.lignes.length === 0) return;

  try {
    let reponse = await ProduitData.fetchVariantes([...new Set(M.lignes.map((ligne) => ligne.variantId))]);
    M.variantes = reponse.variantes;
    M.groupes = reponse.options ?? {};
    M.combinaisons = reponse.combinaisons ?? {};

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
 * . options : les identifiants d'options de la ligne
 * . delta : -1 ou 1
 */
C.handler_changeQuantity = function (variantId, options, delta) {
  M.changeQuantity(variantId, options, delta);
  M.message = null;
  V.refresh(
    C.viewData(),
    `button[data-variante-id="${variantId}"][data-options="${options.join(",")}"][data-quantite-delta]:not(:disabled)`
  );
};

/**
 * Clic sur « Supprimer » : retire la ligne. Le bouton disparaît avec elle : le
 * focus passe au titre de la page.
 * . variantId : l'identifiant de la variante
 * . options : les identifiants d'options de la ligne
 */
C.handler_remove = function (variantId, options) {
  M.remove(variantId, options);
  if (M.edition !== null && M.edition.variantId === variantId && M.edition.options.join(",") === options.join(",")) {
    M.edition = null;
  }
  M.message = null;
  V.refresh(C.viewData(), "h1[data-titre]");
};

/**
 * Clic sur « Modifier les options » : ouvre le sélecteur de la ligne (une seule
 * ligne à la fois) et met le focus sur ses options.
 * . variantId : l'identifiant de la variante
 * . options : les identifiants d'options de la ligne
 */
C.handler_editOptions = function (variantId, options) {
  M.startEdition(variantId, options);
  M.message = null;
  V.refresh(C.viewData(), "[data-edition] input");
};

/**
 * Choix d'une option dans la ligne ouverte : mémorise le choix et reconstruit la
 * page (le sélecteur rend lui-même le focus au choix cliqué).
 * . variantId : l'identifiant de la variante
 * . options : les identifiants d'options de la ligne
 * . groupeId : l'identifiant du groupe
 * . choixId : l'identifiant du choix coché ou décoché
 */
C.handler_pickOption = function (variantId, options, groupeId, choixId) {
  M.toggleEditionChoix(groupeId, choixId);
  M.message = null;
  V.refresh(C.viewData(), `[data-edition] input[data-choix-id="${choixId}"]`);
};

/**
 * Clic sur « Enregistrer » : applique les nouvelles options à la ligne. Rien
 * n'est enregistré si un groupe obligatoire est vide.
 */
C.handler_saveOptions = function () {
  if (!M.canSaveEdition()) {
    M.message = { type: "erreur", texte: "Choisis une option dans chaque groupe obligatoire." };
    V.refresh(C.viewData(), "[data-edition] input");
    return;
  }

  let manque = M.editionShortage();
  if (manque !== null) {
    M.message = {
      type: "erreur",
      texte:
        manque === 0
          ? "Cette combinaison est épuisée : choisis un autre service."
          : `Il ne reste que ${manque} article(s) pour cette combinaison : réduis la quantité avant de changer de service.`,
    };
    V.refresh(C.viewData(), "[data-edition] input");
    return;
  }

  let variantId = M.edition.variantId;
  M.saveEdition();
  M.message = { type: "succes", texte: "Les options ont été modifiées." };
  V.refresh(C.viewData(), `button[data-variante-id="${variantId}"][data-action="modifier"]`);
};

/**
 * Clic sur « Annuler » : referme le sélecteur sans rien changer.
 */
C.handler_cancelEdition = function () {
  let ouverte = M.edition;
  M.edition = null;
  M.message = null;
  V.refresh(
    C.viewData(),
    ouverte === null
      ? "h1[data-titre]"
      : `button[data-variante-id="${ouverte.variantId}"][data-options="${ouverte.options.join(",")}"][data-action="modifier"]`
  );
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
        surModification: C.handler_editOptions,
        surOption: C.handler_pickOption,
        surEnregistrement: C.handler_saveOptions,
        surAnnulation: C.handler_cancelEdition,
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
