---
trigger: glob
globs: ["base/back/**/*.php"]
---

# Règles PHP de l'API

- Conserver `declare(strict_types=1)` et l'autoload de `base/back/index.php`.
- Garder la séparation `Core/`, `Controller/`, `Model/` et `routes.php`.
- Typer propriétés, paramètres et retours ; documenter les méthodes publiques
  en PHPDoc.
- Utiliser PDO et des requêtes préparées pour les valeurs.
- Utiliser une liste blanche serveur pour les identifiants SQL dynamiques.
- Centraliser les réponses avec `Response::json()` ou `Response::erreur()`.
- Ne jamais renvoyer de HTML depuis l'API.
- Configurer la session une seule fois avant `session_start()`, avec
  `HttpOnly`, `Secure`, `SameSite` et le chemin du projet.
- Appeler `session_regenerate_id(true)` après connexion réussie.
- Ne jamais faire confiance à un rôle, prix, quantité, variante ou stock envoyé
  par le navigateur.
- Ne jamais utiliser `foreach` dans ce projet ; préférer `for`, `while` ou les
  fonctions d'itération adaptées.
- Les écritures de commande et de stock doivent être transactionnelles et
  préserver l'idempotence lorsque le parcours l'exige.
