import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import { BadgeStockView } from "../badge-stock/index.js";
import template from "./template.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const BOUTON_ACHAT = "bg-bg-brand text-fg-on-brand hover:opacity-90";
const BOUTON_EPUISE = "cursor-not-allowed border border-border-default bg-bg-default text-fg-muted";

// Carte d'un produit, telle que la prépare la page :
// { nom, slug, description, teinte, image, prixMin, statutStock }
// statutStock vaut "disponible", "bientot" ou "epuise" (voir lib/stock.js).
let CarteProduitView = {
  dom: function (produit) {
    let epuise = produit.statutStock === "epuise";

    let fragment = htmlToFragment(
      genericRenderer(template, {
        nom: produit.nom,
        slug: produit.slug,
        teinte: produit.teinte,
        image: produit.image,
        prix: formaterPrix(produit.prixMin),
        desactive: epuise ? "disabled" : "",
        classes: epuise ? BOUTON_EPUISE : BOUTON_ACHAT,
        libelleBouton: epuise ? "Épuisé" : "Ajouter au panier",
      })
    );

    fragment.querySelector('slot[name="badge"]').replaceWith(BadgeStockView.dom(produit.statutStock));

    return fragment;
  },
};

export { CarteProduitView };
