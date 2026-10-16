---
name: creer-module-data
description: Crée ou étend un module front/src/data/ (appels API par ressource, mapping de la réponse) en s'appuyant sur api-request.js. À utiliser dès qu'une page ou un composant a besoin d'un nouvel endpoint (catégories, panier, commande, auth, stock, admin…).
---

# Créer un module `data/`

Un module `data/` est la **seule couche réseau** du front. Un module par
ressource, un objet exporté `<Ressource>Data`, des fonctions async qui
retournent des données JS. Modèles : `data/produit.js`, `data/auth.js`,
`data/stats.js`.

## 1. Avant d'écrire

1. Vérifier que l'endpoint existe : lire `back/src/routes.php` et le contrôleur.
   Sinon **s'arrêter** : créer l'endpoint est une tâche à part (voir
   `.agents/rules/php-backend.md`, accord requis).
2. Lire `lib/api-request.js` (`getRequest`, `postRequest`, `ErreurApi`).

## 2. Gabarit

```js
import { getRequest, postRequest } from "../lib/api-request.js";

let CategorieData = {};

/**
 * Les catégories : GET /api/categories
 *
 * La réponse contient { categories }. Chaque catégorie est de la forme
 * { id, nom, slug }.
 *
 * Lève une ErreurApi (statut 404, 500…).
 */
CategorieData.fetchAll = async function () {
  return getRequest("categories");
};

export { CategorieData };
```

## 3. Règles

- **Aucun accès DOM**, aucun HTML, aucun `window`/`document`.
- Pas de `fetch` direct : `getRequest` / `postRequest` uniquement. Les erreurs
  HTTP remontent en `ErreurApi` (`.message` en français renvoyé par l'API,
  `.statut`) : c'est la page (C) qui les attrape et choisit le message.
- Paramètres d'URL : `encodeURIComponent(valeur)`.
- Documenter chaque fonction en JSDoc : route, forme de la réponse, unités
  (**prix en centimes**), erreurs possibles.
- Mapping de réponse autorisé et minimal, par exemple préfixer les images
  par `import.meta.env.BASE_URL` comme `ProduitData.fetchAll`.
- Aucune donnée de confiance : ne jamais envoyer un prix ou un rôle comme
  source de vérité (le serveur relit en base). Panier = `variantId`,
  quantité, options ; le serveur recalcule tout.
- Écritures sensibles (commande, admin) : prévoir le jeton CSRF quand le back
  le fournit ; ne rien stocker de sensible en `localStorage` hors panier.
- Pas de `foreach` (utiliser `map`, `for`).

## 4. Stockage du panier (US CMD-b)

Si un module panier local est demandé : clé `variantId`, lignes
`{ variantId, quantity, options, label, unitPriceCents }` utilisées **pour
l'affichage seulement**. Accès `localStorage` dans un `try/catch`, JSON
invalide → panier vide. Ce module est le seul à toucher `localStorage`
(avec `lib/theme.js` pour le thème).

## 5. Fin de tâche

`node .agents/skills/verifier-mvc/scripts/check-mvc.js .`, `cd front && npm
run build`, compte rendu AGENTS §11. Ne jamais commit/push.
