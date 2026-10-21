import { AdminData } from "../../data/admin.js";
import { StatsData } from "../../data/stats.js";
import { formaterDate, formaterPrix } from "../../lib/format.js";
import { montantCsv, toCsv } from "../../lib/csv.js";
import { goTo } from "../../lib/navigation.js";
import { statutStock } from "../../lib/stock.js";
import { libelleStatut } from "../../lib/statut-commande.js";
import { htmlToFragment } from "../../lib/utils.js";
import { ActionsStatistiquesView } from "../../ui/actions-statistiques/index.js";
import { BandeauInfoView } from "../../ui/bandeau-info/index.js";
import { BarreAdminView } from "../../ui/barre-admin/index.js";
import { EnTetePageView } from "../../ui/en-tete-page/index.js";
import { GraphiqueBarresView } from "../../ui/graphique-barres/index.js";
import { IndicateurView } from "../../ui/indicateur/index.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";

/**
 * Page « Statistiques » du back-office (US PIL-a), à l'adresse /admin/statistiques.
 *
 * Montre les stocks par produit (histogramme et alerte de stock faible), les
 * revenus des 7 derniers jours, la répartition des commandes par statut et les
 * produits les plus vendus, et permet d'exporter ces chiffres en CSV. Les
 * chiffres sont relus auprès du serveur à chaque affichage et à chaque clic sur
 * « Actualiser » ; le serveur calcule tout, la page ne fait que les présenter.
 *
 * M : les statistiques reçues, les barres et les lignes d'export qu'on en tire.
 * V : les gabarits et le téléchargement. C : charge, actualise, exporte.
 */

const STATUTS = ["en_cours", "prete", "retiree", "annulee"];

let M = {
  stats: null, // la réponse de /api/admin/statistiques, ou null tant que le chargement n'a pas réussi
  message: null, // { type, texte }, ou null
};

/**
 * Les pourcentages de longueur de barre d'une série : la plus grande valeur
 * occupe toute la longueur, une valeur non nulle reste visible.
 * . valeurs : les valeurs de la série
 * > un pourcentage entier de 0 à 100 par valeur
 */
M.scale = function (valeurs) {
  let max = Math.max(0, ...valeurs);
  return valeurs.map((valeur) => (valeur > 0 ? Math.max(3, Math.round((valeur / max) * 100)) : 0));
};

/**
 * Les produits dont le stock est à surveiller (« Bientôt épuisé » ou « Épuisé »).
 * > [{ produit, categorie, stock, statut }], du plus faible au plus fort stock
 */
M.lowStocks = function () {
  return M.stats.stocks
    .map((ligne) => ({ ...ligne, statut: statutStock(ligne.stock, M.stats.seuilBientotEpuise) }))
    .filter((ligne) => ligne.statut !== "disponible");
};

/**
 * Le total des revenus des 7 jours et le nombre de commandes correspondantes.
 * > { totalCents, commandes }
 */
M.revenueTotal = function () {
  return M.stats.revenus.reduce(
    (somme, jour) => ({ totalCents: somme.totalCents + jour.totalCents, commandes: somme.commandes + jour.commandes }),
    { totalCents: 0, commandes: 0 }
  );
};

/**
 * Un jour lisible et court.
 * . jour : « 2026-10-21 »
 * > par exemple « mer. 21 »
 */
M.dayLabel = function (jour) {
  let date = new Date(jour + "T00:00:00");
  if (Number.isNaN(date.getTime())) return jour;

  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" }).format(date);
};

/**
 * Le texte d'un stock : la quantité, et l'état s'il est à surveiller.
 * . ligne : { stock, statut }
 * > par exemple « 3 · Bientôt épuisé »
 */
M.stockText = function (ligne) {
  if (ligne.statut === "epuise") return "Épuisé";
  return ligne.statut === "bientot" ? `${ligne.stock} · Bientôt épuisé` : String(ligne.stock);
};

/**
 * Les barres de l'histogramme des stocks.
 * > [{ libelle, texte, pourcentage, attention }]
 */
M.stockBars = function () {
  let lignes = M.stats.stocks.map((ligne) => ({
    ...ligne,
    statut: statutStock(ligne.stock, M.stats.seuilBientotEpuise),
  }));
  let pourcentages = M.scale(lignes.map((ligne) => ligne.stock));

  return lignes.map((ligne, i) => ({
    libelle: ligne.produit,
    texte: M.stockText(ligne),
    pourcentage: pourcentages[i],
    attention: ligne.statut !== "disponible",
  }));
};

/**
 * Les barres des revenus, un jour par colonne.
 * > [{ libelle, texte, pourcentage, attention }]
 */
M.revenueBars = function () {
  let pourcentages = M.scale(M.stats.revenus.map((jour) => jour.totalCents));

  return M.stats.revenus.map((jour, i) => ({
    libelle: M.dayLabel(jour.jour),
    texte: formaterPrix(jour.totalCents),
    pourcentage: pourcentages[i],
    attention: false,
  }));
};

