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

## 12. Cartographie du dépôt (état au 19/10/2026)

Carte de référence pour retrouver vite où vit chaque chose avant une
construction. **À tenir à jour** à chaque fichier, route ou table ajouté
(voir 12.10). En cas d'écart entre cette carte et le code, le code fait foi.

### 12.1 Contexte : `public_html/`

| Dossier | Rôle | Toucher ? |
| --- | --- | --- |
| `SAE301-Starter/` | **le projet SAE301** (Ben & Jerry's) | oui |
| `Base/` | évaluation R3.13 cookies/sessions (catalogue de films), `REPONSES.md` | non |
| `R3.13-TP1/` | TP cookies/sessions (films) + énoncés HTML | non |
| `.htaccess` (racine) | auth LDAP de l'espace perso (fichier `root`) | non |

`Base/` et `R3.13-TP1/` sont l'ancêtre du Starter (même architecture PHP
`Core/Controller/Model`, mêmes helpers). Ils servent uniquement de référence :
ne jamais reprendre leur vocabulaire « films » (voir skill
`ajouter-fonctionnalite-mvc`).

### 12.2 Arborescence commentée de `SAE301-Starter/`

```
.htaccess                    /api/* → back/index.php ; /uploads/* servi tel quel ; le reste → front/dist/ (fallback index.html)
uploads/                     images téléversées (GOF-a), ignorées par Git ; .htaccess : aucun script exécuté
.gitignore                   ignore front/node_modules/ et front/dist/
AGENTS.md / README.md        règles (ce fichier) / doc d'installation pour humains
.agents/
├── rules/                   règles auto-chargées par glob
│   ├── architecture-mvc.md  (always_on) MVC par page
│   ├── php-backend.md       (back/**/*.php)
│   ├── sql-data.md          (sql/**/*.sql)
│   └── style-javascript.md  (front/**/*.js|html)
└── skills/                  procédures à ouvrir AVANT de coder (voir 12.9)
    └── verifier-mvc/scripts/check-mvc.js   contrôle statique obligatoire
sql/glaces.sql               schéma + seeds (rejouable : DROP puis CREATE)
back/
├── index.php                point d'entrée unique : autoload, config, PDO, injection, session, Router
├── config/config.php        chemin du projet, identifiants BDD (SECRETS, ne jamais afficher), debug
├── config/.htaccess         Require all denied
└── src/
    ├── .htaccess            Require all denied
    ├── routes.php           table 'METHODE /api/chemin' => [Controleur::class, 'methode']
    ├── Core/                Database (PDO singleton), Request (+ en-têtes), Response (json/erreur + exit), Router, SessionAdmin (garde admin + jeton CSRF), Texte (slug, nettoyage), Televersement (images : contrôle, GD, miniatures)
    ├── Controller/          AdminAuthController, AdminCategorieController, AdminProduitController, AuthController, CommandeController, ProduitController, StatsController
    └── Model/               CategorieModel, CommandeModel, ProduitAdminModel, ParametreModel, ProduitModel, UtilisateurModel
back/tests/stock.php         tests CLI du stock STK-a (base jetable, `Require all denied`)
front/
├── index.html               page unique : police Inter, script inline du thème, #app, main.js
├── vite.config.js           BASE = "/~bellevert1/SAE301-Starter/", proxy /api → mmi.unilim.fr
├── package.json             scripts dev / build / preview ; deps : vite 8, tailwindcss 4
├── public/images/           bandeau-accueil.png + produits/*.svg (12 visuels) → copiés dans dist/
├── dist/                    BUILD GÉNÉRÉ (npm run build) : ne jamais éditer à la main
└── src/
    ├── main.js              déclaration du routeur, du layout et des routes
    ├── global.css           Tailwind v4 + tokens (primitives / sémantique / dimensions) + thème sombre
    ├── layouts/root/        RootLayout : header + <slot> page + footer
    ├── layouts/admin/       AdminLayout (préfixe /admin) : navigation latérale + <slot> page ; sans admin connecté, juste la page
    ├── pages/<nom>/         page.js (M/C/V) + template.html (+ sous-templates)
    ├── ui/<nom>/            composants présentatifs : index.js + template.html (+ sous-templates)
    ├── data/                couche réseau / stockage, un module par ressource
    └── lib/                 router, utils (rendu), api-request, format, stock, theme
```

