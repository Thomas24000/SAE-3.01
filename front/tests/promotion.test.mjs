/**
 * Tests de lib/promotion.js (US PRO-c) : node front/tests/promotion.test.mjs
 * Sans dépendance : seulement le module assert de Node.
 */
import assert from "node:assert/strict";
import { enPromotion, prixEffectif } from "../src/lib/promotion.js";

const normal = { prixCents: 790, prixPromoCents: null };
const promo = { prixCents: 790, prixPromoCents: 632 };

assert.equal(enPromotion(normal), false);
assert.equal(enPromotion(promo), true);
assert.equal(enPromotion({ prixCents: 790 }), false, "champ absent (ancienne réponse) : pas de promotion");
assert.equal(enPromotion({ prixCents: 0, prixPromoCents: 0 }), true, "un prix promo à 0 reste une promotion");

assert.equal(prixEffectif(normal), 790);
assert.equal(prixEffectif(promo), 632);
assert.equal(prixEffectif({ prixCents: 290 }), 290);

console.log("Tous les tests passent.");
