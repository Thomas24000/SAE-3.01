# Ordre de réalisation des US

Respecte cet ordre sauf décision explicite ; ne commence pas une US dont les
dépendances ne sont pas terminées. Ne fusionne jamais dans `main` une branche
à moitié finie.

| # | US | Dépend de |
| -- | --- | --- |
| 0 | Socle : schéma avec variantes, seeds, routeur, layout, tokens, déploiement | — |
| 1 | `DEC-b` Catalogue | — |
| 2 | `DEC-c` Détail produit | DEC-b |
| 3 | `DEC-a` Catégories (`/categorie/...`) | DEC-b |
| 4 | `CMD-b` Panier (clé = `variantId`) | DEC-b, DEC-c |
| 5 | `CMD-c` Authentification | — |
| 6 | `CMD-a` Validation de commande | CMD-b, CMD-c |
| 7 | `STK-b` Affichage du stock | DEC-b |
| 8 | `STK-a` Mise à jour du stock (même transaction que CMD-a) | STK-b, CMD-a |
| 9 | `STK-c` Contraintes de stock | STK-b, CMD-b, CMD-a |
| 10 | `OPT-c` Choix des options | DEC-c |
| 11 | `OPT-a` Options dans panier et commandes | OPT-c, CMD-b, CMD-a |
| 12 | `OPT-b` Variantes et stock | OPT-c, STK-a, STK-b, STK-c |
| 13 | `GOF-b` Back-office (socle admin) | — |
| 14 | `GOF-c` Gestion des catégories | GOF-b |
| 15 | `GOF-a` Gestion des produits | GOF-b, STK-b |
| 16 | `PIL-b` Gestion des commandes (annulation = recrédit) | GOF-b, CMD-a, STK-a |
| 17 | `SUI-b` Espace personnel | CMD-c |
| 18 | `SUI-c` Historique des commandes | CMD-a |
| 19 | `SUI-a` Commander à nouveau | SUI-c, CMD-b, STK-c |
| 20 | `PIL-a` Statistiques | GOF-b, CMD-a, STK-b |
| 21 | `PRO-c`, `PRO-a`, `PRO-b` (bonus) | tout le reste |

Jalons : US 3 = « Découvrir l'offre » ; US 6 = parcours d'achat complet ;
US 9 = **MVP** ; US 12 = options et variantes ; US 16 = back-office.

Une US est terminée avec la DoD : branche dédiée et commits propres, HTML/CSS
valides W3C, charte et responsive, 3 navigateurs, validation client **et**
serveur en français, contrôle des droits. Garde la traçabilité interface, API,
SQL, critères d'acceptation.
