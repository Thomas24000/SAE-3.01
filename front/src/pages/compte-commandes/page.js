import { CommandeData } from "../../data/commande.js";
import { goTo } from "../../lib/navigation.js";
import { libelleStatut } from "../../lib/statut-commande.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { FiltresHistoriqueView } from "../../ui/filtres-historique/index.js";
import { ListeHistoriqueView } from "../../ui/liste-historique/index.js";
import { MessageView } from "../../ui/message/index.js";
import { NavigationCompteView } from "../../ui/navigation-compte/index.js";
import { PaginationView } from "../../ui/pagination/index.js";
import template from "./template.html?raw";

/**
 * Page « Mes commandes » (US SUI-c), à l'adresse /compte/commandes : l'historique
 * du client, de la plus récente à la plus ancienne, filtrable par statut et par
 * période, paginé. Chaque commande mène à son détail (/commande/:numero).
 *
 * M : filtres, page, réponse du serveur (qui filtre et pagine). V : le gabarit,
 * les filtres, la liste et la pagination. C : charge, applique un filtre ou une
 * page, renvoie vers la connexion si le serveur répond 401.
 */

const STATUTS = ["", "en_cours", "prete", "retiree", "annulee"];

const FILTRES_VIDES = { statut: "", du: "", au: "" };

let M = {
  filtres: { ...FILTRES_VIDES },
  page: 1,
  pages: 1,
  total: 0,
  commandes: null, // [{ numero, statut, totalCents, creeLe }], ou null tant que le chargement n'a pas réussi
  message: null, // { type, texte }, ou null
};

/**
 * Les choix de la liste des statuts.
 * > [{ valeur, libelle }], « Tous les statuts » en premier
 */
M.statusOptions = function () {
  return STATUTS.map((statut) => ({
    valeur: statut,
    libelle: statut === "" ? "Tous les statuts" : libelleStatut(statut),
  }));
};

/**
 * Indique si au moins un filtre est actif.
 * > true si le statut ou une date est renseigné
 */
M.hasFilter = function () {
  return M.filtres.statut !== "" || M.filtres.du !== "" || M.filtres.au !== "";
};

/**
 * Vérifie la période avant l'envoi. Le serveur revérifie.
 * > le texte du problème, ou null si la période est valide
 */
M.periodProblem = function () {
  if (M.filtres.du !== "" && M.filtres.au !== "" && M.filtres.du > M.filtres.au) {
    return "La date de début doit précéder la date de fin.";
  }
  return null;
};

/**
 * Le nombre de commandes trouvées, en toutes lettres.
 * > « 1 commande », « 12 commandes » ou « Aucune commande »
 */
M.countText = function () {
  if (M.total === 0) return "Aucune commande";
  if (M.total === 1) return "1 commande";
  return `${M.total} commandes`;
};

/**
 * Une date lisible.
 * . dateSql : la date renvoyée par l'API (« 2026-10-19 10:21:10 »)
 * > la date en français avec l'heure, ou la valeur d'origine si elle est illisible
 */
M.formatDate = function (dateSql) {
  let date = new Date(dateSql.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return dateSql;

  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
};

let C = {};

/**
 * Interroge le serveur avec les filtres et la page de M. Sur un 401, renvoie
 * vers la connexion puis revient ici. En cas d'autre erreur, la liste déjà
 * affichée est conservée et un message l'accompagne.
 * > false si le visiteur a été redirigé, true sinon
 */
C.charger = async function () {
  let probleme = M.periodProblem();
  if (probleme !== null) {
    M.message = { type: "erreur", texte: probleme };
    return true;
  }

  try {
    let reponse = await CommandeData.fetchAll(M.filtres, M.page);
    M.commandes = reponse.commandes;
    M.total = reponse.total;
    M.page = reponse.page;
    M.pages = reponse.pages;
    M.message = null;
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/connexion?retour=" + encodeURIComponent("/compte/commandes"));
      return false;
    }
    M.message = { type: "erreur", texte: `Impossible de charger tes commandes : ${erreur.message}` };
  }

  return true;
};

/**
 * Un filtre a changé : retour à la première page puis rechargement.
 * . filtres : { statut, du, au, champ } ; champ est le champ modifié
 */
C.handler_filter = async function (filtres) {
  M.filtres = { statut: filtres.statut, du: filtres.du, au: filtres.au };
  M.page = 1;

  if (await C.charger()) V.refresh(C.viewData(), `[name="${filtres.champ}"]`);
};

/**
 * Remet tous les filtres à zéro.
 */
C.handler_reset = async function () {
  M.filtres = { ...FILTRES_VIDES };
  M.page = 1;

  if (await C.charger()) V.refresh(C.viewData(), "h1[data-titre]");
};

/**
 * Change de page.
 * . numero : le numéro de page demandé
 */
C.handler_page = async function (numero) {
  M.page = numero;

  if (await C.charger()) V.refresh(C.viewData(), 'nav[aria-label="Pagination"] button[aria-current="true"]');
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { message, filtres, resume, liste, pagination } ; liste et pagination valent
 *   null tant que le chargement n'a pas réussi
 */
C.viewData = function () {
  let filtres = {
    ...M.filtres,
    statuts: M.statusOptions(),
    filtre: M.hasFilter(),
  };

  if (M.commandes === null) {
    return { message: M.message, filtres, resume: "", liste: null, pagination: null };
  }

  return {
    message: M.message,
    filtres,
    resume: M.countText(),
    liste: {
      commandes: M.commandes.map((commande) => ({
        numero: commande.numero,
        statut: commande.statut,
        date: M.formatDate(commande.creeLe),
        totalCents: commande.totalCents,
      })),
      texteVide: M.hasFilter()
        ? "Aucune commande ne correspond à ces filtres."
        : "Tu n'as pas encore passé de commande.",
    },
    pagination: M.pages > 1 ? { page: M.page, pages: M.pages } : null,
  };
};

C.init = async function () {
  // Chaque visite repart d'un historique complet.
  M.filtres = { ...FILTRES_VIDES };
  M.page = 1;
  M.commandes = null;
  M.message = null;

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

// Toute la page se reconstruit à partir du modèle ; le focus revient au champ ou
// au bouton qui vient d'agir.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  document.querySelector(focusSelector)?.focus();
};

V.createPageFragment = function (data) {
  let page = htmlToFragment(genericRenderer(template, { resume: data.resume }));

  page.querySelector('slot[name="navigation"]').replaceWith(NavigationCompteView.dom());
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));
  page
    .querySelector('slot[name="filtres"]')
    .replaceWith(
      FiltresHistoriqueView.dom(data.filtres, {
        surChangement: C.handler_filter,
        surReinitialisation: C.handler_reset,
      })
    );

  let slotListe = page.querySelector('slot[name="liste"]');
  if (data.liste === null) slotListe.remove();
  else slotListe.replaceWith(ListeHistoriqueView.dom(data.liste));

  let slotPagination = page.querySelector('slot[name="pagination"]');
  if (data.pagination === null) slotPagination.remove();
  else slotPagination.replaceWith(PaginationView.dom(data.pagination, { surPage: C.handler_page }));

  return page;
};

export function CompteCommandesPage() {
  return C.init();
}
