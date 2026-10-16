/**
 * Le panier, stocké dans le localStorage du navigateur.
 *
 * Une ligne est de la forme { variantId, quantite }, rien d'autre : nom, format,
 * prix et image sont relus auprès de l'API à l'affichage, pour ne jamais
 * montrer un prix périmé. Le localStorage étant modifiable par le client, le
 * panier ne sert qu'à l'affichage : le serveur recalcule tout à la validation.
 *
 * Ce module est le seul à lire et écrire le panier (avec lib/theme.js pour le
 * thème, qui est le seul autre à toucher au localStorage).
 */
const CLE_PANIER = "panier";

// Plafond de sécurité : le vrai plafond est le stock de la variante, que
// connaît la page, pas ce module.
const QUANTITE_MAX = 99;

let PanierData = {};

/**
 * Lit le panier. Une valeur absente, un JSON invalide ou une ligne mal formée
 * (le client peut modifier le localStorage) donnent un panier vide, ou
 * ignorent la ligne.
 *
 * @returns {Array<{variantId: number, quantite: number}>} les lignes du panier.
 */
PanierData.read = function () {
  try {
    let lignes = JSON.parse(localStorage.getItem(CLE_PANIER));
    if (!Array.isArray(lignes)) return [];

    return lignes.filter(
      (ligne) =>
        Number.isInteger(ligne?.variantId) &&
        ligne.variantId > 0 &&
        Number.isInteger(ligne.quantite) &&
        ligne.quantite > 0
    );
  } catch (erreur) {
    return [];
  }
};

/**
 * Écrit le panier. Si le stockage est refusé (navigation privée, quota), le
 * panier de la session reste simplement vide au prochain chargement.
 *
 * @param {Array<{variantId: number, quantite: number}>} lignes
 */
PanierData.write = function (lignes) {
  try {
    localStorage.setItem(CLE_PANIER, JSON.stringify(lignes));
  } catch (erreur) {
    // Rien à faire : le panier n'est qu'une commodité d'affichage.
  }
};

/**
 * Ajoute une variante au panier. Si elle y est déjà, les quantités s'additionnent.
 *
 * @param {number} variantId - l'identifiant de la variante.
 * @param {number} quantite - la quantité à ajouter, au moins 1.
 * @returns {Array<{variantId: number, quantite: number}>} le panier mis à jour.
 */
PanierData.add = function (variantId, quantite) {
  let lignes = PanierData.read();
  let existante = lignes.find((ligne) => ligne.variantId === variantId);

  if (existante === undefined) {
    lignes.push({ variantId: variantId, quantite: Math.min(quantite, QUANTITE_MAX) });
  } else {
    existante.quantite = Math.min(existante.quantite + quantite, QUANTITE_MAX);
  }

  PanierData.write(lignes);
  return lignes;
};

/**
 * Fixe la quantité d'une variante déjà au panier. Une quantité inférieure à 1
 * supprime la ligne.
 *
 * @param {number} variantId - l'identifiant de la variante.
 * @param {number} quantite - la nouvelle quantité.
 * @returns {Array<{variantId: number, quantite: number}>} le panier mis à jour.
 */
PanierData.setQuantity = function (variantId, quantite) {
  if (quantite < 1) return PanierData.remove(variantId);

  let lignes = PanierData.read().map((ligne) =>
    ligne.variantId === variantId ? { ...ligne, quantite: Math.min(quantite, QUANTITE_MAX) } : ligne
  );

  PanierData.write(lignes);
  return lignes;
};

/**
 * Retire une variante du panier.
 *
 * @param {number} variantId - l'identifiant de la variante.
 * @returns {Array<{variantId: number, quantite: number}>} le panier mis à jour.
 */
PanierData.remove = function (variantId) {
  let lignes = PanierData.read().filter((ligne) => ligne.variantId !== variantId);

  PanierData.write(lignes);
  return lignes;
};

/**
 * Vide le panier.
 */
PanierData.clear = function () {
  PanierData.write([]);
};

/**
 * Nombre d'articles du panier, quantités comprises (le compteur du header).
 *
 * @returns {number} la somme des quantités.
 */
PanierData.count = function () {
  return PanierData.read().reduce((total, ligne) => total + ligne.quantite, 0);
};

export { PanierData };
