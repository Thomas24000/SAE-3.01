import { CompteData } from "../../data/compte.js";
import { goTo } from "../../lib/navigation.js";
import { libelleStatut } from "../../lib/statut-commande.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { ApercuCommandesView } from "../../ui/apercu-commandes/index.js";
import { MessageView } from "../../ui/message/index.js";
import { NavigationCompteView } from "../../ui/navigation-compte/index.js";
import template from "./template.html?raw";
import templateContenu from "./contenu.html?raw";
import templateErreur from "./erreur.html?raw";

/**
 * Page « Mon espace » (US SUI-b), à l'adresse /compte : accueil personnalisé,
 * informations personnelles et aperçu des commandes récentes.
 *
 * M : la réponse de l'API (profil, commandes) et ses mises en forme. V : le
 * gabarit, les onglets et l'aperçu. C : charge, renvoie vers la connexion si
 * le serveur répond 401.
 */

let M = {
  profil: null, // { email, nom, creeLe }, ou null tant que le chargement n'a pas réussi
  commandes: null, // { total, recentes }, ou null
  message: null, // { type, texte }, ou null
};

/**
 * Le titre d'accueil personnalisé.
 * > « Bonjour <nom> », ou « Bonjour <e-mail> » si le client n'a pas de nom
 */
M.greeting = function () {
  return "Bonjour " + (M.profil.nom ?? M.profil.email);
};

/**
 * Une date lisible.
 * . dateSql : la date renvoyée par l'API (« 2026-10-19 10:21:10 »)
 * . avecHeure : true pour ajouter l'heure
 * > la date en français, ou la valeur d'origine si elle est illisible
 */
M.formatDate = function (dateSql, avecHeure) {
  let date = new Date(dateSql.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return dateSql;

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: avecHeure ? "short" : undefined,
  }).format(date);
};

/**
 * La phrase d'introduction de l'aperçu.
 * > un texte selon le nombre total de commandes
 */
M.ordersSummary = function () {
  let total = M.commandes.total;
  if (total === 0) return "Aucune commande pour l'instant.";
  if (total === 1) return "Tu as passé 1 commande.";
  return `Tu as passé ${total} commandes, voici les plus récentes.`;
};

let C = {};

/**
 * Charge le compte. Sur un 401, renvoie vers la connexion puis revient ici.
 * > false si le visiteur a été redirigé, true sinon
 */
C.charger = async function () {
  M.profil = null;
  M.commandes = null;
  M.message = null;

  try {
    let reponse = await CompteData.fetch();
    M.profil = reponse.profil;
    M.commandes = reponse.commandes;
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/connexion?retour=" + encodeURIComponent("/compte"));
      return false;
    }
    M.message = { type: "erreur", texte: `Impossible de charger ton espace : ${erreur.message}` };
  }

  return true;
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { titre, message, compte } ; compte vaut null en cas d'erreur, sinon
 *   { nom, email, depuis, resume, commandes }
 */
C.viewData = function () {
  if (M.profil === null) {
    return { titre: "Mon espace", message: M.message, compte: null };
  }

  return {
    titre: M.greeting(),
    message: M.message,
    compte: {
      nom: M.profil.nom ?? "Non renseigné",
      email: M.profil.email,
      depuis: M.formatDate(M.profil.creeLe, false),
      resume: M.ordersSummary(),
      commandes: M.commandes.recentes.map((commande) => ({
        numero: commande.numero,
        statut: libelleStatut(commande.statut),
        date: M.formatDate(commande.creeLe, true),
        totalCents: commande.totalCents,
      })),
    },
  };
};

C.init = async function () {
  let afficher = await C.charger();
  // Visiteur non connecté : le routeur affiche déjà la page de connexion.
  if (!afficher) return htmlToFragment("");
  return V.init(C.viewData());
};

let V = {};

V.init = function (data) {
  let page = htmlToFragment(genericRenderer(template, { titre: data.titre }));

  page.querySelector('slot[name="navigation"]').replaceWith(NavigationCompteView.dom());
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

  let slotContenu = page.querySelector('slot[name="contenu"]');

  if (data.compte === null) {
    slotContenu.replaceWith(htmlToFragment(templateErreur));
    return page;
  }

  let contenu = htmlToFragment(
    genericRenderer(templateContenu, {
      nom: data.compte.nom,
      email: data.compte.email,
      depuis: data.compte.depuis,
    })
  );
  contenu.querySelector('slot[name="apercu"]').replaceWith(
    ApercuCommandesView.dom({ resume: data.compte.resume, commandes: data.compte.commandes })
  );
  slotContenu.replaceWith(contenu);

  return page;
};

export function ComptePage() {
  return C.init();
}
