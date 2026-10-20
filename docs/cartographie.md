# Cartographie du dépôt SAE301-Starter

Carte de référence déplacée depuis `AGENTS.md` (ancien §12). À tenir à jour à chaque fichier, route ou table ajouté. En cas d'écart avec le code, le code fait foi.

## 1. Contexte : `public_html/`

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

## 2. Arborescence commentée de `SAE301-Starter/`

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
└── skills/                  procédures à ouvrir AVANT de coder (voir 9)
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
    ├── Controller/          AdminAuthController, AdminCategorieController, AdminCommandeController, AdminProduitController, AuthController, CommandeController, CompteController, ProduitController, StatsController
    └── Model/               CategorieModel, CommandeModel, ProduitAdminModel, ParametreModel, ProduitModel, UtilisateurModel
back/tests/stock.php         tests CLI du stock STK-a (base jetable, `Require all denied`)
back/tests/commandes-admin.php tests CLI de la gestion des commandes PIL-b (base jetable, mêmes variables `STK_*`)
back/tests/options.php       tests CLI des options dans les commandes OPT-a (base jetable : `STK_DSN`, `STK_USER`, `STK_PASS`)
front/tests/options.test.mjs tests Node de `lib/options.js` : `node front/tests/options.test.mjs`
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

## 3. Cycle d'une requête

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

## 4. Routes front (`front/src/main.js`)

