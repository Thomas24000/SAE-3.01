import { Router } from "./lib/router.js";
import { RootLayout } from "./layouts/root/layout.js";
import { ProduitsPage } from "./pages/produits/page.js";
import { ProduitPage } from "./pages/produit/page.js";
import { PanierPage } from "./pages/panier/page.js";
import { CommandePage } from "./pages/commande/page.js";
import { ConfirmationPage } from "./pages/confirmation/page.js";
import { ConnexionPage } from "./pages/connexion/page.js";
import { InscriptionPage } from "./pages/inscription/page.js";
import { AdminPage } from "./pages/admin/page.js";
import { The404Page } from "./pages/404/page.js";

// base : chemin du projet sur le serveur (BASE dans vite.config.js).
const router = new Router("app", { base: import.meta.env.BASE_URL });

router.addLayout("/", RootLayout);

router.addRoute("/", ProduitsPage);
router.addRoute("/produit/:slug", ProduitPage);
router.addRoute("/panier", PanierPage);
router.addRoute("/commande", CommandePage);
router.addRoute("/commande/:numero", ConfirmationPage);
router.addRoute("/connexion", ConnexionPage);
router.addRoute("/inscription", InscriptionPage);
router.addRoute("/admin", AdminPage);

// En dernier : toute adresse qui ne correspond à aucune route.
router.addRoute("*", The404Page);

// Démarrer le routeur
router.start();
