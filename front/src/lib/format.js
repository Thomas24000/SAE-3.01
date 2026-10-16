/**
 * Petites fonctions de mise en forme, sans dépendance.
 */

/**
 * 790 (centimes) -> « 7,90 € »
 */
export function formaterPrix(centimes) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(centimes / 100);
}
