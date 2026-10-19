<?php

declare(strict_types=1);

namespace App\Model;

use DomainException;
use PDO;
use Throwable;

/**
 * Accès aux données des commandes et de leurs lignes (US CMD-a).
 *
 * C'est ici que la commande est enregistrée, en une seule transaction : les
 * prix sont relus en base, jamais pris dans la requête.
 */
final class CommandeModel
{
    /** Statut d'une commande qui vient d'être validée. */
    private const STATUT_INITIAL = 'en_cours';

    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Enregistre une commande : la commande et toutes ses lignes, ou rien.
     *
     * Les variantes sont relues dans la transaction (avec un verrou de lecture,
     * pour que leur prix ne change pas avant l'écriture) et leur nom, format et
     * prix sont copiés dans les lignes. Le numéro est fabriqué avec
     * l'identifiant de la commande : CC-2026-000123.
     *
     * @param int $utilisateurId Identifiant du client connecté.
     * @param array<int, array{variantId:int, quantite:int}> $lignes Lignes déjà validées (entiers positifs, variantes distinctes).
     * @return array{numero:string, statut:string, totalCents:int}
     * @throws DomainException Si une variante n'existe plus.
     */
    public function creer(int $utilisateurId, array $lignes): array
    {
        $this->pdo->beginTransaction();

        try {
            $variantes = $this->lireVariantes(
                array_map(static fn (array $ligne): int => $ligne['variantId'], $lignes)
            );

            $detail = array_map(
                static function (array $ligne) use ($variantes): array {
                    $variante = $variantes[$ligne['variantId']] ?? null;

                    if ($variante === null) {
                        throw new DomainException(
                            'Un article de ton panier n\'est plus proposé. Retourne au panier pour le mettre à jour.'
                        );
                    }

                    return $variante + ['quantite' => $ligne['quantite']];
                },
                $lignes
            );

            $total = array_reduce(
                $detail,
                static fn (int $somme, array $ligne): int => $somme + $ligne['prix_cents'] * $ligne['quantite'],
                0
            );

            // Numéro provisoire unique : le vrai dépend de l'identifiant que la
            // base attribue à l'insertion.
            $insertion = $this->pdo->prepare(
                'INSERT INTO commande (numero, utilisateur_id, statut, total_cents)
                 VALUES (:numero, :utilisateur, :statut, :total)'
            );
            $insertion->execute([
                'numero'      => 'TMP-' . bin2hex(random_bytes(8)),
                'utilisateur' => $utilisateurId,
                'statut'      => self::STATUT_INITIAL,
                'total'       => $total,
            ]);
            $commandeId = (int) $this->pdo->lastInsertId();
            $numero     = sprintf('CC-%s-%06d', date('Y'), $commandeId);

            $this->pdo
                ->prepare('UPDATE commande SET numero = :numero WHERE id = :id')
                ->execute(['numero' => $numero, 'id' => $commandeId]);

            $ligneSql = $this->pdo->prepare(
                'INSERT INTO ligne_commande
                        (commande_id, variante_id, produit_nom, variante_libelle, prix_unitaire_cents, quantite)
                 VALUES (:commande, :variante, :nom, :libelle, :prix, :quantite)'
            );
            array_map(
                static fn (array $ligne): bool => $ligneSql->execute([
                    'commande' => $commandeId,
                    'variante' => $ligne['id'],
                    'nom'      => $ligne['nom'],
                    'libelle'  => $ligne['libelle'],
                    'prix'     => $ligne['prix_cents'],
                    'quantite' => $ligne['quantite'],
                ]),
                $detail
            );

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['numero' => $numero, 'statut' => self::STATUT_INITIAL, 'totalCents' => $total];
    }

    /**
     * Une commande et ses lignes, retrouvées par leur numéro. Seul le client qui
     * l'a passée peut la lire : pour tout autre, elle n'existe pas.
     *
     * @param string $numero Numéro de la commande (ex. CC-2026-000123).
     * @param int $utilisateurId Identifiant du client connecté.
     * @return array{numero:string, statut:string, totalCents:int, creeLe:string,
     *               lignes:array<int, array{produit:string, libelle:string, prixUnitaireCents:int,
     *               quantite:int, totalCents:int}>}|null
     *         null si le numéro est inconnu ou appartient à un autre client.
     */
    public function findByNumero(string $numero, int $utilisateurId): ?array
    {
        $requete = $this->pdo->prepare(
            'SELECT id, numero, statut, total_cents, cree_le
               FROM commande
              WHERE numero = :numero AND utilisateur_id = :utilisateur'
        );
        $requete->execute(['numero' => $numero, 'utilisateur' => $utilisateurId]);
        $commande = $requete->fetch();

        if ($commande === false) {
            return null;
        }

        $lignes = $this->pdo->prepare(
            'SELECT produit_nom, variante_libelle, prix_unitaire_cents, quantite
               FROM ligne_commande
              WHERE commande_id = :commande
           ORDER BY id'
        );
        $lignes->execute(['commande' => $commande['id']]);

        return [
            'numero'     => $commande['numero'],
            'statut'     => $commande['statut'],
            'totalCents' => (int) $commande['total_cents'],
            'creeLe'     => $commande['cree_le'],
            'lignes'     => array_map(
                static fn (array $ligne): array => [
                    'produit'           => $ligne['produit_nom'],
                    'libelle'           => $ligne['variante_libelle'],
                    'prixUnitaireCents' => (int) $ligne['prix_unitaire_cents'],
                    'quantite'          => (int) $ligne['quantite'],
                    'totalCents'        => (int) $ligne['prix_unitaire_cents'] * (int) $ligne['quantite'],
                ],
                $lignes->fetchAll()
            ),
        ];
    }

    /**
     * Les variantes demandées, avec le nom de leur produit, verrouillées en
     * lecture jusqu'à la fin de la transaction.
     *
     * @param array<int, int> $ids Identifiants de variantes.
     * @return array<int, array{id:int, libelle:string, prix_cents:int, nom:string}> Indexé par identifiant de variante.
     */
    private function lireVariantes(array $ids): array
    {
        // Un « ? » par identifiant : les valeurs restent des paramètres liés.
        $marqueurs = implode(',', array_fill(0, count($ids), '?'));

        $requete = $this->pdo->prepare(
            'SELECT variante.id, variante.libelle, variante.prix_cents, produit.nom
               FROM variante
         INNER JOIN produit ON produit.id = variante.produit_id
              WHERE variante.id IN (' . $marqueurs . ')
              LOCK IN SHARE MODE'
        );
        $requete->execute(array_values($ids));

        $lignes = $requete->fetchAll();

        return array_combine(
            array_map(static fn (array $ligne): int => (int) $ligne['id'], $lignes),
            array_map(
                static fn (array $ligne): array => [
                    'id'         => (int) $ligne['id'],
                    'libelle'    => $ligne['libelle'],
                    'prix_cents' => (int) $ligne['prix_cents'],
                    'nom'        => $ligne['nom'],
                ],
                $lignes
            )
        );
    }
}