### 12.3 Cycle d'une requête

| Étape | Navigateur → | Fichier qui répond |
| --- | --- | --- |
| 1 | `GET /~bellevert1/SAE301-Starter/produit/cookie-dough` | `.htaccess` règle 2 → `front/dist/produit/...` inexistant → règle 3 → `front/dist/index.html` |
| 2 | `index.html` charge `main.js` | `Router.start()` → `handleRoute()` |
| 3 | route `/produit/:slug` trouvée | `ProduitPage({ slug })` → `C.init()` |
| 4 | `C.charger()` → `ProduitData.fetchOne(slug)` | `lib/api-request.js` → `fetch(BASE + "api/produit?slug=...")` |
| 5 | `/api/produit` | `.htaccess` règle 1 → `back/index.php` → `Router::traiter()` → `ProduitController::show()` → `ProduitModel::findBySlug()` |
| 6 | réponse JSON (ou `{ erreur }` + statut) | `Response::json()` / `Response::erreur()` puis `exit` |
| 7 | retour en front | `ErreurApi(message, statut)` si `!ok` ; sinon M rempli → `V.init()` renvoie un fragment |
| 8 | rendu | le routeur insère la page dans le `<slot>` du layout, met `aria-current`, `scrollTo(0,0)` |

En dev (`npm run dev`), l'étape 5 passe par le proxy Vite vers
`https://mmi.unilim.fr` : **le back doit être déployé** pour que l'API réponde.

### 12.4 Routes front (`front/src/main.js`)

