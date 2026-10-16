---
trigger: always_on
---

# Architecture front-end et séparation MVC

Le front utilise des ES modules Vite et une séparation MVC **par page
dynamique**, pas trois objets globaux dans un fichier unique.

- **M (Modèle)** : état de la page, appels aux modules `front/src/data/` et
  transformations métier. Il ne touche jamais au DOM et ne construit jamais
  de HTML.
- **V (Vue)** : templates HTML, `htmlToFragment`, rendu et branchement des
  événements DOM. Elle reçoit les données en paramètre et ne connaît pas
  l'état interne de M.
- **C (Contrôleur)** : chargement des données, validation des actions et
  callbacks entre M et V. C orchestre la page et ne devient pas un second
  stockage métier.

Une page dynamique suit le modèle présent dans
`front/src/pages/produits/page.js` et `front/src/pages/admin/page.js` :
état privé de page, contrôleurs d'actions, puis fonctions de rendu. La page
exportée retourne `C.init()` au routeur.

Les composants de `front/src/ui/` restent présentatifs : ils reçoivent des
données et des callbacks (`actions`), sans charger eux-mêmes l'API ni décider
de la navigation métier. Les appels HTTP passent par `front/src/data/` et
`front/src/lib/api-request.js`.

Pour une nouvelle fonctionnalité, demander une clarification avant de mélanger
les responsabilités. Répartir systématiquement :

1. données et règles métier → M/data ;
2. templates, affichage et événements DOM → V/UI ;
3. orchestration et réactions → C/page.

Cette règle n’impose pas `C.init()` en dernière ligne d’un fichier global :
dans le projet Vite, le routeur appelle les pages exportées.
