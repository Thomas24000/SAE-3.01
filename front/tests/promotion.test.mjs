/**
 * Tests de lib/promotion.js (US PRO-c) : node front/tests/promotion.test.mjs
 * Sans dépendance : seulement le module assert de Node.
 */
import assert from "node:assert/strict";
import { enPromotion, prixEffectif, reductionCents } from "../src/lib/promotion.js";

const normal = { prixCents: 790, prixPromoCents: null };
const promo = { prixCents: 790, prixPromoCents: 632 };

assert.equal(enPromotion(normal), false);
assert.equal(enPromotion(promo), true);
assert.equal(enPromotion({ prixCents: 790 }), false, "champ absent (ancienne réponse) : pas de promotion");
assert.equal(enPromotion({ prixCents: 0, prixPromoCents: 0 }), true, "un prix promo à 0 reste une promotion");

assert.equal(prixEffectif(normal), 790);
assert.equal(prixEffectif(promo), 632);
assert.equal(prixEffectif({ prixCents: 290 }), 290);

// Mêmes valeurs que CodePromoModel::reduction côté serveur (back/tests/codes-promo.php).
assert.equal(reductionCents(790, 10), 79);
assert.equal(reductionCents(333, 15), 50, "arrondi au plus proche, moitié vers le haut");
assert.equal(reductionCents(790, 100), 790);
assert.equal(reductionCents(5, 100), 5);
assert.equal(reductionCents(0, 50), 0);
assert.equal(reductionCents(1, 50), 1, "0,5 centime arrondi au centime supérieur");
assert.equal(reductionCents(1999, 20), 400);

console.log("Tous les tests passent.");
