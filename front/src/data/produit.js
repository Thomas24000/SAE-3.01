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

/**
 * La fiche d'un produit : GET /api/produit?slug=…
 *
 * La réponse contient { produit } avec produit de la forme
 * { id, nom, slug, description, descriptionLongue, ingredients, teinte, image,
 * images: [chemin], categorie: { libelle, slug },
 * variantes: [{ id, libelle, prixCents, stock }] }. Les prix sont en centimes.
 *
 * Lève une ErreurApi (statut 404 si le produit n'existe pas).
 */
ProduitData.fetchOne = async function (slug) {
  let reponse = await getRequest(`produit?slug=${encodeURIComponent(slug)}`);

  reponse.produit.image = import.meta.env.BASE_URL + reponse.produit.image;
  reponse.produit.images = reponse.produit.images.map((chemin) => import.meta.env.BASE_URL + chemin);

  return reponse;
};

/**
 * Les variantes d'un panier : GET /api/panier?ids=3,5
 *
 * La réponse contient { variantes }. Chaque variante est de la forme
 * { variantId, libelle, prixCents, produit: { nom, slug, image, teinte } }.
 * Les prix sont en centimes. Une variante inconnue du serveur est absente de la
 * liste (la page doit la retirer du panier).
 *
 * Lève une ErreurApi (statut 400 si les identifiants sont invalides).
 *
 * @param {number[]} ids - les identifiants des variantes du panier (au moins un).
 */
ProduitData.fetchVariantes = async function (ids) {
  let reponse = await getRequest(`panier?ids=${encodeURIComponent(ids.join(","))}`);

  reponse.variantes = reponse.variantes.map((variante) => ({
    ...variante,
    produit: { ...variante.produit, image: import.meta.env.BASE_URL + variante.produit.image },
  }));

  return reponse;
};

export { ProduitData };
