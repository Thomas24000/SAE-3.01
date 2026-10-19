/**
 * Tests de lib/stock.js (US STK-c) : règles d'ajustement du panier au stock.
 *
 * Usage : node front/tests/stock.test.mjs  (aucune dépendance, pas de navigateur)
 */
import assert from "node:assert/strict";
import { ajusterLignes, statutStock, texteAjustements } from "../src/lib/stock.js";

let echecs = 0;

/**
 * Exécute un scénario et affiche son résultat.
 * @param {string} nom
 * @param {function(): void} scenario
 */
function test(nom, scenario) {
  try {
    scenario();
    console.log(`  [OK]    ${nom}`);
  } catch (erreur) {
    echecs++;
    console.log(`  [ECHEC] ${nom}\n          ${erreur.message}`);
  }
}

/** Une variante telle que l'API du panier la renvoie. */
function variante(variantId, stock, libelle = "Pot 465 ml") {
  return { variantId: variantId, libelle: libelle, stock: stock, produit: { nom: "Cookie Dough" } };
}

console.log("ajusterLignes");

test("stock suffisant : le panier ne change pas", () => {
  let resultat = ajusterLignes([{ variantId: 1, quantite: 2 }], [variante(1, 10)]);
  assert.deepEqual(resultat.lignes, [{ variantId: 1, quantite: 2 }]);
  assert.deepEqual(resultat.ajustements, []);
});

test("quantité égale au stock : acceptée telle quelle", () => {
  assert.deepEqual(ajusterLignes([{ variantId: 1, quantite: 3 }], [variante(1, 3)]).ajustements, []);
});

test("quantité supérieure au stock : ramenée au stock", () => {
  let resultat = ajusterLignes([{ variantId: 1, quantite: 5 }], [variante(1, 3)]);
  assert.deepEqual(resultat.lignes, [{ variantId: 1, quantite: 3 }]);
  assert.equal(resultat.ajustements[0].type, "reduite");
  assert.equal(resultat.ajustements[0].ancienneQuantite, 5);
  assert.equal(resultat.ajustements[0].quantite, 3);
});

test("variante épuisée : la ligne est retirée", () => {
  let resultat = ajusterLignes([{ variantId: 1, quantite: 1 }], [variante(1, 0)]);
  assert.deepEqual(resultat.lignes, []);
  assert.equal(resultat.ajustements[0].type, "epuise");
});

test("contrainte par variante : le format épuisé n'affecte pas son frère en stock", () => {
  let resultat = ajusterLignes(
    [{ variantId: 1, quantite: 2 }, { variantId: 2, quantite: 2 }],
    [variante(1, 0, "Pot 100 ml"), variante(2, 8)]
  );
  assert.deepEqual(resultat.lignes, [{ variantId: 2, quantite: 2 }]);
  assert.equal(resultat.ajustements.length, 1);
});

test("variante absente de l'API : la ligne est laissée à un autre contrôle", () => {
  assert.deepEqual(ajusterLignes([{ variantId: 9, quantite: 2 }], []).lignes, [{ variantId: 9, quantite: 2 }]);
});

test("stock modifié entre deux lectures : le même panier s'ajuste différemment", () => {
  let panier = [{ variantId: 1, quantite: 4 }];
  assert.deepEqual(ajusterLignes(panier, [variante(1, 5)]).ajustements, []);
  assert.equal(ajusterLignes(panier, [variante(1, 1)]).lignes[0].quantite, 1);
});

test("les tableaux reçus ne sont pas modifiés", () => {
  let panier = [{ variantId: 1, quantite: 5 }];
  ajusterLignes(panier, [variante(1, 2)]);
  assert.deepEqual(panier, [{ variantId: 1, quantite: 5 }]);
});

console.log("texteAjustements");

test("rien à signaler : null", () => {
  assert.equal(texteAjustements([], 0), null);
});

test("quantité réduite : cite le produit, le format et les deux quantités", () => {
  let texte = texteAjustements(ajusterLignes([{ variantId: 1, quantite: 5 }], [variante(1, 3)]).ajustements, 0);
  assert.match(texte, /Cookie Dough/);
  assert.match(texte, /Pot 465 ml/);
  assert.match(texte, /de 5 à 3/);
});

test("variante épuisée : annonce le retrait", () => {
  let texte = texteAjustements(ajusterLignes([{ variantId: 1, quantite: 1 }], [variante(1, 0)]).ajustements, 0);
  assert.match(texte, /épuisé/);
});

test("article disparu : message dédié, en premier", () => {
  assert.match(texteAjustements([], 1), /n'est plus proposé/);
});

console.log("statutStock");

test("épuisé, bientôt épuisé, disponible", () => {
  assert.equal(statutStock(0, 5), "epuise");
  assert.equal(statutStock(5, 5), "bientot");
  assert.equal(statutStock(6, 5), "disponible");
});

console.log(echecs === 0 ? "\nTous les tests passent." : `\n${echecs} test(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
