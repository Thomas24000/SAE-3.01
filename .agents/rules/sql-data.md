---
trigger: glob
globs: ["sql/**/*.sql"]
---

# Règles SQL métier

- Préserver les décisions métier de la section 7 d'`AGENTS.md` :
  variantes, stock par variante, panier avec `variantId`, prix figé dans les
  lignes de commande, commandes et journal de stock.
- Utiliser InnoDB, `utf8mb4`, clés étrangères et contraintes explicites.
- Ajouter des index uniquement lorsqu'ils correspondent à des requêtes réelles.
- Fournir des seeds cohérents avec les écrans et les parcours.
- Ne pas supprimer ou renommer une table existante sans demande explicite et
  sans vérifier les contrôleurs, modèles et dépendances.
- Vérifier les transactions, contraintes de quantité, disponibilité et états
  de commande avant de conclure.
