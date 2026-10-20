# SAE301-Starter — Ben & Jerry's Click & Collect

Prototype d'un site de click & collect de glaces : une API PHP en trois
couches (routage / contrôleur / modèle) au-dessus de MySQL, et un front en
JavaScript organisé en layouts, pages et composants, avec un routeur côté
client. Le client commande en ligne et retire en magasin (ni livraison, ni
paiement en ligne).

| Fonctionnalité | État |
|---|---|
| Catalogue des produits, filtre par catégorie, « Voir plus » | fait |
| Fiche produit (`/produit/:slug`), variantes, quantité, stock | fait |
| Connexion par session, page Administration réservée au rôle `admin` | fait (comptes de démonstration) |
| Thème clair / sombre en `localStorage` | fait |
| Panier, commande, options, back-office complet | à venir |

## 1. Arborescence

```
.htaccess            /api/... vers le back, tout le reste vers front/dist/
sql/glaces.sql       tables et jeu de données, à importer dans votre base
back/                API PHP, ne renvoie que du JSON
├── index.php        point d'entrée : assemble les dépendances, délègue
├── config/          identifiants de la base, chemin du projet
└── src/             Core/ (Request, Response, Router, Database),
                     Controller/, Model/, routes.php
front/               sources du front (Vite + Tailwind)
├── index.html       page unique de l'application
├── vite.config.js   chemin du projet, proxy de développement
├── src/
│   ├── main.js      déclaration des routes et des layouts
│   ├── global.css   Tailwind, tokens de design, thème sombre
│   ├── layouts/     structures de page (en-tête + slot de la page)
│   ├── pages/       une page par route : page.js + template.html
│   ├── ui/          composants réutilisables : index.js + template.html
│   ├── data/        appels à l'API, un module par ressource
│   └── lib/         routeur, rendu des templates, requêtes, utilitaires
└── dist/            résultat de npm run build (non versionné)
.agents/             règles et skills de l'assistant (vérification MVC)
```

## 2. Installation

| Étape | Action |
|---|---|
| 1 | Importer `sql/glaces.sql` dans votre base depuis phpMyAdmin (il crée `categorie`, `produit`, `produit_image` et `variante` ; une table existante de même nom serait remplacée) |
| 2 | Dans `back/config/config.php`, renseigner les identifiants de la base et le chemin du projet (`/~votre_login/SAE301-Starter/`) |
| 3 | Dans `front/vite.config.js`, donner à `BASE` **exactement** le même chemin |
| 4 | Dans `front/`, lancer `npm install` |

Le chemin du projet apparaît donc à deux endroits, et seulement là :
`config.php` pour le back (chemin des cookies), `vite.config.js` pour le front
(adresses des fichiers et des pages).

## 3. Développer

```bash
cd front
npm run dev
```

Le front est servi par Vite à `http://localhost:5173/~votre_login/SAE301-Starter/`
(Vite prend le port suivant si celui-ci est occupé), avec rechargement à chaque
modification. Les requêtes `/~votre_login/SAE301-Starter/api/...` sont
relayées par Vite vers l'API déployée sur `mmi.unilim.fr` : le back doit donc
être en place sur le serveur (voir Déployer).

Ce relais (le proxy de `vite.config.js`) fait croire au navigateur que front
et API sont sur le même site, sous le même chemin qu'en production. Le cookie
de session posé par l'API est donc accepté et renvoyé normalement. Sans lui,
le front sur `localhost` appellerait directement `mmi.unilim.fr` : deux sites
différents, et le navigateur refuserait d'envoyer le cookie.

Utilisez Chrome ou Firefox : le cookie de session est `Secure`, et Safari peut
le refuser sur `http://localhost`.

## 4. Déployer

```bash
cd front
npm run build
```

Le front compilé est produit dans `front/dist/`. Déposez ensuite dans votre
espace web, dans le dossier `SAE301-Starter/` : `.htaccess`, `back/` et
`front/dist/` (en gardant ce chemin). Inutile de déposer `front/node_modules/`.

L'application est alors à `https://mmi.unilim.fr/~votre_login/SAE301-Starter/`.
Le `.htaccess` sert les fichiers de `front/dist/`, et répond par
`front/dist/index.html` à toute autre adresse (`/admin`, `/produit/...`) :
c'est le routeur du front qui affiche la bonne page, ou la page 404.

## 5. Architecture du front

### 5.1 Routeur (`lib/router.js`)

Déclaré dans `main.js`, sur le modèle de `react-router` :

