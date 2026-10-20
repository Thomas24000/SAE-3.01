/**
 * Le panier, stocké dans le localStorage du navigateur.
 *
 * Une ligne est de la forme { variantId, quantite, options }, où options liste,
 * triés, les identifiants des choix d'options (vide sans option). Une ligne est
 * identifiée par sa variante ET ses options : un même format avec d'autres
 * options est une autre ligne. Nom, format,
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
 * Met des identifiants d'options en forme canonique : entiers positifs, sans
 * doublon, triés. Deux sélections identiques donnent ainsi le même tableau.
 *
 * @param {unknown} options - les identifiants reçus (tout autre type donne []).
 * @returns {number[]} les identifiants valides.
 */
function normaliserOptions(options) {
  if (!Array.isArray(options)) return [];

  return [...new Set(options.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
}

/**
 * La ligne désigne-t-elle cette variante avec exactement ces options ?
 *
 * @param {{variantId: number, options: number[]}} ligne
 * @param {number} variantId
 * @param {number[]} options - déjà normalisées.
 * @returns {boolean}
 */
function memeLigne(ligne, variantId, options) {
  return ligne.variantId === variantId && ligne.options.join(",") === options.join(",");
}

/**
 * Lit le panier. Une valeur absente, un JSON invalide ou une ligne mal formée
 * (le client peut modifier le localStorage) donnent un panier vide, ou
 * ignorent la ligne.
 *
 * @returns {Array<{variantId: number, quantite: number, options: number[]}>} les lignes du panier.
 */
PanierData.read = function () {
  try {
    let lignes = JSON.parse(localStorage.getItem(CLE_PANIER));
    if (!Array.isArray(lignes)) return [];

    return lignes
      .filter(
        (ligne) =>
          Number.isInteger(ligne?.variantId) &&
          ligne.variantId > 0 &&
          Number.isInteger(ligne.quantite) &&
          ligne.quantite > 0
      )
      .map((ligne) => ({ ...ligne, options: normaliserOptions(ligne.options) }));
  } catch (erreur) {
    return [];
  }
};

/**
 * Écrit le panier. Si le stockage est refusé (navigation privée, quota), le
 * panier de la session reste simplement vide au prochain chargement.
 *
 * @param {Array<{variantId: number, quantite: number, options?: number[]}>} lignes
 */
PanierData.write = function (lignes) {
  try {
    localStorage.setItem(CLE_PANIER, JSON.stringify(lignes));
  } catch (erreur) {
    // Rien à faire : le panier n'est qu'une commodité d'affichage.
  }
};

/**
 * Ajoute une variante au panier. Si la même variante y est déjà avec les mêmes
 * options, les quantités s'additionnent ; avec d'autres options, c'est une
 * nouvelle ligne.
 *
 * @param {number} variantId - l'identifiant de la variante.
 * @param {number} quantite - la quantité à ajouter, au moins 1.
 * @param {number[]} [options] - les identifiants des choix d'options retenus.
 * @returns {Array<{variantId: number, quantite: number, options: number[]}>} le panier mis à jour.
 */
PanierData.add = function (variantId, quantite, options = []) {
  let choix = normaliserOptions(options);
  let lignes = PanierData.read();
  let existante = lignes.find((ligne) => memeLigne(ligne, variantId, choix));

  if (existante === undefined) {
    lignes.push({ variantId: variantId, quantite: Math.min(quantite, QUANTITE_MAX), options: choix });
  } else {
    existante.quantite = Math.min(existante.quantite + quantite, QUANTITE_MAX);
  }

  PanierData.write(lignes);
  return lignes;
};

/**
 * Fixe la quantité d'une ligne déjà au panier (variante et options). Une
 * quantité inférieure à 1 supprime la ligne.
 *
 * @param {number} variantId - l'identifiant de la variante.
 * @param {number} quantite - la nouvelle quantité.
 * @param {number[]} [options] - les options de la ligne.
 * @returns {Array<{variantId: number, quantite: number, options: number[]}>} le panier mis à jour.
 */
PanierData.setQuantity = function (variantId, quantite, options = []) {
  let choix = normaliserOptions(options);
  if (quantite < 1) return PanierData.remove(variantId, choix);

  let lignes = PanierData.read().map((ligne) =>
    memeLigne(ligne, variantId, choix) ? { ...ligne, quantite: Math.min(quantite, QUANTITE_MAX) } : ligne
  );

  PanierData.write(lignes);
  return lignes;
};

/**
 * Remplace les options d'une ligne, et sa variante si le choix du service change
 * (US OPT-b : la variante est une combinaison format + service). Si une autre
 * ligne a déjà cette variante avec ces options, les deux lignes fusionnent
 * (quantités additionnées) ; sinon la ligne garde sa place dans le panier.
 *
 * @param {number} variantId - l'identifiant de la variante actuelle de la ligne.
 * @param {number[]} anciennes - les options actuelles de la ligne.
 * @param {number[]} nouvelles - les options à lui donner.
 * @param {number} [nouvelleVariantId] - la variante à lui donner (la même par défaut).
 * @returns {Array<{variantId: number, quantite: number, options: number[]}>} le panier mis à jour.
 */
PanierData.changeOptions = function (variantId, anciennes, nouvelles, nouvelleVariantId = variantId) {
  let avant = normaliserOptions(anciennes);
  let apres = normaliserOptions(nouvelles);
  let lignes = PanierData.read();
  let ligne = lignes.find((autre) => memeLigne(autre, variantId, avant));
  if (ligne === undefined) return lignes;

  let cible = lignes.find((autre) => autre !== ligne && memeLigne(autre, nouvelleVariantId, apres));
  if (cible !== undefined) {
    cible.quantite = Math.min(cible.quantite + ligne.quantite, QUANTITE_MAX);
    lignes = lignes.filter((autre) => autre !== ligne);
  } else {
    ligne.variantId = nouvelleVariantId;
    ligne.options = apres;
  }

  PanierData.write(lignes);
  return lignes;
};

/**
 * Retire une ligne du panier, ou toutes les lignes d'une variante si `options`
 * est omis (variante disparue du serveur).
 *
 * @param {number} variantId - l'identifiant de la variante.
 * @param {number[]} [options] - les options de la ligne à retirer.
 * @returns {Array<{variantId: number, quantite: number, options: number[]}>} le panier mis à jour.
 */
PanierData.remove = function (variantId, options) {
  let choix = options === undefined ? undefined : normaliserOptions(options);
  let lignes = PanierData.read().filter((ligne) =>
    choix === undefined ? ligne.variantId !== variantId : !memeLigne(ligne, variantId, choix)
  );

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
