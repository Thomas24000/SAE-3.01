import { AuthData } from "../../data/auth.js";
import { CommandeData } from "../../data/commande.js";
import { PanierData } from "../../data/panier.js";
import { ProduitData } from "../../data/produit.js";
import { goTo } from "../../lib/navigation.js";
import { choixDeLigne, ligneInvalide } from "../../lib/options.js";
import { ajusterLignes, texteAjustements } from "../../lib/stock.js";
import { htmlToFragment } from "../../lib/utils.js";
import { EncartValidationView } from "../../ui/encart-validation/index.js";
import { LigneCommandeView } from "../../ui/ligne-commande/index.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";
import templateContenu from "./contenu.html?raw";
import templateVide from "./vide.html?raw";

/**
 * Page « Récapitulatif de commande » (US CMD-a), à l'adresse /commande.
 *
 * M : les lignes du panier (options comprises), les variantes et groupes
 * d'options relus auprès de l'API (noms, prix et suppléments actuels), la
 * session et l'état d'envoi. V : le gabarit, les lignes et
 * l'encart de confirmation. C : contrôle la connexion, charge, valide la commande.
 */

let M = {
  lignes: [], // [{ variantId, quantite, options }] : le panier du navigateur
  variantes: [], // les variantes de ces lignes, telles que l'API les renvoie
  groupes: {}, // les groupes d'options des produits du panier : { [idProduit]: [groupe] }
  session: null, // { connecte, email?, role? } renvoyé par le serveur, ou null
  echec: false, // true si l'API n'a pas pu répondre
  envoiEnCours: false, // true entre le clic sur « Confirmer » et la réponse du serveur
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
 * Les options d'une ligne que le serveur reconnaît pour son produit.
 * . ligne : la ligne du panier
 * > un tableau de { id, libelle, supplementCents }
 */
M.lineChoix = function (ligne) {
  let variante = M.findVariante(ligne.variantId);

  return choixDeLigne(ligne.options, variante.produit.id, M.groupes[variante.produit.id] ?? []);
};

/**
 * Une ligne ne pourrait-elle pas être commandée (option disparue, groupe
 * obligatoire sans choix) ?
 * . ligne : la ligne du panier
 * > true si elle doit être retirée du panier
 */
M.lineInvalid = function (ligne) {
  let variante = M.findVariante(ligne.variantId);

  return ligneInvalide(ligne.options, variante.produit.id, M.groupes[variante.produit.id] ?? []);
};

/**
 * Remet le panier d'accord avec le serveur : retire les lignes dont la variante
 * ou une option n'existe plus, puis ramène les quantités au stock (US STK-c) en retirant les
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
 * Le visiteur est-il connecté d'après le serveur ?
 * > true si une session est ouverte
 */
M.isConnected = function () {
  return M.session !== null && M.session.connecte === true;
};

/**
 * Les lignes prêtes à afficher.
 * > un tableau de { nom, libelle, options, quantite, prixUnitaireCents (suppléments
 *   des options compris), totalCents }
 */
M.articles = function () {
  return M.lignes.map((ligne) => {
    let variante = M.findVariante(ligne.variantId);
    let choix = M.lineChoix(ligne);
    let unitaire = variante.prixCents + choix.reduce((total, autre) => total + autre.supplementCents, 0);

    return {
      nom: variante.produit.nom,
      libelle: variante.libelle,
      options: choix,
      quantite: ligne.quantite,
      prixUnitaireCents: unitaire,
      totalCents: unitaire * ligne.quantite,
    };
  });
};

/**
 * Le total de la commande, en centimes. Le retrait en magasin est gratuit.
 * > la somme des lignes
 */
M.totalCents = function () {
  return M.articles().reduce((total, article) => total + article.totalCents, 0);
};

let C = {};

/**
 * Relit prix et stock auprès du serveur et ajuste le panier en conséquence.
 * > le message qui explique les ajustements, ou null si le panier n'a pas
 *   changé (lève une ErreurApi si le serveur ne répond pas)
 */
C.syncStock = async function () {
  if (M.lignes.length === 0) return null;

  let reponse = await ProduitData.fetchVariantes([...new Set(M.lignes.map((ligne) => ligne.variantId))]);
  M.variantes = reponse.variantes;
  M.groupes = reponse.options ?? {};

  let reconciliation = M.reconcile();
  return texteAjustements(reconciliation.ajustements, reconciliation.retirees);
};

/**
 * Vérifie la connexion puis charge le panier et ses variantes. Renvoie false
 * quand le visiteur a été redirigé vers la connexion.
 * > true si la page doit s'afficher
 */
C.charger = async function () {
  M.message = null;
  M.echec = false;
  M.envoiEnCours = false;
  M.variantes = [];
  M.groupes = {};
  M.lignes = PanierData.read();

  try {
    M.session = await AuthData.me();
  } catch (erreur) {
    M.echec = true;
    M.message = { type: "erreur", texte: `Impossible de vérifier ta connexion : ${erreur.message}` };
    return true;
  }

  if (!M.isConnected()) {
    goTo("/connexion?retour=" + encodeURIComponent("/commande"));
    return false;
  }

  if (M.lignes.length === 0) return true;

  try {
    let texte = await C.syncStock();

    if (texte !== null) {
      M.message = { type: "erreur", texte: texte };
    }
  } catch (erreur) {
    M.echec = true;
    M.message = { type: "erreur", texte: `Impossible de charger ta commande : ${erreur.message}` };
  }

  return true;
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { message, echec, articles, totalCents, email, enCours }
 */
C.viewData = function () {
  return {
    message: M.message,
    echec: M.echec,
    articles: M.echec ? [] : M.articles(),
    totalCents: M.echec ? 0 : M.totalCents(),
    email: M.isConnected() ? M.session.email : "",
    enCours: M.envoiEnCours,
  };
};

/**
 * Clic sur « Confirmer ma commande » : relit le stock (le panier peut dater) ;
 * s'il a obligé à ajuster le panier, rien n'est envoyé et le client revoit sa
 * commande. Sinon le panier part au serveur, qui enregistre la commande et fait
 * foi : si son stock a encore changé (409), on réajuste et on l'explique. Le
 * panier n'est vidé qu'une fois la commande acceptée, puis le client arrive sur
 * la page de confirmation.
 */
C.handler_confirm = async function () {
  if (M.envoiEnCours) return;

  M.envoiEnCours = true;
  M.message = null;
  V.refresh(C.viewData(), 'button[data-action="confirmer"]');

  try {
    let texte = await C.syncStock();

    if (texte !== null) {
      M.envoiEnCours = false;
      M.message = { type: "erreur", texte: `${texte} Vérifie ta commande, puis confirme-la.` };
      V.refresh(C.viewData(), "h1[data-titre]");
      return;
    }

    let reponse = await CommandeData.create(M.lignes);
    PanierData.clear();
    goTo("/commande/" + encodeURIComponent(reponse.commande.numero));
  } catch (erreur) {
    M.envoiEnCours = false;

    // La session a pu expirer pendant la saisie : retour par la connexion.
    if (erreur.statut === 401) {
      goTo("/connexion?retour=" + encodeURIComponent("/commande"));
      return;
    }

    M.message = { type: "erreur", texte: erreur.message };

    // Stock épuisé entre-temps : on réajuste le panier pour que le client voie
    // ce qui reste possible.
    if (erreur.statut === 409) {
      try {
        let texte = await C.syncStock();
        if (texte !== null) M.message = { type: "erreur", texte: `${texte} Vérifie ta commande, puis confirme-la.` };
      } catch (autre) {
        // Le message du serveur suffit si le stock ne peut pas être relu.
      }
    }

    V.refresh(C.viewData(), "h1[data-titre]");
  }
};

C.init = async function () {
  let afficher = await C.charger();
  // Visiteur non connecté : le routeur affiche déjà la page de connexion.
  if (!afficher) return htmlToFragment("");
  return V.init(C.viewData());
};

let V = {};

V.racine = null; // élément racine de la page affichée

V.init = function (data) {
  let fragment = V.createPageFragment(data);
  V.racine = fragment.firstElementChild;
  return fragment;
};

// Toute la page se reconstruit à partir des données reçues de C.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  document.querySelector(focusSelector)?.focus();
};

V.createPageFragment = function (data) {
  let pageFragment = htmlToFragment(template);

  pageFragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

  let slotContenu = pageFragment.querySelector('slot[name="contenu"]');

  if (data.echec) {
    slotContenu.remove();
  } else if (data.articles.length === 0) {
    slotContenu.replaceWith(htmlToFragment(templateVide));
  } else {
    let contenu = htmlToFragment(templateContenu);

    contenu
      .querySelector('slot[name="lignes"]')
      .replaceWith(...data.articles.map((article) => LigneCommandeView.dom(article)));
    contenu.querySelector('slot[name="encart"]').replaceWith(
      EncartValidationView.dom(
        { totalCents: data.totalCents, email: data.email, enCours: data.enCours },
        { surConfirmation: C.handler_confirm }
      )
    );

    slotContenu.replaceWith(contenu);
  }

  return pageFragment;
};

export function CommandePage() {
  return C.init();
}
