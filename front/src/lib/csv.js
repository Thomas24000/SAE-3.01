/**
 * Fabrication d'un fichier CSV lisible par Excel en français : séparateur « ; »,
 * lignes séparées par CRLF et marque d'ordre des octets UTF-8 en tête (sans elle,
 * Excel affiche mal les accents).
 */

const BOM = "\uFEFF";

/**
 * Met une valeur en forme de cellule CSV. Les guillemets sont doublés et la
 * cellule est entourée de guillemets si elle contient « ; », un guillemet ou un
 * saut de ligne. Un texte qui commence par =, +, - ou @ serait pris pour une
 * formule par un tableur : on le fait précéder d'une apostrophe.
 *
 * @param {string|number|null|undefined} valeur - la valeur à écrire.
 * @returns {string} la cellule.
 */
export function cellule(valeur) {
  let texte = valeur === null || valeur === undefined ? "" : String(valeur);
  if (typeof valeur === "string" && /^[=+\-@]/.test(texte)) texte = "'" + texte;

  return /[;"\r\n]/.test(texte) ? '"' + texte.replaceAll('"', '""') + '"' : texte;
}

/**
 * Assemble des lignes en un fichier CSV.
 *
 * @param {Array<Array<string|number|null>>} lignes - chaque ligne est un tableau de cellules ;
 *   un tableau vide donne une ligne vide.
 * @returns {string} le contenu du fichier.
 */
export function toCsv(lignes) {
  return BOM + lignes.map((ligne) => ligne.map(cellule).join(";")).join("\r\n") + "\r\n";
}

/**
 * 790 (centimes) -> « 7,90 », sans symbole : une cellule numérique pour le tableur.
 *
 * @param {number} centimes - un montant en centimes.
 * @returns {string} le montant en euros, virgule décimale.
 */
export function montantCsv(centimes) {
  return (centimes / 100).toFixed(2).replace(".", ",");
}
