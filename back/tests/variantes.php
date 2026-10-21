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
require_once __DIR__ . '/../src/Model/PromotionModel.php';
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
        'allergeneIds'      => $produit['allergeneIds'],
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
$cone = (int) $pdo->query("SELECT id FROM option_choix WHERE type = 'service' AND libelle = 'Cône gaufrette'")->fetchColumn();
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
    $pdo->prepare('INSERT INTO variante (produit_id, format_id, service_id, prix_cents, stock) VALUES (1, 2, :choix, 1, 1)')
        ->execute(['choix' => $cone]);
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

$topping = (int) $pdo->query("SELECT id FROM option_choix WHERE type = 'topping' LIMIT 1")->fetchColumn();
$fausse = $variantes;
$fausse[] = ['libelle' => 'Pot 465 ml', 'choixId' => $topping, 'prixCents' => 1500, 'stock' => 3];
verifier('un topping à la place d\'un service est refusé', str_contains((string) tenter($admin, 1, donnees($produit, $fausse)), 'service'));
$inconnu = $variantes;
$inconnu[] = ['libelle' => 'Pot 1 l', 'choixId' => $produit['services'][0]['id'], 'prixCents' => 1500, 'stock' => 3];
verifier('un format qui n\'existe pas est refusé', str_contains((string) tenter($admin, 1, donnees($produit, $inconnu)), 'n\'existe pas'));
verifier('rien n\'a été modifié par ces refus', count($admin->trouver(1)['variantes']) === 5);

$pdo->exec("INSERT INTO format (libelle, contenance_ml) VALUES ('Pot 1 l', 1000)");
$nouvelle = $variantes;
$nouvelle[] = ['libelle' => 'Pot 1 l', 'choixId' => $produit['services'][0]['id'], 'prixCents' => 1500, 'stock' => 3];
verifier('un nouveau format avec un seul service (les autres non proposés) passe', tenter($admin, 1, donnees($produit, $nouvelle)) === null);
verifier('il apparaît comme une seule combinaison', count(array_filter(
    $produits->findBySlug('cookie-dough')['variantes'],
    static fn (array $v): bool => $v['libelle'] === 'Pot 1 l'
)) === 1);

echo "4. Un produit a toujours un service\n";
$base = [
    'nom' => 'Test variantes', 'slug' => 'test-variantes', 'categorieId' => 1, 'description' => 'd',
    'descriptionLongue' => '', 'ingredients' => '', 'teinte' => 10,
];
$sansService = false;
try {
    $admin->creer($base + ['variantes' => [['libelle' => 'Pot 100 ml', 'choixId' => null, 'prixCents' => 100, 'stock' => 2]]]);
} catch (DomainException $e) {
    $sansService = true;
}
verifier('une variante sans service est refusée', $sansService);
verifier('et le produit n\'a pas été créé', (int) $pdo->query("SELECT COUNT(*) FROM produit WHERE slug = 'test-variantes'")->fetchColumn() === 0);

$id = $admin->creer($base + ['variantes' => [['libelle' => 'Pot 100 ml', 'choixId' => $produit['services'][0]['id'], 'prixCents' => 100, 'stock' => 2]]]);
$neuf = $admin->trouver($id);
verifier('avec un service, il a une variante et les 3 services restent proposés', count($neuf['variantes']) === 1 && count($neuf['services']) === 3);
verifier('son visuel est celui par défaut tant qu\'il n\'a pas d\'image', $admin->lister()[count($admin->lister()) - 1]['image'] === ProduitModel::IMAGE_DEFAUT);
$admin->supprimer($id);

echo "5. Listes du formulaire et allergènes\n";
verifier('les formats proposés sont ceux de la base, du plus petit au plus grand',
    array_column($admin->formats(), 'libelle') === ['Pot 100 ml', 'Pot 465 ml', 'Pot 1 l']);
verifier('tous les allergènes sont proposés', count($admin->allergenes()) === 6);

$produit = $admin->trouver(1);
verifier('le Cookie Dough a ses 4 allergènes (lait, œufs, blé, soja)', $produit['allergeneIds'] === [1, 2, 3, 4]);

$donnees = donnees($produit, $produit['variantes']);
verifier('remplacer les allergènes passe', tenter($admin, 1, ['allergeneIds' => [5, 6]] + $donnees) === null
    && $admin->trouver(1)['allergeneIds'] === [5, 6]);
verifier('une liste vide les retire tous', tenter($admin, 1, ['allergeneIds' => []] + $donnees) === null
    && $admin->trouver(1)['allergeneIds'] === []);
verifier('un allergène inconnu est refusé', str_contains((string) tenter($admin, 1, ['allergeneIds' => [1, 999]] + $donnees), 'allergènes'));
verifier('et rien n\'a changé', $admin->trouver(1)['allergeneIds'] === []);

$id = $admin->creer($base + ['allergeneIds' => [1], 'variantes' => [['libelle' => 'Pot 100 ml', 'choixId' => $produit['services'][0]['id'], 'prixCents' => 100, 'stock' => 2]]]);
verifier('un produit se crée avec ses allergènes', $admin->trouver($id)['allergeneIds'] === [1]);
$admin->supprimer($id);
$id = $admin->creer($base + ['variantes' => [['libelle' => 'Pot 100 ml', 'choixId' => $produit['services'][0]['id'], 'prixCents' => 100, 'stock' => 2]]]);
verifier('ou sans aucun allergène', $admin->trouver($id)['allergeneIds'] === []);
$admin->supprimer($id);
verifier('supprimer un produit retire ses liens d\'allergènes', (int) $pdo->query("SELECT COUNT(*) FROM produit_allergene WHERE produit_id = $id")->fetchColumn() === 0);

echo $echecs === 0 ? "\nTous les tests passent.\n" : "\n$echecs test(s) en échec.\n";
exit($echecs === 0 ? 0 : 1);
