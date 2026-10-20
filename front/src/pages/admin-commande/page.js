import { AdminData } from "../../data/admin.js";
import { CommandeAdminData } from "../../data/commande-admin.js";
import { formaterDate } from "../../lib/format.js";
import { goTo } from "../../lib/navigation.js";
import { actionsStatut, libelleStatut } from "../../lib/statut-commande.js";
import { htmlToFragment } from "../../lib/utils.js";
import { BarreAdminView } from "../../ui/barre-admin/index.js";
import { DetailCommandeAdminView } from "../../ui/detail-commande-admin/index.js";
import { EnTetePageView } from "../../ui/en-tete-page/index.js";
import { MessageView } from "../../ui/message/index.js";
import { ModaleConfirmationView } from "../../ui/modale-confirmation/index.js";
import template from "./template.html?raw";

/**
 * Page « Détail d'une commande » du back-office (US PIL-b), à l'adresse
 * /admin/commandes/:numero.
 *
 * Montre le client, les articles avec leurs options figées, le total et le
 * journal des modifications faites par les administrateurs, et permet de faire
 * avancer ou d'annuler la commande (avec confirmation).
 *
 * M : la commande, l'annulation en cours, le message. V : les gabarits.
 * C : charge la commande et envoie les changements de statut.
 */

let M = {
  numero: "", // le numéro lu dans l'adresse
  commande: null, // la commande de l'API, ou null tant que le chargement n'a pas réussi
  annulation: null, // { enCours, message } ou null
  message: null, // { type, texte }, ou null
};

/**
 * Les lignes de la commande, prêtes à afficher.
 * > un tableau de { nom, libelle, quantite, prixUnitaireCents, totalCents, options }
 */
M.articles = function () {
  return M.commande.lignes.map((ligne) => ({
    nom: ligne.produit,
    libelle: ligne.libelle,
    quantite: ligne.quantite,
    prixUnitaireCents: ligne.prixUnitaireCents,
    totalCents: ligne.totalCents,
    options: ligne.options,
  }));
};

/**
 * Le journal de la commande, prêt à afficher (statuts en français, date lisible).
 * > un tableau de { ancien, nouveau, admin, date }
 */
M.journal = function () {
  return M.commande.journal.map((entree) => ({
    ancien: libelleStatut(entree.ancien),
    nouveau: libelleStatut(entree.nouveau),
    admin: entree.admin,
    date: formaterDate(entree.creeLe),
  }));
};

/**
 * Le texte affiché à la place des boutons quand plus aucun changement n'est possible.
 * > un texte selon le statut (retirée ou annulée)
 */
M.noActionText = function () {
  return M.commande.statut === "annulee"
    ? "Cette commande est annulée : son stock a été remis en rayon et elle ne peut plus changer de statut."
    : "Cette commande a été retirée : elle ne peut plus changer de statut ni être annulée.";
};

let C = {};

/**
 * Charge la session puis la commande. Sans session admin, retour à la connexion.
 * > true si la page peut s'afficher, false si on a redirigé
 */
C.charger = async function () {
  try {
    let session = await AdminData.me();
    if (!session.connecte) {
      goTo("/admin");
      return false;
    }
    M.commande = (await CommandeAdminData.fetchOne(M.numero)).commande;
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return false;
    }
    M.commande = null;
    M.message = { type: "erreur", texte: erreur.message };
  }
  return true;
};

/**
 * Clic sur un bouton de changement de statut.
 * . statut : le statut visé
 */
C.handler_change = async function (statut) {
  M.message = null;

  if (statut === "annulee") {
    M.annulation = { enCours: false, message: null };
    V.refresh(C.viewData(), null);
    return;
  }

  let erreur = await C.appliquer(statut);
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

  let erreur = await C.appliquer("annulee");
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
 * Envoie un changement de statut puis relit la commande.
 * . statut : le statut visé
 * > null si le changement a eu lieu (message de succès rangé dans M), sinon
 *   le message d'erreur { type, texte } ; { redirige: true } si la session a expiré
 */
C.appliquer = async function (statut) {
  try {
    await CommandeAdminData.updateStatus([M.commande.id], statut);
    M.message = { type: "succes", texte: `La commande est passée au statut « ${libelleStatut(statut)} ».` };
    await C.charger();
    return null;
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return { redirige: true };
    }
    // Le statut a pu changer ailleurs : on relit la commande.
    await C.charger();
    return { type: "erreur", texte: erreur.message };
  }
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { email, titre, sousTitre, message, detail, annulation } ; detail vaut null en cas d'erreur
 */
C.viewData = function () {
  let commande = M.commande;
  return {
    email: AdminData.knownEmail ?? "",
    titre: commande === null ? "Commande" : `Commande ${commande.numero}`,
    sousTitre: commande === null ? "" : `${libelleStatut(commande.statut)} · ${commande.client}`,
    message: M.message,
    detail:
      commande === null
        ? null
        : {
            numero: commande.numero,
            statut: commande.statut,
            date: formaterDate(commande.creeLe),
            client: commande.client,
            totalCents: commande.totalCents,
            actions: actionsStatut(commande.statut),
            aucuneAction: M.noActionText(),
            lignes: M.articles(),
            journal: M.journal(),
          },
    annulation:
      M.annulation === null
        ? null
        : {
            titre: "Annuler cette commande ?",
            texte:
              "Les produits seront remis en stock. L'annulation est définitive : une commande annulée ne peut plus être rouverte.",
            bouton: "Confirmer l'annulation",
            refus: "Garder la commande",
            enCours: M.annulation.enCours,
            message: M.annulation.message,
          },
  };
};

C.init = async function (params) {
  M.numero = params.numero;
  M.commande = null;
  M.annulation = null;
  M.message = null;

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
    EnTetePageView.dom({ titre: data.titre, sousTitre: data.sousTitre, action: null })
  );
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

  let slotContenu = page.querySelector('slot[name="contenu"]');
  if (data.detail === null) {
    slotContenu.remove();
  } else {
    slotContenu.replaceWith(DetailCommandeAdminView.dom(data.detail, { surAction: C.handler_change }));
  }

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

export function AdminCommandePage(params) {
  return C.init(params);
}
