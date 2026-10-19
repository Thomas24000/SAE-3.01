import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
// Les icônes ont un trait sombre fixe : en thème sombre on les inverse, sauf
// sur la carte « attention », qui reste jaune dans les deux thèmes.
const VARIANTES = {
  normal: {
    classesCarte: "bg-bg-default text-fg-default",
    classesLibelle: "text-fg-muted",
    classesLegende: "text-fg-muted",
    classesIcone: "dark:invert",
  },
  attention: {
    classesCarte: "border-transparent bg-bg-highlight text-fg-on-highlight",
    classesLibelle: "text-fg-on-highlight",
    classesLegende: "text-fg-on-highlight",
    classesIcone: "",
  },
};

// Fichiers de public/images/admin/, par nom d'icône.
const ICONES = {
  boite: "boite.svg",
  commandes: "commandes.svg",
  etiquette: "etiquette.svg",
  alerte: "alerte.svg",
};

// Carte d'un indicateur du back-office : un libellé, une icône, un chiffre et
// une légende. Présentatif : la page prépare les textes, ce composant ne
// calcule rien.
let IndicateurView = {
  /**
   * @param {{libelle: string, valeur: string|number, legende: string,
   *          icone: "boite"|"commandes"|"etiquette"|"alerte",
   *          attention?: boolean}} data - attention : vrai pour une valeur à traiter (carte jaune).
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    return htmlToFragment(
      genericRenderer(template, {
        ...(data.attention ? VARIANTES.attention : VARIANTES.normal),
        libelle: data.libelle,
        valeur: data.valeur,
        legende: data.legende,
        icone: import.meta.env.BASE_URL + "images/admin/" + ICONES[data.icone],
      })
    );
  },
};

export { IndicateurView };
