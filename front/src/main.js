import { Router } from "./lib/router.js";
import { RootLayout } from "./layouts/root/layout.js";
import { AdminLayout } from "./layouts/admin/layout.js";
import { ProduitsPage } from "./pages/produits/page.js";
import { ProduitPage } from "./pages/produit/page.js";
import { PanierPage } from "./pages/panier/page.js";
import { CommandePage } from "./pages/commande/page.js";
import { ConfirmationPage } from "./pages/confirmation/page.js";
import { ConnexionPage } from "./pages/connexion/page.js";
import { InscriptionPage } from "./pages/inscription/page.js";
import { AdminPage } from "./pages/admin/page.js";
import { AdminCategoriesPage } from "./pages/admin-categories/page.js";
import { AdminCategoriePage } from "./pages/admin-categorie/page.js";
import { AdminCommandesPage } from "./pages/admin-commandes/page.js";
import { AdminCommandePage } from "./pages/admin-commande/page.js";
import { AdminProduitsPage } from "./pages/admin-produits/page.js";
import { AdminProduitPage } from "./pages/admin-produit/page.js";
import { The404Page } from "./pages/404/page.js";

// base : chemin du projet sur le serveur (BASE dans vite.config.js).
const router = new Router("app", { base: import.meta.env.BASE_URL });

router.addLayout("/", RootLayout);
// Le plus long préfixe gagne : /admin a son propre layout, distinct de la boutique.
router.addLayout("/admin", AdminLayout);

router.addRoute("/", ProduitsPage);
router.addRoute("/produit/:slug", ProduitPage);
router.addRoute("/panier", PanierPage);
router.addRoute("/commande", CommandePage);
router.addRoute("/commande/:numero", ConfirmationPage);
router.addRoute("/connexion", ConnexionPage);
router.addRoute("/inscription", InscriptionPage);
router.addRoute("/admin", AdminPage);
router.addRoute("/admin/produits", AdminProduitsPage);
router.addRoute("/admin/produits/nouveau", AdminProduitPage);
router.addRoute("/admin/produits/:id/modifier", AdminProduitPage);
router.addRoute("/admin/categories", AdminCategoriesPage);
router.addRoute("/admin/categories/nouvelle", AdminCategoriePage);
router.addRoute("/admin/categories/:id/modifier", AdminCategoriePage);
router.addRoute("/admin/commandes", AdminCommandesPage);
router.addRoute("/admin/commandes/:numero", AdminCommandePage);

// En dernier : toute adresse qui ne correspond à aucune route.
router.addRoute("*", The404Page);

// Démarrer le routeur
router.start();
