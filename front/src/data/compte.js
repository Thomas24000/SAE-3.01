import { getRequest, postRequest } from "../lib/api-request.js";
import { AuthData } from "./auth.js";

let CompteData = {};

/**
 * Le profil et l'aperçu de l'activité du client connecté : GET /api/compte
 *
 * Réponse : { profil: { email, nom, creeLe }, commandes: { total, recentes:
 * [{ numero, statut, totalCents, creeLe }] } }.
 *
 * Lève une ErreurApi (401 non connecté).
 */
CompteData.fetch = function () {
  return getRequest("compte");
};

/**
 * Modifie le nom et l'e-mail : POST /api/compte/profil
 *
 * Réponse : { profil: { email, nom } }. Un nom vide efface le nom.
 * Lève une ErreurApi (401 non connecté, 400 champ invalide, 409 e-mail pris).
 *
 * @param {string} nom - le nom d'affichage, éventuellement vide.
 * @param {string} email - la nouvelle adresse e-mail.
 */
CompteData.updateProfile = async function (nom, email) {
  let reponse = await postRequest("compte/profil", { nom, email });
  AuthData.knownEmail = reponse.profil.email;
  return reponse;
};

/**
 * Change le mot de passe : POST /api/compte/mot-de-passe
 *
 * Réponse : { modifie: true }. Le serveur exige l'ancien mot de passe.
 * Lève une ErreurApi (401 non connecté, 400 règles du nouveau, 403 ancien faux).
 *
 * @param {string} ancien - le mot de passe actuel.
 * @param {string} nouveau - le nouveau mot de passe.
 * @param {string} confirmation - le nouveau mot de passe, resaisi.
 */
CompteData.updatePassword = function (ancien, nouveau, confirmation) {
  return postRequest("compte/mot-de-passe", { ancien, nouveau, confirmation });
};

export { CompteData };
