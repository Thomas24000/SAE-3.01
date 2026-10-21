import { CommandeData } from "../../data/commande.js";
import { formaterPrix } from "../../lib/format.js";
import { libelleStatut } from "../../lib/statut-commande.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { LigneCommandeView } from "../../ui/ligne-commande/index.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";
import templateContenu from "./contenu.html?raw";
import templateErreur from "./erreur.html?raw";

/**
 * Page « Confirmation de commande » (US CMD-a), à l'adresse /commande/:numero.
 *
 * M : la commande telle que le serveur l'a enregistrée (prix figés). V : le
 * gabarit, le bloc de confirmation et les lignes. C : charge la commande.
 */

let M = {
  commande: null, // la commande de l'API, ou null tant que le chargement n'a pas réussi
  connexionRequise: false, // true si le serveur a répondu 401
  message: null, // { type, texte }, ou null
};

/**
 * Le libellé français d'un statut de commande.
 * . statut : le statut renvoyé par l'API (ex. "en_cours")
 * > le libellé affichable, ou le statut tel quel s'il est inconnu
 */
M.statusLabel = function (statut) {
  return libelleStatut(statut);
};

/**
 * Une date de commande lisible.
 * . dateSql : la date renvoyée par l'API (« 2026-10-19 10:21:10 »)
 * > la date en toutes lettres, en français (ex. « 19 octobre 2026 à 10:21 »)
 */
M.formatDate = function (dateSql) {
  let date = new Date(dateSql.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return dateSql;

  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
};

/**
 * Les lignes prêtes à afficher.
 * > un tableau de { nom, libelle, options (figées à la commande), quantite,
 *   prixUnitaireCents (suppléments compris), totalCents }
 */
M.articles = function () {
  return M.commande.lignes.map((ligne) => ({
    nom: ligne.produit,
    libelle: ligne.libelle,
    options: ligne.options ?? [],
    quantite: ligne.quantite,
    prixUnitaireCents: ligne.prixUnitaireCents,
    totalCents: ligne.totalCents,
  }));
};

let C = {};

/**
 * Charge la commande dont le numéro est dans l'adresse.
 * . numero : le numéro de commande
 */
C.charger = async function (numero) {
  M.commande = null;
  M.connexionRequise = false;
  M.message = null;

  try {
    M.commande = (await CommandeData.fetchOne(numero)).commande;
  } catch (erreur) {
    M.connexionRequise = erreur.statut === 401;
    M.message = { type: "erreur", texte: erreur.message };
  }
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { message, connexionRequise, commande } ; commande vaut null en cas d'erreur,
 *   sinon { numero, statut, date, email, total, articles }
 */
C.viewData = function () {
  return {
    message: M.message,
    connexionRequise: M.connexionRequise,
    commande:
      M.commande === null
        ? null
        : {
            numero: M.commande.numero,
            statut: M.statusLabel(M.commande.statut),
            date: M.formatDate(M.commande.creeLe),
            email: M.commande.email,
            totalCents: M.commande.totalCents,
            articles: M.articles(),
          },
  };
};

C.init = async function (params) {
  await C.charger(params.numero);
  return V.init(C.viewData());
};

let V = {};

V.init = function (data) {
  let page = htmlToFragment(template);

  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

  let slotContenu = page.querySelector('slot[name="contenu"]');

  if (data.commande === null) {
    let erreur = htmlToFragment(templateErreur);
    if (!data.connexionRequise) erreur.querySelector('[data-lien="connexion"]').remove();
    slotContenu.replaceWith(erreur);
    return page;
  }

  let contenu = htmlToFragment(
    genericRenderer(templateContenu, {
      numero: data.commande.numero,
      statut: data.commande.statut,
      date: data.commande.date,
      email: data.commande.email,
      total: formaterPrix(data.commande.totalCents),
    })
  );
  contenu
    .querySelector('slot[name="lignes"]')
    .replaceWith(...data.commande.articles.map((article) => LigneCommandeView.dom(article)));

  slotContenu.replaceWith(contenu);
  return page;
};

export function ConfirmationPage(params) {
  return C.init(params);
}