/**
 * Les barres de la répartition des commandes par statut.
 * > [{ libelle, texte, pourcentage, attention }]
 */
M.statusBars = function () {
  let nombres = STATUTS.map((statut) => M.stats.commandes.parStatut[statut] ?? 0);
  let pourcentages = M.scale(nombres);

  return STATUTS.map((statut, i) => ({
    libelle: libelleStatut(statut),
    texte: String(nombres[i]),
    pourcentage: pourcentages[i],
    attention: false,
  }));
};

/**
 * Les barres du classement des meilleures ventes.
 * > [{ libelle, texte, pourcentage, attention }]
 */
M.salesBars = function () {
  let ventes = M.stats.meilleuresVentes;
  let pourcentages = M.scale(ventes.map((vente) => vente.quantite));

  return ventes.map((vente, i) => ({
    libelle: `${i + 1}. ${vente.produit}`,
    texte: `${vente.quantite} ${vente.quantite > 1 ? "vendus" : "vendu"}`,
    pourcentage: pourcentages[i],
    attention: false,
  }));
};

/**
 * Le message de l'alerte de stock faible.
 * > { texte, attention } : jaune s'il y a des stocks à surveiller, bleu sinon
 */
M.alert = function () {
  let faibles = M.lowStocks();
  if (faibles.length === 0) {
    return { texte: "Aucun produit en stock faible.", attention: false };
  }

  let detail = faibles.map((ligne) => `${ligne.produit} (${ligne.statut === "epuise" ? "épuisé" : ligne.stock + " en stock"})`);
  return {
    texte: `Stock faible, à réapprovisionner : ${detail.join(", ")}.`,
    attention: true,
  };
};

/**
 * Les trois indicateurs du haut de page.
 * > [{ libelle, valeur, legende, icone, attention }]
 */
M.indicators = function () {
  let revenus = M.revenueTotal();
  let parStatut = M.stats.commandes.parStatut;
  let faibles = M.lowStocks().length;

  return [
    {
      libelle: "Revenus (7 jours)",
      valeur: formaterPrix(revenus.totalCents),
      legende: `${revenus.commandes} ${revenus.commandes > 1 ? "commandes" : "commande"}, annulées exclues`,
      icone: "commandes",
      attention: false,
    },
    {
      libelle: "Commandes",
      valeur: M.stats.commandes.total,
      legende: `${parStatut.en_cours} en cours · ${parStatut.prete} disponibles`,
      icone: "boite",
      attention: false,
    },
    {
      libelle: "Stocks faibles",
      valeur: faibles,
      legende: `Produits à ${M.stats.seuilBientotEpuise} en stock ou moins`,
      icone: "alerte",
      attention: faibles > 0,
    },
  ];
};

/**
 * Les lignes du fichier d'export : les quatre tableaux, séparés par une ligne vide.
 * > [[cellule]] prêt pour toCsv
 */
M.csvRows = function () {
  let stats = M.stats;
  let revenus = M.revenueTotal();

  return [
    ["Statistiques du back-office"],
    ["Chiffres relus le", formaterDate(stats.genereLe)],
    [],
    ["Stocks par produit"],
    ["Produit", "Catégorie", "Stock", "État"],
    ...stats.stocks.map((ligne) => {
      let statut = statutStock(ligne.stock, stats.seuilBientotEpuise);
      return [ligne.produit, ligne.categorie, ligne.stock, { disponible: "En stock", bientot: "Bientôt épuisé", epuise: "Épuisé" }[statut]];
    }),
    [],
    ["Revenus des 7 derniers jours (commandes annulées exclues)"],
    ["Jour", "Commandes", "Revenus (€)"],
    ...stats.revenus.map((jour) => [jour.jour, jour.commandes, montantCsv(jour.totalCents)]),
    ["Total", revenus.commandes, montantCsv(revenus.totalCents)],
    [],
    ["Commandes par statut"],
    ["Statut", "Nombre"],
    ...STATUTS.map((statut) => [libelleStatut(statut), stats.commandes.parStatut[statut] ?? 0]),
    ["Total", stats.commandes.total],
    [],
    ["Produits les plus vendus (commandes annulées exclues)"],
    ["Rang", "Produit", "Quantité", "Chiffre d'affaires (€)"],
    ...stats.meilleuresVentes.map((vente, i) => [i + 1, vente.produit, vente.quantite, montantCsv(vente.totalCents)]),
  ];
};

/**
 * Le nom du fichier d'export, daté du jour des chiffres.
 * > par exemple « statistiques-2026-10-21.csv »
 */
M.fileName = function () {
  return `statistiques-${M.stats.genereLe.slice(0, 10)}.csv`;
};

let C = {};

