---
name: ajouter-fonctionnalite-mvc
description: Ajoute une fonctionnalité front au site click & collect de drones en respectant pages, composants UI, modules data et séparation MVC. À utiliser pour catalogue, détail produit, catégories, panier, commande, stock ou administration.
---

# Ajouter une fonctionnalité front

## Étapes obligatoires

1. Identifier l'US concernée dans le tableau de la section 8 d'`AGENTS.md` et
   vérifier ses dépendances.
2. Lire les pages, composants, modules data, routeur et templates concernés.
3. Présenter un découpage avant d'écrire :
   - M/data : état, appels API et transformations ;
   - V/UI : template, rendu, accessibilité et événements ;
   - C/page : orchestration, callbacks, navigation et erreurs.
4. Attendre la validation de l'utilisateur avant d'écrire le code lorsque le
   périmètre ou le comportement n'est pas explicitement demandé.
5. Implémenter sans créer de dépendance inutile :
   - réutiliser `api-request.js`, `utils.js` et les composants existants ;
   - échapper les valeurs des templates ;
   - gérer loading, vide, erreur, succès et indisponibilité du stock ;
   - vérifier les vues mobile, tablette et desktop.
6. Lancer le skill `verifier-mvc`.
7. Lancer `npm run build` dans `front`.

## Contraintes

- Ne pas revenir à un fichier JavaScript monolithique ni à des objets globaux
  pour simuler le MVC.
- Ne pas utiliser de données de film pour une nouvelle fonctionnalité drone.
- Ne jamais faire confiance au front pour le prix, le rôle, le stock ou les
  permissions.
- Ne pas modifier le back ou le schéma SQL dans la même tâche sans demande
  explicite liée au contrat API ou à l'US.
- Ne jamais commit ou push automatiquement.

## Compte rendu

Indiquer les fichiers modifiés, le rôle M/V/C de chaque changement, l'US
couverte, les états d'interface traités, le résultat du contrôle architectural
et du build.
