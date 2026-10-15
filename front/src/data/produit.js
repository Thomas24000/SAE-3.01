import { getRequest } from "../lib/api-request.js";

let ProduitData = {};

/**
 * Le catalogue des produits : GET /api/produits
 *
 * La réponse contient { produits, total }. Chaque produit est de la forme
 * { id, nom, slug, description, teinte, image, categorie, prixMin } ; prixMin est un
 * prix en centimes, celui de la variante la moins chère.
 */
ProduitData.fetchAll = async function () {
  let reponse = await getRequest("produits");

  // L'API renvoie le chemin de l'image depuis la racine du site : on y ajoute
  // le chemin du projet pour obtenir l'adresse réelle.
  reponse.produits = reponse.produits.map((produit) => ({
    ...produit,
    image: import.meta.env.BASE_URL + produit.image,
  }));

  return reponse;
};

export { ProduitData };
