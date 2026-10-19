/**
 * Tests de lib/options.js (US OPT-c et OPT-a) : node front/tests/options.test.mjs
 * Sans dépendance : seulement le module assert de Node.
 */
import assert from "node:assert/strict";
import {
  choixDepuisIds,
  choixDeLigne,
  choixIds,
  choixReconnus,
  defaultChoix,
  formaterOptions,
  groupesAvecEtat,
  hasMissing,
  ligneInvalide,
  supplementCents,
  toggleChoix,
} from "../src/lib/options.js";

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

let service = { id: 1, libelle: "Service", multiple: false, obligatoire: true, choix: [
  { id: 10, libelle: "Cuillère", supplementCents: 0 },
  { id: 11, libelle: "Cône", supplementCents: 60 },
] };
let toppings = { id: 2, libelle: "Toppings", multiple: true, obligatoire: false, choix: [
  { id: 20, libelle: "Caramel", supplementCents: 50 },
  { id: 21, libelle: "Chantilly", supplementCents: 40 },
] };
let groupes = [service, toppings];

console.log("sélection");

test("par défaut : premier choix du groupe obligatoire, rien ailleurs", () => {
  assert.deepEqual(defaultChoix(groupes), { 1: [10], 2: [] });
});

test("choix unique : le nouveau remplace l'ancien", () => {
  assert.deepEqual(toggleChoix(groupes, { 1: [10], 2: [] }, 1, 11), { 1: [11], 2: [] });
});

test("choix multiples : on ajoute puis on retire", () => {
  let un = toggleChoix(groupes, { 1: [10], 2: [] }, 2, 20);
  let deux = toggleChoix(groupes, un, 2, 21);
  assert.deepEqual(deux[2], [20, 21]);
  assert.deepEqual(toggleChoix(groupes, deux, 2, 20)[2], [21]);
});

test("un choix étranger au groupe laisse la sélection intacte", () => {
  let choix = { 1: [10], 2: [] };
  assert.equal(toggleChoix(groupes, choix, 1, 20), choix);
  assert.equal(toggleChoix(groupes, choix, 99, 10), choix);
});

test("la sélection reçue n'est pas modifiée", () => {
  let choix = { 1: [10], 2: [] };
  toggleChoix(groupes, choix, 2, 20);
  assert.deepEqual(choix, { 1: [10], 2: [] });
});

test("identifiants triés, tous groupes confondus", () => {
  assert.deepEqual(choixIds({ 1: [11], 2: [21, 20] }), [11, 20, 21]);
});

test("depuis des identifiants : ceux d'un autre produit sont ignorés", () => {
  assert.deepEqual(choixDepuisIds(groupes, [11, 20, 999]), { 1: [11], 2: [20] });
});

console.log("prix et validité");

test("supplément = somme des choix retenus", () => {
  assert.equal(supplementCents(groupes, { 1: [11], 2: [20, 21] }), 150);
  assert.equal(supplementCents(groupes, { 1: [10], 2: [] }), 0);
});

test("groupe obligatoire sans choix : manquant", () => {
  assert.equal(hasMissing(groupes, { 1: [], 2: [20] }), true);
  assert.equal(hasMissing(groupes, { 1: [10], 2: [] }), false);
});

test("l'état coché est ajouté à chaque choix", () => {
  let avecEtat = groupesAvecEtat(groupes, { 1: [11], 2: [] });
  assert.deepEqual(avecEtat[0].choix.map((choix) => choix.selectionne), [false, true]);
  assert.deepEqual(avecEtat[1].choix.map((choix) => choix.selectionne), [false, false]);
});

console.log("panier");

test("choix reconnus : inconnu ou d'un autre produit écartés", () => {
  let reconnus = [
    { id: 10, produitId: 1, libelle: "Cuillère", supplementCents: 0 },
    { id: 30, produitId: 2, libelle: "Autre", supplementCents: 10 },
  ];
  assert.deepEqual(choixReconnus([10, 30, 77], 1, reconnus).map((choix) => choix.id), [10]);
});

test("choix d'une ligne : reconnus d'après les groupes du produit", () => {
  assert.deepEqual(choixDeLigne([11, 20, 999], 1, groupes).map((choix) => choix.id), [11, 20]);
  assert.deepEqual(choixDeLigne([10], 1, []), []);
});

test("ligne invalide : option inconnue ou groupe obligatoire vide", () => {
  assert.equal(ligneInvalide([10, 20], 1, groupes), false);
  assert.equal(ligneInvalide([10, 999], 1, groupes), true);
  assert.equal(ligneInvalide([], 1, groupes), true);
  assert.equal(ligneInvalide([], 1, []), false);
});

test("texte des options : supplément seulement s'il y en a un", () => {
  let texte = formaterOptions([
    { libelle: "Cuillère", supplementCents: 0 },
    { libelle: "Cône", supplementCents: 60 },
  ]);
  assert.match(texte, /^Cuillère, Cône \(\+ 0,60/);
  assert.equal(formaterOptions([]), "");
});

console.log(echecs === 0 ? "\nTous les tests passent." : `\n${echecs} test(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
