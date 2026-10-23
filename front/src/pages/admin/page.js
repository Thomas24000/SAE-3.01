import { AdminData } from "../../data/admin.js";
import { StatsData } from "../../data/stats.js";
import { reload } from "../../lib/navigation.js";
import { htmlToFragment } from "../../lib/utils.js";
import { BarreAdminView } from "../../ui/barre-admin/index.js";
import { ConnexionAdminView } from "../../ui/connexion-admin/index.js";
import { IndicateurView } from "../../ui/indicateur/index.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";
import templateConnexion from "./connexion.html?raw";

/**
 * Page « Back-office » (US GOF-b), à l'adresse /admin.
 *
 * Sans session administrateur : l'écran de connexion. Avec une session : le
 * tableau de bord et ses indicateurs. La page ne protège rien elle-même, c'est
 * le serveur qui décide : /api/admin/me et /api/admin/stats répondent selon la
 * session, et la page affiche ce qu'il répond.
 *
 * M : session, statistiques, identifiant saisi, message. V : les gabarits.
 * C : lit la session, charge les statistiques, réagit à la connexion.
 */

let M = {
  email: "", // dernier e-mail saisi, pour pré-remplir le formulaire
  session: null, // { connecte, email? } renvoyé par le serveur, ou null
  stats: null, // indicateurs fournis par le serveur, ou null
  message: null, // { type, texte }, ou null
};

/**
 * L'administrateur est-il connecté d'après le serveur ?
 * > true si une session administrateur est ouverte
 */
M.isConnected = function () {
  return M.session !== null && M.session.connecte === true && M.stats !== null;
};

/**
 * Vérifie les champs avant l'envoi. Le serveur revérifie : ce contrôle évite
 * seulement un aller-retour inutile.
 * . email : l'e-mail saisi
 * . mdp : le mot de passe saisi
 * > un texte d'erreur, ou null si les champs sont renseignés
 */
M.validate = function (email, mdp) {
  if (email === "" || mdp === "") return "Renseignez votre e-mail et votre mot de passe.";
  return null;
};

/**
 * Les quatre indicateurs du tableau de bord, prêts à afficher.
 * > [{ libelle, valeur, legende, icone, attention }]
 */
M.indicators = function () {
  let stats = M.stats;
  let categories = stats.parCategorie.map((ligne) => ligne.categorie);
  let nombreCategories = categories.length;

  return [
    {
      libelle: "Produits",
      valeur: stats.total,
      legende: `Dans ${nombreCategories} ${nombreCategories > 1 ? "catégories" : "catégorie"}`,
      icone: "boite",
      attention: false,
    },
    {
      libelle: "Commandes",
      valeur: stats.commandes,
      legende: `${stats.commandesAujourdhui} aujourd'hui · ${stats.commandesEnCours} à préparer`,
      icone: "commandes",
      attention: false,
    },
    {
      libelle: "Catégories",
      valeur: nombreCategories,
      legende: categories.join(", "),
      icone: "etiquette",
      attention: false,
    },
    {
      libelle: "Bientôt épuisés",
      valeur: stats.bientotEpuises,
      legende: "Stock sous le seuil d'alerte",
      icone: "alerte",
      attention: stats.bientotEpuises > 0,
    },
  ];
};

let C = {};

/**
 * Demande au serveur la session puis, si un administrateur est connecté, les
 * indicateurs. Un refus (401) ramène à l'écran de connexion.
 */
C.charger = async function () {
  M.session = null;
  M.stats = null;

  try {
    M.session = await AdminData.me(true);
    if (M.session.connecte) M.stats = await StatsData.fetch();
  } catch (erreur) {
    M.session = null;
    AdminData.knownEmail = null;
    M.message = { type: "erreur", texte: erreur.statut === 401 ? "Votre session a expiré." : erreur.message };
  }
};

/**
 * Soumission du formulaire de connexion : ouvre la session, puis réaffiche la
 * page, dont le layout montre alors la navigation.
 * . email : l'e-mail saisi
 * . mdp : le mot de passe saisi
 */
C.handler_login = async function (email, mdp) {
  M.email = email;

  let probleme = M.validate(email, mdp);
  if (probleme !== null) {
    M.message = { type: "erreur", texte: probleme };
    V.refresh(C.viewData(), 'input[name="email"]');
    return;
  }

  try {
    await AdminData.login(email, mdp);
  } catch (erreur) {
    M.message = { type: "erreur", texte: erreur.message };
    V.refresh(C.viewData(), 'input[name="mdp"]');
    return;
  }

  M.message = null;
  reload();
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { connecte, email, emailConnecte, message, indicateurs }
 */
C.viewData = function () {
  return {
    connecte: M.isConnected(),
    email: M.email,
    emailConnecte: M.isConnected() ? M.session.email : "",
    message: M.message,
    indicateurs: M.isConnected() ? M.indicators() : [],
  };
};

C.init = async function () {
  M.message = null;
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

// Toute la page se reconstruit à partir du modèle ; l'e-mail saisi survit
// parce qu'il est dans le modèle.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;
  document.querySelector(focusSelector)?.focus();
};

V.createPageFragment = function (data) {
  if (!data.connecte) {
    let page = htmlToFragment(templateConnexion);
    page.querySelector('slot[name="formulaire"]').replaceWith(
      ConnexionAdminView.dom(
        { email: data.email, message: data.message },
        { surConnexion: C.handler_login }
      )
    );
    return page;
  }

  let page = htmlToFragment(template);
  page.querySelector('slot[name="barre"]').replaceWith(
    BarreAdminView.dom({ section: "Tableau de bord", email: data.emailConnecte })
  );
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));
  page.querySelector('slot[name="indicateurs"]').replaceWith(
    ...data.indicateurs.map((indicateur) => IndicateurView.dom(indicateur))
  );
  return page;
};

export function AdminPage() {
  return C.init();
}
