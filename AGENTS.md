# AGENTS.md — SAE301 Ben & Jerry's Click & Collect

## 0. Mission du projet

Ce dépôt est un prototype full-stack de site web responsive de click & collect
de glaces Ben & Jerry's. Le domaine produit glace est déjà en place : catalogue,
fiche produit avec variantes et stock, connexion et page d'administration. Le
produit cible est une boutique de pots de glace (et de produits associés), avec
variantes de format et options, inspirée de l'univers de marque de
[Ben & Jerry's France](https://www.benjerry.fr). Restent à construire le panier,
la commande, les options et le back-office complet.

Le client commande en ligne, puis retire sa commande en magasin : il n'y a ni
livraison ni paiement en ligne dans le périmètre.

Le résultat attendu doit fonctionner sur mobile, tablette et desktop. Il doit
conserver les principes de navigation, d'accessibilité, de sécurité et de
séparation front/back existants, tout en complétant le domaine produit glace
selon l'ordre de réalisation de la section 8.

Ne réorganise, ne renomme et ne déplace jamais un fichier existant sans demande
explicite. Respecte l'architecture présente avant de proposer une évolution.
Parcours l'intégralité du dépôt, y compris `front/`, `back/`, `sql/`, les
configurations et les sous-dossiers, avant une modification structurante.

## 1. Règles d'exécution impératives

- Ne committe et ne pousse jamais automatiquement. Le commit, le push et toute
  action Git distante ne sont effectués que si l'utilisateur le demande
  explicitement.
- Ne crée pas de dépendance, bibliothèque ou outil de build supplémentaire sans
  justification et accord lorsque l'impact est significatif.
- Ne modifie pas des secrets ou identifiants réels. Les valeurs sensibles
  restent dans la configuration locale et ne doivent jamais être ajoutées au
  dépôt.
- Avant une modification importante, lis les fichiers concernés et leurs
  appelants. Après modification, valide le comportement avec les commandes
  adaptées.
- Si deux architectures sont raisonnables et que le choix change fortement le
  code, arrête-toi et demande une décision.
- Les commentaires expliquent uniquement l'intention d'un choix non évident.
  Toute fonction, méthode ou classe publique doit être documentée en JSDoc ou
  PHPDoc.
- JAMAIS DE foreach.
- Les noms de méthodes et variables sont en anglais dans le code ; les données
  métier et commentaires pédagogiques peuvent rester en français comme dans
  l'existant.
- Pour chaque test que tu veux faire ou chose que tu veux vérifier :
  `cd front/` puis `npm run dev` puis ouverture du lien
  `http://localhost:5174/~bellevert1/SAE301-Starter/`. Grâce à la config
  `vite.config.js`, tout fonctionne sur ce lien.

## 2. Architecture actuelle à respecter

Le dépôt est un full-stack sans framework applicatif :

| Zone        | Rôle                                                                              | Emplacement      |
| ----------- | --------------------------------------------------------------------------------- | ---------------- |
| Front       | SPA Vite, Tailwind CSS 4, routeur client, pages et composants                     | `front/`         |
| Back        | API JSON PHP, routage, contrôleurs et accès PDO/MySQL                             | `back/`     |
| Données     | Schéma et seeds SQL, à faire évoluer vers produits/variantes/stock/commandes      | `sql/`           |
| Entrée HTTP | Réécriture `/api/...` vers PHP et du reste vers `front/dist/`                     | `.htaccess` |

Le front conserve le découpage `layouts/`, `pages/`, `ui/`, `data/` et `lib/`.
Le back conserve `Core/`, `Controller/`, `Model/`, `routes.php` et son point
d'entrée `back/index.php`. Ne crée pas une nouvelle couche ou un nouveau
framework seulement pour contourner cette structure.

Voir README.md pour le détail de l'arborescence et de l'architecture.

## 3. MVC strict

Pour chaque page dynamique, respecter strictement :

- **M — Modèle** : état de la page, données reçues, appels et transformations
  métier. Il ne référence jamais la Vue et ne touche jamais au DOM.
- **V — Vue** : templates, rendu, accès DOM et déclaration des événements. Elle
  reçoit les données en paramètre et ne référence jamais le Modèle.
- **C — Contrôleur** : orchestre M et V, charge les données, valide les actions
  et contient les handlers. C est le seul objet qui référence M et V.

En JavaScript vanilla, `C.init()` est appelé après toutes les déclarations
comme point d'entrée de la page. Dans le front modulaire actuel, la fonction de
page peut retourner `C.init()` au routeur, mais la séparation M/C/V reste
obligatoire.

Lorsqu'une fonctionnalité est ajoutée, la découper ainsi :

1. donnée, règle ou calcul → M ;
2. affichage, template ou écouteur → V ;
3. réaction à l'action → C.

Un composant UI ne décide pas de la donnée à afficher : il reçoit ses données
et signale l'action via des callbacks. Une page est reconstruite depuis son
état après une mutation importante ; évite les modifications DOM dispersées.

**Toute modification ou ajout respecte strictement ce découpage.** En cas de doute
sur l'emplacement d'une fonction, s'arrêter et demander plutôt que de mélanger les rôles.

```
data (M) ----get----
                    |
                 C (Contrôleur) ------> page web
                    |
template (V) --get--
```

### M — le Modèle : les données et leur manipulation

- Contient les données de l'application (`M.products`, `M.cart`) et les fonctions qui
  les lisent, filtrent ou transforment (`M.filterProducts(byCategory)`).
- Ses fonctions reçoivent des valeurs simples en paramètre et **retournent des données**
  (tableaux, objets), jamais du HTML.
- **Interdit :** toute référence à `V`, tout accès au DOM (`document`, `window`, éléments HTML,
  événements).
- Autorisé : appeler `C` si besoin.

### V — la Vue : la page web

- Seul endroit où l'on touche au DOM : `document.querySelector`, lecture des `<template>`,
  `innerHTML`, `addEventListener`.
- `V.formatOne...(valeur)` remplit un template (`{{nom}}` → valeur) et retourne une chaîne.
- `V.render...(data)` reçoit les données **en paramètre** et les affiche ; elle ne décide
  pas quelles données afficher.
- `V.init()` enregistre les événements à surveiller et leur associe un gestionnaire de `C`.
- **Interdit :** toute référence à `M`, toute logique métier (filtrer, trier, calculer sur les
  données), tout gestionnaire d'événement qui ne soit pas une méthode de `C`.

### C — le Contrôleur : le lien entre M et V

- `C.init()` lance l'application : initialise la Vue (et le Modèle s'il en a besoin), puis fait
  le premier affichage. L'appel `C.init();` en dernière ligne est l'unique point d'entrée.
