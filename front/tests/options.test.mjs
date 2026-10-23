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
  groupePorteurId,
  groupesAvecDisponibilite,
  groupesAvecEtat,
  hasMissing,
  ligneInvalide,
  supplementCents,
  toggleChoix,
  varianteAChoisir,
  varianteDe,
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

test("ligne invalide : le service doit être celui de la variante (OPT-b)", () => {
  assert.equal(ligneInvalide([10, 20], 1, groupes, 10), false);
  assert.equal(ligneInvalide([11], 1, groupes, 10), true);
  assert.equal(ligneInvalide([10], 1, groupes, null), false);
});

test("texte des options : supplément seulement s'il y en a un", () => {
  let texte = formaterOptions([
    { libelle: "Cuillère", supplementCents: 0 },
    { libelle: "Cône", supplementCents: 60 },
  ]);
  assert.match(texte, /^Cuillère, Cône \(\+ 0,60/);
  assert.equal(formaterOptions([]), "");
});

// US OPT-b : variantes = format + choix du groupe porteur de stock (le Service, groupe 1).
let combinaisons = [
  { id: 1, libelle: "Pot 100 ml", choixId: 10, stock: 5 },
  { id: 2, libelle: "Pot 100 ml", choixId: 11, stock: 0 },
  { id: 3, libelle: "Pot 465 ml", choixId: 10, stock: 0 },
  { id: 4, libelle: "Pot 465 ml", choixId: 11, stock: 8 },
];

test("groupe porteur de stock : celui dont un choix est référencé par une variante", () => {
  assert.equal(groupePorteurId(groupes, combinaisons), 1);
  assert.equal(groupePorteurId(groupes, [{ choixId: null }]), null);
});

test("combinaison exacte : format + choix, undefined si absente", () => {
  assert.equal(varianteDe(combinaisons, "Pot 465 ml", 11).id, 4);
  assert.equal(varianteDe(combinaisons, "Pot 465 ml", 99), undefined);
});

test("changer de format garde le service s'il est en stock, sinon prend un autre en stock", () => {
  assert.equal(varianteAChoisir(combinaisons, "Pot 100 ml", 10).id, 1);
  assert.equal(varianteAChoisir(combinaisons, "Pot 465 ml", 10).id, 4);
});

test("format entièrement épuisé : la combinaison exacte est conservée", () => {
  let epuise = combinaisons.map((variante) => ({ ...variante, stock: 0 }));
  assert.equal(varianteAChoisir(epuise, "Pot 465 ml", 11).id, 4);
  assert.equal(varianteAChoisir(epuise, "Pot 1 l", 11), undefined);
});

test("disponibilité des services : épuisé, indisponible, ou libre selon le format", () => {
  let vue = groupesAvecDisponibilite(groupes, 1, combinaisons, "Pot 100 ml")[0].choix;
  assert.deepEqual(vue.map((choix) => choix.raison), ["", "Épuisé"]);
  assert.deepEqual(vue.map((choix) => choix.indisponible), [false, true]);

  let sans = groupesAvecDisponibilite(groupes, 1, [combinaisons[0]], "Pot 100 ml")[0].choix;
  assert.equal(sans[1].raison, "Indisponible");
});

test("disponibilité : les groupes non porteurs ne sont pas touchés", () => {
  let vue = groupesAvecDisponibilite(groupes, 1, combinaisons, "Pot 100 ml");
  assert.equal(vue[1], groupes[1]);
});

// Stock des toppings : un choix à 0 dose est épuisé, un choix sous le seuil est annoncé.
let avecStock = [
  { id: 1, choix: [{ id: 10, stock: null }] },
  { id: 2, choix: [{ id: 20, stock: 0 }, { id: 21, stock: 4 }, { id: 22, stock: 50 }] },
];

test("disponibilité des toppings : épuisé, bientôt épuisé, disponible", () => {
  let vue = groupesAvecDisponibilite(avecStock, 1, [], "Pot", 5)[1].choix;
  assert.deepEqual(vue.map((choix) => choix.indisponible), [true, false, false]);
  assert.deepEqual(vue.map((choix) => choix.raison), ["Épuisé", "", ""]);
  assert.deepEqual(vue.map((choix) => choix.alerte), ["", "Bientôt épuisé", ""]);
});

test("disponibilité des toppings : sans seuil, pas d'alerte ; un service garde son stock null", () => {
  let vue = groupesAvecDisponibilite(avecStock, 99, [], "Pot");
  assert.deepEqual(vue[1].choix.map((choix) => choix.alerte), ["", "", ""]);
  assert.equal(vue[0], avecStock[0]);
});

test("ligne invalide : un topping épuisé", () => {
  assert.equal(ligneInvalide([10, 21], 1, avecStock), false);
  assert.equal(ligneInvalide([10, 20], 1, avecStock), true);
});

console.log(echecs === 0 ? "\nTous les tests passent." : `\n${echecs} test(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
