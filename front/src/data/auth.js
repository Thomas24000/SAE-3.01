import { getRequest, postRequest } from "../lib/api-request.js";

let AuthData = {};

/**
 * Dernier e-mail connu du visiteur connecté, ou null. Mémoire du module :
 * le header, reconstruit à chaque navigation, peut ainsi l'afficher tout de
 * suite, sans attendre la réponse du serveur. Le serveur reste la référence.
 */
AuthData.knownEmail = null;

/**
 * Connexion : POST /api/login
 * En cas de succès, le serveur ouvre une session ; le cookie PHPSESSID qu'il
 * renvoie accompagnera ensuite chaque requête.
 */
AuthData.login = async function (email, mdp) {
  let reponse = await postRequest("login", { email, mdp });
  AuthData.knownEmail = reponse.email;
  return reponse;
};

/**
 * Inscription : POST /api/inscription
 * Crée un compte client et ouvre sa session. Réponse : { connecte, email, role }.
 * Lève une ErreurApi (400 champ invalide, 409 e-mail déjà utilisé).
 */
AuthData.register = async function (email, mdp, confirmation) {
  let reponse = await postRequest("inscription", { email, mdp, confirmation });
  AuthData.knownEmail = reponse.email;
  return reponse;
};

/**
 * Session courante : GET /api/me
 * Réponse : { connecte: false } ou { connecte: true, email, role }.
 */
AuthData.me = async function () {
  let reponse = await getRequest("me");
  AuthData.knownEmail = reponse.connecte ? reponse.email : null;
  return reponse;
};

/**
 * Déconnexion : POST /api/logout
 */
AuthData.logout = async function () {
  let reponse = await postRequest("logout");
  AuthData.knownEmail = null;
  return reponse;
};

export { AuthData };
