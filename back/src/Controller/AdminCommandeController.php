<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Core\SessionAdmin;
use App\Model\CommandeModel;
use DomainException;

/**
 * Gestion des commandes par les administrateurs (US PIL-b).
 *
 * Toute route exige une session administrateur ; le changement de statut exige
 * en plus le jeton CSRF. Le serveur revalide tout : transitions autorisées,
 * existence des commandes. Le recrédit du stock à l'annulation et l'écriture du
 * journal sont faits par CommandeModel::changerStatut(), en une transaction.
 */
final class AdminCommandeController
{
    /** Nombre maximal de commandes traitées par une action en lot. */
    private const LOT_MAX = 100;

    /** Statuts qu'un administrateur peut demander (liste blanche). */
    private const STATUTS = ['en_cours', 'prete', 'retiree', 'annulee'];

    /** Le modèle des commandes, fourni à la construction. */
    private CommandeModel $commandes;

    public function __construct(CommandeModel $commandes)
    {
        $this->commandes = $commandes;
    }

    /**
     * GET /api/admin/commandes : toutes les commandes des clients.
     *
     * Paramètres facultatifs : tri (date, statut, montant ; défaut date), sens
     * (asc, desc ; défaut desc), statut (filtre sur un statut).
     * Réponse : { commandes: [{ id, numero, statut, totalCents, creeLe, client, articles }],
     * tri, sens, statut }
     * Erreur : 401 sans session administrateur.
     */
    public function index(Request $requete): void
    {
        SessionAdmin::exiger();

        $tri    = in_array($requete->parametre('tri', 'date'), ['date', 'statut', 'montant'], true)
            ? (string) $requete->parametre('tri', 'date')
            : 'date';
        $sens   = $requete->parametre('sens', 'desc') === 'asc' ? 'asc' : 'desc';
        $statut = in_array($requete->parametre('statut', ''), self::STATUTS, true)
            ? (string) $requete->parametre('statut', '')
            : null;

        Response::json([
            'commandes' => $this->commandes->listerAdmin($tri, $sens, $statut),
            'tri'       => $tri,
            'sens'      => $sens,
            'statut'    => $statut,
        ]);
    }

    /**
     * GET /api/admin/commande?numero=CC-2026-000123 : le détail complet d'une commande.
     *
     * Réponse : { commande: { id, numero, statut, totalCents, creeLe, client, lignes: [...],
     * journal: [{ admin, ancien, nouveau, creeLe }] } }
     * Erreurs : 401, 400 (numéro mal formé), 404 (inconnue).
     */
    public function show(Request $requete): void
    {
        SessionAdmin::exiger();

        $numero = $requete->parametre('numero', '');
        if (preg_match('/^CC-[0-9]{4}-[0-9]{6,}$/', (string) $numero) !== 1) {
            Response::erreur('Le numéro de commande est absent ou invalide.', 400);
        }

        $commande = $this->commandes->findAdmin((string) $numero);
        if ($commande === null) {
            Response::erreur('Commande introuvable.', 404);
        }

        Response::json(['commande' => $commande]);
    }

    /**
     * POST /api/admin/commandes/statut : change le statut d'une ou plusieurs commandes.
     *
     * Corps : { ids: [int], statut } (une action en lot est simplement plusieurs ids).
     * Chaque commande est traitée dans sa propre transaction : celles qui ne
     * peuvent pas suivre (déjà retirée, déjà annulée, saut d'étape) sont refusées
     * avec leur motif, les autres sont modifiées. Annuler rend le stock ; aucun
     * autre statut n'y touche. Chaque changement est inscrit au journal.
     * Réponse : { modifiees: [numero], refusees: [message] }
     * Erreurs : 401, 403 (jeton CSRF), 400 (ids ou statut invalides), 404 (aucune
     * commande connue), 409 (aucune commande modifiée : le message donne les motifs).
     */
    public function updateStatus(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);

        $corps  = $requete->corps();
        $statut = $corps['statut'] ?? null;
        $ids    = $this->identifiants($corps['ids'] ?? null);

        if (!is_string($statut) || !in_array($statut, self::STATUTS, true)) {
            Response::erreur('Statut de commande invalide.', 400);
        }

        $existants = $this->commandes->idsExistants($ids);
        if ($existants === []) {
            Response::erreur('Commande introuvable.', 404);
        }

        $adminId   = (int) $_SESSION['admin']['id'];
        $resultats = array_map(
            fn (int $id): array => $this->changer($id, $statut, $adminId),
            $existants
        );

        $modifiees = array_values(array_map(
            static fn (array $r): string => $r['numero'],
            array_filter($resultats, static fn (array $r): bool => $r['message'] === null)
        ));
        $refusees = array_values(array_map(
            static fn (array $r): string => $r['message'],
            array_filter($resultats, static fn (array $r): bool => $r['message'] !== null)
        ));

        if ($modifiees === []) {
            Response::erreur(implode(' ', $refusees), 409);
        }

        Response::json(['modifiees' => $modifiees, 'refusees' => $refusees]);
    }

    /**
     * Change le statut d'une commande sans lever d'erreur : un refus devient un message.
     *
     * @return array{numero:string, message:?string} message : null si la commande a été modifiée.
     */
    private function changer(int $id, string $statut, int $adminId): array
    {
        try {
            $resultat = $this->commandes->changerStatut($id, $statut, $adminId);
        } catch (DomainException $e) {
            return ['numero' => '', 'message' => $e->getMessage()];
        }

        return [
            'numero'  => $resultat['numero'],
            'message' => $resultat['change'] ? null : 'La commande ' . $resultat['numero'] . ' a déjà ce statut.',
        ];
    }

    /**
     * Vérifie la liste d'identifiants reçue : entiers positifs, sans doublon, 1 à LOT_MAX.
     *
     * @return array<int, int>
     */
    private function identifiants(mixed $valeur): array
    {
        if (!is_array($valeur) || $valeur === [] || count($valeur) > self::LOT_MAX) {
            Response::erreur('Choisissez entre 1 et ' . self::LOT_MAX . ' commandes.', 400);
        }

        $entiers = array_map(
            static fn (mixed $id): int => is_int($id) && $id > 0 ? $id : 0,
            array_values($valeur)
        );

        if (in_array(0, $entiers, true)) {
            Response::erreur('Identifiant de commande invalide.', 400);
        }

        return array_values(array_unique($entiers));
    }
}
