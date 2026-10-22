<?php

declare(strict_types=1);

/**
 * Tests du stock des toppings, en ligne de commande, sur une base JETABLE.
 *
 * ATTENTION : le script modifie des stocks et passe des commandes. Ne le pointez
 * jamais sur la vraie base.
 *
 * Usage (après avoir importé sql/glaces.sql dans la base jetable) :
 *   STK_DSN='mysql:host=127.0.0.1;port=3399;dbname=t' STK_USER=root STK_PASS= \
 *   php back/tests/toppings.php
 *
 * Il vérifie : la lecture des doses (fiche), une dose par topping et par
 * commande (journalisée), le refus d'un topping épuisé, l'atomicité, le retour
 * à l'annulation (une seule fois), la reprise d'une ancienne commande et le
 * réapprovisionnement admin.
 */

use App\Model\CommandeModel;
use App\Model\ProduitModel;
use App\Model\ToppingAdminModel;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/Model/PromotionModel.php';
require_once __DIR__ . '/../src/Model/CodePromoInvalideException.php';
require_once __DIR__ . '/../src/Model/CodePromoModel.php';
require_once __DIR__ . '/../src/Model/ProduitModel.php';
require_once __DIR__ . '/../src/Model/CommandeModel.php';
require_once __DIR__ . '/../src/Model/ToppingAdminModel.php';

$dsn = getenv('STK_DSN');

if ($dsn === false || $dsn === '') {
    fwrite(STDERR, "Définis STK_DSN, STK_USER et STK_PASS (base jetable).\n");
    exit(2);
}

$pdo = new PDO($dsn . ';charset=utf8mb4', (string) getenv('STK_USER'), (string) getenv('STK_PASS'), [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
]);

$echecs = 0;

function verifier(string $nom, bool $condition): void
{
    global $echecs;

    echo ($condition ? '  [OK]    ' : '  [ECHEC] ') . $nom . "\n";
    $echecs += $condition ? 0 : 1;
}

/** Vrai si l'appel lève une DomainException. */
function refuse(callable $appel): bool
{
    try {
        $appel();
    } catch (DomainException $e) {
        return true;
    }

    return false;
}

/** Identifiant d'un topping d'après son libellé. */
function topping(PDO $pdo, string $libelle): int
{
    $requete = $pdo->prepare('SELECT id FROM option_choix WHERE type = \'topping\' AND libelle = :libelle');
    $requete->execute(['libelle' => $libelle]);

    return (int) $requete->fetchColumn();
}

/** Doses restantes d'un topping. */
function doses(PDO $pdo, int $id): int
{
    return (int) $pdo->query("SELECT stock FROM option_choix WHERE id = $id")->fetchColumn();
}

/** Service de la variante donnée. */
function service(PDO $pdo, int $varianteId): int
{
    return (int) $pdo->query("SELECT service_id FROM variante WHERE id = $varianteId")->fetchColumn();
}

$produits  = new ProduitModel($pdo);
$commandes = new CommandeModel($pdo);
$admin     = new ToppingAdminModel($pdo);

$caramel   = topping($pdo, 'Sauce caramel');   // 90 doses
$chocolat  = topping($pdo, 'Sauce chocolat');  // 120 doses
$chantilly = topping($pdo, 'Chantilly');       // 4 doses
$amandes   = topping($pdo, 'Amandes effilées'); // 0 dose, catégorie « Sans lactose »
$service1  = service($pdo, 1);

echo "1. Lecture des doses\n";
$options = $produits->findBySlug('cookie-dough')['options'];
$toppings = array_values(array_filter($options, static fn (array $g): bool => $g['libelle'] === 'Toppings'))[0]['choix'];
$services = array_values(array_filter($options, static fn (array $g): bool => $g['libelle'] === 'Service'))[0]['choix'];
verifier('la fiche donne les doses de chaque topping', $toppings[0]['stock'] === 120 && $toppings[1]['stock'] === 90);
verifier('un service n\'a pas de stock de topping (null)', $services[0]['stock'] === null);

echo "2. Une dose par topping et par commande\n";
$commandes->creer(1, [
    ['variantId' => 1, 'quantite' => 3, 'options' => [$service1, $caramel]],
    ['variantId' => 2, 'quantite' => 2, 'options' => [service($pdo, 2), $caramel, $chocolat]],
]);
verifier('le caramel (2 lignes, 5 pots) ne consomme qu\'une dose', doses($pdo, $caramel) === 89);
verifier('le chocolat consomme une dose', doses($pdo, $chocolat) === 119);
$journal = $pdo->query('SELECT type, stock_avant, stock_apres FROM mouvement_topping WHERE choix_id = ' . $caramel)->fetchAll();
verifier('une ligne de journal « sortie » 90 → 89', count($journal) === 1 && $journal[0] === ['type' => 'sortie', 'stock_avant' => 90, 'stock_apres' => 89]);

