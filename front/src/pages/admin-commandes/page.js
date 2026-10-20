import { AdminData } from "../../data/admin.js";
import { CommandeAdminData } from "../../data/commande-admin.js";
import { formaterDate } from "../../lib/format.js";
import { goTo } from "../../lib/navigation.js";
import { actionsStatut, libelleStatut } from "../../lib/statut-commande.js";
import { htmlToFragment } from "../../lib/utils.js";
import { ActionsLotCommandesView } from "../../ui/actions-lot-commandes/index.js";
import { BarreAdminView } from "../../ui/barre-admin/index.js";
import { EnTetePageView } from "../../ui/en-tete-page/index.js";
import { FiltresCommandesView } from "../../ui/filtres-commandes/index.js";
import { ListeCommandesView } from "../../ui/liste-commandes/index.js";
import { MessageView } from "../../ui/message/index.js";
import { ModaleConfirmationView } from "../../ui/modale-confirmation/index.js";
import template from "./template.html?raw";

/**
 * Page « Commandes » du back-office (US PIL-b), à l'adresse /admin/commandes.
 *
 * Liste toutes les commandes des clients, triées et filtrées par le serveur.
 * Chaque commande peut passer de « en cours » à « disponible » puis à
 * « retirée », ou être annulée (le stock est alors rendu) ; les mêmes actions
 * s'appliquent à une sélection de commandes. Une annulation demande toujours
 * une confirmation. Le détail d'une commande a sa propre page.
 *
 * M : commandes, tri, filtre, sélection, annulation en cours, message.
 * V : les gabarits. C : charge, trie, sélectionne, envoie les changements.
 */

// Actions proposées sur une sélection : le serveur refuse celles qui ne
// s'appliquent pas à certaines commandes et le dit.
const ACTIONS_LOT = [
  { statut: "prete", libelle: "Marquer disponible" },
  { statut: "retiree", libelle: "Marquer retirée" },
  { statut: "annulee", libelle: "Annuler" },
];

let M = {
  commandes: [], // [{ id, numero, statut, totalCents, creeLe, client, articles }]
  tri: "date",
  sens: "desc",
  statut: "", // filtre : "" pour tous les statuts
  selection: [], // identifiants des commandes cochées
  annulation: null, // { ids, enCours, message } ou null
  message: null, // { type, texte }, ou null
};

/**
 * Le sous-titre de la page : nombre de commandes affichées.
 * > un texte, par exemple « 3 commandes »
 */
M.subtitle = function () {
  let n = M.commandes.length;
  return `${n} ${n > 1 ? "commandes" : "commande"}`;
};

/**
 * Coche ou décoche une commande.
 * . id : l'identifiant de la commande
 */
M.toggle = function (id) {
  M.selection = M.selection.includes(id) ? M.selection.filter((autre) => autre !== id) : M.selection.concat(id);
};

/**
 * Coche toutes les commandes affichées, ou les décoche si elles le sont déjà.
 */
M.toggleAll = function () {
  M.selection = M.allSelected() ? [] : M.commandes.map((commande) => commande.id);
};

/**
 * Toutes les commandes affichées sont-elles cochées ?
 * > true si la liste n'est pas vide et que chaque commande est cochée
 */
M.allSelected = function () {
  return M.commandes.length > 0 && M.commandes.every((commande) => M.selection.includes(commande.id));
};

/**
 * Le texte de la demande de confirmation d'une annulation.
 * > { titre, texte, bouton }
 */
M.cancelWording = function () {
  let n = M.annulation.ids.length;
  return {
    titre: n > 1 ? `Annuler ${n} commandes ?` : "Annuler cette commande ?",
    texte:
      "Les produits seront remis en stock. L'annulation est définitive : une commande annulée ne peut plus être rouverte, et une commande déjà retirée ne peut pas être annulée.",
    bouton: n > 1 ? "Confirmer les annulations" : "Confirmer l'annulation",
  };
};

/**
 * Le message qui résume le résultat d'un changement de statut.
 * . reponse : { modifiees: [numero], refusees: [message] }
 * . statut : le statut demandé
 * > { type: "succes", texte }
 */
M.resultMessage = function (reponse, statut) {
  let n = reponse.modifiees.length;
  let texte = `${n} ${n > 1 ? "commandes sont passées" : "commande est passée"} au statut « ${libelleStatut(statut)} ».`;
  if (reponse.refusees.length > 0) texte += " Non modifiées : " + reponse.refusees.join(" ");
  return { type: "succes", texte };
};

let C = {};

/**
 * Charge la session puis les commandes. Sans session admin, retour à la connexion.
 * > true si la page peut s'afficher, false si on a redirigé
 */
C.charger = async function () {
  try {
    let session = await AdminData.me();
    if (!session.connecte) {
      goTo("/admin");
      return false;
    }
    M.commandes = (await CommandeAdminData.fetchAll(M.tri, M.sens, M.statut)).commandes;
    // Une commande qui n'est plus affichée n'est plus cochée.
    M.selection = M.selection.filter((id) => M.commandes.some((commande) => commande.id === id));
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return false;
    }
    M.commandes = [];
    M.selection = [];
    M.message = { type: "erreur", texte: erreur.message };
  }
  return true;
};

/**
 * Changement du tri, de l'ordre ou du filtre : le serveur renvoie la liste.
 * . choix : { tri, sens, statut, champ } ; champ est la liste modifiée
 */
C.handler_filter = async function (choix) {
  M.tri = choix.tri;
  M.sens = choix.sens;
  M.statut = choix.statut;
  M.message = null;

  if (!(await C.charger())) return;
  V.refresh(C.viewData(), `select[name="${choix.champ}"]`);
};