/**
 * Charge la session puis les statistiques. Sans session admin, retour à la connexion.
 * > true si la page peut s'afficher, false si on a redirigé
 */
C.charger = async function () {
  try {
    let session = await AdminData.me();
    if (!session.connecte) {
      goTo("/admin");
      return false;
    }
    M.stats = await StatsData.fetchDetail();
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return false;
    }
    M.message = { type: "erreur", texte: `Impossible de charger les statistiques : ${erreur.message}` };
  }
  return true;
};

/**
 * Clic sur « Actualiser » : relit tous les chiffres auprès du serveur.
 */
C.handler_refresh = async function () {
  M.message = null;

  if (!(await C.charger())) return;
  V.refresh(C.viewData(), 'button[data-action="actualiser"]');
};

/**
 * Clic sur « Exporter en CSV » : télécharge les chiffres affichés.
 */
C.handler_export = function () {
  if (M.stats === null) return;

  V.download(M.fileName(), toCsv(M.csvRows()));
  M.message = { type: "succes", texte: `Le fichier ${M.fileName()} a été téléchargé.` };
  V.refresh(C.viewData(), 'button[data-action="exporter"]');
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { email, sousTitre, message, alerte, actions, indicateurs, revenus, statuts, ventes, stocks } ;
 *   tout vaut null sauf email, sousTitre et message tant que le chargement n'a pas réussi
 */
C.viewData = function () {
  let base = {
    email: AdminData.knownEmail ?? "",
    sousTitre: "Stocks, revenus, commandes et meilleures ventes",
    message: M.message,
  };

  if (M.stats === null) {
    return { ...base, alerte: null, actions: null, indicateurs: null, revenus: null, statuts: null, ventes: null, stocks: null };
  }

  return {
    ...base,
    alerte: M.alert(),
    actions: { genereLe: `Chiffres relus le ${formaterDate(M.stats.genereLe)}` },
    indicateurs: M.indicators(),
    revenus: {
      titre: "Revenus des 7 derniers jours",
      legende: "Commandes passées chaque jour, annulées exclues",
      sens: "vertical",
      texteVide: "Aucun revenu sur la période.",
      barres: M.revenueBars(),
    },
    statuts: {
      titre: "Commandes par statut",
      legende: "Toutes les commandes, depuis le début",
      sens: "horizontal",
      texteVide: "Aucune commande.",
      barres: M.statusBars(),
    },
    ventes: {
      titre: "Produits les plus vendus",
      legende: "Quantités commandées depuis le début, annulées exclues",
      sens: "horizontal",
      texteVide: "Aucune vente pour le moment.",
      barres: M.salesBars(),
    },
    stocks: {
      titre: "Stocks par produit",
      legende: `Somme des formats de chaque produit ; en jaune, ${M.stats.seuilBientotEpuise} ou moins`,
      sens: "horizontal",
      texteVide: "Aucun produit au catalogue.",
      barres: M.stockBars(),
    },
  };
};

C.init = async function () {
  M.message = null;
  M.stats = null;

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

// Toute la page se reconstruit à partir du modèle.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  document.querySelector(focusSelector)?.focus();
};

// Déclenche le téléchargement d'un fichier texte construit dans le navigateur.
V.download = function (nom, contenu) {
  let url = URL.createObjectURL(new Blob([contenu], { type: "text/csv;charset=utf-8" }));
  let lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
};

V.createPageFragment = function (data) {
  let page = htmlToFragment(template);

  page.querySelector('slot[name="barre"]').replaceWith(
    BarreAdminView.dom({ section: "Statistiques", email: data.email })
  );
  page.querySelector('slot[name="entete"]').replaceWith(
    EnTetePageView.dom({ titre: "Statistiques", sousTitre: data.sousTitre, action: null })
  );
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

  // Sans statistiques (erreur de chargement) : seuls l'en-tête et le message restent.
  if (data.indicateurs === null) {
    ["alerte", "actions", "indicateurs", "revenus", "statuts", "ventes", "stocks"].map((nom) =>
      page.querySelector(`slot[name="${nom}"]`).remove()
    );
    return page;
  }

  page.querySelector('slot[name="alerte"]').replaceWith(BandeauInfoView.dom(data.alerte));
  page.querySelector('slot[name="actions"]').replaceWith(
    ActionsStatistiquesView.dom(data.actions, { surActualisation: C.handler_refresh, surExport: C.handler_export })
  );
  page.querySelector('slot[name="indicateurs"]').replaceWith(...data.indicateurs.map((indicateur) => IndicateurView.dom(indicateur)));
  ["revenus", "statuts", "ventes", "stocks"].map((nom) =>
    page.querySelector(`slot[name="${nom}"]`).replaceWith(GraphiqueBarresView.dom(data[nom]))
  );

  return page;
};

export function AdminStatistiquesPage() {
  return C.init();
}
