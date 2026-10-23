# SAE301-Starter — Ben & Jerry's Click & Collect

Prototype d'un site de click & collect de glaces : une API PHP en trois
couches (routage / contrôleur / modèle) au-dessus de MySQL, et un front en
JavaScript organisé en layouts, pages et composants, avec un routeur côté
client. Le client commande en ligne et retire en magasin (ni livraison, ni
paiement en ligne).

| Fonctionnalité | État |
|---|---|
| Catalogue, filtre par catégorie (sans changement d'URL), « Voir plus » | fait (DEC-b) ; `/categorie/:slug` à faire (DEC-a) |
| Fiche produit (`/produit/:nom`), galerie, variantes, options, quantité | fait (DEC-c) ; métadonnées SEO et retour à la catégorie d'origine à faire |
| Panier en `localStorage`, compteur dans l'en-tête | fait (CMD-b) |
| Inscription, connexion, déconnexion (mots de passe hachés, session régénérée) | fait (CMD-c) |
| Validation de commande, numéro unique, confirmation | fait (CMD-a) |
| Stock par variante : affichage, contraintes, décrément et recrédit journalisés | fait (STK-a, STK-b, STK-c) |
| Options et variantes avec stock par combinaison | fait (OPT-a, OPT-b, OPT-c) |
| Espace personnel, historique des commandes, « Commander à nouveau » | fait (SUI-a, SUI-b, SUI-c) |
| Back-office `/admin` : catégories, produits, images, seuil de stock | fait (GOF-a, GOF-b, GOF-c) |
| Back-office : commandes (statuts, annulation, actions en lot, journal) et statistiques avec export CSV | fait (PIL-a, PIL-b) |
| Promotion automatique, codes promo et leur gestion | fait (PRO-a, PRO-b, PRO-c) |
| Thème clair / sombre en `localStorage` | fait |

Le détail de l'architecture et des règles métier est dans `docs/CARTOGRAPHIE.md`,
l'ordre des US dans `docs/US.md`.

## 1. Arborescence

```
.htaccess            /api/... vers le back, tout le reste vers front/dist/
sql/glaces.sql       schéma, jeu de données et comptes de démonstration, rejouable
uploads/             images téléversées depuis le back-office (non versionnées)
docs/                CARTOGRAPHIE.md (architecture), US.md (ordre des US)
back/                API PHP, ne renvoie que du JSON
├── index.php        point d'entrée : assemble les dépendances, délègue
├── config/          identifiants de la base, chemin du projet
├── src/             Core/ (Request, Response, Router, Database, sessions admin,
│                    téléversement), Controller/, Model/, routes.php
└── tests/           scripts CLI, à lancer sur une base jetable
front/               sources du front (Vite + Tailwind)
├── index.html       page unique de l'application
├── tests/           tests Node de la logique pure (stock, options, promotion, CSV)
├── vite.config.js   chemin du projet, proxy de développement
├── src/
│   ├── main.js      déclaration des routes et des layouts
│   ├── global.css   Tailwind, tokens de design, thème sombre
│   ├── layouts/     structures de page : boutique (root) et back-office (admin)
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
| 1 | Importer `sql/glaces.sql` dans votre base depuis phpMyAdmin (il crée toutes les tables : catalogue, formats, services et toppings, allergènes, variantes, utilisateurs, commandes, stock, codes promo, puis charge les données ; une table existante de même nom, y compris d'une ancienne version du schéma, serait remplacée) |
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
(Vite prend le port suivant, par exemple 5174, si celui-ci est occupé), avec rechargement à chaque
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
router.addRoute("/produit/:nom", ProduitPage);   // params.nom dans la page
router.addRoute("/panier", PanierPage);
router.addRoute("/commande/:numero", ConfirmationPage);
router.addRoute("/admin", AdminPage);          // /admin/... : layout du back-office
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

Pages actuelles : `produits` (catalogue), `produit` (fiche), `panier`,
`commande`, `confirmation`, `connexion`, `inscription`, `compte` (accueil,
profil, commandes, mot de passe), `admin` (accueil, produits, catégories,
commandes, statistiques, codes promo) et `404`.

## 6. L'API

Toutes les routes sont déclarées dans `back/src/routes.php`. Les erreurs
renvoient un JSON `{ erreur }` avec un statut HTTP explicite.

| Groupe | Routes |
|---|---|
| Catalogue | `GET /api/produits`, `GET /api/produit?nom=…`, `GET /api/panier` (prix et stock actuels des variantes du panier) |
| Compte client | `POST /api/inscription`, `POST /api/login`, `GET /api/me`, `POST /api/logout`, `GET /api/compte`, `POST /api/compte/profil`, `POST /api/compte/mot-de-passe` |
| Commande | `POST /api/commande`, `GET /api/commande?numero=…`, `GET /api/commandes` (filtres et pagination), `GET /api/commande/reprise`, `GET /api/code-promo?code=…` |
| Back-office | `/api/admin/login`, `me`, `logout`, `categories…`, `produits…` (dont `images`), `parametres/seuil`, `commandes…`, `codes-promo…`, `stats`, `statistiques` |

Les routes `/api/admin/*` exigent une session administrateur, distincte de
celle des clients, et un jeton CSRF pour les écritures (403 sinon).

Les prix sont des entiers en centimes. Le stock est porté par la variante, c'est-à-dire par la combinaison d'un produit, d'un format de la table `format` et d'un service (cuillère, coupelle, cône) : chaque combinaison a son propre stock. Chaque topping a aussi son stock de doses, commun à tous les produits : une commande consomme une dose par topping choisi (quel que soit le nombre de pots), rendue à l'annulation. Les allergènes d'un produit sont une liste (`allergenes` sur la fiche) gérée dans le formulaire du back-office. La commande est une transaction : prix et stock sont relus en base, le stock est décrémenté et journalisé, puis recrédité si la commande est annulée.

## 7. Comptes de démonstration

Comptes créés par `sql/glaces.sql` (table `utilisateur`, mots de passe hachés
avec `password_hash`). À retirer avant tout dépôt public.

| Email | Mot de passe | Rôle |
|---|---|---|
| `alice@example.com` | `azerty` | client |
| `admin@example.com` | `motdepasse` | admin (connexion sur `/admin`) |

Codes promo de démonstration : `BIENVENUE10`, `GLACE20` ; `ANCIEN15` est
désactivé, pour tester un refus.

## 8. Vérifier l'architecture

```bash
node .agents/skills/verifier-mvc/scripts/check-mvc.js .
```

## 9. Tests

```bash
cd front
for t in tests/*.mjs; do node "$t"; done     # logique pure : stock, options, promotion, CSV
```

Les scripts de `back/tests/` (`stock.php`, `options.php`, `variantes.php`,
`commandes-admin.php`, `promotion.php`, `codes-promo.php`,
`codes-promo-admin.php`) s'exécutent en ligne de commande, sur une **base
jetable** : ils réimportent les données et effacent les commandes. Les
variables d'environnement à fournir sont décrites en tête de chaque script.

## 10. Si ça ne marche pas

| Symptôme | Cause probable |
|---|---|
| Un listing de dossiers, ou une erreur 404 sur la racine | le `.htaccess` n'a pas été déposé, ou `front/dist/` est absent (lancer `npm run build`) |
| Page blanche, fichiers `assets/…` en 404 | `BASE` de `vite.config.js` ne correspond pas au dossier de dépôt |
| « Impossible de charger le catalogue » | identifiants de `config.php`, ou tables non importées |
| Les images téléversées n'apparaissent pas | `uploads/` absent ou non inscriptible sur le serveur |
| La connexion ne tient pas | `chemin` de `config.php` ne correspond pas au dossier de dépôt |
| En développement, l'API répond 404 | le back n'est pas déployé sur le serveur, ou `BASE` est faux |
