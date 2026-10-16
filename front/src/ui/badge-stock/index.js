import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const BADGES = {
  disponible: { libelle: "En stock", classes: "bg-bg-success text-fg-on-success" },
  bientot: { libelle: "Bientôt épuisé", classes: "bg-bg-highlight text-fg-on-highlight" },
  epuise: { libelle: "Épuisé", classes: "bg-bg-muted text-fg-on-muted" },
};

// Badge de stock. statut vaut "disponible", "bientot" ou "epuise" (voir lib/stock.js).
let BadgeStockView = {
  html: function (statut) {
    return genericRenderer(template, BADGES[statut]);
  },

  dom: function (statut) {
    return htmlToFragment(BadgeStockView.html(statut));
  },
};

export { BadgeStockView };