| Route | Page | US | État |
| --- | --- | --- | --- |
| `/` | `pages/produits` (catalogue, filtres catégorie, « Voir plus » par 8, bandeau) | DEC-b + STK-b | fait |
| `/produit/:slug` | `pages/produit` (galerie, variantes, quantité, ajout panier ; 404 si slug inconnu) | DEC-c | fait |
| `/panier` | `pages/panier` (lignes, ±, suppression, résumé, réconciliation avec l'API) | CMD-b | fait (« Valider » : non connecté → `/connexion?retour=/commande` ; connecté → `/commande`) |
| `/commande` | `pages/commande` (récapitulatif en lecture seule, bouton « Confirmer ma commande », redirige vers la connexion si besoin) | CMD-a | fait (à tester en navigateur) |
| `/commande/:numero` | `pages/confirmation` (numéro, statut, date, lignes aux prix figés, total ; 401/404 affichés) | CMD-a | fait (à tester en navigateur) |
| `/admin` | `pages/admin` : écran de connexion admin sans session, tableau de bord (4 indicateurs) avec session ; layout `AdminLayout` | GOF-b | fait (non testée en navigateur ni sur la vraie base) |
| `/connexion` | `pages/connexion` (formulaire, ou « connecté » + déconnexion ; `?retour=` filtré) | CMD-c | fait |
| `/inscription` | `pages/inscription` (validation client + serveur, connecte aussitôt) | CMD-c | fait |
| `/admin/categories` | `pages/admin-categories` (liste, modale de suppression avec réaffectation) | GOF-c | fait (non testée en navigateur ni sur la vraie base) |
| `/admin/categories/nouvelle`, `/admin/categories/:id/modifier` | `pages/admin-categorie` (même formulaire création / modification) | GOF-c | fait (non testée) |
| `/admin/produits` | `pages/admin-produits` (recherche, filtres catégorie/stock, pagination par 6, modale de suppression) | GOF-a | fait (testée avec jsdom + faux serveur, pas sur la vraie base) |
| `/admin/produits/nouveau`, `/admin/produits/:id/modifier` | `pages/admin-produit` (informations, images, formats et prix, seuil, suppression) | GOF-a | fait (idem) |
| `*` | `pages/404` (statique, renvoie une chaîne) | — | fait |
| `/categorie/:slug` | — | DEC-a | **à faire** (le filtre actuel est local, sans URL) |

Ajouter une route : `import` + `router.addRoute(...)` **avant** `"*"`.

### 12.5 Composants UI (`front/src/ui/`)

| Composant (objet exporté) | API | Données reçues → callbacks | Utilisé par |
| --- | --- | --- | --- |
| `header` (`HeaderView`) | `html`, `dom`, `updateCount(n)` | `{ panierCount }` ; gère seul le bouton thème ; icône « Mon compte » → `/connexion` + e-mail du connecté + bouton « Se déconnecter » ; `dom(data, { surDeconnexion })`, `updateAccount(email)` | `RootLayout`, pages produit/panier (compteur) |
| `footer` (`FooterView`) | `html`, `dom` | aucune | `RootLayout` |
| `bandeau` (`BandeauView`) | `dom(image, surDecouvrir)` | URL visuel | produits |
| `message` (`MessageView`) | `html`, `dom` | `{ type: "erreur"\|"succes", texte }` ou `null` | toutes les pages dynamiques |
| `filtres-categories` (`FiltresCategoriesView`) | `dom(chips, surChoix)` ; sous-template `chip.html` | `[{ slug, libelle, selectionne }]` | produits |
| `grille-produits` (`GrilleProduitsView`) | `dom(produits)` ; `vide.html` si liste vide | produits avec `statutStock` | produits |
| `carte-produit` (`CarteProduitView`) | `dom(produit)` ; `bouton-choisir.html` / `bouton-epuise.html` | `{ nom, slug, teinte, image, prixMin, statutStock }` | grille-produits |
| `badge-stock` (`BadgeStockView`) | `html(statut)`, `dom(statut)` | `"disponible"\|"bientot"\|"epuise"` | carte, fiche |
| `fiche-produit` (`FicheProduitView`) | `dom(data, actions)`, `domVariante`, `domVignette` ; rend lui-même le focus | voir JSDoc ; `surVariante`, `surImage`, `surQuantite`, `surAjout` | produit |
| `ligne-panier` (`LignePanierView`) | `dom(data, actions)` | `{ variantId, nom, slug, libelle, image, teinte, quantite, totalCents, moinsPossible }` ; `surQuantite(id, ±1)`, `surSuppression(id)` | panier |
| `resume-commande` (`ResumeCommandeView`) | `dom(data, actions)` | `{ sousTotalCents, totalCents }` ; `surValidation` | panier |
| `ligne-commande` (`LigneCommandeView`) | `dom(data)` | `{ nom, libelle, quantite, prixUnitaireCents, totalCents }` (lecture seule) | commande, confirmation |
| `encart-validation` (`EncartValidationView`) | `dom(data, actions)` | `{ totalCents, email, enCours }` ; `surConfirmation` (bouton `aria-disabled` pendant l'envoi) | commande |
| `formulaire-login` (`FormulaireLoginView`) | `dom(data, actions)` | `{ email }` ; `surConnexion(email, mdp)`, `surInscription` | connexion |
| `formulaire-inscription` (`FormulaireInscriptionView`) | `dom(data, actions)` | `{ email }` ; `surInscription(email, mdp, confirmation)`, `surConnexion` | inscription |
| `formulaire-connexion` (`FormulaireConnexionView`) | `html`, `dom(data, actions)` | `{ login }` ; `surConnexion(login, mdp)`, `surDeconnexion` | admin |
| `indicateur` (`IndicateurView`) | `dom(data)` | `{ libelle, valeur, legende, icone, attention? }` (aucun callback) ; icônes dans `public/images/admin/` | `AdminLayout` |
| `barre-admin` (`BarreAdminView`) | `dom(data)` | `{ section, email }` ; masquée en mobile ; avatar `public/images/admin/avatar.svg` | pages admin |
| `connexion-admin` (`ConnexionAdminView`) | `dom(data, actions)` | `{ email, message }` ; `surConnexion(email, mdp)` | admin |
| `navigation-admin` (`NavigationAdminView`) | `dom(data, actions)` ; sous-templates `lien.html`, `lien-indisponible.html` | `{ liens: [{ libelle, href, icone, disponible }] }` ; `surDeconnexion` ; `aria-current` posé par le routeur ; barre latérale desktop / icônes tablette / menu repliable mobile ; icônes `public/images/admin/nav-*.svg` | `AdminLayout` |
| `formulaire-connexion` / `statistiques` (anciens composants de la page admin de démo) | — | **plus utilisés** depuis GOF-b ; à supprimer sur demande | aucun |
| `en-tete-page` (`EnTetePageView`) | `dom(data)` ; `action.html` | `{ titre, sousTitre, action: { libelle, href } \| null }` | pages admin |
| `bandeau-info` (`BandeauInfoView`) | `dom(data)` | `{ texte, attention? }` (bleu, ou jaune si `attention`) | admin-categories, modale |
| `liste-categories` (`ListeCategoriesView`) | `dom(categories, actions)` ; `ligne.html`, `vide.html` | `[{ id, libelle, description, nombreProduits }]` ; `surSuppression(id)` | admin-categories |
| `formulaire-categorie` (`FormulaireCategorieView`) | `dom(data, actions)` | `{ libelle, description, bouton, enCours, message }` ; `surEnvoi(libelle, description)` | admin-categorie |
| `modale-suppression` (`ModaleSuppressionView`) | `dom(data, actions)` ; `reaffectation.html` ; `<dialog>` natif (la page appelle `showModal()`) | `{ nom, nombreProduits, cibles, cible, enCours, message }` ; `surConfirmation(cible)`, `surChoixCible`, `surAnnulation` | admin-categories |
| `modale-confirmation` (`ModaleConfirmationView`) | `dom(data, actions)` ; `<dialog>` natif | `{ titre, texte, bouton, enCours, message }` ; `surConfirmation()`, `surAnnulation()` | admin-produits, admin-produit |
| `pagination` (`PaginationView`) | `dom(data, actions)` ; `page.html` | `{ page, pages }` ; `surPage(n)` | admin-produits |
| `filtres-produits` (`FiltresProduitsView`) | `dom(data, actions)` | `{ recherche, categorieId, stock, categories }` ; `surChangement({ recherche, categorieId, stock })` | admin-produits |
| `liste-produits` (`ListeProduitsView`) | `dom(produits, actions)` ; `ligne.html`, `vide.html` | `[{ id, nom, categorie, miniature, prixMin, stock, nombreFormats, nombreImages, statut }]` ; `surSuppression(id)` | admin-produits |
| `panneau-images` (`PanneauImagesView`) | `dom(data, actions)` ; dépôt (clic ou glisser-déposer), vignettes | `{ actif, enCours, images, message }` ; `surFichiers(File[])`, `surPrincipale(id)`, `surSuppression(id)` | admin-produit |
| `panneau-seuil` (`PanneauSeuilView`) | `dom(data, actions)` | `{ seuil, stock, statut, enCours, message }` ; `surEnregistrement(texte)` | admin-produit |
| `formulaire-produit` (`FormulaireProduitView`) | `dom(data, panneaux, actions)`, `lireEtat(form)` ; `format.html`, `suppression.html` | voir JSDoc ; `surEnvoi(etat)`, `surAjoutFormat(etat)`, `surRetraitFormat(i, etat)`, `surSuppressionProduit()` | admin-produit |
| `statistiques` (`StatistiquesView`) | `dom(stats)` ; `ligne-categorie.html` | `{ total, stockTotal, prixMoyenCents, parCategorie }` | admin |

Conventions observées : dossier kebab-case français, objet `<Nom>View`,
callbacks nommés `sur<Action>`, variantes de style dans un objet de constantes
(`ETATS`, `BADGES`, `COULEURS`), écouteur **délégué** sur
`fragment.firstElementChild`, attributs `data-action`, `data-variante-id`,
`data-quantite-delta`, `data-image-index`, `data-categorie` pour identifier
les boutons. Booléens dans un template : `{{desactivee}}` vaut `"disabled"` ou
`""` (pas de condition dans un template).

### 12.6 Modules `lib/` et `data/`

| Fichier | Exporte | Rôle |
| --- | --- | --- |
| `lib/router.js` | `Router` | routes avec `:param`, layouts par plus long préfixe, `data-link`, `basename`, anti-course (`this.navigation`) |
| `lib/utils.js` | `genericRenderer`, `htmlToFragment` | `{{cle}}` **échappé** ; chaîne → `DocumentFragment` |
| `lib/api-request.js` | `getRequest`, `postRequest(uri, data, headers)`, `postFormRequest(uri, formData, headers)`, `ErreurApi` | `fetch` JSON sur `BASE_URL + "api/"`, erreur `{ erreur }` → `ErreurApi(message, statut)` |
| `lib/format.js` | `formaterPrix(centimes)` | « 7,90 € » (affichage uniquement) |
| `lib/stock.js` | `statutStock(stock, seuil)` | seuil fourni par l'API (`seuilBientotEpuise`, table `parametre`) |
| `lib/navigation.js` | `goTo(path)`, `reload()`, `readQuery(name)`, `safeReturnPath(raw)` | redirection depuis une page (pushState + `popstate`, sans toucher au routeur) ; `retour` limité aux chemins internes |
| `lib/theme.js` | `basculerTheme()` | classe `.theme-dark` sur `<html>` + `localStorage["theme"]` |
| `data/produit.js` | `ProduitData.fetchAll / fetchOne(slug) / fetchVariantes(ids)` | préfixe les images par `BASE_URL` |
| `data/auth.js` | `AuthData.login(email, mdp) / register / me / logout`, `knownEmail` | session PHP ; `knownEmail` = dernier e-mail connu, pour le header |
| `data/commande.js` | `CommandeData.create(lignes) / fetchOne(numero)` | `POST` puis `GET /api/commande` ; n'envoie que `{ variantId, quantite }` |
| `data/admin.js` | `AdminData.login(email, mdp) / me / logout`, `knownEmail` | `admin/login`, `admin/me`, `admin/logout` (session admin séparée) |
| `data/categories.js` | `CategorieData.fetchAll / create / update / remove(id, reaffecterVers)` | `admin/categories…` ; joint le jeton CSRF (`AdminData.csrf`) en-tête `X-CSRF-Token` |
| `data/produit-admin.js` | `ProduitAdminData.fetchAll / fetchOne(id) / create / update / remove / uploadImages(id, files) / removeImage / setMainImage / saveThreshold` | `admin/produits…` ; jeton CSRF ; adresses d'images complétées par `BASE_URL` |
| `data/stats.js` | `StatsData.fetch()` | `admin/stats` (inclut `commandes`) |
| `data/panier.js` | `PanierData.read / write / add / setQuantity / remove / clear / count` | `localStorage["panier"]` = `[{ variantId, quantite }]` uniquement, validé à la lecture, plafond 99 |

Seuls `data/panier.js` et `lib/theme.js` (+ le script inline d'`index.html`)
touchent au `localStorage`.

### 12.7 API PHP (`back/src/routes.php`)

| Route | Contrôleur::méthode | Modèle | Réponse / erreurs |
| --- | --- | --- | --- |
| `GET /api/produits` | `ProduitController::index` | `lister()` | `{ produits, total, seuilBientotEpuise }` (prixMin, stock total, categorieSlug) |
| `GET /api/produit?slug=` | `ProduitController::show` | `findBySlug()` | `{ produit, seuilBientotEpuise }` ; 400 slug invalide (`^[a-z0-9-]{1,120}$`), 404 |
| `GET /api/panier?ids=3,5` | `ProduitController::panier` | `findVariantesByIds()` | `{ variantes }` (prix actuel) ; 400 ids invalides ou > 50 |
| `POST /api/login` | `AuthController::login` | `UtilisateurModel::findByEmail()` | corps `{ email, mdp }` → `{ connecte, email, role }` ; 400 champ vide, 401 identifiants |
| `POST /api/inscription` | `AuthController::register` | `UtilisateurModel::create()` | corps `{ email, mdp, confirmation }` → 201 `{ connecte, email, role: "client" }` (connecte aussitôt) ; 400 validation (`filter_var`), 409 e-mail pris |
| `GET /api/me` | `AuthController::me` | — (lit la session) | `{ connecte: false }` ou `{ connecte, email, role }` |
| `POST /api/logout` | `AuthController::logout` | — | `{ connecte: false }` |
| `POST /api/commande` | `CommandeController::store` | `CommandeModel::creer()` | corps `{ lignes: [{ variantId, quantite }] }` → 201 `{ commande: { numero, statut, totalCents } }` ; 401 non connecté, 400 lignes invalides (vide, > 50, doublon, quantité hors 1-99), 409 variante disparue **ou stock insuffisant**. Transaction : variantes verrouillées `FOR UPDATE` par id croissant, prix relus en base (prix du client ignoré), stock décrémenté et journalisé (STK-a) |
| `GET /api/commande?numero=` | `CommandeController::show` | `CommandeModel::findByNumero()` | `{ commande: { numero, statut, totalCents, creeLe, email, lignes } }` ; 401, 400 numéro mal formé, 404 inconnue **ou à un autre client** |
| `POST /api/admin/login` | `AdminAuthController::login` | `UtilisateurModel::findByEmail()` | corps `{ email, mdp }` → `{ connecte, email }` ; 400 champ vide, 401 identifiants ou compte non admin. Session séparée du client : `$_SESSION['admin']` ; `POST /api/login` refuse désormais les comptes admin (401) |
| `GET /api/admin/me` | `AdminAuthController::me` | — | `{ connecte: false }` ou `{ connecte, email }` |
| `POST /api/admin/logout` | `AdminAuthController::logout` | — | retire `$_SESSION['admin']` seulement ; `{ connecte: false }` |
| `GET /api/admin/categories` | `AdminCategorieController::index` | `CategorieModel::lister()` | `{ categories: [{ id, libelle, slug, description, nombreProduits }], totalProduits }` ; 401 |
| `POST /api/admin/categories` | `AdminCategorieController::create` | `creer()` | corps `{ libelle, description }` → 201 `{ categorie }` ; 400 (nom 2-60, description ≤ 255), 401, 403 (CSRF), 409 (nom/slug déjà pris) |
| `POST /api/admin/categories/modifier` | `AdminCategorieController::update` | `modifier()` | corps `{ id, libelle, description }` → `{ categorie }` ; 400, 401, 403, 404, 409 |
| `POST /api/admin/categories/supprimer` | `AdminCategorieController::delete` | `supprimer()` | corps `{ id, reaffecterVers? }` → `{ supprimee, reaffectes }`. **Règle** : catégorie vide → suppression directe ; avec produits → `reaffecterVers` obligatoire (autre catégorie existante), sinon 409 ; transaction (verrou, UPDATE produit, DELETE) ; 400 cible invalide, 404 |
| `GET /api/admin/produits` | `AdminProduitController::index` | `ProduitAdminModel::lister()` | `{ produits: [{ id, nom, slug, categorieId, categorie, image, miniature, prixMin, stock, nombreFormats, nombreImages }], categories, seuilBientotEpuise }` ; 401 |
| `GET /api/admin/produit?id=` | `AdminProduitController::show` | `trouver()` | `{ produit: { …, variantes, images }, categories, seuilBientotEpuise }` ; 400, 401, 404 |
| `POST /api/admin/produits` | `create` | `creer()` | corps `{ nom, categorieId, description, descriptionLongue, ingredients, variantes: [{ libelle, prixCents, stock }] }` → 201 `{ produit: { id, nom, slug } }` ; 400, 401, 403 (CSRF), 409 (nom ou format en double). Slug généré à la création et **jamais modifié** ; teinte = crc32(nom) % 360 ; image par défaut `images/produits/placeholder.svg` |
| `POST /api/admin/produits/modifier` | `update` | `modifier()` | corps comme ci-dessus + `id` ; format avec `id` mis à jour, sans `id` créé, absent supprimé (transaction, de 1 à 10 formats) |
| `POST /api/admin/produits/supprimer` | `delete` | `supprimer()` | `{ id }` → `{ supprime }` ; variantes et lignes d'images supprimées en cascade, fichiers effacés, commandes passées intactes (instantané) |
| `POST /api/admin/produits/images?id=` | `uploadImages` | `ajouterImage()`, `Televersement::enregistrerImage()` | multipart `images[]` ; type **réel** contrôlé, 5 Mo, ≤ 8000 px, ≤ 10 images/produit ; réencodé en JPEG (1200 px) + miniature 400 px (`-m.jpg`), nom aléatoire dans `uploads/produits/` → `{ images }` |
| `POST /api/admin/produits/images/supprimer` et `…/principale` | `deleteImage`, `setMainImage` | `supprimerImage()`, `definirPrincipale()` | `{ id, imageId }` → `{ images }` ; la 1ʳᵉ image (position 1) est `produit.image` |
| `POST /api/admin/parametres/seuil` | `updateThreshold` | `ParametreModel::definirSeuilBientotEpuise()` | `{ seuil }` (entier 0-100000) → `{ seuilBientotEpuise }` |
| `GET /api/admin/stats` | `StatsController::index` | `ProduitModel::statistiques()`, `compterSousSeuil()`, `CommandeModel::statistiques()`, `ParametreModel::seuilBientotEpuise()` | `{ total (produits), stockTotal, prixMoyenCents, parCategorie, commandes, commandesAujourdhui, commandesEnCours, bientotEpuises }` ; 401 sans `$_SESSION['admin']` |

Ajouter une route back = **3 endroits** : la ligne dans `routes.php`, l'instance
du contrôleur dans le tableau `$controleurs` de `back/index.php` (sinon
`RuntimeException`), et la méthode du contrôleur/modèle. Le modèle convertit
les nombres MySQL en `int` et renvoie des clés **camelCase** (`prixCents`,
`categorieSlug`) à partir de colonnes **snake_case** (`prix_cents`).
Itérations PHP : `for` ou `array_map`, jamais `foreach`.

### 12.8 Base de données (`sql/glaces.sql`)

| Table | Colonnes clés | Contraintes |
| --- | --- | --- |
| `categorie` | `id`, `libelle`, `slug`, `description` (≤ 255, vide par défaut) | `UNIQUE(slug)` |
| `produit` | `categorie_id`, `nom`, `slug`, `description`, `teinte` (0-359), `image`, `description_longue`, `ingredients` | `UNIQUE(slug)`, FK → categorie `RESTRICT` |
| `produit_image` | `produit_id`, `chemin`, `position` | `UNIQUE(produit_id, position)`, FK `CASCADE` |
| `variante` | `produit_id`, `libelle`, `prix_cents`, `stock` | `UNIQUE(produit_id, libelle)`, FK `CASCADE` |
| `utilisateur` | `email` (minuscules), `mot_de_passe` (hachage `password_hash`), `role` (`client`\|`admin`), `cree_le` | `UNIQUE(email)` |
| `commande` | `numero` (`CC-AAAA-000123`), `utilisateur_id`, `statut` (`en_cours`\|`prete`\|`retiree`\|`annulee`, défaut `en_cours`), `total_cents`, `cree_le` | `UNIQUE(numero)`, FK → utilisateur `RESTRICT` |
| `ligne_commande` | `commande_id`, `variante_id` (NULL si supprimée), `produit_nom`, `variante_libelle`, `prix_unitaire_cents`, `quantite` | FK commande `CASCADE`, FK variante `SET NULL` ; nom, format et prix **figés** à la commande |
| `mouvement_stock` | `variante_id` (NULL si supprimée), `commande_id`, `type` (`sortie`\|`retour`), `quantite`, `stock_avant`, `stock_apres`, `cree_le` | `UNIQUE(commande_id, variante_id, type)` (idempotence), FK variante `SET NULL`, FK commande `CASCADE` ; `variante.stock` a en plus `CHECK (stock >= 0)` |

Seeds : 3 catégories (pots classiques, sans lactose, sorbets) × 4 produits,
2 variantes chacun (« Pot 100 ml » 2,90 €, « Pot 465 ml » 7,90 €), stocks
variés (certains ≤ 5 pour tester « Bientôt épuisé »). Comptes de démo
`alice@example.com`/`azerty` (client) et `admin@example.com`/`motdepasse` (admin). InnoDB, `utf8mb4`.
| `parametre` | `cle` (PK), `valeur` ; seed `seuil_bientot_epuise` = 5 | lue par `ParametreModel` (repli sur 5 si absente) |

**Absentes pour l'instant** :
`option` (à créer selon §7 et l'ordre §8).

**Stock (STK-a)** : `CommandeModel::mouvementer()` est le seul endroit qui
écrit `variante.stock` ; `creer()` l'appelle (sortie) et `changerStatut()`
(seule porte pour changer un statut, aucune route pour l'instant : PIL-b) rend
le stock uniquement au passage à `annulee`. Test : `back/tests/stock.php`.

### 12.9 Quel skill ouvrir pour quelle tâche

| Tâche | Skill (`.agents/skills/…/SKILL.md`) |
| --- | --- |
| nouvelle page / route | `creer-page` |
| nouveau composant visuel | `creer-composant-ui` |
| nouvel appel API ou stockage local | `creer-module-data` |
| écrire / modifier du Tailwind | `styler-tailwind-tokens` |
| fonctionnalité front complète | `ajouter-fonctionnalite-mvc` |
| fin de toute tâche front | `verifier-mvc` |

### 12.10 Écarts connus et points de vigilance (diagnostic)

| # | Constat | Conséquence pour la suite |
| --- | --- | --- |
| 1 | `README.md` ne mentionne pas encore la page `/panier` ni `GET /api/panier` (tableau d'état « Panier : à venir ») | le mettre à jour quand CMD-b sera terminée |
| 2 | Le skill `creer-module-data` §4 décrit des lignes panier avec `label` et `unitPriceCents` ; le code ne stocke que `{ variantId, quantite }` et relit les prix via l'API | **le code fait foi** ; ajouter `options` avec OPT-a |
| 3 | Port de dev : `5174` (AGENTS §1, choisi car 5173 souvent occupé) vs `5173` (README) | utiliser le lien affiché par `npm run dev` |
| 4 | Nommage mixte : `C.charger`, `V.rafraichir`, `M.produitsFiltres` (français, ancien) et `C.handler_selectVariante`, `M.addToCart` (anglais) | nouveau code en **anglais** (§1), ne pas renommer l'existant sans demande |
| 5 | `ui/message` utilise des couleurs Tailwind brutes (`text-red-700` + `dark:`) au lieu de tokens | exception connue ; ne pas la recopier |
| 6 | Seuil « Bientôt épuisé » : **résolu** (STK-b étape A, table `parametre`). Reste : le rendre modifiable en back-office (GOF-a) et afficher le stock par variante (STK-b étape B). Comptes en dur : **résolu** (CMD-c) |
| 7 | `config.php` : `debug => true` ; contient de vrais identifiants | passer à `false` en prod ; ne jamais afficher ni committer les identifiants |
| 8 | Commentaires de `lib/api-request.js` et `lib/router.js` citent `/~login/Base/` (héritage du TP) | sans effet ; ne pas « corriger » sans demande |
| 9 | CSRF : **résolu pour l'admin** (jeton en session, `SessionAdmin::exigerEcriture`, en-tête `X-CSRF-Token`) ; `POST /api/commande` (client) s'appuie toujours sur `SameSite=Lax` | utiliser `exigerEcriture` pour toute écriture admin |
| 11 | Stock décrémenté, journalisé et recrédité : **résolu** (STK-a). Reste : messages et affichage côté front d'un refus pour stock insuffisant (409), ajustement du panier | STK-c |
| 12 | Aucun e-mail de confirmation : la confirmation est la page `/commande/:numero` | hors périmètre actuel |
| 13 | Stock saisi en back-office (GOF-a) : **non journalisé** dans `mouvement_stock` (réservé aux commandes) et écrasé tel quel : une commande passée entre le chargement du formulaire et l'enregistrement est perdue pour ce format | acceptable en MVP ; journal d'ajustements à prévoir si besoin |
| 14 | Options de type topping/cône (§7) : **absentes** ; GOF-a les assimile aux formats (variantes), les options viennent avec OPT-c | à faire en OPT-c |
| 15 | Images : pas de réordonnancement par glisser-déposer (étoile = principale seulement) ; limites PHP (`upload_max_filesize` 2 Mo en local) à vérifier sur mmi.unilim.fr ; la description produit est limitée à 400 caractères (colonne SQL), la maquette annonce 500 | à tester sur le serveur |
| 10 | Aucun `foreach` dans le code applicatif (`for…of` dans le routeur, `forEach` seulement dans `check-mvc.js`, outil hors application) | garder la règle §1 |

### 12.11 Check-list avant toute construction

- [ ] Relire §1, §3 et §8 ; vérifier que les dépendances de l'US sont terminées.
- [ ] Repérer dans 12.4 à 12.8 les fichiers concernés, puis les **lire** avec leurs appelants.
- [ ] Ouvrir le skill adapté (12.9).
- [ ] Proposer le découpage M / V / C (et back/SQL si besoin) et attendre l'accord.
- [ ] Ne modifier que les fichiers nécessaires ; JSDoc/PHPDoc ; cibles ≥ 40 px ; pas de `foreach`.
- [ ] `node .agents/skills/verifier-mvc/scripts/check-mvc.js .` puis `cd front && npm run build`.
- [ ] Vérifier 320/375, 768, 1440 px en clair et sombre.
- [ ] Compte rendu §11 **et mise à jour de cette section 12** (route, composant, table, écart résolu).
- [ ] Aucun commit/push sans demande.
