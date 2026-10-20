/**
 * Statuts d'une commande, côté back-office (US PIL-b).
 *
 * Le serveur décide seul des changements autorisés : ces fonctions ne servent
 * qu'à proposer les bons boutons.
 */

const LIBELLES = {
  en_cours: "En cours",
  prete: "Disponible",
  retiree: "Retirée",
  annulee: "Annulée",
};

// Les actions proposées depuis chaque statut : le parcours du retrait, puis l'annulation.
const ACTIONS = {
  en_cours: [
    { statut: "prete", libelle: "Marquer disponible" },
    { statut: "annulee", libelle: "Annuler" },
  ],
  prete: [
    { statut: "retiree", libelle: "Marquer retirée" },
    { statut: "annulee", libelle: "Annuler" },
  ],
  retiree: [],
  annulee: [],
};

/**
 * Le libellé français d'un statut.
 *
 * @param {string} statut - "en_cours", "prete", "retiree" ou "annulee".
 * @returns {string} le libellé (le statut tel quel s'il est inconnu).
 */
export function libelleStatut(statut) {
  return LIBELLES[statut] ?? statut;
}

/**
 * Les changements de statut proposés pour une commande.
 *
 * @param {string} statut - le statut actuel de la commande.
 * @returns {Array<{statut: string, libelle: string}>} vide si la commande est retirée ou annulée.
 */
export function actionsStatut(statut) {
  return ACTIONS[statut] ?? [];
}
