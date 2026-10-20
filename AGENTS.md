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
- **JAMAIS DE `foreach`** (front comme back) : `for`, `while`, `array_map` ou
  un autre itérateur explicite.
- Les noms de méthodes et variables sont en anglais dans le code ; les données
  métier et commentaires pédagogiques peuvent rester en français comme dans
  l'existant.
- Pour chaque test que tu veux faire ou chose que tu veux vérifier :
  `cd front/` puis `npm run dev` puis ouverture du lien
  `http://localhost:5174/~bellevert1/SAE301-Starter/`. Grâce à la config
  `vite.config.js`, tout fonctionne sur ce lien.

## 2. Architecture actuelle à respecter

Le dépôt est un full-stack sans framework applicatif :

| Zone        | Rôle                                                                         | Emplacement |
| ----------- | ---------------------------------------------------------------------------- | ----------- |
| Front       | SPA Vite, Tailwind CSS 4, routeur client, pages et composants                | `front/`    |
| Back        | API JSON PHP, routage, contrôleurs et accès PDO/MySQL                        | `back/`     |
| Données     | Schéma et seeds SQL                                                          | `sql/`      |
| Entrée HTTP | Réécriture `/api/...` vers PHP et du reste vers `front/dist/`                | `.htaccess` |

Le front conserve le découpage `layouts/`, `pages/`, `ui/`, `data/` et `lib/`.
Le back conserve `Core/`, `Controller/`, `Model/`, `routes.php` et son point
d'entrée `back/index.php`. Ne crée pas une nouvelle couche ou un nouveau
framework seulement pour contourner cette structure.

Voir README.md pour l'arborescence et l'installation, et
[docs/cartographie.md](docs/cartographie.md) pour la carte détaillée (routes,
composants, API, tables). Cette carte est une aide : en cas d'écart, le code
fait foi, et elle se met à jour quand une route, un composant ou une table est
ajouté.

## 3. MVC strict

Le détail du découpage M/V/C par page est dans `.agents/rules/architecture-mvc.md`
(toujours chargé). À retenir ici :

- **Toute modification ou ajout respecte strictement ce découpage.** En cas de
  doute sur l'emplacement d'une fonction, s'arrêter et demander plutôt que de
  mélanger les rôles.
- C est le seul objet qui référence M et V. M ne référence jamais V et ne touche
  jamais au DOM ; V reçoit ses données en paramètre et ne référence jamais M.
- Un composant UI ne décide pas de la donnée à afficher : il reçoit ses données
  et signale l'action via des callbacks. Une page est reconstruite depuis son
  état après une mutation importante ; évite les modifications DOM dispersées.

Conventions à suivre :

- Une fonction par propriété : `M.xxx = function(...) { ... }`, précédée d'un
  commentaire qui donne ses paramètres (`. paramètre ...`) et sa valeur de
  retour (`> valeur de retour ...`), comme dans le code existant.
- Noms : `M.filter...`, `V.formatOne...`, `V.render...`, `V.init`, `C.init`,
  `C.handler_clickOn...`.
- En JavaScript vanilla, `C.init()` est appelé en dernière ligne. Dans le front
  modulaire actuel, la fonction de page retourne `C.init()` au routeur.

## 4. Front-end JavaScript

Le style général (ES modules, JSDoc, échappement, délégation, `async/await`)
est dans `.agents/rules/style-javascript.md`. Spécificités du projet :

- N'utilise `innerHTML` brut que via les helpers existants et jamais avec une
  valeur utilisateur non échappée.
- Les appels réseau passent par `front/src/data/` et
  `front/src/lib/api-request.js`, avec gestion explicite des erreurs et des
  statuts HTTP.
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

Tailwind CSS 4 uniquement (`@tailwindcss/vite`) : pas de Sass ni de CSS basique.
Tokens, variables privées de composant et classes complètes : voir le skill
`styler-tailwind-tokens`.

## 6. Back-end PHP

Les règles PHP générales (`strict_types`, typage, PDO préparé, `Response::json()`,
session) sont dans `.agents/rules/php-backend.md`. Spécificités du projet :

- Conserve `back/index.php` comme point d'entrée unique : autoload,
  configuration, connexion, session, contrôleurs et routeur.
