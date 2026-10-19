import { getRequest, postRequest } from "../lib/api-request.js";

let AdminData = {};

/**
 * E-mail de l'administrateur connecté, ou null. Mémoire du module : le layout
 * du back-office, construit après la page, sait ainsi s'il doit afficher la
 * navigation. Le serveur reste la référence (voir AdminData.me).
 */
AdminData.knownEmail = null;

/**
 * Jeton CSRF de la session admin, ou null. Renvoyé par le serveur à la connexion
 * et par AdminData.me ; à joindre (en-tête X-CSRF-Token) à toute écriture admin.
 */
AdminData.csrf = null;

/**
 * Connexion administrateur : POST /api/admin/login
 *
 * Séparée de la connexion client (AuthData.login). Réponse : { connecte, email }.
 * Lève une ErreurApi (400 champ vide, 401 identifiants invalides ou compte
 * sans le rôle admin).
 */
AdminData.login = async function (email, mdp) {
  let reponse = await postRequest("admin/login", { email, mdp });
  AdminData.knownEmail = reponse.email;
  AdminData.csrf = reponse.csrf;
  return reponse;
};

/**
 * Session administrateur courante : GET /api/admin/me
 *
 * Réponse : { connecte: false } ou { connecte: true, email, csrf }.
 */
AdminData.me = async function () {
  let reponse = await getRequest("admin/me");
  AdminData.knownEmail = reponse.connecte ? reponse.email : null;
  AdminData.csrf = reponse.connecte ? reponse.csrf : null;
  return reponse;
};

/**
 * Déconnexion administrateur : POST /api/admin/logout
 *
 * Réponse : { connecte: false }. Une éventuelle connexion client reste ouverte.
 */
AdminData.logout = async function () {
  let reponse = await postRequest("admin/logout");
  AdminData.knownEmail = null;
  AdminData.csrf = null;
  return reponse;
};

export { AdminData };
