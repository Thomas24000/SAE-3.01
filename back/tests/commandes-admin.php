<?php

declare(strict_types=1);

/**
 * Tests de la gestion des commandes par l'administrateur (US PIL-b), en ligne
 * de commande, sur une base JETABLE.
 *
 * ATTENTION : le script efface les commandes et remet des stocks. Ne le pointez
 * jamais sur la vraie base.
 *
 * Usage :
 *   STK_DSN='mysql:host=127.0.0.1;port=3399;dbname=t' STK_USER=root STK_PASS= \
 *   php back/tests/commandes-admin.php
 *
 * Il vérifie : liste et tris, filtre, détail, parcours des statuts, stock rendu
 * uniquement à l'annulation, refus des transitions interdites et journal.
 */

use App\Model\CommandeModel;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/Model/PromotionModel.php';
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
$admin  = 2;

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
 * Stock courant d'une variante.
 */
function stock(PDO $pdo, int $variantId): int
{
    $requete = $pdo->prepare('SELECT stock FROM variante WHERE id = :id');
    $requete->execute(['id' => $variantId]);

    return (int) $requete->fetchColumn();
}

/**
 * Passe une commande d'une quantité donnée et renvoie son identifiant.
 */
function commander(PDO $pdo, CommandeModel $model, int $quantite): int
{
    $choix = $pdo->query(
        "SELECT MIN(option_choix.id)
           FROM option_groupe
     INNER JOIN option_choix ON option_choix.groupe_id = option_groupe.id
          WHERE option_groupe.produit_id = (SELECT produit_id FROM variante WHERE id = 1)
            AND option_groupe.libelle = 'Service'"
    )->fetchColumn();
    $commande = $model->creer(1, [['variantId' => 1, 'quantite' => $quantite, 'options' => [(int) $choix]]]);
    $requete  = $pdo->prepare('SELECT id FROM commande WHERE numero = :numero');
    $requete->execute(['numero' => $commande['numero']]);

    return (int) $requete->fetchColumn();
}

/**
 * Vrai si l'appel lève une DomainException.
 */
function refuse(callable $appel): bool
{
    try {
        $appel();
    } catch (DomainException $e) {
        return true;
    }

    return false;
}

$pdo->exec('DELETE FROM commande');
$pdo->exec('UPDATE variante SET stock = 20 WHERE id = 1');

$a = commander($pdo, $model, 1);
usleep(1100000);
$b = commander($pdo, $model, 3);
usleep(1100000);
$c = commander($pdo, $model, 2);

echo "1. Liste, tris et filtre\n";
$liste = $model->listerAdmin('date', 'desc', null);
verifier('3 commandes listées, la plus récente d\'abord', count($liste) === 3 && $liste[0]['id'] === $c && $liste[2]['id'] === $a);
verifier('le client et le nombre d\'articles sont fournis', $liste[1]['client'] === 'alice@example.com' && $liste[1]['articles'] === 3);
$parMontant = $model->listerAdmin('montant', 'desc', null);
verifier('tri par montant décroissant', $parMontant[0]['id'] === $b && $parMontant[2]['id'] === $a);
verifier('tri par montant croissant', $model->listerAdmin('montant', 'asc', null)[0]['id'] === $a);
verifier('tri inconnu : retombe sur la date, jamais d\'injection SQL',
    $model->listerAdmin('id; DROP TABLE commande', 'desc', null)[0]['id'] === $c);
$model->changerStatut($a, 'prete', $admin);
verifier('filtre par statut', count($model->listerAdmin('date', 'desc', 'prete')) === 1);
verifier('tri par statut', $model->listerAdmin('statut', 'asc', null)[0]['statut'] === 'en_cours');

echo "2. Détail complet\n";
$detail = $model->findAdmin($model->listerAdmin('date', 'asc', null)[0]['numero']);
verifier('détail : client, lignes, options', $detail !== null && $detail['client'] === 'alice@example.com'
    && count($detail['lignes']) === 1 && count($detail['lignes'][0]['options']) === 1);
verifier('détail : journal avec l\'admin', count($detail['journal']) === 1 && $detail['journal'][0]['admin'] === 'admin@example.com'
    && $detail['journal'][0]['ancien'] === 'en_cours' && $detail['journal'][0]['nouveau'] === 'prete');
verifier('numéro inconnu : null', $model->findAdmin('CC-2026-999999') === null);

echo "3. Parcours des statuts et stock\n";
$avant = stock($pdo, 1);
$model->changerStatut($a, 'retiree', $admin);
verifier('prete -> retiree ne touche pas au stock', stock($pdo, 1) === $avant);
verifier('une commande retirée ne peut pas être annulée', refuse(fn () => $model->changerStatut($a, 'annulee', $admin)));
verifier('on ne saute pas d\'étape (en_cours -> retiree)', refuse(fn () => $model->changerStatut($b, 'retiree', $admin)));
verifier('on ne revient pas en arrière (retiree -> prete)', refuse(fn () => $model->changerStatut($a, 'prete', $admin)));
verifier('statut inconnu refusé', refuse(fn () => $model->changerStatut($b, 'perdue', $admin)));
$resultat = $model->changerStatut($b, 'prete', $admin);
verifier('en_cours -> prete : stock inchangé', $resultat['change'] === true && stock($pdo, 1) === $avant);
$resultat = $model->changerStatut($b, 'prete', $admin);
verifier('même statut : sans effet, sans journal', $resultat['change'] === false
    && (int) $pdo->query("SELECT COUNT(*) FROM journal_commande WHERE commande_id = $b")->fetchColumn() === 1);

echo "4. Annulation : stock rendu une fois, journal\n";
$model->changerStatut($b, 'annulee', $admin);
verifier('annuler une commande prête rend 3 pots', stock($pdo, 1) === $avant + 3);
$model->changerStatut($b, 'annulee', $admin);
verifier('une 2e annulation ne rend rien', stock($pdo, 1) === $avant + 3);
verifier('une commande annulée est figée', refuse(fn () => $model->changerStatut($b, 'prete', $admin)));
$model->changerStatut($c, 'annulee', $admin);
verifier('annuler une commande en cours rend 2 pots', stock($pdo, 1) === $avant + 5);
verifier('le journal garde 2 entrées pour la commande annulée (prete, annulee)',
    (int) $pdo->query("SELECT COUNT(*) FROM journal_commande WHERE commande_id = $b")->fetchColumn() === 2);

echo "5. Atomicité du journal\n";
$d = commander($pdo, $model, 1);
verifier('un administrateur inexistant fait échouer le changement', (function () use ($model, $d, $pdo): bool {
    try {
        $model->changerStatut($d, 'prete', 99999);
    } catch (PDOException $e) {
        return (string) $pdo->query("SELECT statut FROM commande WHERE id = $d")->fetchColumn() === 'en_cours';
    }

    return false;
})());
verifier('idsExistants ignore les identifiants inconnus', $model->idsExistants([$a, 999999]) === [$a]);

echo $echecs === 0 ? "\nTous les tests passent.\n" : "\n$echecs échec(s).\n";
exit($echecs === 0 ? 0 : 1);