- Les contrôleurs valident la requête et orchestrent ; les modèles interrogent
  la base ; `Core/` contient les abstractions HTTP, DB et routage.
- Encapsule l'état avec `private`/`protected`, getters/setters validants et
  fluent setters uniquement lorsqu'ils correspondent au besoin. Préfère
  abstraction et polymorphisme pour les comportements réellement partagés.
- Messages de validation et d'erreur renvoyés en français.

## 7. Données, commandes et sécurité

Le modèle métier préserve les décisions suivantes (les règles SQL renvoient ici) :

- un produit (un parfum de glace) a au moins une **variante**, par exemple
  « pot 100 ml » et « pot 465 ml » ; un produit sans choix possible a une
  variante par défaut. Le **stock est porté par la variante** ;
- les **options** (par exemple topping, cône ou gaufrette, coupelle, cuillère)
  sont choisies sur la fiche produit et figées dans la commande ;
- panier et lignes de commande identifiés par `variantId`, avec options
  choisies et **prix unitaire figé** (instantané du prix et des libellés) ;
- numéro de commande unique (ex. `CC-2026-000123`, avec contrainte `UNIQUE`) ;
- validation de commande dans une **transaction SQL**, tables en InnoDB ;
- décrément et journal des mouvements de stock à la validation, recrédit
  uniquement au passage à « annulée » via une fonction unique de changement
  de statut ;
- seuil « Bientôt épuisé » stocké dans une table de paramètres, modifiable
  en back-office ;
- authentification par session serveur et rôle non fiable côté client ;
  admin séparé du client ;
- seeds disponibles pour les écrans de lecture : au minimum **3 catégories de
  4 produits** (ex. pots classiques, sans lactose, sorbets), chaque produit
  avec ses variantes.

Règles complémentaires (le reste est dans `php-backend.md` et `sql-data.md`) :

- `password_hash` / `password_verify` ; `session_regenerate_id(true)` aussi
  après élévation de privilège ;
- réponses JSON avec code HTTP explicite et terminaison via `exit` ;
- validation serveur de toute quantité, variante, option, disponibilité, prix
  et état de commande : à la validation, le serveur relit les prix en base et
  ignore ceux envoyés par le navigateur ;
- protection contre la survente, par exemple
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

Méthode Git : pour chaque nouvelle fonctionnalité, une nouvelle branche +
commits, puis push et merge dans `main` (toujours sur demande, voir §1).

## 9. Vérification obligatoire

Toujours à la fin de chaque requête, vérifier le découpage :
`node .agents/skills/verifier-mvc/scripts/check-mvc.js .`
puis, pour le front, `cd front && npm run build`.

## 10. Documentation

Toute documentation générée doit être pédagogique : sections numérotées,
tableaux récapitulatifs, check-lists et diagnostic.

## 11. Après chaque modification

Fournis un résumé clair et expliqué avec :

1. la liste des fichiers modifiés, créés ou supprimés avec leur chemin d'accès ;
2. le détail des modifications apportées avec les lignes ;
3. les éventuels points d'attention et/ou étapes suivantes recommandées en
   respectant toujours l'ordre qui doit être suivi ;
4. les éventuels impacts sur le reste de l'application.

## 12. Avant toute construction

- Relire §1, §3 et §8 ; vérifier que les dépendances de l'US sont terminées.
- Repérer les fichiers concernés dans [docs/cartographie.md](docs/cartographie.md),
  puis les **lire** avec leurs appelants.
- Ouvrir le skill adapté :

| Tâche | Skill (`.agents/skills/…/SKILL.md`) |
| --- | --- |
| nouvelle page / route | `creer-page` |
| nouveau composant visuel | `creer-composant-ui` |
| nouvel appel API ou stockage local | `creer-module-data` |
| écrire / modifier du Tailwind | `styler-tailwind-tokens` |
| fonctionnalité front complète | `ajouter-fonctionnalite-mvc` |
| fin de toute tâche front | `verifier-mvc` |

- Proposer le découpage M / V / C (et back/SQL si besoin) et attendre l'accord.
- Ne modifier que les fichiers nécessaires ; cibles tactiles ≥ 40 px.
- Vérifier 320/375, 768, 1440 px en clair et sombre.
- Mettre à jour `docs/cartographie.md` (route, composant, table, écart résolu).
