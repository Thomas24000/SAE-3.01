import { libelleStatut } from "../../lib/statut-commande.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const CLASSES = {
  en_cours: "bg-bg-highlight text-fg-on-highlight",
  prete: "bg-bg-accent text-fg-default",
  retiree: "bg-bg-success text-fg-on-success",
  annulee: "bg-bg-muted text-fg-on-muted",
};

// Badge du statut d'une commande. statut vaut "en_cours", "prete", "retiree" ou "annulee".
let BadgeStatutCommandeView = {
  html: function (statut) {
    return genericRenderer(template, { classes: CLASSES[statut] ?? CLASSES.annulee, libelle: libelleStatut(statut) });
  },

  dom: function (statut) {
    return htmlToFragment(BadgeStatutCommandeView.html(statut));
  },
};

export { BadgeStatutCommandeView };
