import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { basculerTheme } from "../../lib/theme.js";
import template from "./template.html?raw";

const LOGO = import.meta.env.BASE_URL + "images/ben-jerry-s-4.svg";

/**
 * Texte lu par les lecteurs d'écran pour le lien du compte.
 *
 * @param {string|null} email - l'e-mail du visiteur connecté, ou null.
 * @returns {string}
 */
function libelleCompte(email) {
  if (email === null) return "Mon compte";
  return `Mon compte (connecté : ${email})`;
}

/**
 * Destination du lien du compte : l'espace personnel pour un visiteur connecté,
 * la connexion sinon.
 *
 * @param {string|null} email - l'e-mail du visiteur connecté, ou null.
 * @returns {string} un chemin de route.
 */
function destinationCompte(email) {
  return email === null ? "/connexion" : "/compte";
}

/**
 * Texte lu par les lecteurs d'écran pour le lien du panier.
 *
 * @param {number} nombre - le nombre d'articles du panier.
 * @returns {string}
 */
function libelleLien(nombre) {
  if (nombre === 0) return "Mon panier (vide)";
  return `Mon panier (${nombre} ${nombre === 1 ? "article" : "articles"})`;
}

// HeaderView : la navigation, le lien du panier avec son compteur, et le bouton
// de thème, dont il gère lui-même le clic.
let HeaderView = {
  /**
   * @param {{panierCount: number, email: string|null}} data - panierCount : le nombre
   *   d'articles du panier ; email : l'e-mail du visiteur connecté, ou null.
   * @returns {string}
   */
  html: function (data) {
    return genericRenderer(template, {
      logo: LOGO,
      compteHref: destinationCompte(data.email),
      compteLibelle: libelleCompte(data.email),
      email: data.email ?? "",
      masqueConnecte: data.email === null ? "hidden" : "",
      libelle: libelleLien(data.panierCount),
      nombre: data.panierCount,
      masque: data.panierCount === 0 ? "hidden" : "",
    });
  },

  /**
   * @param {{panierCount: number, email: string|null}} data - voir html.
   * @param {{surDeconnexion: function(): void}} actions - appelée au clic sur « Se déconnecter ».
   * @returns {DocumentFragment}
   */
  dom: function (data, actions) {
    let fragment = htmlToFragment(HeaderView.html(data));
    fragment.querySelector('[data-action="theme"]').addEventListener("click", basculerTheme);
    fragment
      .querySelector('[data-action="deconnexion"]')
      .addEventListener("click", () => actions.surDeconnexion());
    return fragment;
  },

  /**
   * Met à jour le compteur du header déjà affiché. Une page qui modifie le
   * panier sans changer d'adresse l'appelle, car le header n'est reconstruit
   * qu'à chaque navigation.
   *
   * @param {number} nombre - le nombre d'articles du panier.
   */
  updateCount: function (nombre) {
    let lien = document.querySelector("[data-panier-lien]");
    let compteur = document.querySelector("[data-panier-compteur]");
    if (lien === null || compteur === null) return;

    lien.setAttribute("aria-label", libelleLien(nombre));
    compteur.textContent = nombre;
    compteur.hidden = nombre === 0;
  },

  /**
   * Met à jour l'e-mail affiché à côté de l'icône du compte, et le bouton de
   * déconnexion, dans le header déjà affiché. Sert quand une connexion ou une déconnexion a lieu
   * sans changement d'adresse, ou quand la réponse du serveur arrive après le
   * premier affichage.
   *
   * @param {string|null} email - l'e-mail du visiteur connecté, ou null.
   */
  updateAccount: function (email) {
    let lien = document.querySelector("[data-compte-lien]");
    let texte = document.querySelector("[data-compte-email]");
    let deconnexion = document.querySelector('[data-action="deconnexion"]');
    if (lien === null || texte === null || deconnexion === null) return;

    lien.setAttribute("aria-label", libelleCompte(email));
    // Chemin complet (avec le chemin du projet), comme le pose le routeur.
    lien.setAttribute("href", import.meta.env.BASE_URL.replace(/\/$/, "") + destinationCompte(email));
    texte.textContent = email ?? "";
    texte.hidden = email === null;
    deconnexion.hidden = email === null;
  },
};

export { HeaderView };
