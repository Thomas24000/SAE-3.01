import { AdminData } from "../../data/admin.js";
import { ToppingAdminData } from "../../data/topping-admin.js";
import { goTo } from "../../lib/navigation.js";
import { statutStock } from "../../lib/stock.js";
import { htmlToFragment } from "../../lib/utils.js";
import { BandeauInfoView } from "../../ui/bandeau-info/index.js";
import { BarreAdminView } from "../../ui/barre-admin/index.js";
import { EnTetePageView } from "../../ui/en-tete-page/index.js";
import { ListeToppingsView } from "../../ui/liste-toppings/index.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";

/**
 * Page « Toppings » du back-office (/admin/toppings) : les doses en stock de
 * chaque topping, commun à tous les produits, et leur réapprovisionnement.
 *
 * M : les toppings, la saisie de chacun, le seuil, les messages. V : les gabarits.
 * C : charge, valide la saisie, enregistre un stock.
 */

const STOCK_MAX = 1000000;

let M = {
  toppings: [], // [{ id, libelle, supplementCents, stock, nombreCategories, saisie, enCours, message }]
  seuil: 5, // seuil « Bientôt épuisé » enregistré
  message: null, // { type, texte } de la page, ou null
};

/**
 * Le topping qui porte cet identifiant.
 * . id : l'identifiant cherché
 * > le topping, ou undefined s'il n'existe pas
 */
M.find = function (id) {
  return M.toppings.find((topping) => topping.id === id);
};

/**
 * Un stock saisi converti en entier.
 * . texte : la saisie
 * > un entier entre 0 et 1 000 000, ou null si la saisie n'est pas valide
 */
M.textToStock = function (texte) {
  let propre = texte.trim();
  if (!/^\d{1,7}$/.test(propre)) return null;
  let stock = Number(propre);
  return stock <= STOCK_MAX ? stock : null;
};

/**
 * Range les toppings reçus du serveur : la saisie de chacun commence au stock enregistré.
 * . reponse : { toppings, seuilBientotEpuise }
 */
M.setToppings = function (reponse) {
  M.toppings = reponse.toppings.map((topping) => ({
    ...topping,
    saisie: String(topping.stock),
    enCours: false,
    message: null,
  }));
  M.seuil = reponse.seuilBientotEpuise;
};

/**
 * Le sous-titre de la page : nombre de toppings et de toppings en alerte.
 * > un texte, par exemple « 8 toppings · 2 à réapprovisionner »
 */
M.subtitle = function () {
  let n = M.toppings.length;
  let alertes = M.toppings.filter((topping) => topping.stock <= M.seuil).length;

  return `${n} ${n > 1 ? "toppings" : "topping"} · ${alertes} à réapprovisionner`;
};

let C = {};

/**
 * Charge la session puis les toppings. Sans session admin, retour à la connexion.
 * > true si la page peut s'afficher, false si on a redirigé
 */
C.charger = async function () {
  try {
    let session = await AdminData.me();
    if (!session.connecte) {
      goTo("/admin");
      return false;
    }
    M.setToppings(await ToppingAdminData.fetchAll());
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return false;
    }
    M.toppings = [];
    M.message = { type: "erreur", texte: erreur.message };
  }
  return true;
};

/**
 * Frappe dans un champ de stock : on garde le texte pour les réaffichages.
 * . id : le topping
 * . texte : la saisie
 */
C.handler_input = function (id, texte) {
  let topping = M.find(id);
  if (topping !== undefined) topping.saisie = texte;
};

/**
 * Clic sur « Enregistrer » d'une ligne : valide, envoie, met la ligne à jour.
 * . id : le topping
 * . texte : le stock saisi
 */
C.handler_saveStock = async function (id, texte) {
  let topping = M.find(id);
  if (topping === undefined) return;

  topping.saisie = texte;
  topping.message = null;

  let stock = M.textToStock(texte);
  if (stock === null) {
    topping.message = { type: "erreur", texte: `Le stock doit être un nombre entier entre 0 et ${STOCK_MAX.toLocaleString("fr-FR")}.` };
    V.refresh(C.viewData(), `[data-id="${id}"] input[name="stock"]`);
    return;
  }

  topping.enCours = true;
  V.refresh(C.viewData(), null);

  try {
    let reponse = await ToppingAdminData.saveStock(id, stock);
    topping.stock = reponse.topping.stock;
    topping.saisie = String(reponse.topping.stock);
    topping.message = { type: "succes", texte: "Le stock a été enregistré." };
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    topping.message = { type: "erreur", texte: erreur.message };
  }

  topping.enCours = false;
  V.refresh(C.viewData(), `[data-id="${id}"] input[name="stock"]`);
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { email, sousTitre, toppings (chacun avec son statut de stock), message }
 */
C.viewData = function () {
  return {
    email: AdminData.knownEmail ?? "",
    sousTitre: M.subtitle(),
    toppings: M.toppings.map((topping) => ({ ...topping, statut: statutStock(topping.stock, M.seuil) })),
    message: M.message,
  };
};

C.init = async function () {
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

// Toute la page se reconstruit à partir du modèle ; les saisies survivent parce
// qu'elles sont dans le modèle.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  if (focusSelector !== null) document.querySelector(focusSelector)?.focus();
};

V.createPageFragment = function (data) {
  let page = htmlToFragment(template);

  page.querySelector('slot[name="barre"]').replaceWith(
    BarreAdminView.dom({ section: "Toppings", email: data.email })
  );
  page.querySelector('slot[name="entete"]').replaceWith(
    EnTetePageView.dom({ titre: "Toppings", sousTitre: data.sousTitre, action: null })
  );
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));
  page.querySelector('slot[name="bandeau"]').replaceWith(
    BandeauInfoView.dom({
      texte:
        "Une commande consomme une dose par topping choisi, quel que soit le nombre de pots. Le stock est commun à tous les produits qui proposent le topping.",
    })
  );
  page.querySelector('slot[name="liste"]').replaceWith(
    ListeToppingsView.dom(data.toppings, {
      surSaisie: C.handler_input,
      surEnregistrement: C.handler_saveStock,
    })
  );

  return page;
};

export function AdminToppingsPage() {
  return C.init();
}
