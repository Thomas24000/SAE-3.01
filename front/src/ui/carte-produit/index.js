import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { formaterPrix } from "../../lib/format.js";
import template from "./template.html?raw";

// Carte d'un produit, tel que le renvoie l'API :
// { nom, slug, description, teinte, image, categorie, prixMin }
let CarteProduitView = {
  html: function (produit) {
    return genericRenderer(template, {
      nom: produit.nom,
      slug: produit.slug,
      description: produit.description,
      categorie: produit.categorie,
      teinte: produit.teinte,
      image: produit.image,
      prix: formaterPrix(produit.prixMin),
    });
  },

  dom: function (produit) {
    return htmlToFragment(CarteProduitView.html(produit));
  },
};

export { CarteProduitView };