echo "3. Un topping épuisé est refusé, rien n'est écrit\n";
$avant = [
    'stock'  => (int) $pdo->query('SELECT SUM(stock) FROM variante')->fetchColumn(),
    'doses'  => doses($pdo, $caramel),
    'ligne'  => (int) $pdo->query('SELECT COUNT(*) FROM commande')->fetchColumn(),
];
verifier('commander des amandes à 0 dose est refusé', refuse(
    fn () => $commandes->creer(1, [['variantId' => 1, 'quantite' => 1, 'options' => [$service1, $caramel, $amandes]]])
));
verifier('ni stock, ni dose, ni commande n\'a bougé', $avant === [
    'stock'  => (int) $pdo->query('SELECT SUM(stock) FROM variante')->fetchColumn(),
    'doses'  => doses($pdo, $caramel),
    'ligne'  => (int) $pdo->query('SELECT COUNT(*) FROM commande')->fetchColumn(),
]);

echo "4. La dernière dose\n";
$pdo->exec("UPDATE option_choix SET stock = 1 WHERE id = $chantilly");
$commande = $commandes->creer(1, [['variantId' => 1, 'quantite' => 1, 'options' => [$service1, $chantilly]]]);
verifier('la dernière dose part', doses($pdo, $chantilly) === 0);
verifier('la suivante est refusée', refuse(
    fn () => $commandes->creer(1, [['variantId' => 1, 'quantite' => 1, 'options' => [$service1, $chantilly]]])
));

echo "5. Annulation : la dose revient, une seule fois\n";
$id = (int) $pdo->query("SELECT id FROM commande WHERE numero = '{$commande['numero']}'")->fetchColumn();
$commandes->changerStatut($id, 'annulee');
verifier('la dose est rendue', doses($pdo, $chantilly) === 1);
$commandes->changerStatut($id, 'annulee');
verifier('une seconde annulation ne rend rien', doses($pdo, $chantilly) === 1
    && (int) $pdo->query("SELECT COUNT(*) FROM mouvement_topping WHERE commande_id = $id AND type = 'retour'")->fetchColumn() === 1);

echo "6. Un topping supprimé depuis la commande\n";
$pdo->exec("UPDATE option_choix SET stock = 5 WHERE id = $chantilly");
$commande = $commandes->creer(1, [['variantId' => 1, 'quantite' => 1, 'options' => [$service1, $chantilly]]]);
$id = (int) $pdo->query("SELECT id FROM commande WHERE numero = '{$commande['numero']}'")->fetchColumn();
$pdo->exec("DELETE FROM categorie_topping WHERE choix_id = $chantilly");
$pdo->exec("DELETE FROM option_choix WHERE id = $chantilly");
verifier('annuler quand même fonctionne', $commandes->changerStatut($id, 'annulee')['change'] === true);
verifier('le journal garde la sortie avec choix_id NULL', (int) $pdo->query("SELECT COUNT(*) FROM mouvement_topping WHERE commande_id = $id AND choix_id IS NULL")->fetchColumn() === 1);

echo "7. Reprise d'une ancienne commande\n";
$commande = $commandes->creer(1, [['variantId' => 1, 'quantite' => 1, 'options' => [$service1, $chocolat]]]);
$reprise = $commandes->preparerReprise($commande['numero'], 1)['lignes'][0];
verifier('reprise possible tant que le topping est en stock', $reprise['statut'] === 'ok');
$pdo->exec("UPDATE option_choix SET stock = 0 WHERE id = $chocolat");
$reprise = $commandes->preparerReprise($commande['numero'], 1)['lignes'][0];
verifier('indisponible quand le topping est épuisé', $reprise['statut'] === 'indisponible' && str_contains((string) $reprise['motif'], 'topping'));

echo "8. Réapprovisionnement admin\n";
$liste = $admin->lister();
$libelles = array_column($liste, 'libelle');
verifier('la liste donne les toppings avec leur stock (le chantilly supprimé en moins)', count($liste) === 7 && $liste[0]['stock'] >= 0);
verifier('elle est triée par libellé', $libelles === array_values(array_unique($libelles)) && $libelles[0] === 'Amandes effilées');
verifier('fixer le stock du chocolat', $admin->definirStock($chocolat, 50) && doses($pdo, $chocolat) === 50);
verifier('un identifiant de service est refusé (pas un topping)', $admin->definirStock($service1, 10) === false);
verifier('un identifiant inconnu est refusé', $admin->definirStock(99999, 10) === false);
verifier('on ne peut pas donner de stock à un service (contrainte SQL)', (static function (PDO $pdo, int $s): bool {
    try {
        $pdo->exec("UPDATE option_choix SET stock = 3 WHERE id = $s");
    } catch (PDOException $e) {
        return true;
    }

    return false;
})($pdo, $service1));

echo $echecs === 0 ? "\nTous les tests passent.\n" : "\n$echecs échec(s).\n";
exit($echecs === 0 ? 0 : 1);
