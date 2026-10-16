---
name: creer-composant-ui
description: Crée un composant présentatif dans front/src/ui/ (index.js + template.html, éventuellement sous-templates) pour le site click & collect Ben & Jerry's. À utiliser pour une carte, un badge, un formulaire, une liste, un bandeau, un résumé de panier, un sélecteur d'options, etc.
---

# Créer un composant UI

Un composant UI est **présentatif** : il reçoit des données et des callbacks,
retourne un `DocumentFragment`. Il ne charge jamais l'API, ne décide pas de
la navigation et ne contient aucune règle métier (filtrer, trier, calculer).
Modèles de référence : `ui/carte-produit/`, `ui/badge-stock/`,
`ui/grille-produits/`, `ui/filtres-categories/`, `ui/fiche-produit/`.

## 1. Avant d'écrire

1. Lire `AGENTS.md` (sections 3, 4, 5) et un composant voisin.
2. Vérifier qu'aucun composant existant ne convient (`ls front/src/ui/`).
3. Annoncer à l'utilisateur : nom du composant, forme des données reçues,
   callbacks exposés, états gérés. Attendre son accord (AGENTS §8 : une
   fonctionnalité à la fois, pas de code non demandé).

## 2. Structure de fichiers

```
front/src/ui/<nom-en-kebab-case>/
├── index.js        l'objet <Nom>View
├── template.html   le gabarit principal
└── <sous>.html     sous-gabarits répétés (ligne, chip, vignette…), si besoin
```

Dossier en kebab-case français comme l'existant (`carte-produit`), objet
exporté `<Nom>View` en PascalCase. Noms de méthodes et variables **en
anglais**.

## 3. Gabarit de `index.js`

```js
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const STATES = {
  default: "border border-border-default bg-bg-default text-fg-default",
  selected: "border border-border-brand bg-bg-brand text-fg-on-brand",
};

// <Résumé d'une ligne.> data vaut { champ, champ }.
let ExempleView = {
  /**
   * @param {{name: string, selected: boolean}} data - les données à afficher.
   * @param {function(string): void} onPick - appelée avec l'id choisi.
   * @returns {DocumentFragment}
   */
  dom: function (data, onPick) {
    let fragment = htmlToFragment(
      genericRenderer(template, { name: data.name, classes: STATES.default })
    );

    // Composant imbriqué : il prend la place d'un <slot name="...">.
    // fragment.querySelector('slot[name="badge"]').replaceWith(BadgeView.dom(...));

    // Délégation : un seul écouteur sur la racine, il survit aux recréations.
    fragment.firstElementChild.addEventListener("click", (ev) => {
      let button = ev.target.closest("button[data-action]");
      if (button === null || button.disabled) return;
      onPick(button.dataset.id);
    });

    return fragment;
  },
};

export { ExempleView };
```

Si le composant est aussi inséré en chaîne dans un autre template, exposer en
plus `html: function (data) { return genericRenderer(...) }` (voir
`BadgeStockView`).

## 4. Règles du template HTML

- Placeholders `{{cle}}` : **toujours échappés** par `genericRenderer`. Jamais
  de HTML brut dans une valeur ; pour insérer un composant, utiliser
  `<slot name="...">` + `replaceWith`.
- Un seul élément racine par template (le `firstElementChild` reçoit
  l'écouteur délégué).
- Sémantique d'abord : `<article>`, `<button type="button">`, `<ul>/<li>`,
  `<label for>`, `<fieldset>/<legend>`, titres hiérarchisés.
- Accessibilité : `alt` sur toute image (avec `width`, `height`, ratio et
  `loading="lazy"` hors du haut de page), `aria-label` sur les boutons
  icônes, `aria-pressed` / `aria-current` pour les états, `aria-live="polite"`
  sur les messages dynamiques, `disabled` pour l'indisponible, cible tactile
  ≥ 40 px (`min-h-10`/`min-h-12`).
- Liens internes : `href="/chemin" data-link` (le routeur ajoute le basename).
- Styles : voir le skill `styler-tailwind-tokens`.

## 5. États à prévoir (AGENTS §4)

Le composant doit pouvoir représenter, selon son rôle : chargement
(squelette), vide, erreur, succès, **stock** (`disponible`, `bientot`,
`epuise` via `BadgeStockView` et `lib/stock.js`), authentification requise.
Le *choix* de l'état est fait par la page (M/C) : le composant reçoit
l'état en paramètre.

## 6. Interdits

- `import` de `data/`, de `api-request.js`, ou d'une page.
- `foreach` (utiliser `map`, `filter`, `for`).
- `innerHTML` avec une valeur non échappée, `document.querySelector` hors du
  fragment du composant.
- Calcul de prix, total, statut de stock **dans** le composant : la page les
  prépare (`formaterPrix` de `lib/format.js` pour l'affichage uniquement).
- Classes Tailwind assemblées dynamiquement (`"bg-" + couleur`).

## 7. Fin de tâche

1. `node .agents/skills/verifier-mvc/scripts/check-mvc.js .`
2. `cd front && npm run build`
3. Vérification visuelle à 320/375, 768 et 1440 px (`npm run dev`, puis
   `http://localhost:5174/~bellevert1/SAE301-Starter/`).
4. Compte rendu au format AGENTS §11 (fichiers, lignes, points d'attention,
   impacts). Ne jamais commit/push.
