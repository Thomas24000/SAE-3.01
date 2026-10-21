<?php

declare(strict_types=1);

/**
 * Tests de la promotion automatique (US PRO-c), en ligne de commande, sur une base
 * JETABLE.
 *
 * ATTENTION : le script efface les commandes et remet des stocks. Ne le pointez
 * jamais sur la vraie base.
 *
 * Usage (après avoir importé sql/glaces.sql dans la base jetable) :
 *   STK_DSN='mysql:host=127.0.0.1;port=3399;dbname=t' STK_USER=root STK_PASS= \
 *   php back/tests/promotion.php
 *
 * Il vérifie : le produit au stock le plus élevé est seul en promotion (départage
 * à égalité, aucun produit si tout est épuisé), les prix remisés dans la liste, la
 * fiche, le panier et les combinaisons, le prix facturé à la commande (suppléments
 * au prix plein) et le déplacement de la promotion quand les stocks changent.
 */

use App\Model\CommandeModel;
use App\Model\ProduitModel;
use App\Model\PromotionModel;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/Model/PromotionModel.php';
require_once __DIR__ . '/../src/Model/ProduitModel.php';
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
$produits  = new ProduitModel($pdo);
$commandes = new CommandeModel($pdo);
$echecs    = 0;

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
 * Donne le même stock à toutes les variantes d'un produit.
 */
function stockProduit(PDO $pdo, int $produitId, int $stock): void
{
    $pdo->prepare('UPDATE variante SET stock = :stock WHERE produit_id = :produit')
        ->execute(['stock' => $stock, 'produit' => $produitId]);
}

/**
 * Stock identique et nul partout, sauf pour les produits donnés (produit => stock par variante).
 *
 * @param array<int, int> $stocks
 */
function repartir(PDO $pdo, array $stocks): void
{
    $pdo->exec('DELETE FROM mouvement_stock');
    $pdo->exec('DELETE FROM commande');
    $pdo->exec('UPDATE variante SET stock = 0');
    array_map(fn (int $produit, int $stock) => stockProduit($pdo, $produit, $stock), array_keys($stocks), $stocks);
}

/**
 * La première variante (la moins chère) d'un produit : [id, prix en centimes].
 *
 * @return array{0:int, 1:int}
 */
function variante(PDO $pdo, int $produitId): array
{
    $requete = $pdo->prepare('SELECT id, prix_cents FROM variante WHERE produit_id = :produit ORDER BY prix_cents, id LIMIT 1');
    $requete->execute(['produit' => $produitId]);
    $ligne = $requete->fetch();

    return [(int) $ligne['id'], (int) $ligne['prix_cents']];
}

/**
 * Les options minimales d'une variante : son choix de Service (US OPT-b), obligatoire à la commande.
 *
 * @return array<int, int>
 */
function optionsDe(PDO $pdo, int $variantId): array
{
    $choix = $pdo->query("SELECT choix_id FROM variante WHERE id = $variantId")->fetchColumn();

    return $choix === null || $choix === false ? [] : [(int) $choix];
}

/**
 * Le produit d'une liste (lister) par identifiant.
 *
 * @param array<int, array<string, mixed>> $liste
 * @return array<string, mixed>
 */
function dans(array $liste, int $id): array
{
    return array_values(array_filter($liste, static fn (array $p): bool => $p['id'] === $id))[0];
}

echo "1. Le produit au stock le plus élevé est en promotion\n";
repartir($pdo, [1 => 5, 2 => 9, 3 => 9]);
// Chaque produit a deux formats (ou plus) : on compare les sommes de stock réelles.
$somme = static fn (int $id): int => (int) $pdo->query("SELECT SUM(stock) FROM variante WHERE produit_id = $id")->fetchColumn();
verifier('produits 2 et 3 à égalité (somme ' . $somme(2) . ' = ' . $somme(3) . ')', $somme(2) === $somme(3) && $somme(2) > $somme(1));
verifier('à égalité, le plus ancien l\'emporte (produit 2)', PromotionModel::produitEnPromotion($pdo) === 2);
stockProduit($pdo, 3, 10);
verifier('le produit 3 prend la tête', PromotionModel::produitEnPromotion($pdo) === 3);
repartir($pdo, []);
verifier('tout épuisé : aucun produit en promotion', PromotionModel::produitEnPromotion($pdo) === null);

echo "2. Calcul du prix remisé\n";
verifier('7,90 € → 6,32 €', PromotionModel::prixRemise(790) === 632);
verifier('2,90 € → 2,32 €', PromotionModel::prixRemise(290) === 232);
verifier('arrondi au centime : 3,33 € → 2,66 €', PromotionModel::prixRemise(333) === 266);
verifier('0 reste 0', PromotionModel::prixRemise(0) === 0);
verifier('un autre produit n\'a pas de prix promo', PromotionModel::prixPromo(2, 790, 3) === null);
verifier('sans produit en promotion : null', PromotionModel::prixPromo(2, 790, null) === null);

echo "3. Liste, fiche, panier et combinaisons\n";
repartir($pdo, [1 => 50, 2 => 10]);
$liste = $produits->lister();
$un    = dans($liste, 1);
$deux  = dans($liste, 2);
verifier('liste : le produit 1 est à -20 %', $un['promoPourcent'] === 20);
verifier('liste : prix « à partir de » remisé', $un['prixMinPromoCents'] === PromotionModel::prixRemise($un['prixMin']));
verifier('liste : le produit 2 n\'a pas de promotion', $deux['promoPourcent'] === null && $deux['prixMinPromoCents'] === null);

