import { AdminData } from "../../data/admin.js";
import { CodePromoAdminData } from "../../data/codes-promo.js";
import { formaterDate, formaterPrix } from "../../lib/format.js";
import { goTo, readQuery } from "../../lib/navigation.js";
import { htmlToFragment } from "../../lib/utils.js";
import { BandeauInfoView } from "../../ui/bandeau-info/index.js";
import { BarreAdminView } from "../../ui/barre-admin/index.js";
import { EnTetePageView } from "../../ui/en-tete-page/index.js";
import { IndicateurView } from "../../ui/indicateur/index.js";
import { ListeCodesPromoView } from "../../ui/liste-codes-promo/index.js";
import { MessageView } from "../../ui/message/index.js";
import { ModaleConfirmationView } from "../../ui/modale-confirmation/index.js";
import template from "./template.html?raw";

/**
 * Page « Codes promo » du back-office (US PRO-b), à l'adresse /admin/codes-promo.
 *
 * Liste les codes promotionnels avec leurs statistiques d'utilisation (nombre de
 * commandes, réductions accordées, chiffre d'affaires, dernière utilisation) et
 * supprime, après confirmation, un code jamais utilisé. Un code déjà utilisé se
 * désactive depuis sa page de modification. La création et la modification ont
 * leur propre page.
 *
 * M : codes, résumé, suppression en cours, message. V : les gabarits.
 * C : charge, ouvre et ferme la modale, envoie la suppression.
 */

// Messages de réussite, désignés par ?ok=... dans l'adresse (jamais de texte libre).
const SUCCES = {
  cree: "Le code promo a été créé.",
  modifie: "Le code promo a été modifié.",
};

let M = {
  codes: [], // voir CodePromoAdminData.fetchAll
  resume: { nombre: 0, actifs: 0, utilisations: 0, reductionCents: 0 },
  suppression: null, // { id, code, enCours, message } ou null
  message: null, // { type, texte }, ou null
};

/**
 * Le code qui porte cet identifiant.
 * . id : l'identifiant cherché
 * > le code, ou undefined s'il n'existe pas
 */
M.find = function (id) {
  return M.codes.find((code) => code.id === id);
};

/**
 * Le sous-titre de la page : nombre de codes et de codes actifs.
 * > un texte, par exemple « 3 codes · 2 actifs »
 */
M.subtitle = function () {
  let n = M.resume.nombre;
  let a = M.resume.actifs;
  return `${n} ${n > 1 ? "codes" : "code"} · ${a} ${a > 1 ? "actifs" : "actif"}`;
};

/**
 * Les trois indicateurs du haut de page.
 * > [{ libelle, valeur, legende, icone, attention }]
 */
M.indicators = function () {
  let u = M.resume.utilisations;

  return [
    {
      libelle: "Codes",
      valeur: M.resume.nombre,
      legende: `${M.resume.actifs} ${M.resume.actifs > 1 ? "actifs" : "actif"}`,
      icone: "etiquette",
      attention: false,
    },
    {
      libelle: "Utilisations",
      valeur: u,
      legende: "Commandes avec un code, annulées exclues",
      icone: "commandes",
      attention: false,
    },
    {
      libelle: "Réductions accordées",
      valeur: formaterPrix(M.resume.reductionCents),
      legende: "Total déduit des commandes",
      icone: "boite",
      attention: false,
    },
  ];
};

/**
 * Les lignes du tableau, avec leurs textes lisibles.
 * > [{ id, code, actif, remise, utilisations, reductions, chiffre, derniere, supprimable }]
 */
M.rows = function () {
  return M.codes.map((code) => ({
    id: code.id,
    code: code.code,
    actif: code.actif,
    remise: `${code.pourcentage} %`,
    utilisations: String(code.utilisations),
    reductions: formaterPrix(code.reductionCents),
    chiffre: formaterPrix(code.chiffreAffairesCents),
    derniere: code.derniereUtilisation === null ? "Jamais" : formaterDate(code.derniereUtilisation),
    supprimable: code.supprimable,
  }));
};

/**
 * Message de succès annoncé par l'adresse (?ok=cree).
 * . code : la valeur du paramètre
 * > { type: "succes", texte }, ou null si la valeur est inconnue
 */
