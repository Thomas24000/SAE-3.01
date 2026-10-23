<?php

declare(strict_types=1);

/**
 * Tests des codes promotionnels (US PRO-a), en ligne de commande, sur une base
 * JETABLE.
 *
 * ATTENTION : le script efface les commandes et remet des stocks. Ne le pointez
 * jamais sur la vraie base.
 *
 * Usage (après avoir importé sql/glaces.sql dans la base jetable) :
 *   STK_DSN='mysql:host=127.0.0.1;port=3399;dbname=t' STK_USER=root STK_PASS= \
 *   php back/tests/codes-promo.php
 *
 * Il vérifie : la recherche d'un code (casse, espaces, inactif, inconnu), le calcul
 * de la réduction (arrondi, plafond), l'enregistrement du code et de la réduction
 * avec la commande, le cumul avec la promotion automatique, et le refus d'un code
 * non valable sans rien écrire (ni commande ni mouvement de stock).
 */

use App\Model\CodePromoInvalideException;
use App\Model\CodePromoModel;
use App\Model\CommandeModel;
use App\Model\PromotionModel;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/Model/PromotionModel.php';
require_once __DIR__ . '/../src/Model/CodePromoInvalideException.php';
require_once __DIR__ . '/../src/Model/CodePromoModel.php';
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
$codes     = new CodePromoModel($pdo);
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
 * Remet la base de test dans un état connu : plus de commande, stocks identiques partout.
 */
function reinitialiser(PDO $pdo, int $stock): void
{
    $pdo->exec('DELETE FROM mouvement_stock');
    $pdo->exec('DELETE FROM commande');
    $pdo->prepare('UPDATE variante SET stock = :stock')->execute(['stock' => $stock]);
}

/**
 * La variante la moins chère d'un produit : [id, prix en centimes, options minimales (son service)].
 *
 * @return array{0:int, 1:int, 2:array<int, int>}
 */
function variante(PDO $pdo, int $produitId): array
{
    $requete = $pdo->prepare('SELECT id, prix_cents, service_id AS choix_id FROM variante WHERE produit_id = :produit ORDER BY prix_cents, id LIMIT 1');
    $requete->execute(['produit' => $produitId]);
    $ligne = $requete->fetch();

    return [(int) $ligne['id'], (int) $ligne['prix_cents'], [(int) $ligne['choix_id']]];
}

/**
 * Tente une commande et renvoie le nom de l'exception du refus, ou null si elle passe.
 *
 * @param array<int, array{variantId:int, quantite:int, options?:array<int, int>}> $lignes
 */
function tenter(CommandeModel $model, array $lignes, ?string $code): ?string
{
    try {
        $model->creer(1, $lignes, $code);

        return null;
    } catch (DomainException $e) {
        return $e::class;
    }
}

echo "1. Recherche d'un code\n";
verifier('« GLACE20 » existe, à 20 %', $codes->trouverActif('GLACE20') === ['code' => 'GLACE20', 'pourcentage' => 20]);
verifier('la casse est ignorée', $codes->trouverActif('glace20')['code'] === 'GLACE20');
verifier('les espaces autour sont ignorés', $codes->trouverActif('  Glace20 ')['pourcentage'] === 20);
verifier('un code désactivé n\'est pas trouvé', $codes->trouverActif('ANCIEN15') === null);
verifier('un code inconnu n\'est pas trouvé', $codes->trouverActif('NOPE') === null);
verifier('un code vide n\'est pas trouvé', $codes->trouverActif('   ') === null);
verifier('un code trop long n\'est pas trouvé', $codes->trouverActif(str_repeat('A', 31)) === null);
verifier('pas d\'injection : une apostrophe ne trouve rien', $codes->trouverActif("' OR '1'='1") === null);

echo "2. Calcul de la réduction\n";
verifier('10 % de 7,90 € = 0,79 €', CodePromoModel::reduction(790, 10) === 79);
verifier('arrondi au plus proche : 15 % de 3,33 € = 0,50 €', CodePromoModel::reduction(333, 15) === 50);
verifier('100 % = tout le total', CodePromoModel::reduction(790, 100) === 790);
verifier('jamais plus que le total', CodePromoModel::reduction(5, 100) === 5);
verifier('un total nul n\'a pas de réduction', CodePromoModel::reduction(0, 50) === 0);

[$v1, $prix1, $options1] = variante($pdo, 1);
[$v2, $prix2, $options2] = variante($pdo, 2);

echo "3. Sans code, la commande est inchangée\n";
reinitialiser($pdo, 10);
$sans = $commandes->creer(1, [['variantId' => $v2, 'quantite' => 2, 'options' => $options2]]);
verifier('total = 2 × prix', $sans['totalCents'] === 2 * $prix2 && $sans['reductionCents'] === 0 && $sans['codePromo'] === null);
$ligne = $pdo->query('SELECT code_promo, reduction_pourcent, reduction_cents FROM commande')->fetch();
verifier('rien enregistré côté code', $ligne['code_promo'] === null && $ligne['reduction_pourcent'] === null && (int) $ligne['reduction_cents'] === 0);

