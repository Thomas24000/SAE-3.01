---
name: verifier-mvc
description: Vérifie la séparation Modèle/Vue/Contrôleur du front Vite, les composants UI, les appels API et les règles de sécurité front. À utiliser avant de conclure une modification de page, composant ou module data.
---

# Vérifier l'architecture front

## Quand utiliser ce skill

Utiliser après une modification de `front/src/pages/`, `front/src/ui/`,
`front/src/data/` ou `front/src/lib/`, et avant de conclure une fonctionnalité
front importante. Ne pas l'utiliser pour une modification PHP ou SQL seule.

## Étapes

1. Lire les fichiers modifiés et leurs imports directs.
2. Vérifier manuellement que :
   - un module `data/` ne touche pas au DOM ;
   - une page ne met pas son HTML directement dans le module API ;
   - un composant UI ne charge pas l'API et ne contient pas de règle métier ;
   - les événements appellent des callbacks de page ;
   - les données utilisateur passent par un échappement avant le template ;
   - les statuts `401`, `403`, erreurs réseau, chargement et état vide sont
     traités lorsqu'ils sont concernés.
3. Lancer le contrôle automatisé :

```bash
node .agents/skills/verifier-mvc/scripts/check-mvc.js .
```

4. Lancer le build front :

```bash
cd front
npm run build
```

5. Signaler les violations et les fichiers concernés. Ne pas modifier
   `index.html` ou `global.css` pour masquer une erreur d'architecture ; une
   modification visuelle explicite peut naturellement toucher ces fichiers.

## Résultat attendu

Rendre un compte rendu indiquant :

- fichiers contrôlés ;
- séparation M/data, V/UI et C/page ;
- erreurs ou états traités ;
- résultat du script et du build ;
- éventuels points volontairement différés.