- `C.handler_<action>(ev)` gère un événement : lit l'information utile dans `ev`
  (ex. `ev.target.dataset.category`), interroge ou met à jour `M`, puis appelle `V` pour
  rafraîchir l'affichage.
- C est le seul objet autorisé à référencer à la fois `M` et `V`.
- **Interdit :** accéder au DOM autrement que par l'objet `ev` reçu ; stocker les données de
  l'application (elles vont dans `M`).

### Conventions à suivre

- Une fonction par propriété : `M.xxx = function(...) { ... }`, précédée d'un commentaire
  qui donne ses paramètres (`. paramètre ...`) et sa valeur de retour (`> valeur de retour ...`),
  comme dans le code existant.
- Noms : `M.filter...`, `V.formatOne...`, `V.render...`, `V.init`, `C.init`, `C.handler_clickOn...`.
- Un nouveau besoin se découpe toujours ainsi : donnée ou calcul → M ; affichage ou
  événement → V ; réaction à l'événement → C.

## 4. Front-end JavaScript

- Utilise ES modules et les conventions déjà présentes dans `front/src/`.
- Privilégie la délégation d'événements sur un ancêtre commun lorsque des
  éléments sont recréés dynamiquement (cartes de glaces, lignes du panier).
- Toutes les données injectées dans un placeholder doivent être échappées.
  N'utilise `innerHTML` brut que via les helpers existants et jamais avec une
  valeur utilisateur non échappée.