M.flash = function (code) {
  if (code === null || !(code in SUCCES)) return null;
  return { type: "succes", texte: SUCCES[code] };
};

let C = {};

/**
 * Charge la session puis les codes. Sans session admin, retour à la connexion.
 * > true si la page peut s'afficher, false si on a redirigé
 */
C.charger = async function () {
  try {
    let session = await AdminData.me();
    if (!session.connecte) {
      goTo("/admin");
      return false;
    }
    let reponse = await CodePromoAdminData.fetchAll();
    M.codes = reponse.codes;
    M.resume = reponse.resume;
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return false;
    }
    M.codes = [];
    M.resume = { nombre: 0, actifs: 0, utilisations: 0, reductionCents: 0 };
    M.message = { type: "erreur", texte: erreur.message };
  }
  return true;
};

/**
 * Clic sur « Supprimer » : ouvre la modale de confirmation.
 * . id : le code à supprimer
 */
C.handler_askDelete = function (id) {
  let code = M.find(id);
  if (code === undefined) return;

  M.message = null;
  M.suppression = { id: code.id, code: code.code, enCours: false, message: null };
  V.refresh(C.viewData(), null);
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
 * Confirmation : envoie la suppression au serveur, qui revérifie que le code n'a jamais servi.
 */
C.handler_confirmDelete = async function () {
  let suppression = M.suppression;
  if (suppression === null) return;

  suppression.enCours = true;
  suppression.message = null;
  V.refresh(C.viewData(), null);

  try {
    await CodePromoAdminData.remove(suppression.id);
    M.suppression = null;
    await C.charger();
    M.message = { type: "succes", texte: `Le code ${suppression.code} a été supprimé.` };
    V.refresh(C.viewData(), "h1[data-titre]");
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    suppression.enCours = false;
    suppression.message = { type: "erreur", texte: erreur.message };
    // Code déjà supprimé ou utilisé entre-temps : on referme et on relit la liste.
    if (erreur.statut === 404 || erreur.statut === 409) {
      M.suppression = null;
      await C.charger();
      M.message = suppression.message;
    }
    V.refresh(C.viewData(), null);
  }
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { email, sousTitre, message, indicateurs, codes, suppression }
 */
C.viewData = function () {
  return {
    email: AdminData.knownEmail ?? "",
    sousTitre: M.subtitle(),
    message: M.message,
    indicateurs: M.indicators(),
    codes: M.rows(),
    suppression:
      M.suppression === null
        ? null
        : {
            titre: "Supprimer ce code ?",
            texte: `Le code ${M.suppression.code} n'a jamais servi : il sera supprimé définitivement.`,
            bouton: "Supprimer le code",
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
    BarreAdminView.dom({ section: "Codes promo", email: data.email })
  );
  page.querySelector('slot[name="entete"]').replaceWith(
    EnTetePageView.dom({
      titre: "Codes promo",
      sousTitre: data.sousTitre,
      action: { libelle: "Nouveau code", href: "/admin/codes-promo/nouveau" },
    })
  );
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));
  page.querySelector('slot[name="indicateurs"]').replaceWith(...data.indicateurs.map((indicateur) => IndicateurView.dom(indicateur)));
  page.querySelector('slot[name="bandeau"]').replaceWith(
    BandeauInfoView.dom({
      texte:
        "Un code ne se renomme pas et ne se supprime plus dès qu'une commande l'a utilisé : désactivez-le pour garder ses statistiques.",
    })
  );
  page.querySelector('slot[name="liste"]').replaceWith(
    ListeCodesPromoView.dom(data.codes, { surSuppression: C.handler_askDelete })
  );

  let slotModale = page.querySelector('slot[name="modale"]');
  if (data.suppression === null) {
    slotModale.remove();
  } else {
    slotModale.replaceWith(
      ModaleConfirmationView.dom(data.suppression, {
        surConfirmation: C.handler_confirmDelete,
        surAnnulation: C.handler_cancelDelete,
      })
    );
  }

  return page;
};

export function AdminCodesPromoPage() {
  return C.init();
}
