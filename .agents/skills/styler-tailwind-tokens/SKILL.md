---
name: styler-tailwind-tokens
description: Applique le design system (tokens Tailwind v4 de global.css, thème clair/sombre, responsive mobile first, accessibilité, direction artistique Ben & Jerry's) à un composant ou une page. À consulter à chaque fois que du HTML/Tailwind est écrit ou modifié.
---

# Styler avec les tokens du projet

Le style vit dans `front/src/global.css` (Tailwind CSS 4 via
`@tailwindcss/vite`, **pas de Sass, pas de CSS classique**). Ne pas modifier
`global.css` sans demande visuelle explicite : l'enrichir (nouveau token,
`@utility`) est une décision à faire valider.

## 1. Tokens disponibles (classes Tailwind)

| Rôle | Classes |
|---|---|
| Fonds | `bg-bg-default`, `bg-bg-subtle`, `bg-bg-accent`, `bg-bg-brand`, `bg-bg-highlight`, `bg-bg-success`, `bg-bg-inverse`, `bg-bg-placeholder`, `bg-bg-muted` |
| Textes | `text-fg-default`, `text-fg-muted`, `text-fg-brand`, `text-fg-on-brand`, `text-fg-on-highlight`, `text-fg-on-success`, `text-fg-on-muted`, `text-fg-inverse` |
| Bordures | `border-border-default`, `border-border-strong`, `border-border-brand`, `border-border-focus` |
| Rayons | `rounded-sm` 4, `-md` 8, `-lg` 12, `-xl` 16, `-full` |
| Espaces | variables `--space-*` : `p-(--space-16)` ; sinon échelle Tailwind |
| Utilitaires | `conteneur` (marges 16/32/120 px, max 1200 px), `bandeau-clair` / `dark:bandeau-sombre` (dégradé via `--teinte`) |

Primitives (`--color-bleu-900`, `--color-jaune-400`…) : **jamais** dans un
composant, uniquement via les tokens sémantiques. Les tokens changent seuls
en thème sombre (classe `.theme-dark` sur `<html>`) ; `dark:` n'est utile
que pour une valeur non tokenisée (ex. `ui/message`).

Besoin d'une couleur absente (parfum, accent) : proposer d'ajouter un token
primitif + sémantique dans `global.css` (structure `@theme` / `@theme
inline` / `:root` + `.theme-dark`) plutôt qu'une valeur en dur.

## 2. Règles

- **Classes écrites en entier**, jamais assemblées par concaténation : mettre
  les variantes dans un objet de constantes (voir `ui/badge-stock`).
- Variables privées de composant pour les variantes (`--_bg`, `--_fg`) : le
  modifier ne fait que les réassigner.
- **Mobile first** : base = 320 px (1 colonne) ; `md:` ≥ 768 px (tablette) ;
  `lg:`/`xl:` desktop. Grilles de référence : `grid-cols-2 md:grid-cols-3
  xl:grid-cols-4`. Aucune largeur fixe qui déborde ; images `w-full`, `aspect-*`,
  `object-cover`, `width`/`height` renseignés.
- Rendu : titres expressifs et gras, texte courant lisible, espaces aérés,
  cartes généreuses, accent via `bg-bg-brand`/`bg-bg-highlight`, animations
  discrètes (`transition-colors`, `transition-opacity`), respecter
  `motion-reduce:`.
- Accessibilité : contraste conforme (n'utiliser que les paires fg/bg
  prévues : `fg-on-brand` sur `bg-brand`, etc.), focus déjà géré
  globalement (`:focus-visible`), cibles ≥ 40 px, ne jamais coder un état
  par la couleur seule (texte/icône en plus), `disabled` visible
  (`cursor-not-allowed`).
- Images de pots/ingrédients : `alt` descriptif, ratio fixe, `loading="lazy"`,
  état de chargement (fond `bg-bg-placeholder`).

## 3. Vérification responsive

`cd front && npm run dev`, ouvrir
`http://localhost:5174/~bellevert1/SAE301-Starter/`, contrôler à 320, 375,
768 et 1440 px (clair **et** sombre) : pas de défilement horizontal, textes
non coupés, cibles tactiles utilisables, ordre de tabulation logique. Puis
`npm run build` (le compilateur ne détecte que les classes entières).
