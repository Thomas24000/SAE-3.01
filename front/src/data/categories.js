import { getRequest, postRequest } from "../lib/api-request.js";
import { AdminData } from "./admin.js";

let CategorieData = {};

/**
 * En-têtes d'une écriture admin : le jeton CSRF reçu à la connexion.
 */
let entetes = function () {
  return { "X-CSRF-Token": AdminData.csrf ?? "" };
};

/**
 * Les catégories : GET /api/admin/categories
 *
 * { categories: [{ id, libelle, slug, description, nombreProduits }], totalProduits }
 * Lève une ErreurApi (401 sans session administrateur).
 */
CategorieData.fetchAll = async function () {
  return getRequest("admin/categories");
};

/**
 * Crée une catégorie : POST /api/admin/categories
 *
 * Réponse : { categorie: { id, libelle, slug, description } }
 * Lève une ErreurApi (400 champ invalide, 403 jeton CSRF, 409 nom déjà pris).
 */
CategorieData.create = async function (libelle, description) {
  return postRequest("admin/categories", { libelle, description }, entetes());
};

/**
 * Modifie une catégorie : POST /api/admin/categories/modifier
 *
 * Réponse : { categorie: { id, libelle, slug, description } }
 * Lève une ErreurApi (400, 403, 404 inconnue, 409 nom déjà pris).
 */
CategorieData.update = async function (id, libelle, description) {
  return postRequest("admin/categories/modifier", { id, libelle, description }, entetes());
};

/**
 * Supprime une catégorie : POST /api/admin/categories/supprimer
 *
 * reaffecterVers : id de la catégorie qui reçoit les produits. Obligatoire si
 * la catégorie en contient, sinon le serveur répond 409.
 * Réponse : { supprimee: true, reaffectes }
 * Lève une ErreurApi (400 cible invalide, 403, 404, 409 réaffectation requise).
 */
CategorieData.remove = async function (id, reaffecterVers = null) {
  let corps = { id };
  if (reaffecterVers !== null) corps.reaffecterVers = reaffecterVers;
  return postRequest("admin/categories/supprimer", corps, entetes());
};

export { CategorieData };
