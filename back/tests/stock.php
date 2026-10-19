<?php

declare(strict_types=1);

/**
 * Tests du stock (US STK-a et STK-c), en ligne de commande, sur une base JETABLE.
 *
 * ATTENTION : le script réimporte les données de test (il remet des stocks et
 * efface les commandes). Ne le pointez jamais sur la vraie base.
 *
 * Usage :
 *   STK_DSN='mysql:host=127.0.0.1;port=3399;dbname=t' STK_USER=root STK_PASS= \
 *   php back/tests/stock.php
 *
 * Il vérifie : décrément et journal, recrédit à l'annulation uniquement,
 * atomicité (rollback), stock jamais négatif et la concurrence (deux processus
 * PHP commandent en même temps la dernière unité), puis (STK-c) le stock renvoyé
 * pour le panier et les contraintes par variante : variante épuisée, stock
 * inférieur à la quantité, stock modifié entre la lecture et la validation.
 */

use App\Model\CommandeModel;
use App\Model\ProduitModel;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/Model/CommandeModel.php';
require_once __DIR__ . '/../src/Model/ProduitModel.php';

/**
 * Ouvre la connexion de test d'après les variables d'environnement.
 */
function connecter(): PDO
{
    $dsn = getenv('STK_DSN');

    if ($dsn === false || $dsn === '') {
        fwrite(STDERR, "Définis STK_DSN, STK_USER et STK_PASS (base jetable).\n");
        exit(2);
    }

    return new PDO($dsn . ';charset=utf8mb4', (string) getenv('STK_USER'), (string) getenv('STK_PASS'), [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}

// Mode « ouvrier » : lancé par le test de concurrence, il attend l'instant de
// départ puis commande une unité de la variante donnée.
if (($argv[1] ?? '') === 'worker') {
    $model = new CommandeModel(connecter());
    $start = (float) $argv[3];

    while (microtime(true) < $start) {
        usleep(100);
    }

    try {
        $model->creer(1, [['variantId' => (int) $argv[2], 'quantite' => 1]]);
        echo 'OK';
    } catch (DomainException $e) {
        echo 'REFUS';
    }

    exit(0);
}

$pdo     = connecter();
$model   = new CommandeModel($pdo);
$echecs  = 0;
$variant = 1;

/**
 * Affiche un résultat de test et compte les échecs.
 */
function verifier(string $nom, bool $condition): void
{
    global $echecs;

    echo ($condition ? '  [OK]    ' : '  [ECHEC] ') . $nom . "\n";
    $echecs += $condition ? 0 : 1;
}

/**
 * Remet la base de test dans un état connu : plus de commande, stock donné.
 */
function reinitialiser(PDO $pdo, int $variantId, int $stock): void
{
    $pdo->exec('DELETE FROM mouvement_stock');
    $pdo->exec('DELETE FROM commande');
    $pdo->prepare('UPDATE variante SET stock = :stock WHERE id = :id')->execute(['stock' => $stock, 'id' => $variantId]);
}

/**
 * Stock courant d'une variante.
 */
function stock(PDO $pdo, int $variantId): int
{
    $requete = $pdo->prepare('SELECT stock FROM variante WHERE id = :id');
    $requete->execute(['id' => $variantId]);

    return (int) $requete->fetchColumn();
}

/**
 * Nombre de lignes du journal pour un type de mouvement.
 */
function journal(PDO $pdo, string $type): int
{
    $requete = $pdo->prepare('SELECT COUNT(*) FROM mouvement_stock WHERE type = :type');
    $requete->execute(['type' => $type]);

    return (int) $requete->fetchColumn();
}

/**
 * Identifiant d'une commande d'après son numéro.
 */
function commandeId(PDO $pdo, string $numero): int
{
    $requete = $pdo->prepare('SELECT id FROM commande WHERE numero = :numero');
    $requete->execute(['numero' => $numero]);

    return (int) $requete->fetchColumn();
}

echo "1. Décrément à la validation + journal\n";
reinitialiser($pdo, $variant, 10);
$commande = $model->creer(1, [['variantId' => $variant, 'quantite' => 3]]);
verifier('le stock passe de 10 à 7', stock($pdo, $variant) === 7);
$mouvement = $pdo->query('SELECT type, quantite, stock_avant, stock_apres FROM mouvement_stock')->fetch();
verifier('le journal contient la sortie (3, 10 -> 7)', $mouvement === ['type' => 'sortie', 'quantite' => 3, 'stock_avant' => 10, 'stock_apres' => 7]);

echo "2. Les statuts autres que « annulee » ne touchent pas au stock\n";
$id = commandeId($pdo, $commande['numero']);
$model->changerStatut($id, 'prete');
$model->changerStatut($id, 'retiree');
verifier('stock inchangé après prete puis retiree', stock($pdo, $variant) === 7);
verifier('journal inchangé (1 sortie, 0 retour)', journal($pdo, 'sortie') === 1 && journal($pdo, 'retour') === 0);
$refus = false;
try {
    $model->changerStatut($id, 'annulee');
} catch (DomainException $e) {
    $refus = true;
}
verifier('une commande retirée ne peut pas être annulée', $refus && stock($pdo, $variant) === 7);

echo "3. Recrédit à l'annulation, une seule fois\n";
$commande = $model->creer(1, [['variantId' => $variant, 'quantite' => 2]]);
$id       = commandeId($pdo, $commande['numero']);
verifier('stock à 5 après la 2e commande', stock($pdo, $variant) === 5);
$model->changerStatut($id, 'annulee');
verifier('stock recrédité à 7', stock($pdo, $variant) === 7);
$model->changerStatut($id, 'annulee');
verifier('une 2e annulation ne recrédite pas', stock($pdo, $variant) === 7 && journal($pdo, 'retour') === 1);
$refus = false;
try {
    $model->changerStatut($id, 'en_cours');
} catch (DomainException $e) {
    $refus = true;
}
verifier('une commande annulée ne peut pas être rouverte', $refus);

echo "4. Atomicité : une ligne en rupture annule toute la commande\n";
reinitialiser($pdo, $variant, 5);
$pdo->exec('UPDATE variante SET stock = 1 WHERE id = 2');
$refus = false;
try {
    $model->creer(1, [['variantId' => $variant, 'quantite' => 2], ['variantId' => 2, 'quantite' => 5]]);
} catch (DomainException $e) {
    $refus = true;
}
verifier('la commande est refusée', $refus);
verifier('aucun stock n\'a bougé (5 et 1)', stock($pdo, $variant) === 5 && stock($pdo, 2) === 1);
verifier('ni commande ni journal', (int) $pdo->query('SELECT COUNT(*) FROM commande')->fetchColumn() === 0
    && journal($pdo, 'sortie') === 0);

echo "5. Le stock ne devient jamais négatif\n";
reinitialiser($pdo, $variant, 2);
$refus = false;
try {
    $model->creer(1, [['variantId' => $variant, 'quantite' => 3]]);
} catch (DomainException $e) {
    $refus = true;
}
verifier('commander 3 avec 2 en stock est refusé, stock = 2', $refus && stock($pdo, $variant) === 2);
$bloque = false;
try {
    $pdo->exec('UPDATE variante SET stock = 0 - 1 WHERE id = ' . $variant);
} catch (PDOException $e) {
    $bloque = true;
}
verifier('la base elle-même refuse un stock négatif', $bloque);

echo "6. Concurrence : deux processus commandent la dernière unité\n";
$tours = 5;
$ok    = true;

for ($i = 1; $i <= $tours; $i++) {
    reinitialiser($pdo, $variant, 1);
    $depart = microtime(true) + 1.0;
    $procs  = [];
    $flux   = [];

    for ($n = 0; $n < 2; $n++) {
        $procs[$n] = proc_open(
            [PHP_BINARY, __FILE__, 'worker', (string) $variant, sprintf('%.4f', $depart)],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes
        );
        $flux[$n] = $pipes[1];
    }

    $sorties = array_map(static fn ($f): string => (string) stream_get_contents($f), $flux);
    array_map('proc_close', $procs);
    sort($sorties);

    $ok = $ok && $sorties === ['OK', 'REFUS']
        && stock($pdo, $variant) === 0
        && journal($pdo, 'sortie') === 1
        && (int) $pdo->query('SELECT COUNT(*) FROM commande')->fetchColumn() === 1;
}

verifier("sur $tours tours : toujours 1 commande acceptée, 1 refusée, stock 0, 1 sortie journalisée", $ok);

$produits = new ProduitModel($pdo);

/**
 * Le stock que l'API du panier renverrait pour une variante (null si absente).
 */
function stockApi(ProduitModel $produits, int $variantId): ?int
{
    $trouvees = array_values(array_filter(
        $produits->findVariantesByIds([$variantId]),
        static fn (array $v): bool => $v['variantId'] === $variantId
    ));

    return $trouvees === [] ? null : $trouvees[0]['stock'];
}

/**
 * Tente une commande d'une variante et renvoie le message du refus, ou null si elle passe.
 */
function tenter(CommandeModel $model, int $variantId, int $quantite): ?string
{
    try {
        $model->creer(1, [['variantId' => $variantId, 'quantite' => $quantite]]);
        return null;
    } catch (DomainException $e) {
        return $e->getMessage();
    }
}

echo "7. Le stock renvoyé pour le panier est celui de la base (STK-c)\n";
reinitialiser($pdo, 1, 4);
$pdo->exec('UPDATE variante SET stock = 0 WHERE id = 2');
$reponse = $produits->findVariantesByIds([1, 2]);
verifier('chaque variante porte un stock entier', array_map(static fn (array $v): int => $v['stock'], $reponse) === [4, 0]);
$pdo->exec('UPDATE variante SET stock = 9 WHERE id = 1');
verifier('un stock modifié en base est vu à la lecture suivante', stockApi($produits, 1) === 9);
verifier('une variante inconnue est absente', stockApi($produits, 999999) === null);

echo "8. Contraintes par variante (deux formats du même produit)\n";
reinitialiser($pdo, 1, 0);
$pdo->exec('UPDATE variante SET stock = 5 WHERE id = 2');
verifier('variante épuisée : commande refusée, message clair', str_contains((string) tenter($model, 1, 1), 'Stock insuffisant'));
verifier('la variante sœur en stock se commande normalement', tenter($model, 2, 5) === null && stock($pdo, 2) === 0);
$message = (string) tenter($model, 2, 1);
verifier('plus rien : refus qui cite le produit, le format et ce qu\'il reste (0)', str_contains($message, 'il en reste 0')
    && str_contains($message, 'Pot 465 ml'));

reinitialiser($pdo, 1, 3);
$message = (string) tenter($model, 1, 5);
verifier('quantité 5 pour un stock de 3 : refus « il en reste 3 », stock intact', str_contains($message, 'il en reste 3')
    && stock($pdo, 1) === 3);
verifier('quantité égale au stock (3) : acceptée, stock 0', tenter($model, 1, 3) === null && stock($pdo, 1) === 0);

echo "9. Stock modifié pendant la session\n";
reinitialiser($pdo, 1, 5);
verifier('le client voit 5 au moment de remplir son panier', stockApi($produits, 1) === 5);
tenter($model, 1, 4); // un autre client passe commande entre-temps
verifier('à la validation du 1er client (3), le serveur refuse : il en reste 1', str_contains((string) tenter($model, 1, 3), 'il en reste 1'));
verifier('la relecture du panier voit le nouveau stock (1)', stockApi($produits, 1) === 1);
verifier('après ajustement à 1, la commande passe', tenter($model, 1, 1) === null && stock($pdo, 1) === 0);

reinitialiser($pdo, 1, 40);
$pdo->exec('UPDATE variante SET stock = 25 WHERE id = 2');

echo $echecs === 0 ? "\nTous les tests passent.\n" : "\n$echecs test(s) en échec.\n";
exit($echecs === 0 ? 0 : 1);
