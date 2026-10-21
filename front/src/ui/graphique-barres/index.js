import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateHorizontale from "./horizontale.html?raw";
import templateLigne from "./ligne-horizontale.html?raw";
import templateVerticale from "./verticale.html?raw";
import templateColonne from "./colonne-verticale.html?raw";
import templateVide from "./vide.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const COULEURS = {
  normal: "bg-bg-brand",
  attention: "bg-bg-highlight",
};

// Histogramme du back-office, sans bibliothèque : des barres horizontales (une
// ligne par élément, pour les libellés longs) ou verticales (une colonne par
// élément, pour une série courte comme les 7 jours). La valeur est toujours
// écrite en toutes lettres à côté de la barre : la couleur ne porte jamais seule
// l'information. Présentatif : la page calcule les pourcentages et les textes.
let GraphiqueBarresView = {
  /**
   * @param {{titre: string, legende: string, sens: "horizontal"|"vertical", texteVide: string,
   *          barres: Array<{libelle: string, texte: string, pourcentage: number, attention: boolean}>}} data -
   *   pourcentage : la longueur de la barre, de 0 à 100 ; texte : la valeur affichée ;
   *   attention : vrai pour une barre à signaler (jaune) ; texteVide : le message si barres est vide.
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    let fragment = htmlToFragment(genericRenderer(template, { titre: data.titre, legende: data.legende }));
    let slot = fragment.querySelector('slot[name="barres"]');

    if (data.barres.length === 0) {
      slot.replaceWith(htmlToFragment(genericRenderer(templateVide, { texte: data.texteVide })));
      return fragment;
    }

    let horizontal = data.sens === "horizontal";
    let liste = htmlToFragment(horizontal ? templateHorizontale : templateVerticale);
    let elements = data.barres.map((barre) =>
      htmlToFragment(
        genericRenderer(horizontal ? templateLigne : templateColonne, {
          libelle: barre.libelle,
          texte: barre.texte,
          pourcentage: barre.pourcentage,
          classes: barre.attention ? COULEURS.attention : COULEURS.normal,
        })
      )
    );
    liste.querySelector(horizontal ? 'slot[name="lignes"]' : 'slot[name="colonnes"]').replaceWith(...elements);
    slot.replaceWith(liste);

    return fragment;
  },
};

export { GraphiqueBarresView };
