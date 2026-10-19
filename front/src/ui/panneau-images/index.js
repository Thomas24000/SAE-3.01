import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { MessageView } from "../message/index.js";
import template from "./template.html?raw";
import templateDepot from "./depot.html?raw";
import templateVignette from "./vignette.html?raw";
import templateBadge from "./badge-principale.html?raw";
import templateBoutonPrincipale from "./bouton-principale.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

// Panneau « Images » d'un produit : zone de dépôt, vignettes, image principale
// (étoile) et suppression. Un produit pas encore enregistré n'a pas d'images :
// le panneau l'explique au lieu d'offrir la zone de dépôt.
let PanneauImagesView = {
  /**
   * @param {{actif: boolean, enCours: boolean, images: Array<{id: number, miniature: string, principale: boolean}>,
   *          message: ({type: string, texte: string}|null)}} data - actif : faux tant que le
   *   produit n'est pas enregistré ; enCours : vrai pendant un envoi.
   * @param {{surFichiers: function(File[]): void, surPrincipale: function(number): void,
   *          surSuppression: function(number): void}} actions - surFichiers reçoit les fichiers
   *   choisis ou déposés, sans les avoir contrôlés.
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        aide: data.actif
          ? "L'image principale s'affiche sur la carte produit. Choisissez-la avec l'étoile."
          : "Enregistrez d'abord le produit : vous pourrez ensuite ajouter ses images.",
      })
    );
    fragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

    let slotDepot = fragment.querySelector('slot[name="depot"]');
    let slotVignettes = fragment.querySelector('slot[name="vignettes"]');

    if (!data.actif) {
      slotDepot.remove();
      slotVignettes.remove();
      return fragment;
    }

    slotDepot.replaceWith(
      htmlToFragment(
        genericRenderer(templateDepot, {
          images: IMAGES,
          titre: data.enCours ? "Envoi en cours…" : "Glissez vos images ici ou cliquez pour parcourir",
          enCours: String(data.enCours),
          desactive: data.enCours ? "disabled" : "",
        })
      )
    );

    slotVignettes.replaceWith(
      ...data.images.map((image, index) => {
        let alt = `Image ${index + 1}`;
        let vignette = htmlToFragment(
          genericRenderer(templateVignette, {
            id: image.id,
            src: image.miniature,
            alt,
            images: IMAGES,
            classesBordure: image.principale ? "border-border-strong" : "border-transparent",
          })
        );
        vignette
          .querySelector('slot[name="principale"]')
          .replaceWith(
            image.principale
              ? htmlToFragment(templateBadge)
              : htmlToFragment(genericRenderer(templateBoutonPrincipale, { id: image.id, alt, images: IMAGES }))
          );
        return vignette;
      })
    );

    let racine = fragment.firstElementChild;
    let depot = racine.querySelector("[data-depot]");
    let champ = racine.querySelector('input[name="fichiers"]');

    // Choix par la fenêtre de parcours.
    champ.addEventListener("change", () => {
      let fichiers = Array.from(champ.files);
      champ.value = "";
      if (fichiers.length > 0) actions.surFichiers(fichiers);
    });

    // Glisser-déposer : sans preventDefault sur dragover, le navigateur ouvrirait le fichier.
    depot.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      depot.classList.add("border-border-strong");
    });
    depot.addEventListener("dragleave", () => depot.classList.remove("border-border-strong"));
    depot.addEventListener("drop", (ev) => {
      ev.preventDefault();
      depot.classList.remove("border-border-strong");
      let fichiers = Array.from(ev.dataTransfer.files);
      if (!data.enCours && fichiers.length > 0) actions.surFichiers(fichiers);
    });

    // Délégation : un seul écouteur pour les boutons des vignettes.
    racine.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button[data-action]");
      if (bouton === null) return;
      let id = Number(bouton.dataset.id);
      if (bouton.dataset.action === "principale") actions.surPrincipale(id);
      if (bouton.dataset.action === "supprimer") actions.surSuppression(id);
    });

    return fragment;
  },
};

export { PanneauImagesView };