echo "4. Avec un code, la réduction s'applique au total\n";
reinitialiser($pdo, 10);
// Le produit 2 n'est pas en promotion automatique (stocks identiques : le plus ancien, le 1, l'est).
$sousTotal = 2 * $prix2;
$avec = $commandes->creer(1, [['variantId' => $v2, 'quantite' => 2, 'options' => $options2]], 'glace20');
$reduction = CodePromoModel::reduction($sousTotal, 20);
verifier('total à payer = sous-total - 20 %', $avec['totalCents'] === $sousTotal - $reduction);
verifier('la réponse donne la réduction et le code en majuscules', $avec['reductionCents'] === $reduction && $avec['codePromo'] === 'GLACE20');
$ligne = $pdo->query('SELECT total_cents, code_promo, reduction_pourcent, reduction_cents FROM commande')->fetch();
verifier('la base garde total, code, pourcentage et réduction',
    (int) $ligne['total_cents'] === $sousTotal - $reduction && $ligne['code_promo'] === 'GLACE20'
    && (int) $ligne['reduction_pourcent'] === 20 && (int) $ligne['reduction_cents'] === $reduction);
$relue = $commandes->findByNumero($avec['numero'], 1);
verifier('la commande relue expose code, pourcentage et réduction',
    $relue['codePromo'] === 'GLACE20' && $relue['reductionPourcent'] === 20 && $relue['reductionCents'] === $reduction
    && $relue['totalCents'] === $avec['totalCents']);
verifier('sous-total = total + réduction = somme des lignes',
    $relue['totalCents'] + $relue['reductionCents'] === array_sum(array_column($relue['lignes'], 'totalCents')));

echo "5. Le code se cumule avec la promotion automatique\n";
reinitialiser($pdo, 10);
verifier('le produit 1 est en promotion automatique', PromotionModel::produitEnPromotion($pdo) === 1);
$sousTotal = 3 * PromotionModel::prixRemise($prix1);
$cumul = $commandes->creer(1, [['variantId' => $v1, 'quantite' => 3, 'options' => $options1]], 'BIENVENUE10');
$reduction = CodePromoModel::reduction($sousTotal, 10);
verifier('code de 10 % appliqué sur le prix déjà remisé', $cumul['totalCents'] === $sousTotal - $reduction && $reduction > 0);

echo "6. Un code non valable refuse la commande sans rien écrire\n";
reinitialiser($pdo, 10);
$stockAvant = (int) $pdo->query('SELECT SUM(stock) FROM variante')->fetchColumn();
$refus = array_map(
    fn (string $code): ?string => tenter($commandes, [['variantId' => $v2, 'quantite' => 1, 'options' => $options2]], $code),
    ['ANCIEN15', 'NOPE']
);
verifier('code désactivé et code inconnu : CodePromoInvalideException', $refus === [CodePromoInvalideException::class, CodePromoInvalideException::class]);
verifier('aucune commande créée', (int) $pdo->query('SELECT COUNT(*) FROM commande')->fetchColumn() === 0);
verifier('stock et journal intacts', (int) $pdo->query('SELECT SUM(stock) FROM variante')->fetchColumn() === $stockAvant
    && (int) $pdo->query('SELECT COUNT(*) FROM mouvement_stock')->fetchColumn() === 0);

echo "7. Un code à 100 % donne une commande gratuite\n";
reinitialiser($pdo, 10);
$pdo->exec("INSERT INTO code_promo (code, pourcentage, actif) VALUES ('GRATUIT', 100, 1)");
$gratuite = $commandes->creer(1, [['variantId' => $v2, 'quantite' => 1, 'options' => $options2]], 'GRATUIT');
verifier('total à payer 0, réduction = sous-total', $gratuite['totalCents'] === 0 && $gratuite['reductionCents'] === $prix2);
verifier('le stock est quand même décrémenté', (int) $pdo->query("SELECT stock FROM variante WHERE id = $v2")->fetchColumn() === 9);

echo "8. Désactiver un code ne change pas les commandes passées\n";
$pdo->exec("UPDATE code_promo SET actif = 0 WHERE code = 'GRATUIT'");
$passee = $commandes->findByNumero($gratuite['numero'], 1);
verifier('la commande garde son code et sa réduction', $passee['codePromo'] === 'GRATUIT' && $passee['reductionCents'] === $prix2);
verifier('le code désactivé est refusé ensuite', tenter($commandes, [['variantId' => $v2, 'quantite' => 1, 'options' => $options2]], 'GRATUIT') === CodePromoInvalideException::class);

echo $echecs === 0 ? "\nTous les tests passent.\n" : "\n$echecs échec(s).\n";
exit($echecs === 0 ? 0 : 1);
