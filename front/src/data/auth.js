import { getRequest, postRequest } from "../lib/api-request.js";

let AuthData = {};

/**
 * Dernier e-mail connu du visiteur connecté, ou null. Mémoire du module :
 * le header, reconstruit à chaque navigation, peut ainsi l'afficher tout de
 * suite, sans attendre la réponse du serveur. Le serveur reste la référence.
 */
AuthData.knownEmail = null;

/**
 * Durée (ms) pendant laquelle la session lue par me() est réutilisée. Le
 * serveur contrôle chaque route protégée : ce cache ne sert qu'à l'affichage.
 */
const DUREE_CACHE = 30000;

/** Dernière lecture de /api/me : { promesse, date }, ou null. */
let cache = null;

/**
 * Connexion : POST /api/login
 * En cas de succès, le serveur ouvre une session ; le cookie PHPSESSID qu'il
 * renvoie accompagnera ensuite chaque requête.
 */
AuthData.login = async function (email, mdp) {
  cache = null;
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
  cache = null;
  let reponse = await postRequest("inscription", { email, mdp, confirmation });
  AuthData.knownEmail = reponse.email;
  return reponse;
};

/**
 * Session courante : GET /api/me
 * Réponse : { connecte: false } ou { connecte: true, email, role }.
 *
 * Réutilise la lecture de moins de 30 s (et celle en cours, si deux appels
 * se croisent). `forcer` relit le serveur : à utiliser quand la décision doit
 * être sûre, par exemple sur la page de connexion.
 */
AuthData.me = function (forcer = false) {
  if (!forcer && cache !== null && Date.now() - cache.date < DUREE_CACHE) {
    return cache.promesse;
  }
  let promesse = getRequest("me").then((reponse) => {
    AuthData.knownEmail = reponse.connecte ? reponse.email : null;
    return reponse;
  });
  let entree = { promesse, date: Date.now() };
  cache = entree;
  // Un échec n'est pas mémorisé : le prochain appel réessaie.
  promesse.catch(() => {
    if (cache === entree) cache = null;
  });
  return promesse;
};

/**
 * Déconnexion : POST /api/logout
 */
AuthData.logout = async function () {
  cache = null;
  let reponse = await postRequest("logout");
  AuthData.knownEmail = null;
  return reponse;
};

export { AuthData };
