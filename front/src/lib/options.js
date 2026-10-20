import { formaterPrix } from "./format.js";

/**
 * Règles des options d'un produit (US OPT-c et OPT-a), partagées par la fiche
 * produit, le panier et la commande. Fonctions pures : elles ne touchent ni au
 * DOM ni au stockage et ne modifient pas leurs arguments.
 *
 * Un groupe est de la forme { id, libelle, multiple, obligatoire, choix: [{ id,
 * libelle, supplementCents }] }. Une sélection ("choix") est un objet
 * { [idGroupe]: [idChoix, ...] }.
 */

/**
 * Sélection proposée par défaut : le premier choix de chaque groupe obligatoire
 * à choix unique, rien ailleurs.
 *
 * @param {Array<{id: number, multiple: boolean, obligatoire: boolean, choix: Array<{id: number}>}>} groupes
 * @returns {Object<number, number[]>} la sélection par défaut.
 */
export function defaultChoix(groupes) {
  return Object.fromEntries(
    groupes.map((groupe) => [groupe.id, groupe.obligatoire && !groupe.multiple ? [groupe.choix[0].id] : []])
  );
}

/**
 * La sélection correspondant à une liste d'identifiants de choix (les
 * identifiants qui n'appartiennent à aucun groupe sont ignorés).
 *
 * @param {Array<{id: number, choix: Array<{id: number}>}>} groupes
 * @param {number[]} ids - les identifiants de choix retenus.
 * @returns {Object<number, number[]>} la sélection, avec une entrée par groupe.
 */
export function choixDepuisIds(groupes, ids) {
  return Object.fromEntries(
    groupes.map((groupe) => [
      groupe.id,
      groupe.choix.map((choix) => choix.id).filter((id) => ids.includes(id)),
    ])
  );
}

/**
 * Coche ou décoche un choix : dans un groupe à choix multiples il s'ajoute ou se
 * retire, sinon il remplace le précédent. Un choix qui n'appartient pas au groupe
 * laisse la sélection inchangée.
 *
 * @param {Array<{id: number, multiple: boolean, choix: Array<{id: number}>}>} groupes
 * @param {Object<number, number[]>} choix - la sélection actuelle.
 * @param {number} groupeId
 * @param {number} choixId
 * @returns {Object<number, number[]>} la nouvelle sélection.
 */
export function toggleChoix(groupes, choix, groupeId, choixId) {
  let groupe = groupes.find((autre) => autre.id === groupeId);
  if (groupe === undefined || !groupe.choix.some((autre) => autre.id === choixId)) return choix;

  let actuels = choix[groupeId] ?? [];
  let nouveaux;

  if (!groupe.multiple) {
    nouveaux = [choixId];
  } else if (actuels.includes(choixId)) {
    nouveaux = actuels.filter((id) => id !== choixId);
  } else {
    nouveaux = [...actuels, choixId];
  }

  return { ...choix, [groupeId]: nouveaux };
}

/**
 * Les identifiants de tous les choix d'une sélection, triés (forme stockée dans
 * une ligne de panier).
 *
 * @param {Object<number, number[]>} choix
 * @returns {number[]}
 */
export function choixIds(choix) {
  return Object.values(choix)
    .flat()
    .sort((a, b) => a - b);
}

/**
 * Supplément total d'une sélection, par unité.
 *
 * @param {Array<{choix: Array<{id: number, supplementCents: number}>}>} groupes
 * @param {Object<number, number[]>} choix
 * @returns {number} le supplément en centimes.
 */
export function supplementCents(groupes, choix) {
  let retenus = choixIds(choix);

  return groupes
    .flatMap((groupe) => groupe.choix)
    .filter((autre) => retenus.includes(autre.id))
    .reduce((total, autre) => total + autre.supplementCents, 0);
}

/**
 * Indique si un groupe obligatoire est resté sans choix.
 *
 * @param {Array<{id: number, obligatoire: boolean}>} groupes
 * @param {Object<number, number[]>} choix
 * @returns {boolean} true s'il manque au moins un choix obligatoire.
 */
export function hasMissing(groupes, choix) {
  return groupes.some((groupe) => groupe.obligatoire && (choix[groupe.id] ?? []).length === 0);
}

/**
 * Les groupes avec, pour chaque choix, son état coché (`selectionne`), prêts à
 * être affichés par le sélecteur d'options.
 *
 * @param {Array<{id: number, choix: Array<{id: number}>}>} groupes
 * @param {Object<number, number[]>} choix
 * @returns {Array<Object>} les groupes enrichis.
 */
export function groupesAvecEtat(groupes, choix) {
  return groupes.map((groupe) => ({
    ...groupe,
    choix: groupe.choix.map((autre) => ({
      ...autre,
      selectionne: (choix[groupe.id] ?? []).includes(autre.id),
    })),
  }));
}

/**
 * Les choix d'une ligne de panier que le serveur reconnaît pour ce produit. Un
 * choix inconnu ou rattaché à un autre produit (panier modifié dans le
 * navigateur, option retirée du catalogue) est écarté.
 *
 * @param {number[]} ids - les identifiants de choix de la ligne.
 * @param {number} produitId - le produit de la variante de la ligne.
 * @param {Array<{id: number, produitId: number}>} reconnus - les choix renvoyés par l'API.
 * @returns {Array<Object>} les choix reconnus, dans l'ordre des identifiants.
 */
export function choixReconnus(ids, produitId, reconnus) {
  return ids
    .map((id) => reconnus.find((choix) => choix.id === id))
    .filter((choix) => choix !== undefined && choix.produitId === produitId);
}