$fiche = $produits->findBySlug($un['slug']);
verifier('fiche : promoPourcent 20', $fiche['promoPourcent'] === 20);
verifier('fiche : chaque format a son prix remisé',
    array_filter($fiche['variantes'], static fn (array $v): bool => $v['prixPromoCents'] !== PromotionModel::prixRemise($v['prixCents'])) === []);
$ficheDeux = $produits->findBySlug($deux['slug']);
verifier('fiche d\'un produit normal : pas de prix promo',
    $ficheDeux['promoPourcent'] === null && array_filter($ficheDeux['variantes'], static fn (array $v): bool => $v['prixPromoCents'] !== null) === []);

[$v1, $prix1] = variante($pdo, 1);
[$v2, $prix2] = variante($pdo, 2);
$panier = array_column($produits->findVariantesByIds([$v1, $v2]), null, 'variantId');
verifier('panier : prix remisé du produit en promotion', $panier[$v1]['prixPromoCents'] === PromotionModel::prixRemise($prix1));
verifier('panier : prix plein de l\'autre produit', $panier[$v2]['prixPromoCents'] === null && $panier[$v2]['prixCents'] === $prix2);
$combinaisons = $produits->findCombinaisonsByProduits([1, 2]);
verifier('combinaisons : prixPromoCents présent pour le produit 1 seulement',
    $combinaisons[1][0]['prixPromoCents'] !== null && $combinaisons[2][0]['prixPromoCents'] === null);

echo "4. Le prix facturé et figé est le prix remisé\n";
repartir($pdo, [1 => 50, 2 => 10]);
$commandes->creer(1, [
    ['variantId' => $v1, 'quantite' => 2, 'options' => optionsDe($pdo, $v1)],
    ['variantId' => $v2, 'quantite' => 1, 'options' => optionsDe($pdo, $v2)],
]);
$lignes = $pdo->query('SELECT variante_id, prix_unitaire_cents, quantite FROM ligne_commande ORDER BY id')->fetchAll();
verifier('ligne du produit en promotion : prix remisé', (int) $lignes[0]['prix_unitaire_cents'] === PromotionModel::prixRemise($prix1));
verifier('ligne de l\'autre produit : prix plein', (int) $lignes[1]['prix_unitaire_cents'] === $prix2);
$total = (int) $pdo->query('SELECT total_cents FROM commande')->fetchColumn();
verifier('total = 2 × prix remisé + prix plein', $total === 2 * PromotionModel::prixRemise($prix1) + $prix2);

// Les suppléments d'options restent au prix plein : on prend un format + une option payante.
$sauce = (int) $pdo->query(
    "SELECT option_choix.id FROM option_choix JOIN option_groupe ON option_groupe.id = option_choix.groupe_id
      WHERE option_groupe.produit_id = 1 AND option_choix.libelle = 'Sauce caramel'"
)->fetchColumn();
$options = array_merge(optionsDe($pdo, $v1), [$sauce]);
repartir($pdo, [1 => 50, 2 => 10]);
$commandes->creer(1, [['variantId' => $v1, 'quantite' => 1, 'options' => $options]]);
$unitaire = (int) $pdo->query('SELECT prix_unitaire_cents FROM ligne_commande')->fetchColumn();
$supplements = (int) $pdo->query(
    'SELECT COALESCE(SUM(supplement_cents), 0) FROM ligne_commande_option'
)->fetchColumn();
verifier('suppléments au prix plein (+' . $supplements . ' ct)', $supplements > 0
    && $unitaire === PromotionModel::prixRemise($prix1) + $supplements);

echo "5. La promotion suit les stocks\n";
repartir($pdo, []);
// Un seul format en stock par produit : 20 contre 15, donc le produit 1 mène.
$pdo->prepare('UPDATE variante SET stock = 20 WHERE id = :id')->execute(['id' => $v1]);
$pdo->prepare('UPDATE variante SET stock = 15 WHERE id = :id')->execute(['id' => $v2]);
verifier('au départ, le produit 1 est en promotion', PromotionModel::produitEnPromotion($pdo) === 1);
$commandes->creer(1, [['variantId' => $v1, 'quantite' => 10, 'options' => optionsDe($pdo, $v1)]]);
verifier('après une grosse commande, la promotion passe au produit 2', PromotionModel::produitEnPromotion($pdo) === 2);
$apres = dans($produits->lister(), 1);
verifier('le produit 1 retrouve son prix plein', $apres['promoPourcent'] === null);
$commandes->creer(1, [['variantId' => $v1, 'quantite' => 1, 'options' => optionsDe($pdo, $v1)]]);
$dernier = (int) $pdo->query('SELECT prix_unitaire_cents FROM ligne_commande ORDER BY id DESC LIMIT 1')->fetchColumn();
verifier('une commande ultérieure du produit 1 est facturée au prix plein', $dernier === $prix1);

echo $echecs === 0 ? "\nTous les tests passent.\n" : "\n$echecs échec(s).\n";
exit($echecs === 0 ? 0 : 1);