- Les appels réseau passent par `front/src/data/` et
  `front/src/lib/api-request.js`, avec `async/await`, gestion explicite des
  erreurs et des statuts HTTP.
- Le routeur doit conserver les liens `data-link`, le `basename` Vite et la
  page 404. Les URL propres du sujet (`/produit/nom-produit`,
  `/categorie/nom-categorie`) passent par ce routeur et par `.htaccess`.
- Le panier est stocké en `localStorage` (donc modifiable par le client) :
  il ne sert qu'à l'affichage, le serveur recalcule tout à la validation.
- Les états loading, vide, erreur, succès, authentification et indisponibilité
  du stock (« Bientôt épuisé », « Épuisé ») doivent être visibles et accessibles.

## 5. Design responsive et direction artistique

Le site cible reprend l'univers observable chez Ben & Jerry's :

- ton ludique, gourmand et engagé, mais interface lisible et structurée ;
- navigation claire, barre supérieure compacte, menus utilisables au clavier ;
- grands visuels de pots de glace, hero éditorial, cartes produit généreuses
  (pot, nom du parfum, description des morceaux et swirls) et espaces aérés ;
- palette de marque inspirée du packaging (fond clair, aplats de couleurs
  vives par parfum, bleu/blanc de la marque), avec une couleur d'accent
  contrôlée par le design system ;
- typographie arrondie et expressive pour les titres, texte courant très
  lisible, contrastes conformes à l'accessibilité, animations discrètes et
  utiles ;
- grilles et composants Mobile First : une colonne mobile, composition
  intermédiaire tablette, grille et navigation étendues desktop ;
- aucune largeur, image ou interaction ne doit casser entre 320 px et desktop ;
- les images (pots, ingrédients) doivent prévoir `alt`, ratio, lazy-loading
  lorsque pertinent et état de chargement.

Le responsive est une contrainte fonctionnelle, pas une finition. Vérifie au
minimum les vues à 320/375 px, 768 px et 1440 px lorsque l'UI est modifiée.
Utilise Tailwind en Mobile First et garde les classes écrites en entier pour
que le compilateur les détecte.

### CSS, Tailwind et Sass

- Le projet actuel utilise Tailwind CSS 4 via `@tailwindcss/vite`.
- Configure les tokens dans `@theme inline`, en séparant tokens primitifs et
  tokens sémantiques.
- Utilise des variables CSS privées de composant (`--_bg`, `--_fg`, etc.) ;
  les modifiers ne font que réassigner les variables.
