---
name: creer-page
description: Crée une page du front (pages/<nom>/page.js + template.html) avec séparation M/V/C, branche la route dans main.js et gère les états loading/vide/erreur. À utiliser pour une nouvelle page ou route (catégorie, panier, connexion, compte, historique, back-office…).
---

# Créer une page

Une page est un module `front/src/pages/<nom>/page.js` découpé **M / C / V**
dans le même fichier, avec un `template.html` pour la mise en page. Elle
compose des composants `ui/` et consomme des modules `data/`.
Modèles : `pages/produits/page.js` (catalogue, filtres, « voir plus »),
`pages/produit/page.js` (paramètre d'URL), `pages/admin/page.js` (auth +
403), `pages/404/page.js` (statique).

## 1. Avant d'écrire

1. Identifier l'US (AGENTS §8) et **vérifier ses dépendances** ; sinon
   s'arrêter et demander.
2. Lire la page voisine, `main.js`, `lib/router.js` et le module `data/`
   concerné. Si l'endpoint API n'existe pas : le signaler, ne pas modifier le
   back/SQL sans demande explicite.
3. Présenter le découpage à l'utilisateur et attendre son accord :
   - **M** : état de la page + fonctions pures qui retournent des données ;
   - **V** : template, composants assemblés, événements, focus ;
   - **C** : handlers, chargement, erreurs, navigation.

## 2. Fichiers

```
front/src/pages/<nom>/
├── page.js
├── template.html      mise en page avec des <slot name="..."> nommés
└── <sous>.html        fragments propres à la page (ex. voir-plus.html)
```

Puis dans `front/src/main.js` : `import { <Nom>Page } ...` et
`router.addRoute("/chemin/:param", <Nom>Page)` **avant** la route `"*"`. URL
du sujet : `/produit/:slug`, `/categorie/:slug`. Le `.htaccess` redirige déjà
tout vers `front/dist/`.

## 3. Gabarit de `page.js`

```js
import { ExempleData } from "../../data/exemple.js";
import { htmlToFragment } from "../../lib/utils.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";

/**
 * Page « Exemple » (US XXX-x).
 * M : … V : … C : …
 */

let M = {
  items: null, // tableau, ou null tant que le chargement n'a pas réussi
  message: null, // { type: "erreur" | "succes", texte }, ou null
};

/**
 * Les éléments à afficher.
 * . filter : le filtre choisi
 * > un tableau d'éléments (jamais de HTML, jamais de DOM)
 */
M.filterItems = function (filter) {
  return M.items.filter((item) => filter === "" || item.categorySlug === filter);
};

let C = {};

C.load = async function () {
  try {
    M.items = (await ExempleData.fetchAll()).items;
    M.message = null;
  } catch (error) {
    M.items = null;
    M.message = { type: "erreur", texte: `Impossible de charger : ${error.message}` };
  }
};

C.handler_clickOnItem = function (id) {
  // 1. met à jour M  2. appelle V.refresh(selecteurFocus)
};

C.init = async function () {
  await C.load();
  return V.init();
};

let V = {};

V.root = null;

V.init = function () {
  let fragment = V.createPageFragment();
  V.root = fragment.firstElementChild;
  return fragment;
};

// Reconstruit la page depuis M ; rend le focus à l'équivalent du bouton cliqué.
V.refresh = function (focusSelector) {
  let fragment = V.createPageFragment();
  let newRoot = fragment.firstElementChild;
  V.root.replaceWith(fragment);
  V.root = newRoot;
  if (focusSelector !== undefined) document.querySelector(focusSelector)?.focus();
};

V.createPageFragment = function () {
  let page = htmlToFragment(template);
  page.querySelector('slot[name="message"]').replaceWith(MessageView.dom(M.message));
  // if (M.items === null) → retirer les slots de données et retourner.
  // sinon : replaceWith(<Composant>View.dom(données de M, callbacks de C))
  return page;
};

export function ExemplePage(params) {
  return C.init(params);
}
```

Page à paramètre d'URL : le routeur appelle `Page({ slug })` ; faire passer
`params` à `C.init` et le stocker dans M (voir `pages/produit/page.js`).

## 4. Règles MVC (AGENTS §3, à respecter strictement)

| Objet | Autorisé | Interdit |
|---|---|---|
| **M** | état, appels `data/`, filtres, tris, calculs, retourne des données | `V`, `document`, `window`, HTML |
| **V** | `htmlToFragment`, composants `ui/`, DOM, `addEventListener` vers `C.handler_*` | référencer `M`, logique métier |
| **C** | référencer M **et** V, handlers `C.handler_<action>`, chargement, erreurs | accéder au DOM hors `ev`, stocker des données |

Un composant ne reçoit que des **données issues de M via C** et des
callbacks `C.handler_*`. Après une mutation, reconstruire la page depuis M
(`V.refresh`), pas de modifications DOM dispersées. En cas de doute sur
l'emplacement d'une fonction : s'arrêter et demander.

## 5. États obligatoires

| État | Traitement |
|---|---|
| Chargement | message ou squelette accessible (`aria-busy`, `role="status"`) |
| Vide | composant « vide » (voir `grille-produits/vide.html`) |
| Erreur réseau / API | `M.message` + `MessageView` ; distinguer 401, 403, 404 via `erreur.statut` |
| Succès | `M.message` de type `succes` |
| Stock | `statutStock()` de `lib/stock.js` + `BadgeStockView` ; bouton désactivé si épuisé |
| Auth | le serveur décide ; la page affiche sa réponse (voir `pages/admin`) |

Panier en `localStorage` : affichage uniquement, le serveur recalcule prix et
stock à la validation. Aucun rôle/prix/stock « de confiance » côté front.

## 6. Interdits

`foreach` ; `fetch` direct (passer par `data/` + `api-request.js`) ; HTML
construit par concaténation de valeurs utilisateur ; vocabulaire ou données de l'ancien catalogue de films ;
modification de `lib/router.js`, `global.css` ou de fichiers existants non
nécessaires à la page ; renommer/déplacer un fichier existant.

## 7. Fin de tâche

`node .agents/skills/verifier-mvc/scripts/check-mvc.js .` puis
`cd front && npm run build`, vérification à 320/375, 768, 1440 px, compte
rendu AGENTS §11 (avec l'US couverte et le rôle M/V/C de chaque changement).
Ne jamais commit/push.
