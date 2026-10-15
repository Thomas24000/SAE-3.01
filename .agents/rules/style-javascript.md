---
trigger: glob
globs: ["front/**/*.js", "front/**/*.html"]
---

# Style JavaScript du front

- Utiliser les ES modules et les imports relatifs déjà présents dans
  `front/src/`.
- Respecter l'organisation `pages/`, `ui/`, `data/` et `lib/`.
- Documenter les fonctions et classes publiques en JSDoc.
- Utiliser `async/await` pour les appels réseau et gérer explicitement les
  erreurs HTTP.
- Échapper toute donnée injectée dans un placeholder. Réutiliser
  `genericRenderer` et `htmlToFragment` plutôt que d'injecter du HTML brut.
- Préférer la délégation d'événements lorsque les éléments sont recréés.
- Ne pas construire des classes Tailwind dynamiquement : écrire les classes
  complètes dans le code.
- Ne jamais stocker dans le front une donnée de confiance comme un rôle,
  un prix définitif, un stock disponible ou un droit d'administration.
- Les composants doivent rester réutilisables et recevoir leurs callbacks
  depuis la page.
- Les fonctions et variables suivent les conventions de l'existant ;
  commentaires et textes utilisateur restent en français lorsque le produit
  le prévoit, noms techniques en anglais.
