import { getRequest } from "../lib/api-request.js";

let ProduitData = {};

/**
 * Le catalogue des produits : GET /api/produits
 *
 * La réponse contient { produits, total }. Chaque produit est de la forme
 * { id, nom, slug, description, teinte, categorie, prixMin } ; prixMin est un
 * prix en centimes, celui de la variante la moins chère.
 */
ProduitData.fetchAll = async function () {
  return getRequest("produits");
};

export { ProduitData };
