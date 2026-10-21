import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLigne from "./ligne.html?raw";
import templateSupprimer from "./supprimer.html?raw";
import templateVide from "./vide.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const ETATS = {
  actif: { libelle: "Actif", classes: "bg-bg-success text-fg-on-success" },
  inactif: { libelle: "Désactivé", classes: "bg-bg-muted text-fg-on-muted" },
};

// Tableau des codes promotionnels du back-office, avec leurs statistiques
// d'utilisation (cartes empilées en mobile). Présentatif : la page prépare les textes.
let ListeCodesPromoView = {
  /**
   * @param {Array<{id: number, code: string, actif: boolean, remise: string, utilisations: string,
   *          reductions: string, chiffre: string, derniere: string, supprimable: boolean}>} codes -
   *   remise, reductions, chiffre et derniere sont déjà lisibles ; supprimable : faux dès qu'une
   *   commande a utilisé le code (le bouton « Supprimer » n'est alors pas proposé).
   * @param {{surSuppression: function(number): void}} actions - appelée avec l'id du code
   *   dont on a cliqué « Supprimer ».
   * @returns {DocumentFragment}
   */
  dom: function (codes, actions) {
    let fragment = htmlToFragment(template);

    let lignes =
      codes.length === 0
        ? [htmlToFragment(templateVide)]
        : codes.map((code) => {
            let etat = code.actif ? ETATS.actif : ETATS.inactif;
            let ligne = htmlToFragment(
              genericRenderer(templateLigne, {
                code: code.code,
                etat: etat.libelle,
                classesEtat: etat.classes,
                remise: code.remise,
                utilisations: code.utilisations,
                reductions: code.reductions,
                chiffre: code.chiffre,
                derniere: code.derniere,
                href: `/admin/codes-promo/${code.id}/modifier`,
                images: IMAGES,
              })
            );
            let slot = ligne.querySelector('slot[name="supprimer"]');
            if (code.supprimable) {
              slot.replaceWith(htmlToFragment(genericRenderer(templateSupprimer, { id: code.id, code: code.code, images: IMAGES })));
            } else {
              slot.remove();
            }
            return ligne;
          });
    fragment.querySelector('slot[name="lignes"]').replaceWith(...lignes);

    // Délégation : un seul écouteur sur la racine.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let bouton = ev.target.closest('button[data-action="supprimer"]');
      if (bouton === null) return;
      actions.surSuppression(Number(bouton.dataset.id));
    });

    return fragment;
  },
};

export { ListeCodesPromoView };
