<?php

declare(strict_types=1);

/**
 * Tests des variantes par combinaison format + service (US OPT-b), en ligne de
 * commande, sur une base JETABLE.
 *
 * ATTENTION : le script modifie des stocks, retire des variantes et crée un
 * produit. Ne le pointez jamais sur la vraie base.
 *
 * Usage (après avoir importé sql/glaces.sql dans la base jetable) :
 *   STK_DSN='mysql:host=127.0.0.1;port=3399;dbname=t' STK_USER=root STK_PASS= \
 *   php back/tests/variantes.php
 *
 * Il vérifie : la lecture des combinaisons (fiche, panier, admin), l'unicité
 * d'une combinaison en base, l'édition admin (stock, retrait d'une combinaison,
 * service immuable, service d'un autre produit refusé) et la création d'un
 * produit sans service.
 */

use App\Model\ProduitAdminModel;
use App\Model\ProduitModel;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/Core/Televersement.php';
require_once __DIR__ . '/../src/Model/ProduitModel.php';
require_once __DIR__ . '/../src/Model/ProduitAdminModel.php';

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
$produits = new ProduitModel($pdo);
$admin    = new ProduitAdminModel($pdo);
$echecs   = 0;

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
 * Message du refus d'une modification admin, ou null si elle passe.
 *
 * @param array<string, mixed> $donnees
 */
function tenter(ProduitAdminModel $admin, int $id, array $donnees): ?string
{
    try {
        $admin->modifier($id, $donnees);

        return null;
    } catch (DomainException $e) {
        return $e->getMessage();
    }
}

/**
 * Les champs d'un produit repris tels quels pour une modification, avec des variantes données.
 *
 * @param array<string, mixed> $produit
 * @param array<int, array<string, mixed>> $variantes
 * @return array<string, mixed>
 */
function donnees(array $produit, array $variantes): array
{
    return [
        'nom'               => $produit['nom'],
        'categorieId'       => $produit['categorieId'],
        'description'       => $produit['description'],
        'descriptionLongue' => $produit['descriptionLongue'],
        'ingredients'       => $produit['ingredients'],
        'variantes'         => $variantes,
    ];
}

// Seeds : le produit 1 a 2 formats x 3 services = 6 combinaisons.
echo "1. Lecture des combinaisons\n";
$fiche = $produits->findBySlug('cookie-dough');
verifier('la fiche liste 6 variantes', count($fiche['variantes']) === 6);
verifier('chaque variante porte son choixId', count(array_filter(
    $fiche['variantes'],
    static fn (array $v): bool => is_int($v['choixId'])
)) === 6);
$cone = (int) $pdo->query("SELECT id FROM option_choix WHERE libelle = 'Cône gaufrette' AND groupe_id IN (SELECT id FROM option_groupe WHERE produit_id = 1)")->fetchColumn();
$pot465Cone = array_values(array_filter(
    $fiche['variantes'],
    static fn (array $v): bool => $v['libelle'] === 'Pot 465 ml' && $v['choixId'] === $cone
))[0] ?? null;
verifier('Pot 465 ml + cône a son stock propre (épuisé dans les seeds)', $pot465Cone !== null && $pot465Cone['stock'] === 0);

$combinaisons = $produits->findCombinaisonsByProduits([1, 2]);
verifier('le panier reçoit les 6 combinaisons de chaque produit', count($combinaisons[1]) === 6 && count($combinaisons[2]) === 6);
verifier('findVariantesByIds expose le choixId', $produits->findVariantesByIds([$pot465Cone['id']])[0]['choixId'] === $cone);
verifier('aucune combinaison pour une liste vide', $produits->findCombinaisonsByProduits([]) === []);

echo "2. Une combinaison est unique en base\n";
try {
    $pdo->prepare('INSERT INTO variante (produit_id, libelle, choix_id, prix_cents, stock) VALUES (1, :format, :choix, 1, 1)')
        ->execute(['format' => 'Pot 465 ml', 'choix' => $cone]);
    verifier('un doublon format + service est refusé', false);
} catch (PDOException $e) {
    verifier('un doublon format + service est refusé', $e->getCode() === '23000');
}

echo "3. Édition admin\n";
$produit = $admin->trouver(1);
verifier('l\'admin lit 6 variantes et 3 services', count($produit['variantes']) === 6 && count($produit['services']) === 3);
verifier('le nombre de formats compte les formats, pas les combinaisons', $admin->lister()[0]['nombreFormats'] === 2);

$variantes = $produit['variantes'];
$variantes[0]['stock'] = 77;
array_pop($variantes);
verifier('modifier un stock et retirer une combinaison passe', tenter($admin, 1, donnees($produit, $variantes)) === null);
$relu = $admin->trouver(1);
verifier('5 variantes restent, le stock est mis à jour', count($relu['variantes']) === 5 && $relu['variantes'][0]['stock'] === 77);
verifier('la combinaison retirée est supprimée de la fiche publique', count($produits->findBySlug('cookie-dough')['variantes']) === 5);

$changee = $variantes;
$changee[0]['choixId'] = $changee[1]['choixId'];
verifier('changer le service d\'une variante est refusé', str_contains((string) tenter($admin, 1, donnees($produit, $changee)), 'ne peut pas être changé'));

$autreProduit = $admin->trouver(2);
$etrangere = $variantes;
$etrangere[] = ['libelle' => 'Pot 1 l', 'choixId' => $autreProduit['services'][0]['id'], 'prixCents' => 1500, 'stock' => 3];
verifier('un service d\'un autre produit est refusé', str_contains((string) tenter($admin, 1, donnees($produit, $etrangere)), 'services choisis'));
verifier('rien n\'a été modifié par ces refus', count($admin->trouver(1)['variantes']) === 5);

$nouvelle = $variantes;
$nouvelle[] = ['libelle' => 'Pot 1 l', 'choixId' => $produit['services'][0]['id'], 'prixCents' => 1500, 'stock' => 3];
verifier('un nouveau format avec un seul service (les autres non proposés) passe', tenter($admin, 1, donnees($produit, $nouvelle)) === null);
verifier('il apparaît comme une seule combinaison', count(array_filter(
    $produits->findBySlug('cookie-dough')['variantes'],
    static fn (array $v): bool => $v['libelle'] === 'Pot 1 l'
)) === 1);

echo "4. Produit sans service\n";
$id = $admin->creer([
    'nom' => 'Test variantes', 'slug' => 'test-variantes', 'categorieId' => 1, 'description' => 'd',
    'descriptionLongue' => '', 'ingredients' => '', 'teinte' => 10,
    'variantes' => [['libelle' => 'Pot', 'choixId' => null, 'prixCents' => 100, 'stock' => 2]],
]);
$neuf = $admin->trouver($id);
verifier('il a une variante et aucun service', count($neuf['variantes']) === 1 && $neuf['services'] === []);
verifier('lui donner un service est refusé', str_contains((string) tenter($admin, $id, donnees($neuf, [
    ['libelle' => 'Pot', 'choixId' => $produit['services'][0]['id'], 'prixCents' => 100, 'stock' => 2],
])), 'services choisis'));
$admin->supprimer($id);

echo $echecs === 0 ? "\nTous les tests passent.\n" : "\n$echecs test(s) en échec.\n";
exit($echecs === 0 ? 0 : 1);