| Route | Page | US | État |
| --- | --- | --- | --- |
| `/` | `pages/produits` (catalogue, filtres catégorie, « Voir plus » par 8, bandeau) | DEC-b + STK-b | fait |
| `/produit/:slug` | `pages/produit` (galerie, variantes, quantité, ajout panier ; 404 si slug inconnu) | DEC-c | fait |
| `/panier` | `pages/panier` (lignes, ±, suppression, résumé, réconciliation avec l'API) | CMD-b | fait (« Valider » : non connecté → `/connexion?retour=/commande` ; connecté → `/commande`) |
| `/commande` | `pages/commande` (récapitulatif en lecture seule, bouton « Confirmer ma commande », redirige vers la connexion si besoin) | CMD-a | fait (à tester en navigateur) |
| `/commande/:numero` | `pages/confirmation` (numéro, statut, date, lignes aux prix figés, total ; 401/404 affichés) | CMD-a | fait (à tester en navigateur) |
| `/compte` | `pages/compte` (bonjour personnalisé, infos, 3 dernières commandes ; 401 → `/connexion?retour=/compte`) | SUI-b | fait (à tester en navigateur) |
| `/compte/profil` | `pages/compte-profil` (nom + e-mail) | SUI-b | fait (à tester en navigateur) |
| `/compte/commandes` | `pages/compte-commandes` (historique : filtres statut + période du/au, 10 par page, lien vers `/commande/:numero` ; 401 → `/connexion?retour=/compte/commandes`) | SUI-c | fait (testée avec jsdom contre le vrai back sur MariaDB jetable, pas en navigateur) |
| `/compte/mot-de-passe` | `pages/compte-mot-de-passe` (ancien exigé) | SUI-b | fait (à tester en navigateur) |
| `/admin` | `pages/admin` : écran de connexion admin sans session, tableau de bord (4 indicateurs) avec session ; layout `AdminLayout` | GOF-b | fait (non testée en navigateur ni sur la vraie base) |
| `/connexion` | `pages/connexion` (formulaire, ou « connecté » + déconnexion ; `?retour=` filtré) | CMD-c | fait |
| `/inscription` | `pages/inscription` (validation client + serveur, connecte aussitôt) | CMD-c | fait |
| `/admin/categories` | `pages/admin-categories` (liste, modale de suppression avec réaffectation) | GOF-c | fait (non testée en navigateur ni sur la vraie base) |
| `/admin/categories/nouvelle`, `/admin/categories/:id/modifier` | `pages/admin-categorie` (même formulaire création / modification) | GOF-c | fait (non testée) |
| `/admin/produits` | `pages/admin-produits` (recherche, filtres catégorie/stock, pagination par 6, modale de suppression) | GOF-a | fait (testée avec jsdom + faux serveur, pas sur la vraie base) |
| `/admin/produits/nouveau`, `/admin/produits/:id/modifier` | `pages/admin-produit` (informations, images, formats et prix, seuil, suppression) | GOF-a | fait (idem) |
| `/admin/commandes` | `pages/admin-commandes` (liste, tri date/statut/montant, filtre statut, cases à cocher + actions en lot, modale de confirmation d'annulation) | PIL-b | fait (testée avec jsdom contre le vrai back sur MariaDB jetable, pas en navigateur) |
| `/admin/commandes/:numero` | `pages/admin-commande` (détail complet, boutons de statut, journal, annulation confirmée) | PIL-b | fait (idem) |
| `*` | `pages/404` (statique, renvoie une chaîne) | — | fait |
| `/categorie/:slug` | — | DEC-a | **à faire** (le filtre actuel est local, sans URL) |

Ajouter une route : `import` + `router.addRoute(...)` **avant** `"*"`.

## 5. Composants UI (`front/src/ui/`)

| Composant (objet exporté) | API | Données reçues → callbacks | Utilisé par |
| --- | --- | --- | --- |
| `header` (`HeaderView`) | `html`, `dom`, `updateCount(n)` | `{ panierCount }` ; gère seul le bouton thème ; icône « Mon compte » → `/compte` si connecté, `/connexion` sinon + e-mail du connecté + bouton « Se déconnecter » ; `dom(data, { surDeconnexion })`, `updateAccount(email)` | `RootLayout`, pages produit/panier (compteur) |
| `footer` (`FooterView`) | `html`, `dom` | aucune | `RootLayout` |
| `bandeau` (`BandeauView`) | `dom(image, surDecouvrir)` | URL visuel | produits |
| `message` (`MessageView`) | `html`, `dom` | `{ type: "erreur"\|"succes", texte }` ou `null` | toutes les pages dynamiques |
| `filtres-categories` (`FiltresCategoriesView`) | `dom(chips, surChoix)` ; sous-template `chip.html` | `[{ slug, libelle, selectionne }]` | produits |
| `grille-produits` (`GrilleProduitsView`) | `dom(produits)` ; `vide.html` si liste vide | produits avec `statutStock` | produits |
| `carte-produit` (`CarteProduitView`) | `dom(produit)` ; `bouton-choisir.html` / `bouton-epuise.html` | `{ nom, slug, teinte, image, prixMin, statutStock }` | grille-produits |
| `badge-stock` (`BadgeStockView`) | `html(statut)`, `dom(statut)` | `"disponible"\|"bientot"\|"epuise"` | carte, fiche |
| `fiche-produit` (`FicheProduitView`) | `dom(data, actions)`, `domVariante`, `domVignette` ; rend lui-même le focus | voir JSDoc ; `surVariante`, `surImage`, `surQuantite`, `surAjout`, `surOption` | produit |
| `selecteur-options` (`SelecteurOptionsView`) | `dom(groupes, onPick)`, `domGroupe`, `domChoix` ; sous-templates `groupe.html`, `choix.html` | groupes `{ id, libelle, multiple, obligatoire, choix: [{ id, libelle, supplementCents, selectionne }] }` ; `onPick(groupeId, choixId)` ; radio ou case à cocher, rend lui-même le focus | fiche-produit |
| `ligne-panier` (`LignePanierView`) | `dom(data, actions)` | `{ variantId, options: [{ id, libelle, supplementCents }], cle, nom, slug, libelle, image, teinte, quantite, totalCents (suppléments compris), moinsPossible, plusPossible, modifiable, edition }` (`edition` : `null` ou `{ groupes, manquants }`) ; `surQuantite(id, options, ±1)`, `surSuppression(id, options)`, `surModification(id, options)`, `surOption(id, options, groupeId, choixId)`, `surEnregistrement(id, options)`, `surAnnulation()` (boutons `data-options`) ; le sous-template `edition.html` embarque `selecteur-options` | panier |
| `resume-commande` (`ResumeCommandeView`) | `dom(data, actions)` | `{ sousTotalCents, totalCents }` ; `surValidation` | panier |
| `ligne-commande` (`LigneCommandeView`) | `dom(data)` | `{ nom, libelle, options: [{ libelle, supplementCents }], quantite, prixUnitaireCents (suppléments compris), totalCents }` (lecture seule) | commande, confirmation |
| `encart-validation` (`EncartValidationView`) | `dom(data, actions)` | `{ totalCents, email, enCours }` ; `surConfirmation` (bouton `aria-disabled` pendant l'envoi) | commande |
| `formulaire-login` (`FormulaireLoginView`) | `dom(data, actions)` | `{ email }` ; `surConnexion(email, mdp)`, `surInscription` | connexion |
| `formulaire-inscription` (`FormulaireInscriptionView`) | `dom(data, actions)` | `{ email }` ; `surInscription(email, mdp, confirmation)`, `surConnexion` | inscription |
| `formulaire-connexion` (`FormulaireConnexionView`) | `html`, `dom(data, actions)` | `{ login }` ; `surConnexion(login, mdp)`, `surDeconnexion` | admin |
| `navigation-compte` (`NavigationCompteView`) | `dom()` | aucune ; 4 liens `data-link` (Accueil, Profil, Mes commandes, Mot de passe), `aria-current` posé par le routeur | pages compte* |
| `formulaire-profil` (`FormulaireProfilView`) | `dom(data, actions)` | `{ nom, email }` ; `surEnregistrement(nom, email)` | compte-profil |
| `formulaire-mot-de-passe` (`FormulaireMotDePasseView`) | `dom(actions)` | aucune donnée (champs jamais pré-remplis) ; `surChangement(ancien, nouveau, confirmation)` | compte-mot-de-passe |
| `apercu-commandes` (`ApercuCommandesView`) | `dom(data)` ; `ligne.html`, `vide.html` | `{ resume, commandes: [{ numero, statut, date, totalCents }] }` | compte |
| `filtres-historique` (`FiltresHistoriqueView`) | `dom(data, actions)` | `{ statut, du, au, statuts: [{ valeur, libelle }], filtre }` ; `surChangement({ statut, du, au, champ })`, `surReinitialisation()` | compte-commandes |
| `liste-historique` (`ListeHistoriqueView`) | `dom(data)` ; `ligne.html`, `vide.html` ; rend `badge-statut-commande` | `{ commandes: [{ numero, statut, date, totalCents }], texteVide }` (lecture seule) | compte-commandes |
| `indicateur` (`IndicateurView`) | `dom(data)` | `{ libelle, valeur, legende, icone, attention? }` (aucun callback) ; icônes dans `public/images/admin/` | `AdminLayout` |
| `barre-admin` (`BarreAdminView`) | `dom(data)` | `{ section, email }` ; masquée en mobile ; avatar `public/images/admin/avatar.svg` | pages admin |
| `connexion-admin` (`ConnexionAdminView`) | `dom(data, actions)` | `{ email, message }` ; `surConnexion(email, mdp)` | admin |
| `badge-statut-commande` (`BadgeStatutCommandeView`) | `html`, `dom(statut)` | `"en_cours"\|"prete"\|"retiree"\|"annulee"` | liste-commandes, detail-commande-admin |
| `filtres-commandes` (`FiltresCommandesView`) | `dom(data, actions)` | `{ tri, sens, statut }` ; `surChangement({ tri, sens, statut, champ })` | admin-commandes |
| `liste-commandes` (`ListeCommandesView`) | `dom(data, actions)` ; sous-templates `ligne`, `action`, `vide` | `{ commandes: [{ id, numero, client, date, articles, statut, totalCents, coche, actions }], toutCoche }` ; `surSelection(id)`, `surToutSelectionner()`, `surChangement(id, statut)` | admin-commandes |
| `actions-lot-commandes` (`ActionsLotCommandesView`) | `dom(data, actions)` ; sous-template `bouton` | `{ nombre, actions: [{ statut, libelle }] }` ; `surAction(statut)` | admin-commandes |
| `detail-commande-admin` (`DetailCommandeAdminView`) | `dom(data, actions)` ; sous-templates `ligne`, `option`, `entree`, `action`, `vide`, `aucune-action` | `{ numero, statut, date, client, totalCents, actions, aucuneAction, lignes, journal }` ; `surAction(statut)` | admin-commande |
| `navigation-admin` (`NavigationAdminView`) | `dom(data, actions)` ; sous-templates `lien.html`, `lien-indisponible.html` | `{ liens: [{ libelle, href, icone, disponible }] }` ; `surDeconnexion` ; `aria-current` posé par le routeur ; barre latérale desktop / icônes tablette / menu repliable mobile ; icônes `public/images/admin/nav-*.svg` | `AdminLayout` |
| `formulaire-connexion` / `statistiques` (anciens composants de la page admin de démo) | — | **plus utilisés** depuis GOF-b ; à supprimer sur demande | aucun |
| `en-tete-page` (`EnTetePageView`) | `dom(data)` ; `action.html` | `{ titre, sousTitre, action: { libelle, href } \| null }` | pages admin |
| `bandeau-info` (`BandeauInfoView`) | `dom(data)` | `{ texte, attention? }` (bleu, ou jaune si `attention`) | admin-categories, modale |
| `liste-categories` (`ListeCategoriesView`) | `dom(categories, actions)` ; `ligne.html`, `vide.html` | `[{ id, libelle, description, nombreProduits }]` ; `surSuppression(id)` | admin-categories |
| `formulaire-categorie` (`FormulaireCategorieView`) | `dom(data, actions)` | `{ libelle, description, bouton, enCours, message }` ; `surEnvoi(libelle, description)` | admin-categorie |
| `modale-suppression` (`ModaleSuppressionView`) | `dom(data, actions)` ; `reaffectation.html` ; `<dialog>` natif (la page appelle `showModal()`) | `{ nom, nombreProduits, cibles, cible, enCours, message }` ; `surConfirmation(cible)`, `surChoixCible`, `surAnnulation` | admin-categories |
| `modale-confirmation` (`ModaleConfirmationView`) | `dom(data, actions)` ; `<dialog>` natif | `{ titre, texte, bouton, refus?, enCours, message }` (`refus` : texte du bouton qui ferme, « Annuler » par défaut) ; `surConfirmation()`, `surAnnulation()` | admin-produits, admin-produit, admin-commandes, admin-commande |
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

## 6. Modules `lib/` et `data/`

| Fichier | Exporte | Rôle |
| --- | --- | --- |
| `lib/router.js` | `Router` | routes avec `:param`, layouts par plus long préfixe, `data-link`, `basename`, anti-course (`this.navigation`) |
| `lib/utils.js` | `genericRenderer`, `htmlToFragment` | `{{cle}}` **échappé** ; chaîne → `DocumentFragment` |
| `lib/api-request.js` | `getRequest`, `postRequest(uri, data, headers)`, `postFormRequest(uri, formData, headers)`, `ErreurApi` | `fetch` JSON sur `BASE_URL + "api/"`, erreur `{ erreur }` → `ErreurApi(message, statut)` |
| `lib/format.js` | `formaterPrix(centimes)` | « 7,90 € » (affichage uniquement) |
| `lib/stock.js` | `statutStock(stock, seuil)`, `ajusterLignes(lignes, variantes)`, `texteAjustements(ajustements, retirees)` | seuil fourni par l'API (`seuilBientotEpuise`, table `parametre`) ; `ajusterLignes` (pure) plafonne les quantités au stock, les lignes d'une même variante se partageant son stock |
| `lib/options.js` | `defaultChoix`, `choixDepuisIds`, `toggleChoix`, `choixIds`, `supplementCents`, `hasMissing`, `groupesAvecEtat`, `choixReconnus`, `choixDeLigne`, `ligneInvalide`, `formaterOptions` | règles des options (US OPT-c et OPT-a), **pures** (testées : `front/tests/options.test.mjs`) ; une sélection est `{ [idGroupe]: [idChoix] }` ; partagées par fiche, panier et commande |
| `lib/navigation.js` | `goTo(path)`, `reload()`, `readQuery(name)`, `safeReturnPath(raw)` | redirection depuis une page (pushState + `popstate`, sans toucher au routeur) ; `retour` limité aux chemins internes |
| `lib/theme.js` | `basculerTheme()` | classe `.theme-dark` sur `<html>` + `localStorage["theme"]` |
| `lib/statut-commande.js` | `libelleStatut(statut)`, `actionsStatut(statut)` | libellés (prete = « Disponible ») et boutons proposés ; le serveur reste seul juge des transitions |
| `data/produit.js` | `ProduitData.fetchAll / fetchOne(slug) / fetchVariantes(ids)` | préfixe les images par `BASE_URL` |
| `data/auth.js` | `AuthData.login(email, mdp) / register / me / logout`, `knownEmail` | session PHP ; `knownEmail` = dernier e-mail connu, pour le header |
| `data/commande.js` | `CommandeData.create(lignes) / fetchOne(numero) / fetchAll(filtres, page)` | `POST` puis `GET /api/commande` ; n'envoie que `{ variantId, quantite, options }` (ids de choix) ; `fetchAll` → `GET /api/commandes` (filtres vides non envoyés) |
| `data/compte.js` | `CompteData.fetch / updateProfile(nom, email) / updatePassword(ancien, nouveau, confirmation)` | `GET /api/compte`, `POST /api/compte/profil` et `/mot-de-passe` ; met à jour `AuthData.knownEmail` |
| `data/admin.js` | `AdminData.login(email, mdp) / me / logout`, `knownEmail` | `admin/login`, `admin/me`, `admin/logout` (session admin séparée) |
| `data/categories.js` | `CategorieData.fetchAll / create / update / remove(id, reaffecterVers)` | `admin/categories…` ; joint le jeton CSRF (`AdminData.csrf`) en-tête `X-CSRF-Token` |
| `data/commande-admin.js` | `CommandeAdminData.fetchAll(tri, sens, statut) / fetchOne(numero) / updateStatus(ids, statut)` | `admin/commandes…` ; jeton CSRF en-tête `X-CSRF-Token` |
| `data/produit-admin.js` | `ProduitAdminData.fetchAll / fetchOne(id) / create / update / remove / uploadImages(id, files) / removeImage / setMainImage / saveThreshold` | `admin/produits…` ; jeton CSRF ; adresses d'images complétées par `BASE_URL` |
| `data/stats.js` | `StatsData.fetch()` | `admin/stats` (inclut `commandes`) |
| `data/panier.js` | `PanierData.read / write / add(variantId, quantite, options) / setQuantity(variantId, quantite, options) / remove(variantId, options?) / clear / count` | `localStorage["panier"]` = `[{ variantId, quantite, options: [idChoix triés] }]`, validé à la lecture, plafond 99 ; **une ligne = variante + options** (`remove` sans options retire toutes les lignes de la variante) |

Seuls `data/panier.js` et `lib/theme.js` (+ le script inline d'`index.html`)
touchent au `localStorage`.

## 7. API PHP (`back/src/routes.php`)

| Route | Contrôleur::méthode | Modèle | Réponse / erreurs |
| --- | --- | --- | --- |
| `GET /api/produits` | `ProduitController::index` | `lister()` | `{ produits, total, seuilBientotEpuise }` (prixMin, stock total, categorieSlug) |
| `GET /api/produit?slug=` | `ProduitController::show` | `findBySlug()` | `{ produit (dont `options` : groupes + choix), seuilBientotEpuise }` ; 400 slug invalide (`^[a-z0-9-]{1,120}$`), 404 |
| `GET /api/panier?ids=3,5` | `ProduitController::panier` | `findVariantesByIds()`, `findOptionsByProduits()` | `{ variantes, options, seuilBientotEpuise }` (prix et `stock` actuels ; `options` = `{ [idProduit]: [groupes avec choix et suppléments] }`, pour chiffrer et modifier les lignes) ; 400 ids invalides ou > 50 |
| `POST /api/login` | `AuthController::login` | `UtilisateurModel::findByEmail()` | corps `{ email, mdp }` → `{ connecte, email, role }` ; 400 champ vide, 401 identifiants |
| `POST /api/inscription` | `AuthController::register` | `UtilisateurModel::create()` | corps `{ email, mdp, confirmation }` → 201 `{ connecte, email, role: "client" }` (connecte aussitôt) ; 400 validation (`filter_var`), 409 e-mail pris |
| `GET /api/me` | `AuthController::me` | — (lit la session) | `{ connecte: false }` ou `{ connecte, email, role }` |
| `POST /api/logout` | `AuthController::logout` | — | `{ connecte: false }` |
| `POST /api/commande` | `CommandeController::store` | `CommandeModel::creer()` | corps `{ lignes: [{ variantId, quantite, options?: [idChoix] }] }` → 201 `{ commande: { numero, statut, totalCents } }` ; 401 non connecté, 400 lignes invalides (vide, > 50, doublon **variante + options**, quantité hors 1-99, options mal formées ou > 20), 409 variante disparue, **option invalide pour le produit (autre produit, inconnue, 2 choix dans un groupe à choix unique, groupe obligatoire vide)** ou stock insuffisant. Transaction : variantes verrouillées `FOR UPDATE` par id croissant, prix et suppléments relus en base (prix du client ignoré), options figées dans `ligne_commande_option`, `prix_unitaire_cents` = format + suppléments, stock contrôlé, décrémenté et journalisé **par variante** (somme des lignes qui la partagent, STK-a) |
| `GET /api/commande?numero=` | `CommandeController::show` | `CommandeModel::findByNumero()` | `{ commande: { numero, statut, totalCents, creeLe, email, lignes: [{ …, options: [{ groupe, libelle, supplementCents }] }] } }` ; 401, 400 numéro mal formé, 404 inconnue **ou à un autre client** |
| `GET /api/commandes?statut=&du=&au=&page=` | `CommandeController::index` | `CommandeModel::listerClient()` | tous les paramètres facultatifs (statut dans `CommandeModel::STATUTS`, `du`/`au` = `AAAA-MM-JJ` inclusifs, `page` ≥ 1) → `{ commandes: [{ numero, statut, totalCents, creeLe }], total, page, pages }`, 10 par page, plus récente d'abord, page hors limites ramenée à la dernière ; 401, 400 (statut/date/page invalides, début > fin) |
| `GET /api/compte` | `CompteController::show` | `UtilisateurModel::findById()`, `CommandeModel::findRecentes()` / `countByUtilisateur()` | `{ profil: { email, nom, creeLe }, commandes: { total, recentes[3] } }` ; 401 (SUI-b) |
| `POST /api/compte/profil` | `CompteController::updateProfile` | `UtilisateurModel::updateProfile()` | corps `{ nom, email }` → `{ profil }` (nom vide = effacé, session alignée) ; 401, 400 (nom > 100, e-mail invalide), 409 e-mail pris |
| `POST /api/compte/mot-de-passe` | `CompteController::updatePassword` | `findHashById()`, `updatePassword()` | corps `{ ancien, nouveau, confirmation }` → `{ modifie: true }` ; **exige l'ancien** : 403 s'il est faux ; 400 règles du nouveau ; `session_regenerate_id(true)` |
| `POST /api/admin/login` | `AdminAuthController::login` | `UtilisateurModel::findByEmail()` | corps `{ email, mdp }` → `{ connecte, email }` ; 400 champ vide, 401 identifiants ou compte non admin. Session séparée du client : `$_SESSION['admin']` ; `POST /api/login` refuse désormais les comptes admin (401) |
| `GET /api/admin/me` | `AdminAuthController::me` | — | `{ connecte: false }` ou `{ connecte, email }` |
| `POST /api/admin/logout` | `AdminAuthController::logout` | — | retire `$_SESSION['admin']` seulement ; `{ connecte: false }` |
| `GET /api/admin/categories` | `AdminCategorieController::index` | `CategorieModel::lister()` | `{ categories: [{ id, libelle, slug, description, nombreProduits }], totalProduits }` ; 401 |
| `POST /api/admin/categories` | `AdminCategorieController::create` | `creer()` | corps `{ libelle, description }` → 201 `{ categorie }` ; 400 (nom 2-60, description ≤ 255), 401, 403 (CSRF), 409 (nom/slug déjà pris) |
| `POST /api/admin/categories/modifier` | `AdminCategorieController::update` | `modifier()` | corps `{ id, libelle, description }` → `{ categorie }` ; 400, 401, 403, 404, 409 |
| `POST /api/admin/categories/supprimer` | `AdminCategorieController::delete` | `supprimer()` | corps `{ id, reaffecterVers? }` → `{ supprimee, reaffectes }`. **Règle** : catégorie vide → suppression directe ; avec produits → `reaffecterVers` obligatoire (autre catégorie existante), sinon 409 ; transaction (verrou, UPDATE produit, DELETE) ; 400 cible invalide, 404 |
| `GET /api/admin/commandes` | `AdminCommandeController::index` | `CommandeModel::listerAdmin()` | `?tri=date\|statut\|montant&sens=asc\|desc&statut=` (liste blanche, repli date/desc) → `{ commandes: [{ id, numero, statut, totalCents, creeLe, client, articles }], tri, sens, statut }` ; 401 |
| `GET /api/admin/commande?numero=` | `AdminCommandeController::show` | `findAdmin()` | `{ commande: { …, client, lignes (avec options), journal: [{ admin, ancien, nouveau, creeLe }] } }` ; 400, 401, 404 |
| `POST /api/admin/commandes/statut` | `AdminCommandeController::updateStatus` | `changerStatut()` | corps `{ ids: [1 à 100], statut }` (une action seule = un id). **Une transaction par commande** : `{ modifiees: [numero], refusees: [message] }` ; 409 si aucune n'a changé ; 400, 401, 403 (CSRF), 404 |
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

## 8. Base de données (`sql/glaces.sql`)

| Table | Colonnes clés | Contraintes |
| --- | --- | --- |
| `categorie` | `id`, `libelle`, `slug`, `description` (≤ 255, vide par défaut) | `UNIQUE(slug)` |
| `produit` | `categorie_id`, `nom`, `slug`, `description`, `teinte` (0-359), `image`, `description_longue`, `ingredients` | `UNIQUE(slug)`, FK → categorie `RESTRICT` |
| `produit_image` | `produit_id`, `chemin`, `position` | `UNIQUE(produit_id, position)`, FK `CASCADE` |
| `variante` | `produit_id`, `libelle`, `prix_cents`, `stock` | `UNIQUE(produit_id, libelle)`, FK `CASCADE` |
| `utilisateur` | `email` (minuscules), `nom` (NULL, facultatif), `mot_de_passe` (hachage `password_hash`), `role` (`client`\|`admin`), `cree_le` | `UNIQUE(email)` |
| `commande` | `numero` (`CC-AAAA-000123`), `utilisateur_id`, `statut` (`en_cours`\|`prete`\|`retiree`\|`annulee`, défaut `en_cours`), `total_cents`, `cree_le` | `UNIQUE(numero)`, FK → utilisateur `RESTRICT` |
| `ligne_commande` | `commande_id`, `variante_id` (NULL si supprimée), `produit_nom`, `variante_libelle`, `prix_unitaire_cents`, `quantite` | FK commande `CASCADE`, FK variante `SET NULL` ; nom, format et prix **figés** à la commande ; `prix_unitaire_cents` comprend les suppléments ; une même variante peut figurer sur plusieurs lignes (options différentes) |
| `ligne_commande_option` | `ligne_id`, `groupe_libelle`, `choix_libelle`, `supplement_cents` | FK ligne `CASCADE`, **aucune clé vers `option_choix`** : instantané, le catalogue peut changer sans toucher aux commandes (US OPT-a) |
| `mouvement_stock` | `variante_id` (NULL si supprimée), `commande_id`, `type` (`sortie`\|`retour`), `quantite`, `stock_avant`, `stock_apres`, `cree_le` | `UNIQUE(commande_id, variante_id, type)` (idempotence), FK variante `SET NULL`, FK commande `CASCADE` ; `variante.stock` a en plus `CHECK (stock >= 0)` |
| `journal_commande` | `commande_id`, `admin_id`, `ancien_statut`, `nouveau_statut`, `cree_le` | FK commande `CASCADE`, FK admin (`utilisateur`) `RESTRICT` ; une ligne par changement de statut fait par un admin, écrite dans la même transaction (US PIL-b) |
Seeds : 3 catégories (pots classiques, sans lactose, sorbets) × 4 produits,
2 variantes chacun (« Pot 100 ml » 2,90 €, « Pot 465 ml » 7,90 €), stocks
variés (certains ≤ 5 pour tester « Bientôt épuisé »). Comptes de démo
`alice@example.com`/`azerty` (client) et `admin@example.com`/`motdepasse` (admin). InnoDB, `utf8mb4`.
| `parametre` | `cle` (PK), `valeur` ; seed `seuil_bientot_epuise` = 5 | lue par `ParametreModel` (repli sur 5 si absente) |

| `option_groupe` | `produit_id`, `libelle`, `multiple`, `obligatoire`, `position` ; seeds « Service » (1 choix, obligatoire) et « Toppings » (plusieurs, facultatif) par produit | `UNIQUE(produit_id, libelle)`, FK produit `CASCADE` |
| `option_choix` | `groupe_id`, `libelle`, `supplement_cents`, `position` ; seeds cuillère / coupelle / cône, toppings selon la catégorie | `UNIQUE(groupe_id, libelle)`, FK groupe `CASCADE` |

**Options (OPT-c + OPT-a, terminées)** : choix sur la fiche produit
(`selecteur-options`) ; options stockées dans les lignes du panier (une ligne =
variante + options), affichées, chiffrées et **modifiables** dans `/panier`
(fusion de deux lignes devenues identiques) ; validées côté serveur à la
commande, figées dans `ligne_commande_option` avec le prix, et affichées dans
`/commande` et `/commande/:numero`. Un panier d'avant les options (ligne sans le
groupe obligatoire « Service ») est nettoyé avec un message au chargement du
panier. Tests : `back/tests/options.php`, `front/tests/options.test.mjs`.

**Stock (STK-a)** : `CommandeModel::mouvementer()` est le seul endroit qui
écrit `variante.stock` ; `creer()` l'appelle (sortie) et `changerStatut()`
(seule porte pour changer un statut) rend le stock uniquement au passage à
`annulee`. Test : `back/tests/stock.php`.

**Commandes admin (PIL-b)** : parcours `en_cours` → `prete` (« disponible ») →
`retiree`, annulation possible tant que la commande n'est pas retirée ; pas de
saut d'étape ni de retour en arrière (table `TRANSITIONS` de `CommandeModel`).
`changerStatut($id, $statut, $adminId)` écrit aussi `journal_commande`. Demander
le statut déjà en place est sans effet (ni stock ni journal). Test :
`back/tests/commandes-admin.php`.

## 9. Quel skill ouvrir pour quelle tâche

| Tâche | Skill (`.agents/skills/…/SKILL.md`) |
| --- | --- |
| nouvelle page / route | `creer-page` |
| nouveau composant visuel | `creer-composant-ui` |
| nouvel appel API ou stockage local | `creer-module-data` |
| écrire / modifier du Tailwind | `styler-tailwind-tokens` |
| fonctionnalité front complète | `ajouter-fonctionnalite-mvc` |
| fin de toute tâche front | `verifier-mvc` |

## 10. Écarts connus et points de vigilance (diagnostic)

| # | Constat | Conséquence pour la suite |
| --- | --- | --- |
| 1 | `README.md` ne mentionne pas encore la page `/panier` ni `GET /api/panier` (tableau d'état « Panier : à venir ») | le mettre à jour quand CMD-b sera terminée |
| 2 | Le skill `creer-module-data` §4 décrit des lignes panier avec `label` et `unitPriceCents` ; le code stocke `{ variantId, quantite, options }` et relit prix et suppléments via l'API | **le code fait foi** (options ajoutées avec OPT-a) |
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
| 16 | PIL-b : le statut technique `prete` est affiché « Disponible » ; la liste des commandes n'a **pas de pagination** (toute la table est lue) ; le journal ne couvre que les changements de statut (pas le stock saisi en GOF-a, voir 13) ; le tableau de bord (`/admin`) ne renvoie pas encore vers les commandes | paginer si le volume grandit ; relier les « Accès rapides » du tableau de bord |
| 10 | Aucun `foreach` dans le code applicatif (`for…of` dans le routeur, `forEach` seulement dans `check-mvc.js`, outil hors application) | garder la règle §1 |

## 11. Check-list avant toute construction

- [ ] Relire §1, §3 et §8 ; vérifier que les dépendances de l'US sont terminées.
- [ ] Repérer dans 4 à 8 les fichiers concernés, puis les **lire** avec leurs appelants.
- [ ] Ouvrir le skill adapté (§9).
- [ ] Proposer le découpage M / V / C (et back/SQL si besoin) et attendre l'accord.
- [ ] Ne modifier que les fichiers nécessaires ; JSDoc/PHPDoc ; cibles ≥ 40 px ; pas de `foreach`.
- [ ] `node .agents/skills/verifier-mvc/scripts/check-mvc.js .` puis `cd front && npm run build`.
- [ ] Vérifier 320/375, 768, 1440 px en clair et sombre.
- [ ] Compte rendu §11 **et mise à jour de cette section 12** (route, composant, table, écart résolu).
- [ ] Aucun commit/push sans demande.

