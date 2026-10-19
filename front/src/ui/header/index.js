import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { basculerTheme } from "../../lib/theme.js";
import template from "./template.html?raw";

/**
 * Texte lu par les lecteurs d'écran pour le lien du compte.
 *
 * @param {string|null} login - l'identifiant du visiteur connecté, ou null.
 * @returns {string}
 */
function libelleCompte(login) {
  if (login === null) return "Mon compte";
  return `Mon compte (connecté : ${login})`;
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
   * @param {{panierCount: number, login: string|null}} data - panierCount : le nombre
   *   d'articles du panier ; login : l'identifiant du visiteur connecté, ou null.
   * @returns {string}
   */
  html: function (data) {
    return genericRenderer(template, {
      compteLibelle: libelleCompte(data.login),
      login: data.login ?? "",
      masqueLogin: data.login === null ? "hidden" : "",
      libelle: libelleLien(data.panierCount),
      nombre: data.panierCount,
      masque: data.panierCount === 0 ? "hidden" : "",
    });
  },

  /**
   * @param {{panierCount: number, login: string|null}} data - voir html.
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    let fragment = htmlToFragment(HeaderView.html(data));
    fragment.querySelector('[data-action="theme"]').addEventListener("click", basculerTheme);
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
   * Met à jour l'identifiant affiché à côté de l'icône du compte, dans le
   * header déjà affiché. Sert quand une connexion ou une déconnexion a lieu
   * sans changement d'adresse, ou quand la réponse du serveur arrive après le
   * premier affichage.
   *
   * @param {string|null} login - l'identifiant du visiteur connecté, ou null.
   */
  updateAccount: function (login) {
    let lien = document.querySelector("[data-compte-lien]");
    let texte = document.querySelector("[data-compte-login]");
    if (lien === null || texte === null) return;

    lien.setAttribute("aria-label", libelleCompte(login));
    texte.textContent = login ?? "";
    texte.hidden = login === null;
  },
};

export { HeaderView };
