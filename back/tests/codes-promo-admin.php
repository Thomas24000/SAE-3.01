<?php

declare(strict_types=1);

/**
 * Tests de la gestion des codes promotionnels (US PRO-b), en ligne de commande, sur une base
 * JETABLE.
 *
 * ATTENTION : le script efface les commandes et remet des stocks. Ne le pointez
 * jamais sur la vraie base.
 *
 * Usage (après avoir importé sql/glaces.sql dans la base jetable) :
 *   STK_DSN='mysql:host=127.0.0.1;port=3399;dbname=t' STK_USER=root STK_PASS= \
 *   php back/tests/codes-promo-admin.php
 *
 * Il vérifie : les statistiques d'utilisation (commandes annulées exclues, réductions
 * et chiffre d'affaires), la règle de suppression (jamais un code déjà utilisé), la
 * création (doublon refusé), la modification (les commandes passées gardent leur
 * pourcentage) et la désactivation.
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
    $requete = $pdo->prepare('SELECT id, prix_cents, choix_id FROM variante WHERE produit_id = :produit ORDER BY prix_cents, id LIMIT 1');
    $requete->execute(['produit' => $produitId]);
    $ligne = $requete->fetch();

    return [(int) $ligne['id'], (int) $ligne['prix_cents'], $ligne['choix_id'] === null ? [] : [(int) $ligne['choix_id']]];
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

[$v2, $prix2, $options2] = variante($pdo, 2);
$ligne = [['variantId' => $v2, 'quantite' => 2, 'options' => $options2]];

/**
 * Le code d'une liste (lister) par son nom.
 *
 * @param array<int, array<string, mixed>> $liste
 * @return array<string, mixed>
 */
function dans(array $liste, string $code): array
{
    return array_values(array_filter($liste, static fn (array $c): bool => $c['code'] === $code))[0];
}

echo "1. Sans commande, aucun code n'a servi\n";
reinitialiser($pdo, 20);
$liste = $codes->lister();
verifier('les 3 codes de démonstration sont listés', count($liste) === 3);
verifier('aucune utilisation, aucune réduction', array_sum(array_column($liste, 'utilisations')) === 0 && array_sum(array_column($liste, 'reductionCents')) === 0);
verifier('tous supprimables', !in_array(false, array_column($liste, 'supprimable'), true));
verifier('les codes actifs passent avant les désactivés', $liste[2]['code'] === 'ANCIEN15' && $liste[2]['actif'] === false);

echo "2. Statistiques d'utilisation\n";
$a = $commandes->creer(1, $ligne, 'GLACE20');
$b = $commandes->creer(1, $ligne, 'glace20');
$c = $commandes->creer(1, $ligne, 'BIENVENUE10');
$commandes->creer(1, $ligne);                       // sans code
$liste = $codes->lister();
$glace = dans($liste, 'GLACE20');
verifier('GLACE20 : 2 utilisations', $glace['utilisations'] === 2);
verifier('GLACE20 : réductions cumulées', $glace['reductionCents'] === $a['reductionCents'] + $b['reductionCents']);
verifier('GLACE20 : chiffre d\'affaires = totaux payés', $glace['chiffreAffairesCents'] === $a['totalCents'] + $b['totalCents']);
verifier('GLACE20 : dernière utilisation renseignée', is_string($glace['derniereUtilisation']));
verifier('BIENVENUE10 : 1 utilisation', dans($liste, 'BIENVENUE10')['utilisations'] === 1);
verifier('ANCIEN15 : 0 utilisation, pas de dernière date', dans($liste, 'ANCIEN15')['utilisations'] === 0 && dans($liste, 'ANCIEN15')['derniereUtilisation'] === null);
verifier('les commandes sans code ne comptent pour personne', array_sum(array_column($liste, 'utilisations')) === 3);
verifier('le plus utilisé passe en premier', $liste[0]['code'] === 'GLACE20');
verifier('un code utilisé n\'est pas supprimable', $glace['supprimable'] === false);

echo "3. Une commande annulée ne compte plus\n";
$id = (int) $pdo->query("SELECT id FROM commande WHERE numero = '" . $b['numero'] . "'")->fetchColumn();
$commandes->changerStatut($id, 'annulee');
$glace = dans($codes->lister(), 'GLACE20');
verifier('GLACE20 : 1 utilisation après l\'annulation', $glace['utilisations'] === 1);
verifier('réductions et chiffre d\'affaires sans la commande annulée', $glace['reductionCents'] === $a['reductionCents'] && $glace['chiffreAffairesCents'] === $a['totalCents']);
verifier('mais le code reste non supprimable (l\'historique le cite)', $glace['supprimable'] === false);

echo "4. Création\n";
$ete = $codes->creer('ETE5', 5, true);
verifier('création : un identifiant est renvoyé', $ete > 0);
verifier('le nouveau code est accepté à la commande', $codes->trouverActif('ete5') === ['code' => 'ETE5', 'pourcentage' => 5]);
$doublon = null;
try {
    $codes->creer('ETE5', 10, true);
} catch (PDOException $e) {
    $doublon = $e->getCode();
}
verifier('un code en double est refusé (SQLSTATE 23000)', $doublon === '23000');
$off = $codes->creer('DORMANT', 30, false);
verifier('un code créé désactivé n\'est pas accepté', $codes->trouverActif('DORMANT') === null);

echo "5. Modification\n";
verifier('modifier un code inconnu renvoie faux', $codes->modifier(99999, 10, true) === false);
verifier('modifier le pourcentage', $codes->modifier($ete, 50, true) === true && $codes->trouverActif('ETE5')['pourcentage'] === 50);
$apres = $commandes->creer(1, $ligne, 'ETE5');
verifier('la nouvelle commande utilise le nouveau pourcentage', $apres['reductionCents'] === CodePromoModel::reduction(2 * $prix2, 50));
$codes->modifier($ete, 5, true);
$relue = $commandes->findByNumero($apres['numero'], 1);
verifier('la commande passée garde son pourcentage et sa réduction', $relue['reductionPourcent'] === 50 && $relue['reductionCents'] === $apres['reductionCents']);
$codes->modifier($ete, 5, false);
verifier('désactiver un code le refuse aussitôt', $codes->trouverActif('ETE5') === null);
verifier('la désactivation ne change pas ses statistiques', dans($codes->lister(), 'ETE5')['utilisations'] === 1);
$codes->modifier($ete, 5, true);
verifier('réactiver un code l\'accepte de nouveau', $codes->trouverActif('ETE5') !== null);

echo "6. Suppression\n";
$erreurs = [];
array_map(
    function (int $cible) use ($codes, &$erreurs): void {
        try {
            $codes->supprimer($cible);
            $erreurs[$cible] = 0;
        } catch (DomainException $e) {
            $erreurs[$cible] = $e->getCode();
        }
    },
    [$ete, $off, 99999]
);
verifier('un code déjà utilisé ne peut pas être supprimé (409)', $erreurs[$ete] === 409);
verifier('un code jamais utilisé est supprimé', $erreurs[$off] === 0 && $codes->trouverActif('DORMANT') === null
    && (int) $pdo->query("SELECT COUNT(*) FROM code_promo WHERE code = 'DORMANT'")->fetchColumn() === 0);
verifier('un code inconnu : 404', $erreurs[99999] === 404);
verifier('le code utilisé est toujours là, avec ses statistiques', dans($codes->lister(), 'ETE5')['utilisations'] === 1);

echo $echecs === 0 ? "\nTous les tests passent.\n" : "\n$echecs échec(s).\n";
exit($echecs === 0 ? 0 : 1);
