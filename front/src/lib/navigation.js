/**
 * Navigation déclenchée par le code d'une page (redirection).
 *
 * Le routeur gère les clics sur les liens `data-link` et le bouton Précédent ;
 * ce module sert quand une page doit changer d'adresse d'elle-même, par
 * exemple renvoyer un visiteur non connecté vers /connexion.
 */

// Chemin du projet sans la barre finale, comme le fait le routeur.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Affiche la page de ce chemin, sans recharger le navigateur.
 *
 * Le routeur écoute `popstate` : on lui signale le changement d'adresse comme
 * le ferait le bouton Précédent.
 *
 * @param {string} path - chemin de route, éventuellement suivi d'une query
 *   string, sans le chemin du projet (ex. "/connexion?retour=%2Fpanier").
 */
export function goTo(path) {
  window.history.pushState(null, "", BASE + path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * Réaffiche la page courante, comme si on venait d'y arriver : elle relit ses
 * données et le layout reconstruit le header. Sert après un changement de
 * session (déconnexion) qui touche tout ce qui est affiché.
 */
export function reload() {
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * Valeur d'un paramètre de la query string de l'adresse courante.
 *
 * @param {string} name - nom du paramètre.
 * @returns {string|null} la valeur, ou null si le paramètre est absent.
 */
export function readQuery(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Chemin de retour sûr après une connexion.
 *
 * Seul un chemin interne est accepté ; tout le reste (adresse externe,
 * « //site.com », valeur absente) renvoie à l'accueil. Cela empêche un lien
 * piégé d'envoyer l'utilisateur hors du site après sa connexion.
 *
 * @param {string|null} raw - la valeur lue dans l'adresse.
 * @returns {string} un chemin de route interne.
 */
export function safeReturnPath(raw) {
  if (typeof raw === "string" && /^\/(?!\/)[a-z0-9/-]*$/.test(raw)) return raw;
  return "/";
}
