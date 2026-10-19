import { getRequest, postRequest } from "../lib/api-request.js";

let AuthData = {};

/**
 * Dernier identifiant connu du visiteur connecté, ou null. Mémoire du module :
 * le header, reconstruit à chaque navigation, peut ainsi l'afficher tout de
 * suite, sans attendre la réponse du serveur. Le serveur reste la référence.
 */
AuthData.knownLogin = null;

/**
 * Connexion : POST /api/login
 * En cas de succès, le serveur ouvre une session ; le cookie PHPSESSID qu'il
 * renvoie accompagnera ensuite chaque requête.
 */
AuthData.login = async function (login, mdp) {
  let reponse = await postRequest("login", { login, mdp });
  AuthData.knownLogin = reponse.login;
  return reponse;
};

/**
 * Inscription : POST /api/inscription
 * Crée un compte client et ouvre sa session. Réponse : { connecte, login, role }.
 * Lève une ErreurApi (400 champ invalide, 409 identifiant déjà pris).
 */
AuthData.register = async function (login, mdp, confirmation) {
  let reponse = await postRequest("inscription", { login, mdp, confirmation });
  AuthData.knownLogin = reponse.login;
  return reponse;
};

/**
 * Session courante : GET /api/me
 * Réponse : { connecte: false } ou { connecte: true, login, role }.
 */
AuthData.me = async function () {
  let reponse = await getRequest("me");
  AuthData.knownLogin = reponse.connecte ? reponse.login : null;
  return reponse;
};

/**
 * Déconnexion : POST /api/logout
 */
AuthData.logout = async function () {
  let reponse = await postRequest("logout");
  AuthData.knownLogin = null;
  return reponse;
};

export { AuthData };
