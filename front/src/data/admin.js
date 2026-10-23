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
 * Durée (ms) pendant laquelle la session lue par me() est réutilisée. Le
 * serveur contrôle chaque route admin : ce cache ne sert qu'à l'affichage et
 * à retrouver le jeton CSRF.
 */
const DUREE_CACHE = 30000;

/** Dernière lecture de /api/admin/me : { promesse, date }, ou null. */
let cache = null;

/**
 * Connexion administrateur : POST /api/admin/login
 *
 * Séparée de la connexion client (AuthData.login). Réponse : { connecte, email }.
 * Lève une ErreurApi (400 champ vide, 401 identifiants invalides ou compte
 * sans le rôle admin).
 */
AdminData.login = async function (email, mdp) {
  cache = null;
  let reponse = await postRequest("admin/login", { email, mdp });
  AdminData.knownEmail = reponse.email;
  AdminData.csrf = reponse.csrf;
  return reponse;
};

/**
 * Session administrateur courante : GET /api/admin/me
 *
 * Réponse : { connecte: false } ou { connecte: true, email, csrf }.
 *
 * Réutilise la lecture de moins de 30 s (et celle en cours, si deux appels
 * se croisent). `forcer` relit le serveur, comme sur l'écran de connexion.
 */
AdminData.me = function (forcer = false) {
  if (!forcer && cache !== null && Date.now() - cache.date < DUREE_CACHE) {
    return cache.promesse;
  }
  let promesse = getRequest("admin/me").then((reponse) => {
    AdminData.knownEmail = reponse.connecte ? reponse.email : null;
    AdminData.csrf = reponse.connecte ? reponse.csrf : null;
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
 * Déconnexion administrateur : POST /api/admin/logout
 *
 * Réponse : { connecte: false }. Une éventuelle connexion client reste ouverte.
 */
AdminData.logout = async function () {
  cache = null;
  let reponse = await postRequest("admin/logout");
  AdminData.knownEmail = null;
  AdminData.csrf = null;
  return reponse;
};

export { AdminData };