/**
 * Les choix d'une ligne de panier reconnus d'après les groupes d'options que le
 * serveur renvoie pour son produit (voir choixReconnus).
 *
 * @param {number[]} ids - les identifiants de choix de la ligne.
 * @param {number} produitId - le produit de la variante de la ligne.
 * @param {Array<{choix: Array<{id: number}>}>} groupes - les groupes d'options de ce produit.
 * @returns {Array<Object>} les choix reconnus ({ id, libelle, supplementCents, produitId }).
 */
export function choixDeLigne(ids, produitId, groupes) {
  return choixReconnus(
    ids,
    produitId,
    groupes.flatMap((groupe) => groupe.choix.map((choix) => ({ ...choix, produitId: produitId })))
  );
}

/**
 * Une ligne de panier ne pourrait-elle pas être commandée ? Elle est invalide si
 * l'une de ses options n'est pas reconnue pour son produit, si un groupe
 * obligatoire du produit n'a aucun choix (cas des paniers créés avant les
 * options) ou si le choix du groupe porteur de stock n'est pas celui de sa
 * variante (cas des paniers créés avant les variantes par service, US OPT-b).
 *
 * @param {number[]} ids - les identifiants de choix de la ligne.
 * @param {number} produitId - le produit de la variante de la ligne.
 * @param {Array<{id: number, obligatoire: boolean, choix: Array<{id: number}>}>} groupes
 *        les groupes d'options de ce produit (vide si le produit n'en a pas).
 * @param {number|null} [choixId] - le choix du groupe porteur de stock de la variante de la ligne.
 * @returns {boolean} true si la ligne doit être retirée du panier.
 */
export function ligneInvalide(ids, produitId, groupes, choixId = null) {
  return (
    choixDeLigne(ids, produitId, groupes).length !== ids.length ||
    hasMissing(groupes, choixDepuisIds(groupes, ids)) ||
    (choixId !== null && !ids.includes(choixId))
  );
}

/**
 * Le texte des options d'une ligne : « Cône gaufrette (+ 0,60 €), Sauce caramel ».
 *
 * @param {Array<{libelle: string, supplementCents: number}>} options
 * @returns {string} les options séparées par des virgules, vide s'il n'y en a pas.
 */
export function formaterOptions(options) {
  return options
    .map((option) =>
      option.supplementCents > 0 ? `${option.libelle} (+ ${formaterPrix(option.supplementCents)})` : option.libelle
    )
    .join(", ");
}

/**
 * Identifiant du groupe d'options qui porte le stock (US OPT-b) : celui dont un
 * choix est référencé par une variante (`choixId`). Les variantes d'un produit
 * sans ce groupe ont toutes `choixId` à null.
 *
 * @param {Array<{id: number, choix: Array<{id: number}>}>} groupes
 * @param {Array<{choixId: number|null}>} variantes
 * @returns {number|null} l'identifiant du groupe, ou null s'il n'y en a pas.
 */
export function groupePorteurId(groupes, variantes) {
  let groupe = groupes.find((autre) => autre.choix.some((choix) => variantes.some((v) => v.choixId === choix.id)));

  return groupe === undefined ? null : groupe.id;
}

/**
 * La variante d'une combinaison exacte : un format et un choix du groupe porteur.
 *
 * @param {Array<{libelle: string, choixId: number|null}>} variantes
 * @param {string} format - le libellé du format.
 * @param {number|null} choixId - le choix du groupe porteur, null si le produit n'en a pas.
 * @returns {Object|undefined} la variante, ou undefined si cette combinaison n'existe pas.
 */
export function varianteDe(variantes, format, choixId) {
  return variantes.find((variante) => variante.libelle === format && variante.choixId === choixId);
}

/**
 * La variante à sélectionner quand on choisit un format : la combinaison avec le
 * choix actuel si elle est en stock, sinon la première du format qui l'est, sinon
 * la combinaison exacte (épuisée) ou, à défaut, la première du format.
 *
 * @param {Array<{libelle: string, choixId: number|null, stock: number}>} variantes
 * @param {string} format
 * @param {number|null} choixId - le choix actuel du groupe porteur.
 * @returns {Object|undefined} la variante, undefined si le format n'existe pas.
 */
export function varianteAChoisir(variantes, format, choixId) {
  let exacte = varianteDe(variantes, format, choixId);
  if (exacte !== undefined && exacte.stock > 0) return exacte;

  let enStock = variantes.find((variante) => variante.libelle === format && variante.stock > 0);

  return enStock ?? exacte ?? variantes.find((variante) => variante.libelle === format);
}

/**
 * Les groupes, avec pour chaque choix du groupe porteur de stock son
 * indisponibilité pour le format donné : « Épuisé » si la combinaison n'a plus
 * de stock, « Indisponible » si elle n'existe pas. Les autres groupes sont
 * renvoyés tels quels.
 *
 * @param {Array<{id: number, choix: Array<{id: number}>}>} groupes
 * @param {number|null} porteurId - l'identifiant du groupe porteur de stock.
 * @param {Array<{libelle: string, choixId: number|null, stock: number}>} variantes
 * @param {string} format - le format choisi.
 * @returns {Array<Object>} les groupes, leurs choix portant `indisponible` (booléen) et `raison`.
 */
export function groupesAvecDisponibilite(groupes, porteurId, variantes, format) {
  return groupes.map((groupe) => {
    if (groupe.id !== porteurId) return groupe;

    return {
      ...groupe,
      choix: groupe.choix.map((choix) => {
        let variante = varianteDe(variantes, format, choix.id);
        let raison = variante === undefined ? "Indisponible" : variante.stock === 0 ? "Épuisé" : "";

        return { ...choix, indisponible: raison !== "", raison: raison };
      }),
    };
  });
}
