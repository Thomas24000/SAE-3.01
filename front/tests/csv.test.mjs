/**
 * Tests de lib/csv.js (US PIL-a) : node front/tests/csv.test.mjs
 * Sans dépendance : seulement le module assert de Node.
 */
import assert from "node:assert/strict";
import { cellule, montantCsv, toCsv } from "../src/lib/csv.js";

assert.equal(cellule("Cookie Dough"), "Cookie Dough");
assert.equal(cellule(12), "12");
assert.equal(cellule(null), "");
assert.equal(cellule(undefined), "");
assert.equal(cellule("a;b"), '"a;b"');
assert.equal(cellule('dit "oui"'), '"dit ""oui"""');
assert.equal(cellule("deux\nlignes"), '"deux\nlignes"');

// Une formule de tableur est neutralisée ; un nombre négatif reste un nombre.
assert.equal(cellule("=SOMME(A1)"), "'=SOMME(A1)");
assert.equal(cellule("@cmd"), "'@cmd");
assert.equal(cellule("-1+1"), "'-1+1");
assert.equal(cellule(-5), "-5");

assert.equal(montantCsv(790), "7,90");
assert.equal(montantCsv(0), "0,00");
assert.equal(montantCsv(123456), "1234,56");

assert.equal(toCsv([["A", "B"], [], ["x;y", 3]]), "\uFEFFA;B\r\n\r\n\"x;y\";3\r\n");

console.log("Tous les tests passent.");
