import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const VARIANTES = {
  info: { classes: "bg-bg-accent text-fg-default", classesIcone: "dark:invert", icone: IMAGES + "info.svg" },
  attention: { classes: "bg-bg-highlight text-fg-on-highlight", classesIcone: "", icone: IMAGES + "alerte.svg" },
};

// Bandeau d'information (bleu) ou d'attention (jaune) du back-office.
let BandeauInfoView = {
  /**
   * @param {{texte: string, attention?: boolean}} data - attention : vrai pour le bandeau jaune.
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    let variante = data.attention ? VARIANTES.attention : VARIANTES.info;
    return htmlToFragment(genericRenderer(template, { ...variante, texte: data.texte }));
  },
};

export { BandeauInfoView };