```js
router.addLayout("/", RootLayout);
router.addRoute("/", ProduitsPage);
router.addRoute("/produit/:slug", ProduitPage);   // params.slug dans la page
router.addRoute("/admin", AdminPage);
router.addRoute("*", The404Page);                 // toujours en dernier
```

- Un lien interne porte `data-link` et un chemin de route, sans le chemin du
  projet : `<a href="/admin" data-link>`. Le routeur intercepte le clic,
  change l'adresse sans recharger, et complète lui-même le `href` avec le
  chemin du projet (comme `basename` dans `react-router`).
- Le lien de la page affichée reçoit `aria-current="page"`, que Tailwind
  cible avec `aria-[current=page]:…`.
- Une page renvoie une chaîne HTML (page statique) ou un fragment, ou une
  promesse de l'un des deux (page qui charge des données).
- Le layout est choisi par le plus long préfixe d'adresse. La page prend la
  place de son `<slot>` sans nom.

### 5.2 Composants (`ui/`)

Un dossier par composant : le HTML et les classes Tailwind dans
`template.html`, le JavaScript dans `index.js`. Le composant expose
`html(data)` (chaîne) et/ou `dom(data, actions)` (fragment).

- `{{cle}}` dans un template est remplacé par la valeur correspondante,
  **échappée** : un placeholder ne produit jamais que du texte. Pour insérer
  un autre composant, on utilise un `<slot name="…">`, que le JavaScript
  remplace (`slot.replaceWith(Composant.dom(…))`).
- Un template n'a ni boucle ni condition : une liste se construit avec un
  template par élément (`ui/statistiques/ligne-categorie.html`), et un état
  (option choisie, bouton désactivé) se règle en JavaScript après
  `htmlToFragment`.
- Un composant ne décide de rien : il reçoit ses données, et signale les
  actions de l'utilisateur par les fonctions de `actions`
  (`surVariante`, `surQuantite`…), comme les props `onChange` de React.
- Tailwind ne génère que les classes écrites en entier dans le code :
  `"text-red-700"`, jamais `"text-" + couleur`.

### 5.3 Pages (`pages/`)

Une page dynamique suit le découpage Modèle / Contrôleur / Vue :

| Rôle | Contenu |
|---|---|
| `M` | l'état de la page (réponse de l'API, choix de l'utilisateur, message affiché…), sans DOM |
| `C` | les traitements : chargement des données, réactions aux actions de l'utilisateur ; seul à connaître `M` et `V` |
| `V` | construit la page à partir de ce que `C` lui passe |

Après chaque changement, toute la page est reconstruite et remplace l'ancienne
(`V.rafraichir()`) : l'affichage se déduit de l'état, on ne le retouche pas
morceau par morceau.

Pages actuelles : `produits` (catalogue), `produit` (fiche), `admin`, `404`.

## 6. L'API

| Route | Effet |
|---|---|
| `GET /api/produits` | le catalogue : `{ produits, total }`, avec prix « à partir de » et stock total |
| `GET /api/produit?slug=cookie-dough` | la fiche d'un produit, avec ses images et ses variantes (400 si le slug est invalide, 404 s'il est inconnu) |
| `POST /api/login` | connexion, corps JSON `{"login": …, "mdp": …}` |
| `POST /api/logout` | déconnexion |
| `GET /api/admin/stats` | statistiques du catalogue, réservées au rôle `admin` (403 sinon) |

Les prix sont des entiers en centimes. Le stock est porté par la variante, c'est-à-dire par la combinaison d'un format et d'un service (cuillère, coupelle, cône) : chaque combinaison a son propre stock.

## 7. Comptes de démonstration

Comptes en dur dans `AuthController`, à remplacer par une table d'utilisateurs
(`password_hash`) lors de l'US d'authentification.

| Login | Mot de passe | Rôle |
|---|---|---|
| `alice` | `azerty` | `user` |
| `admin` | `motdepasse` | `admin` |

## 8. Vérifier l'architecture

```bash
node .agents/skills/verifier-mvc/scripts/check-mvc.js .
```

## 9. Si ça ne marche pas

| Symptôme | Cause probable |
|---|---|
| Un listing de dossiers, ou une erreur 404 sur la racine | le `.htaccess` n'a pas été déposé, ou `front/dist/` est absent (lancer `npm run build`) |
| Page blanche, fichiers `assets/…` en 404 | `BASE` de `vite.config.js` ne correspond pas au dossier de dépôt |
| « Impossible de charger le catalogue » | identifiants de `config.php`, ou tables non importées |
| La connexion ne tient pas | `chemin` de `config.php` ne correspond pas au dossier de dépôt |
| En développement, l'API répond 404 | le back n'est pas déployé sur le serveur, ou `BASE` est faux |
