/**
 * Petites fonctions de mise en forme, sans dépendance.
 */

/**
 * 790 (centimes) -> « 7,90 € »
 */
export function formaterPrix(centimes) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(centimes / 100);
}

/**
 * « 2026-10-19 10:21:10 » (date SQL) -> « 19 octobre 2026 à 10:21 ».
 * Une date illisible est renvoyée telle quelle.
 */
export function formaterDate(dateSql) {
  let date = new Date(dateSql.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return dateSql;

  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
}
