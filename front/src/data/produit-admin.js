import { getRequest, postRequest, postFormRequest } from "../lib/api-request.js";
import { AdminData } from "./admin.js";

let ProduitAdminData = {};

/**
 * En-têtes d'une écriture admin : le jeton CSRF reçu à la connexion.
 */
let entetes = function () {
  return { "X-CSRF-Token": AdminData.csrf ?? "" };
};

/**
 * L'API renvoie les chemins d'images depuis la racine du site : on y ajoute le
 * chemin du projet pour obtenir l'adresse réelle.
 */
let adresse = function (chemin) {
  return import.meta.env.BASE_URL + chemin;
};

/**
 * Les images d'un produit, avec leurs adresses réelles.
 * { id, chemin, miniature, principale } devient { id, src, miniature, principale }.
 */
let imagesAvecAdresses = function (images) {
  return images.map((image) => ({
    id: image.id,
    src: adresse(image.chemin),
    miniature: adresse(image.miniature),
    principale: image.principale,
  }));
};

/**
 * Tous les produits : GET /api/admin/produits
 *
 * { produits: [{ id, nom, slug, categorieId, categorie, image, miniature, prixMin, stock,
 *   nombreFormats, nombreImages }], categories: [{ id, libelle }], seuilBientotEpuise }
 * Les prix sont en centimes ; image et miniature sont des adresses réelles.
 * Lève une ErreurApi (401 sans session administrateur).
 */
ProduitAdminData.fetchAll = async function () {
  let reponse = await getRequest("admin/produits");

  reponse.produits = reponse.produits.map((produit) => ({
    ...produit,
    image: adresse(produit.image),
    miniature: adresse(produit.miniature),
  }));

  return reponse;
};

/**
 * Un produit complet : GET /api/admin/produit?id=
 *
 * { produit: { id, nom, slug, categorieId, description, descriptionLongue, ingredients,
 *   variantes: [{ id, libelle, prixCents, stock }], images: [{ id, src, miniature, principale }] },
 *   categories, seuilBientotEpuise }
 * Lève une ErreurApi (401, 404 si le produit n'existe pas).
 */
ProduitAdminData.fetchOne = async function (id) {
  let reponse = await getRequest(`admin/produit?id=${encodeURIComponent(id)}`);

  reponse.produit.images = imagesAvecAdresses(reponse.produit.images);

  return reponse;
};

/**
 * Crée un produit : POST /api/admin/produits
 *
 * produit : { nom, categorieId, description, descriptionLongue, ingredients,
 * variantes: [{ libelle, prixCents, stock }] }. Réponse : { produit: { id, nom, slug } }
 * Lève une ErreurApi (400 champ invalide, 403 jeton CSRF, 409 nom déjà pris).
 */
ProduitAdminData.create = async function (produit) {
  return postRequest("admin/produits", produit, entetes());
};

/**
 * Modifie un produit et ses formats : POST /api/admin/produits/modifier
 *
 * produit : comme pour create, plus id ; un format avec id est mis à jour, sans id
 * il est créé, et un format absent est supprimé. Réponse : { produit }
 * Lève une ErreurApi (400, 403, 404, 409).
 */
ProduitAdminData.update = async function (produit) {
  return postRequest("admin/produits/modifier", produit, entetes());
};

/**
 * Supprime un produit : POST /api/admin/produits/supprimer
 *
 * Réponse : { supprime: true }. Lève une ErreurApi (403, 404).
 */
ProduitAdminData.remove = async function (id) {
  return postRequest("admin/produits/supprimer", { id }, entetes());
};

/**
 * Téléverse des images : POST /api/admin/produits/images?id= (multipart)
 *
 * files : tableau de File. Réponse : { images } (voir fetchOne). Le serveur contrôle
 * le contenu, redimensionne et crée les miniatures.
 * Lève une ErreurApi (400 fichier refusé ou trop d'images, 403, 404).
 */
ProduitAdminData.uploadImages = async function (id, files) {
  let formulaire = new FormData();
  files.map((fichier) => formulaire.append("images[]", fichier));

  let reponse = await postFormRequest(`admin/produits/images?id=${encodeURIComponent(id)}`, formulaire, entetes());
  reponse.images = imagesAvecAdresses(reponse.images);
  return reponse;
};

/**
 * Retire une image : POST /api/admin/produits/images/supprimer
 *
 * Réponse : { images }. Lève une ErreurApi (403, 404).
 */
ProduitAdminData.removeImage = async function (id, imageId) {
  let reponse = await postRequest("admin/produits/images/supprimer", { id, imageId }, entetes());
  reponse.images = imagesAvecAdresses(reponse.images);
  return reponse;
};

/**
 * Définit l'image principale (celle de la carte produit) :
 * POST /api/admin/produits/images/principale
 *
 * Réponse : { images }. Lève une ErreurApi (403, 404).
 */
ProduitAdminData.setMainImage = async function (id, imageId) {
  let reponse = await postRequest("admin/produits/images/principale", { id, imageId }, entetes());
  reponse.images = imagesAvecAdresses(reponse.images);
  return reponse;
};

/**
 * Fixe le seuil « Bientôt épuisé » : POST /api/admin/parametres/seuil
 *
 * Réponse : { seuilBientotEpuise }. Lève une ErreurApi (400 seuil invalide, 403).
 */
ProduitAdminData.saveThreshold = async function (seuil) {
  return postRequest("admin/parametres/seuil", { seuil }, entetes());
};

export { ProduitAdminData };
