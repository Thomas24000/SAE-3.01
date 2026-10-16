/**
 * Petites fonctions de mise en forme, sans dépendance.
 */

/**
 * 149 -> « 2 h 29 »
 */
export function formaterDuree(minutes) {
  const heures = Math.floor(minutes / 60);
  const restant = minutes % 60;

  if (heures === 0) {
    return `${restant} min`;
  }

  return `${heures} h ${String(restant).padStart(2, "0")}`;
}

/**
 * 8.6 -> « 8,6 » (la virgule décimale française)
 */
export function formaterNote(note) {
  return Number(note).toFixed(1).replace(".", ",");
}

/**
 * 790 (centimes) -> « 7,90 € »
 */
export function formaterPrix(centimes) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(centimes / 100);
}