- Ne pas introduire Sass ou CSS basique : on reste sur Tailwind v4.
- Architecture Tailwind v4 à respecter (c'est un exemple) :

```css
@import "tailwindcss";

@theme inline {
  --color-....: var(--clr-....);
}

@layer base {
  :root {
    /* Tokens primitifs (couleurs de base) */
    --clr-indigo-600: oklch(51.1% 0.262 276.966);

    /* Tokens sémantiques (ils disent à quoi ils vont servir) */
    --clr-card-background: var(--clr-indigo-600);
  }
}

.bouton--white {
  --clr-text-btn: var(--clr-indigo-600);
}
```

## 6. Back-end PHP

- `declare(strict_types=1)` dans chaque fichier PHP.
- Conserve `back/index.php` comme point d'entrée unique : autoload,
  configuration, connexion, session, contrôleurs et routeur.
- Les contrôleurs valident la requête et orchestrent ; les modèles interrogent
  la base ; `Core/` contient les abstractions HTTP, DB et routage.
- Type toutes les propriétés, paramètres et valeurs de retour.
- Encapsule l'état avec `private`/`protected`, getters/setters validants et
  fluent setters uniquement lorsqu'ils correspondent au besoin.
- Préfère abstraction et polymorphisme pour les comportements réellement
  partagés.
- N'utilise jamais `foreach` ; utilise `for`, `while`, `array_map` ou un autre
  itérateur explicite.
- Ne renvoie jamais de HTML depuis l'API : les réponses restent JSON via
  `Response::json()` ou `Response::erreur()`.
- Messages de validation et d'erreur renvoyés en français.

## 7. Données, commandes et sécurité

Le futur modèle métier doit préserver les décisions suivantes :

- un produit (un parfum de glace) a au moins une **variante**, par exemple
  « pot 100 ml » et « pot 465 ml » ; un produit sans choix possible a une
  variante par défaut. Le **stock est porté par la variante** ;
- les **options** (par exemple topping, cône ou gaufrette, coupelle, cuillère)
  sont choisies sur la fiche produit et figées dans la commande ;
- panier et lignes de commande identifiés par `variantId`, avec options
  choisies et **prix unitaire figé** (instantané du prix et des libellés) ;
- numéro de commande unique (ex. `CC-2026-000123`, avec contrainte `UNIQUE`) ;
- validation de commande dans une **transaction SQL** dès la première version,
  tables en InnoDB ;
- décrément et journal des mouvements de stock à la validation, recrédit
  uniquement au passage à « annulée » via une fonction unique de changement
  de statut ;
- seuil « Bientôt épuisé » stocké dans une table de paramètres, modifiable
  en back-office ;
- authentification par session serveur et rôle non fiable côté client ;
  admin séparé du client ;
- seeds disponibles dès le début pour débloquer les écrans de lecture : au
  minimum **3 catégories de 4 produits** (ex. pots classiques, sans lactose,
  sorbets), chaque produit avec ses variantes.

Règles obligatoires :

- requêtes PDO préparées pour les valeurs ;
- liste blanche serveur pour tout identifiant SQL dynamique (`ORDER BY`,
  colonnes, filtres structurants) ;
- `session_start()` une seule fois, après configuration du cookie (`Path`,
  `HttpOnly`, `Secure`, `SameSite`) et avant toute sortie ;
- `password_hash` / `password_verify` ; `session_regenerate_id(true)` après
  connexion réussie ou élévation de privilège ;
- aucun rôle, droit, prix ou état de commande de confiance dans un cookie ;
- réponses JSON centralisées avec code HTTP explicite et terminaison via `exit` ;
- validation serveur de toute quantité, variante, option, disponibilité, prix
  et état de commande, le front ne fait jamais foi : à la validation, le serveur
  relit les prix en base et ignore ceux envoyés par le navigateur ;
- les écritures de commande et de stock sont atomiques, idempotentes lorsque
  nécessaire et protégées contre la survente, par exemple
  `UPDATE variante SET stock = stock - :q WHERE id = :id AND stock >= :q`
  puis contrôle de `rowCount()` ;
- jeton CSRF sur les formulaires sensibles (surtout admin) ; téléversement
  d'images contrôlé (type réel, taille, renommage) ;
- changer de mot de passe exige l'ancien.

## 8. Ordre de réalisation métier

Source : le tableau des dépendances ci-dessous.
Respecte cet ordre sauf décision explicite. Une US n'est terminée qu'avec la
DoD commune du sujet : branche dédiée et commits propres, HTML/CSS valides W3C,
charte et responsive, 3 navigateurs, validation client **et** serveur en
français, contrôle des droits.

| #  | US                                             | Dépend de                  | Complexité |
| -- | ---------------------------------------------- | -------------------------- | ---------- |
| 0  | Socle : schéma complet avec variantes, seeds, routeur + `.htaccess`, layout, tokens, déploiement mmi.unilim.fr | — | — |
| 1  | `DEC-b` Catalogue                              | aucune                     | Légère     |
| 2  | `DEC-c` Détail produit (URL `/produit/...`)    | DEC-b                      | Légère     |
| 3  | `DEC-a` Catégories (URL `/categorie/...`)      | DEC-b                      | Légère     |
| 4  | `CMD-b` Panier (clé = `variantId`)             | DEC-b, DEC-c               | Lourde     |
| 5  | `CMD-c` Authentification                       | aucune                     | Moyenne    |
| 6  | `CMD-a` Validation de commande                 | CMD-b, CMD-c               | Lourde     |
| 7  | `STK-b` Affichage du stock                     | DEC-b                      | Légère     |
| 8  | `STK-a` Mise à jour automatique du stock (même transaction que CMD-a) | STK-b, CMD-a | Lourde |
| 9  | `STK-c` Contraintes de stock                   | STK-b, CMD-b, CMD-a        | Moyenne    |
| 10 | `OPT-c` Choix des options                      | DEC-c                      | Moyenne    |
| 11 | `OPT-a` Options dans panier et commandes       | OPT-c, CMD-b, CMD-a        | Moyenne    |
| 12 | `OPT-b` Variantes et stock                     | OPT-c, STK-a, STK-b, STK-c | Moyenne (variantes anticipées dès le schéma) |
| 13 | `GOF-b` Back-office (socle admin)              | aucune                     | Moyenne    |
| 14 | `GOF-c` Gestion des catégories                 | GOF-b                      | Moyenne    |
| 15 | `GOF-a` Gestion des produits                   | GOF-b, STK-b               | Lourde     |
| 16 | `PIL-b` Gestion des commandes (annulation = recrédit via STK-a) | GOF-b, CMD-a, STK-a | Lourde |
| 17 | `SUI-b` Espace personnel                       | CMD-c                      | Légère     |
| 18 | `SUI-c` Historique des commandes               | CMD-a                      | Moyenne    |
| 19 | `SUI-a` Commander à nouveau                    | SUI-c, CMD-b, STK-c        | Moyenne    |
| 20 | `PIL-a` Statistiques                           | GOF-b, CMD-a, STK-b        | Lourde     |
| 21 | `PRO-c`, puis `PRO-a`, `PRO-b` (bonus uniquement, après stabilisation) | US précédentes terminées | Légère |

Jalons :

- après l'US 3 : epic « Découvrir l'offre » terminé et fusionné dans `main` ;
- après l'US 6 : parcours d'achat complet de bout en bout (epic « Commander ») ;
- après l'US 9 : **MVP** (découvrir, commander, stock) en ligne ;
- après l'US 12 : options et variantes ;
- après l'US 16 : back-office et traitement des commandes.

Ne commence pas une US si ses dépendances du tableau source ne sont pas
terminées, sauf demande explicite. Ne fusionne jamais dans `main` une branche à
moitié finie. Pour chaque US, conserve la traçabilité entre interface, API,
modèle SQL, critères d'acceptation et validation. Ne code pas sans mon accord
et mes demandes : je te demande de coder des fonctions ou fonctionnalités une
par une, pas de tout faire à ma place.

## 9. Vérification obligatoire

Toujours à la fin de chaque requête, vérifier le découpage :
`node .agents/skills/verifier-mvc/scripts/check-mvc.js .`

## 10. Documentation et compte rendu

Toute documentation générée doit être pédagogique : sections numérotées,
tableaux récapitulatifs, check-lists et diagnostic.

## 11. Après chaque modification

Fournis un résumé clair et expliqué avec :

1. la liste des fichiers modifiés, créés ou supprimés avec leur chemin d'accès ;
2. le détail des modifications apportées avec les lignes ;
3. les éventuels points d'attention et/ou étapes suivantes recommandées en
   respectant toujours l'ordre qui doit être suivi ;
4. les éventuels impacts sur le reste de l'application.
