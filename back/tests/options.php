<?php

declare(strict_types=1);

/**
 * Tests des options dans les commandes (US OPT-a), en ligne de commande, sur une
 * base JETABLE.
 *
 * ATTENTION : le script efface les commandes et remet des stocks. Ne le pointez
 * jamais sur la vraie base.
 *
 * Usage (après avoir importé sql/glaces.sql dans la base jetable) :
 *   STK_DSN='mysql:host=127.0.0.1;port=3399;dbname=t' STK_USER=root STK_PASS= \
 *   php back/tests/options.php
 *
 * Il vérifie : prix unitaire avec suppléments, options figées avec la ligne,
 * même variante sur deux lignes (stock additionné, une seule sortie au journal,
 * recrédit complet), refus des options invalides, relecture par numéro.
 */

use App\Model\CommandeModel;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/Model/CommandeModel.php';

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
$model  = new CommandeModel($pdo);
$echecs = 0;

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
 * Identifiant d'un choix d'option d'un produit, d'après les libellés du groupe et du choix.
 */
function choix(PDO $pdo, int $produitId, string $groupe, string $libelle): int
{
    $requete = $pdo->prepare(
        'SELECT option_choix.id
           FROM option_choix
     INNER JOIN option_groupe ON option_groupe.id = option_choix.groupe_id
          WHERE option_groupe.produit_id = :produit AND option_groupe.libelle = :groupe AND option_choix.libelle = :libelle'
    );
    $requete->execute(['produit' => $produitId, 'groupe' => $groupe, 'libelle' => $libelle]);

    return (int) $requete->fetchColumn();
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
 * Nombre de lignes de la table donnée (liste blanche : le nom n'est jamais saisi).
 */
function compter(PDO $pdo, string $table): int
{
    return (int) $pdo->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
}

/**
 * Tente une commande et renvoie le message du refus, ou null si elle passe.
 *
 * @param array<int, array{variantId:int, quantite:int, options?:array<int, int>}> $lignes
 */
function tenter(CommandeModel $model, array $lignes): ?string
{
    try {
        $model->creer(1, $lignes);

        return null;
    } catch (DomainException $e) {
        return $e->getMessage();
    }
}

/**
 * Identifiant de la variante d'un produit pour un format et un choix de Service (US OPT-b).
 */
function combinaison(PDO $pdo, int $produitId, string $format, int $choixId): int
{
    $requete = $pdo->prepare('SELECT id FROM variante WHERE produit_id = :produit AND libelle = :format AND choix_id = :choix');
    $requete->execute(['produit' => $produitId, 'format' => $format, 'choix' => $choixId]);

    return (int) $requete->fetchColumn();
}

// Produit 1 (Cookie Dough, pots classiques) : variante 1 = Pot 100 ml à 2,90 €, avec la cuillère.
$variant = 1;
$service = choix($pdo, 1, 'Service', 'Cuillère en bois');
$cone    = choix($pdo, 1, 'Service', 'Cône gaufrette');       // + 0,60 €
$coupe   = choix($pdo, 1, 'Service', 'Coupelle');
$sauce   = choix($pdo, 1, 'Toppings', 'Sauce caramel');       // + 0,50 €
$chantilly = choix($pdo, 1, 'Toppings', 'Chantilly');         // + 0,40 €
$autreProduit = choix($pdo, 9, 'Service', 'Cône gaufrette');  // un sorbet
$varianteCone  = combinaison($pdo, 1, 'Pot 100 ml', $cone);
$varianteCoupe = combinaison($pdo, 1, 'Pot 100 ml', $coupe);

echo "1. Prix unitaire avec suppléments et options figées\n";
reinitialiser($pdo, $varianteCone, 20);
$commande = $model->creer(1, [['variantId' => $varianteCone, 'quantite' => 2, 'options' => [$cone, $sauce]]]);
verifier('total = 2 × (2,90 + 0,60 + 0,50) = 8,00 €', $commande['totalCents'] === 800);
$relue = $model->findByNumero($commande['numero'], 1);
verifier('la ligne porte le prix unitaire avec suppléments (4,00 €)', $relue['lignes'][0]['prixUnitaireCents'] === 400);
verifier('la ligne porte ses deux options, libellés et suppléments figés', $relue['lignes'][0]['options'] === [
    ['groupe' => 'Service', 'libelle' => 'Cône gaufrette', 'supplementCents' => 60],
    ['groupe' => 'Toppings', 'libelle' => 'Sauce caramel', 'supplementCents' => 50],
]);

echo "2. Le catalogue peut changer sans toucher à la commande passée\n";
$pdo->exec("UPDATE option_choix SET supplement_cents = 999, libelle = 'Autre' WHERE id = $cone");
$relue = $model->findByNumero($commande['numero'], 1);
verifier('options et prix de la commande inchangés', $relue['lignes'][0]['prixUnitaireCents'] === 400
    && $relue['lignes'][0]['options'][0]['libelle'] === 'Cône gaufrette'
    && $relue['lignes'][0]['options'][0]['supplementCents'] === 60
    && $relue['totalCents'] === 800);
$pdo->exec("UPDATE option_choix SET supplement_cents = 60, libelle = 'Cône gaufrette' WHERE id = $cone");

echo "3. Même variante sur deux lignes (toppings différents)\n";
reinitialiser($pdo, $variant, 10);
$commande = $model->creer(1, [
    ['variantId' => $variant, 'quantite' => 3, 'options' => [$service]],
    ['variantId' => $variant, 'quantite' => 2, 'options' => [$service, $chantilly]],
]);
verifier('deux lignes enregistrées', compter($pdo, 'ligne_commande') === 2);
verifier('le stock baisse de la somme (10 - 5 = 5)', stock($pdo, $variant) === 5);
verifier('une seule sortie au journal, de 5', compter($pdo, 'mouvement_stock') === 1
    && (int) $pdo->query('SELECT quantite FROM mouvement_stock')->fetchColumn() === 5);
verifier('total = 3 × 2,90 + 2 × 3,30 = 15,30 €', $commande['totalCents'] === 1530);

$id = (int) $pdo->query('SELECT id FROM commande')->fetchColumn();
$model->changerStatut($id, 'annulee');
verifier('l\'annulation recrédite les 5 unités en un seul retour', stock($pdo, $variant) === 10
    && (int) $pdo->query("SELECT COUNT(*) FROM mouvement_stock WHERE type = 'retour'")->fetchColumn() === 1);

echo "4. Le stock se contrôle sur la somme des lignes\n";
reinitialiser($pdo, $variant, 3);
$refus = tenter($model, [
    ['variantId' => $variant, 'quantite' => 2, 'options' => [$service]],
    ['variantId' => $variant, 'quantite' => 2, 'options' => [$service, $sauce]],
]);
verifier('2 + 2 avec 3 en stock est refusé', $refus !== null && str_contains($refus, 'Stock insuffisant'));
verifier('rien n\'a été écrit (stock 3, aucune commande)', stock($pdo, $variant) === 3 && compter($pdo, 'commande') === 0);

echo "5. Options invalides refusées\n";
reinitialiser($pdo, $variant, 10);
verifier('un choix d\'un autre produit est refusé', str_contains((string) tenter($model, [
    ['variantId' => $variant, 'quantite' => 1, 'options' => [$service, $autreProduit]],
]), 'ne sont plus valides'));
verifier('un choix inconnu est refusé', str_contains((string) tenter($model, [
    ['variantId' => $variant, 'quantite' => 1, 'options' => [$service, 999999]],
]), 'ne sont plus valides'));
verifier('deux choix dans un groupe à choix unique sont refusés', str_contains((string) tenter($model, [
    ['variantId' => $variant, 'quantite' => 1, 'options' => [$service, $cone]],
]), 'ne sont plus valides'));
verifier('un groupe obligatoire sans choix est refusé (aucune option)', str_contains((string) tenter($model, [
    ['variantId' => $variant, 'quantite' => 1],
]), 'ne sont plus valides'));
verifier('un groupe obligatoire sans choix est refusé (toppings seuls)', str_contains((string) tenter($model, [
    ['variantId' => $variant, 'quantite' => 1, 'options' => [$sauce]],
]), 'ne sont plus valides'));
verifier('aucune commande ni stock modifié par ces refus', compter($pdo, 'commande') === 0 && stock($pdo, $variant) === 10);

echo "6. Plusieurs toppings acceptés\n";
verifier('service + 2 toppings passent', tenter($model, [
    ['variantId' => $variant, 'quantite' => 1, 'options' => [$service, $sauce, $chantilly]],
]) === null);

echo "7. Variante = combinaison format + service (OPT-b)\n";
reinitialiser($pdo, $variant, 10);
$pdo->prepare('UPDATE variante SET stock = 7 WHERE id = :id')->execute(['id' => $varianteCoupe]);
verifier('la variante « cuillère » avec le service « cône » est refusée', str_contains((string) tenter($model, [
    ['variantId' => $variant, 'quantite' => 1, 'options' => [$cone]],
]), 'ne sont plus valides'));
verifier('le message nomme la combinaison', str_contains((string) tenter($model, [
    ['variantId' => $variant, 'quantite' => 1, 'options' => [$cone]],
]), 'Pot 100 ml, Cuillère en bois'));
verifier('aucune commande ni stock modifié par ce refus', compter($pdo, 'commande') === 0 && stock($pdo, $variant) === 10);
verifier('la variante « coupelle » avec le service « coupelle » passe', tenter($model, [
    ['variantId' => $varianteCoupe, 'quantite' => 2, 'options' => [$coupe]],
]) === null);
verifier('seul le stock de la combinaison baisse (7 - 2 = 5), pas celui de la cuillère', stock($pdo, $varianteCoupe) === 5
    && stock($pdo, $variant) === 10);
$pdo->prepare('UPDATE variante SET stock = 0 WHERE id = :id')->execute(['id' => $varianteCone]);
$refus = tenter($model, [['variantId' => $varianteCone, 'quantite' => 1, 'options' => [$cone]]]);
verifier('la combinaison épuisée est refusée et nommée', $refus !== null && str_contains($refus, 'Stock insuffisant')
    && str_contains($refus, 'Cône gaufrette'));
verifier('une combinaison voisine en stock reste commandable', tenter($model, [
    ['variantId' => $variant, 'quantite' => 1, 'options' => [$service]],
]) === null);

reinitialiser($pdo, $variant, 40);

echo $echecs === 0 ? "\nTous les tests passent.\n" : "\n$echecs test(s) en échec.\n";
exit($echecs === 0 ? 0 : 1);
