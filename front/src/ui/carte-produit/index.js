import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import { BadgeStockView } from "../badge-stock/index.js";
import template from "./template.html?raw";
import templateChoisir from "./bouton-choisir.html?raw";
import templateEpuise from "./bouton-epuise.html?raw";

// Carte d'un produit, telle que la prépare la page :
// { nom, slug, description, teinte, image, prixMin, statutStock }
// statutStock vaut "disponible", "bientot" ou "epuise" (voir lib/stock.js).
// Le format se choisit sur la fiche : la carte propose un lien vers elle, ou un
// bouton désactivé « Épuisé ».
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
      })
    );

    fragment
      .querySelector('slot[name="action"]')
      .replaceWith(htmlToFragment(epuise ? templateEpuise : genericRenderer(templateChoisir, { slug: produit.slug, nom: produit.nom })));
    fragment.querySelector('slot[name="badge"]').replaceWith(BadgeStockView.dom(produit.statutStock));

    return fragment;
  },
};

export { CarteProduitView };
