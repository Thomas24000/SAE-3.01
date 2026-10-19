import { getRequest, postRequest } from "../lib/api-request.js";

let AuthData = {};

/**
 * Connexion : POST /api/login
 * En cas de succès, le serveur ouvre une session ; le cookie PHPSESSID qu'il
 * renvoie accompagnera ensuite chaque requête.
 */
AuthData.login = async function (login, mdp) {
  return postRequest("login", { login, mdp });
};

/**
 * Inscription : POST /api/inscription
 * Crée un compte client et ouvre sa session. Réponse : { connecte, login, role }.
 * Lève une ErreurApi (400 champ invalide, 409 identifiant déjà pris).
 */
AuthData.register = async function (login, mdp, confirmation) {
  return postRequest("inscription", { login, mdp, confirmation });
};

/**
 * Session courante : GET /api/me
 * Réponse : { connecte: false } ou { connecte: true, login, role }.
 */
AuthData.me = async function () {
  return getRequest("me");
};

/**
 * Déconnexion : POST /api/logout
 */
AuthData.logout = async function () {
  return postRequest("logout");
};

export { AuthData };
