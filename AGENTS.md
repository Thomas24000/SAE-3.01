# AGENTS.md — SAE301 Ben & Jerry's Click & Collect

## 0. Mission

Prototype full-stack responsive de click & collect de glaces Ben & Jerry's
([benjerry.fr](https://www.benjerry.fr)) : le client commande en ligne et
retire en magasin (ni livraison ni paiement en ligne). Fonctionne sur mobile,
tablette et desktop. État d'avancement et carte du dépôt dans
`docs/CARTOGRAPHIE.md`, `docs/US.md` et `README.md`.

Ne réorganise, ne renomme et ne déplace jamais un fichier existant sans
demande explicite. Lis `front/`, `back/`, `sql/` et les configs avant toute
modification structurante.

## 1. Règles impératives

- **Ne code pas sans mon accord** : je (l'étudiant) demande les fonctions une
  par une, tu ne fais pas tout à ma place. Correction ciblée demandée
  (une ligne, une faute, un bug précis) : fais-la directement. Nouvelle
  fonction, nouveau fichier ou changement de comportement : propose d'abord le
  découpage (M/V/C pour le front) et attends mon accord.
- Ne committe et ne pousse jamais sans demande explicite.
- Aucune dépendance ou outil de build en plus sans justification et accord.
- Ne touche pas aux secrets réels ; ils ne vont jamais dans le dépôt.
- Lis les fichiers concernés et leurs appelants avant une modification
  importante, puis valide le comportement.
- Si deux architectures sont raisonnables, arrête-toi et demande.
- Commentaires : uniquement l'intention d'un choix non évident. JSDoc/PHPDoc
  sur toute fonction, méthode ou classe publique.
- **Jamais de `foreach`** (PHP) ni de `forEach`/`for…of` (JS) : `for`, `while`,
  `map`/`array_map` (vérifié par `check-mvc.js`).
- Noms de méthodes et variables en anglais ; données métier et commentaires
  pédagogiques peuvent rester en français.
- Test : `cd front/ && npm run dev`, puis
  `http://localhost:5174/~bellevert1/SAE301-Starter/` (le back doit être
  déployé : le proxy Vite pointe vers mmi.unilim.fr). Back : `php -l` sur les
  fichiers modifiés, scripts de `back/tests/` (`php back/tests/<nom>.php`).

## 2. Architecture

| Zone | Rôle | Dossier |
| --- | --- | --- |
| Front | SPA Vite, Tailwind 4, routeur client | `front/` (`layouts/`, `pages/`, `ui/`, `data/`, `lib/`) |
| Back | API JSON PHP, PDO/MySQL | `back/index.php`, `back/src/` (`Core/`, `Controller/`, `Model/`, `routes.php`), `back/tests/` |
| Données | schéma et seeds | `sql/` |
| Entrée HTTP | `/api/...` → PHP, reste → `front/dist/` | `.htaccess` |

Ne crée pas de nouvelle couche ou de framework pour contourner cette structure.

## 3. MVC strict (chaque page dynamique)

| Rôle | Contient | Interdit |
| --- | --- | --- |
| **M** | état, données, appels, calculs ; retourne des données, jamais du HTML | référencer V, toucher au DOM |
| **V** | templates, DOM, événements ; reçoit les données en paramètre | référencer M, logique métier, handler hors `C` |
| **C** | orchestre M et V, handlers `C.handler_<action>(ev)`, seul à référencer M et V | stocker des données, accéder au DOM hors `ev` |

- Un besoin se découpe toujours : donnée/calcul → M ; affichage/événement → V ;
  réaction → C. En cas de doute, demande.
- `C.init()` est le point d'entrée (la fonction de page peut le retourner au
  routeur).
- Un composant UI reçoit ses données et signale l'action par callbacks. Une page
  est reconstruite depuis son état après une mutation importante.
- Conventions : `M.xxx = function`, précédée d'un commentaire (`. paramètre`,
  `> valeur de retour`) ; `M.filter…`, `V.formatOne…`, `V.render…`, `V.init`,
  `C.init`, `C.handler_clickOn…`.

## 4. Front

- ES modules, conventions de `front/src/`. Délégation d'événements pour les
  éléments recréés.
- Toute donnée injectée est échappée ; `innerHTML` uniquement via les helpers.
- Réseau via `front/src/data/` et `lib/api-request.js` (`async/await`, erreurs
  et statuts HTTP explicites).
- Routeur : `data-link`, `basename` Vite, page 404 conservés. URL propres
  `/produit/:slug` et `/categorie/:slug`.
- Le panier (`localStorage`) n'est qu'un affichage : le serveur recalcule tout.
- États loading, vide, erreur, succès, auth et stock (« Bientôt épuisé »,
  « Épuisé ») visibles et accessibles.

## 5. Design

- Univers ludique et gourmand mais lisible : grands visuels de pots, cartes
  généreuses, palette de marque (fond clair, aplats vifs par parfum,
  bleu/blanc), titres arrondis, contrastes accessibles, animations discrètes.
- Mobile first : 1 colonne mobile, intermédiaire tablette, étendu desktop.
  Rien ne casse entre 320 px et desktop ; vérifier 320/375, 768, 1440 px, en
  thème clair et sombre (classe `.theme-dark`, tokens sémantiques).
- Images : `alt`, ratio, lazy-loading, état de chargement. Cibles tactiles ≥ 40 px.
- **Tailwind v4 uniquement** (pas de Sass ni de CSS basique), classes écrites en
  entier. Tokens dans `@theme inline`, primitifs séparés des sémantiques ;
  variables privées de composant (`--_bg`, `--_fg`) que les modifiers
  réassignent.
- Maquette figma à suivre : https://www.figma.com/design/LUg7WmEljJi6ViDYBtt235/Bellevert_Thomas?node-id=56-8217&t=nS0Aibs8zrTrLHCu-1

## 6. Back PHP

- `declare(strict_types=1)` partout ; tout est typé.
- `back/index.php` reste le point d'entrée unique. Contrôleurs : valident et
  orchestrent ; modèles : interrogent la base ; `Core/` : HTTP, DB, routage.
- Encapsulation `private`/`protected` ; abstraction/polymorphisme seulement si
  réellement partagés.
- Réponses JSON uniquement (`Response::json()` / `Response::erreur()`), jamais
  de HTML. Messages en français.
- Nouvelle route = 3 endroits : `routes.php`, `$controleurs` dans `index.php`,
  méthode contrôleur/modèle.

## 7. Données et sécurité

- Produit → au moins une **variante** (le stock est sur la variante) ; options
  choisies sur la fiche et figées dans la commande ; panier et lignes
  identifiés par `variantId` + options, **prix unitaire figé**.
- Numéro de commande unique (`CC-2026-000123`, `UNIQUE`) ; validation en
  **transaction** InnoDB ; décrément et journal de stock à la validation,
  recrédit uniquement via la fonction unique de changement de statut ; seuil
  « Bientôt épuisé » en table `parametre`.
- PDO préparé pour les valeurs ; liste blanche pour tout identifiant SQL
  dynamique.
- `session_start()` une seule fois, cookie configuré (`Path`, `HttpOnly`,
  `Secure`, `SameSite`), avant toute sortie ; `password_hash`/`password_verify` ;
  `session_regenerate_id(true)` après connexion ; admin séparé du client ;
  changer de mot de passe exige l'ancien.
- Aucun rôle, droit, prix ou statut de confiance côté client : le serveur
  valide quantité, variante, option, disponibilité, prix et statut, et relit
  les prix en base.
- Écritures atomiques, idempotentes si besoin, sans survente
  (`UPDATE … SET stock = stock - :q WHERE id = :id AND stock >= :q` puis
  `rowCount()`).
- Jeton CSRF sur les formulaires sensibles (admin) ; téléversements contrôlés
  (type réel, taille, renommage).
- Réponses avec code HTTP explicite et `exit`.

## 8. Ordre de réalisation

L'ordre des US, leurs dépendances et les jalons sont dans **`docs/US.md`**.
Respecte-le sauf décision explicite ; ne commence pas une US dont les
dépendances ne sont pas terminées. Ne fusionne jamais dans `main` une branche
à moitié finie.

Une US est terminée avec la DoD : branche dédiée (`US-0xx`) et commits propres,
HTML/CSS valides W3C, charte et responsive, 3 navigateurs, validation client
**et** serveur en français, contrôle des droits. Garde la traçabilité
interface, API, SQL, critères d'acceptation.

## 9. Vérification et skills

- Fin de toute modification front : `node .agents/skills/verifier-mvc/scripts/check-mvc.js .`
  puis `cd front && npm run build`. Modification PHP/SQL seule : `php -l` sur
  les fichiers touchés et les scripts de `back/tests/` concernés.
- Skills à ouvrir **avant** de coder (`.agents/skills/…/SKILL.md`) :

| Tâche | Skill |
| --- | --- |
| nouvelle page / route | `creer-page` |
| nouveau composant visuel | `creer-composant-ui` |
| appel API ou stockage local | `creer-module-data` |
| Tailwind | `styler-tailwind-tokens` |
| fonctionnalité front complète | `ajouter-fonctionnalite-mvc` |
| fin de toute tâche front | `verifier-mvc` |

## 10. Compte rendu

Proportionné à la modification (une correction ciblée : 2-3 lignes). Pour une
fonctionnalité :

1. Fichiers modifiés, créés ou supprimés (chemins).
2. Détail des modifications (fonctions touchées ; lignes si utile).
3. Points d'attention et étapes suivantes, dans l'ordre de `docs/US.md`.
4. Impacts sur le reste de l'application.

Toute documentation générée est pédagogique : sections numérotées, tableaux
récapitulatifs, check-lists, diagnostic.

## 11. Cartographie

`docs/CARTOGRAPHIE.md` donne le fonctionnement global (structure, cycle d'une
requête, fonctionnalités, données, écarts connus). Pas de liste exhaustive :
lis le code pour le détail, il fait foi. Mets la carte à jour seulement quand
l'architecture change (nouvelle zone, nouvelle table, écart résolu).

Avant toute construction : dépendances de l'US terminées, fichiers concernés repérés
(cartographie, puis lus avec leurs appelants), skill ouvert, accord obtenu
(§1). Après : vérifications du §9, 320/375, 768, 1440 px en clair et sombre,
compte rendu, cartographie à jour. Aucun commit/push sans demande.
