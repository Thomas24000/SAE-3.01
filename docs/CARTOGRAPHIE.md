# Cartographie du dépôt SAE301

Vue d'ensemble du fonctionnement. Pas de liste exhaustive : pour le détail
(routes, composants, colonnes), lire le code, qui fait foi. À mettre à jour
seulement quand l'architecture change.

## 1. Contexte : `public_html/`

| Dossier | Rôle | Toucher ? |
| --- | --- | --- |
| `SAE301-Starter/` | le projet SAE301 (Ben & Jerry's) | oui |
| `Base/`, `R3.13-TP1/` | anciens TP cookies/sessions (catalogue de films) | non |
| `.htaccess` (racine) | auth LDAP de l'espace perso | non |

`Base/` et `R3.13-TP1/` ont la même architecture PHP que le Starter mais un
autre vocabulaire (films) : ne jamais le reprendre.

## 2. Structure du projet

| Zone | Contenu |
| --- | --- |
| `.htaccess` | `/api/*` → `back/index.php` ; `/uploads/*` servi tel quel ; le reste → `front/dist/` |
| `front/` | SPA Vite + Tailwind 4. `src/` : `main.js` (routeur), `layouts/` (root, admin), `pages/` (M/C/V + template), `ui/` (composants présentatifs), `data/` (appels API, `localStorage` du panier), `lib/` (routeur, rendu, format, stock, options, thème), `global.css` (tokens). `dist/` est généré : ne pas éditer. Tests Node dans `front/tests/` |
| `back/` | API PHP : `index.php` (point d'entrée unique), `config/` (secrets, accès refusé au web), `src/` (`routes.php`, `Core/`, `Controller/`, `Model/`), `tests/` (scripts CLI sur base jetable) |
| `sql/glaces.sql` | schéma + seeds, rejouable |
| `uploads/` | images téléversées (ignorées par Git, aucun script exécuté) |
| `.agents/` | règles (`rules/`) et skills (`skills/`) pour l'agent ; `.claude/skills` y pointe |
| `docs/` | cette carte, `US.md` (ordre des US) |

## 3. Cycle d'une requête

1. Le navigateur demande une URL ; `.htaccess` sert `front/dist/index.html` (sauf `/api` et `/uploads`).
2. `main.js` démarre le routeur, qui choisit la page et son layout.
3. La page (`C.init`) charge ses données via un module `data/`, puis `lib/api-request.js` appelle `/api/...`.
4. `back/index.php` → `Router` → contrôleur (valide) → modèle (PDO) → `Response::json()` ou `Response::erreur()` puis `exit`.
5. En cas d'erreur HTTP, le front lève `ErreurApi(message, statut)` ; la page affiche le message.
6. La page construit son DOM depuis son état (M), via des composants `ui/` ; le routeur l'insère dans le layout.

En dev (`npm run dev`), `/api` passe par le proxy Vite vers `mmi.unilim.fr` : le back doit être déployé.

## 4. Fonctionnalités

| Domaine | Front (routes) | API (`/api/...`) |
| --- | --- | --- |
| Catalogue, fiche produit | `/`, `/produit/:slug` | `produits`, `produit` |
| Panier (`localStorage`, affichage seul) | `/panier` | `panier` (prix et stock actuels) |
| Compte client | `/connexion`, `/inscription` | `login`, `inscription`, `me`, `logout` |
| Commande | `/commande`, `/commande/:numero` | `commande` (POST/GET), `commandes`, `commande/reprise`, `code-promo` |
| Back-office (session admin séparée, CSRF) | `/admin`, `/admin/categories…`, `/admin/produits…`, `/admin/commandes…`, `/admin/statistiques`, `/admin/codes-promo…` | `admin/login`, `admin/me`, `admin/logout`, `admin/categories…`, `admin/produits…`, `admin/parametres/seuil`, `admin/stats`, `admin/statistiques`, `admin/codes-promo…` |
| Page inconnue | `*` → `pages/404` | — |

Pas encore faite : `/categorie/:slug` (DEC-a). Voir `docs/US.md` pour le reste.

Ajouter une route front : `import` + `router.addRoute(...)` avant `"*"`.
Ajouter une route back : `routes.php`, `$controleurs` dans `index.php`, méthode du contrôleur/modèle.

## 5. Données

Un produit a au moins une **variante** (format × service) qui porte le stock et
le prix. Les formats, services et toppings sont des référentiels **partagés** par
tous les produits. Les options choisies sur la fiche sont **figées** dans la
commande, avec le prix unitaire.

| Tables | Rôle |
| --- | --- |
| `categorie`, `produit`, `produit_image`, `variante` | catalogue |
| `format` | formats de pot (« Pot 100 ml »), partagés |
| `option_choix` (`type` = `service` ou `topping`), `categorie_topping` | services (un par variante) et toppings (par catégorie) ; une seule table pour que l'identifiant d'un choix soit unique |
| `allergene`, `produit_allergene` | allergènes d'un produit (liste, pas du texte libre) |
| `statut_commande` | statuts d'une commande (`en_cours`, `prete`, `retiree`, `annulee`) |
| `utilisateur` | clients et admins (`role`) |
| `commande`, `ligne_commande`, `ligne_commande_option` | commandes figées (nom, prix, options copiés) |
| `mouvement_stock` | journal des sorties/retours, idempotent |
| `parametre` | seuil « Bientôt épuisé » |

Points clés :
- **Variante = combinaison (OPT-b).** `variante.format_id` est le format, `variante.service_id` le service (un choix de type `service`, jamais un topping : clé étrangère composite). L'API garde les deux groupes « Service » et « Toppings » avec des identifiants de choix uniques. Une combinaison absente de la table n'existe pas : la fiche et l'éditeur d'options du panier l'affichent « Indisponible », « Épuisé » si son stock est nul. La commande exige que le service des options soit celui de la variante. L'admin choisit le format dans une liste (les formats existants), saisit un prix par format et un stock par service (champ vide = combinaison retirée), et coche les allergènes. Un produit a toujours des services : un produit sans service n'existe plus.
- **Promotion automatique (PRO-c).** Le produit au stock total le plus élevé (somme de ses variantes, à égalité le plus ancien, aucun si tout est épuisé) est à -20 %. Rien n'est enregistré : `PromotionModel` le déduit des stocks à chaque lecture, donc la promotion se déplace quand les stocks changent. La remise porte sur le prix du format ; les suppléments d'options restent au prix plein. L'API expose `promoPourcent`, `prixMinPromoCents` et `prixPromoCents` ; la commande recalcule le même prix et le fige dans la ligne de commande.
- **Codes promo (PRO-a).** Table `code_promo` (code en majuscules, pourcentage 1-100, `actif`). Le client le saisit sur `/commande` ; `GET /api/code-promo?code=` le vérifie (404 si inconnu ou désactivé, 429 après 5 essais ratés par minute) et `POST /api/commande` accepte `codePromo`, revérifié dans la transaction (422 sinon). La réduction s'applique au total des lignes, **après** la promotion automatique (cumul). `commande.total_cents` est le total à payer ; `code_promo`, `reduction_pourcent` et `reduction_cents` sont copiés (pas de clé étrangère : modifier un code ne touche pas les commandes passées). Les statistiques de revenus (PIL-a) utilisent le total à payer ; le classement des meilleures ventes reste calculé sur les prix des lignes.
- **Gestion des codes (PRO-b).** `/admin/codes-promo` (liste + statistiques : utilisations hors annulées, réductions accordées, chiffre d'affaires, dernière utilisation), `/admin/codes-promo/nouveau`, `/admin/codes-promo/:id/modifier`. Un code ne se renomme jamais ; on change son pourcentage ou on le désactive (les commandes passées gardent leur pourcentage). Un code n'est supprimable que s'aucune commande ne l'a cité. Écritures protégées par le jeton CSRF.
- La commande est une transaction : variantes verrouillées, prix relus en base, stock décrémenté et journalisé. `CommandeModel::mouvementer()` est le seul à écrire `variante.stock`, et `changerStatut()` le seul à changer un statut (recrédit à l'annulation).
- Comptes de démo dans les seeds (`alice@example.com`, `admin@example.com`) : retirer les mots de passe avant tout dépôt public.

## 6. Écarts connus

| Constat | État |
| --- | --- |
| `README.md` en retard (panier, commande, options, back-office, port 5173 vs 5174) | à mettre à jour |
| `config.php` : `debug => true` et identifiants réels | `debug` à `false` en prod ; fournir un `config.example.php` |
| Nommage mixte français/anglais dans l'ancien code (`C.charger`, `M.produitsFiltres`) | nouveau code en anglais, ne pas renommer l'existant |
| `ui/message` utilise des couleurs Tailwind brutes | exception connue, ne pas la recopier |
| Composants `formulaire-connexion` / `statistiques` hérités de la page admin de démo, plus utilisés | à supprimer sur demande |
| Stock saisi en back-office non journalisé | acceptable en MVP |
| Formats, services, toppings et allergènes ne se créent pas dans l'admin (listes fixes en base) | à ajouter dans `sql/glaces.sql` |
| Stock affiché dans le catalogue = somme des combinaisons du produit | acceptable |
| Pages admin et commande pas toutes testées en navigateur ni sur la vraie base | à tester |