/**
 * Case à cocher d'une commande.
 * . id : l'identifiant de la commande
 */
C.handler_select = function (id) {
  M.toggle(id);
  V.refresh(C.viewData(), `input[data-id="${id}"]`);
};

/**
 * Case « Tout sélectionner ».
 */
C.handler_selectAll = function () {
  M.toggleAll();
  V.refresh(C.viewData(), "input[data-tout]");
};

/**
 * Clic sur une action d'une ligne.
 * . id : la commande concernée
 * . statut : le statut visé
 */
C.handler_changeOne = function (id, statut) {
  C.demander([id], statut);
};

/**
 * Clic sur une action de la barre d'actions en lot.
 * . statut : le statut visé pour toute la sélection
 */
C.handler_changeBatch = function (statut) {
  C.demander(M.selection, statut);
};

/**
 * Applique un changement de statut, après confirmation s'il s'agit d'une annulation.
 * . ids : les commandes concernées
 * . statut : le statut visé
 */
C.demander = async function (ids, statut) {
  M.message = null;

  if (statut === "annulee") {
    M.annulation = { ids, enCours: false, message: null };
    V.refresh(C.viewData(), null);
    return;
  }

  let erreur = await C.appliquer(ids, statut);
  if (erreur?.redirige) return;
  if (erreur !== null) M.message = erreur;
  V.refresh(C.viewData(), "h1[data-titre]");
};

/**
 * Confirmation de l'annulation : envoie le changement au serveur.
 */
C.handler_confirmCancel = async function () {
  let annulation = M.annulation;
  if (annulation === null) return;

  annulation.enCours = true;
  annulation.message = null;
  V.refresh(C.viewData(), null);

  let erreur = await C.appliquer(annulation.ids, "annulee");
  if (erreur?.redirige) return;
  if (erreur !== null) {
    annulation.enCours = false;
    annulation.message = erreur;
    V.refresh(C.viewData(), null);
    return;
  }

  M.annulation = null;
  V.refresh(C.viewData(), "h1[data-titre]");
};

/**
 * Fermeture de la modale d'annulation (bouton ou Échap) : rien n'est annulé.
 */
C.handler_cancelCancel = function () {
  if (M.annulation === null) return;
  M.annulation = null;
  V.refresh(C.viewData(), "h1[data-titre]");
};

/**
 * Envoie un changement de statut puis relit la liste.
 * . ids : les commandes concernées
 * . statut : le statut visé
 * > null si le changement a eu lieu (message de succès rangé dans M), sinon
 *   le message d'erreur { type, texte } ; { redirige: true } si la session a expiré
 */
C.appliquer = async function (ids, statut) {
  try {
    let reponse = await CommandeAdminData.updateStatus(ids, statut);
    M.selection = [];
    M.message = M.resultMessage(reponse, statut);
    await C.charger();
    return null;
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return { redirige: true };
    }
    // Le refus vient souvent d'un statut déjà changé ailleurs : on relit la liste.
    await C.charger();
    return { type: "erreur", texte: erreur.message };
  }
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { email, sousTitre, message, filtres, lot, liste, annulation }
 */
C.viewData = function () {
  return {
    email: AdminData.knownEmail ?? "",
    sousTitre: M.subtitle(),
    message: M.message,
    filtres: { tri: M.tri, sens: M.sens, statut: M.statut },
    lot: M.selection.length === 0 ? null : { nombre: M.selection.length, actions: ACTIONS_LOT },
    liste: {
      toutCoche: M.allSelected(),
      commandes: M.commandes.map((commande) => ({
        id: commande.id,
        numero: commande.numero,
        client: commande.client,
        date: formaterDate(commande.creeLe),
        articles: `${commande.articles} ${commande.articles > 1 ? "articles" : "article"}`,
        statut: commande.statut,
        totalCents: commande.totalCents,
        coche: M.selection.includes(commande.id),
        actions: actionsStatut(commande.statut),
      })),
    },
    annulation:
      M.annulation === null
        ? null
        : {
            ...M.cancelWording(),
            refus: "Garder la commande",
            enCours: M.annulation.enCours,
            message: M.annulation.message,
          },
  };
};

C.init = async function () {
  M.message = null;
  M.annulation = null;
  M.selection = [];

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
    BarreAdminView.dom({ section: "Commandes", email: data.email })
  );
  page.querySelector('slot[name="entete"]').replaceWith(
    EnTetePageView.dom({ titre: "Commandes", sousTitre: data.sousTitre, action: null })
  );
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));
  page.querySelector('slot[name="filtres"]').replaceWith(
    FiltresCommandesView.dom(data.filtres, { surChangement: C.handler_filter })
  );

  let slotLot = page.querySelector('slot[name="lot"]');
  if (data.lot === null) {
    slotLot.remove();
  } else {
    slotLot.replaceWith(ActionsLotCommandesView.dom(data.lot, { surAction: C.handler_changeBatch }));
  }

  page.querySelector('slot[name="liste"]').replaceWith(
    ListeCommandesView.dom(data.liste, {
      surSelection: C.handler_select,
      surToutSelectionner: C.handler_selectAll,
      surChangement: C.handler_changeOne,
    })
  );

  let slotModale = page.querySelector('slot[name="modale"]');
  if (data.annulation === null) {
    slotModale.remove();
  } else {
    slotModale.replaceWith(
      ModaleConfirmationView.dom(data.annulation, {
        surConfirmation: C.handler_confirmCancel,
        surAnnulation: C.handler_cancelCancel,
      })
    );
  }

  return page;
};

export function AdminCommandesPage() {
  return C.init();
}
