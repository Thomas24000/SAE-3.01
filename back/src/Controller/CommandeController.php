<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\CommandeModel;
use DomainException;

/**
 * Validation d'une commande et consultation de sa confirmation (US CMD-a).
 *
 * Le client doit être connecté. Le panier reçu ne donne que des identifiants de
 * variantes, d'options et des quantités : prix, noms, suppléments et total sont
 * recalculés ici, d'après la base.
 */
final class CommandeController
{
    /** Nombre maximal de lignes différentes dans une commande. */
    private const LIGNES_MAX = 50;

    /** Nombre maximal de choix d'options sur une même ligne. */
    private const OPTIONS_MAX = 20;

    /** Quantité maximale d'une même variante (comme le panier du navigateur). */
    private const QUANTITE_MAX = 99;

    /** Nombre de commandes par page dans l'historique du client. */
    private const PAR_PAGE = 10;

    /** Le modèle qui interroge les commandes, fourni à la construction. */
    private CommandeModel $commandes;

    public function __construct(CommandeModel $commandes)
    {
        $this->commandes = $commandes;
    }

    /**
     * POST /api/commande : valide la commande du client connecté.
     *
     * Corps : { lignes: [{ variantId, quantite, options?: [idChoix] }] }
     * Réponse (201) : { commande: { numero, statut, totalCents } }
     * Erreurs : 401 si personne n'est connecté, 400 si les lignes sont invalides,
     * 409 si une variante ou une option n'existe plus, si les options ne sont pas
     * valides pour le produit ou si le stock manque.
     */
    public function store(Request $requete): void
    {
        $utilisateurId = $this->utilisateurConnecte('Connecte-toi pour valider ta commande.');
        $lignes        = $this->lignesValides($requete->corps()['lignes'] ?? null);

        try {
            $commande = $this->commandes->creer($utilisateurId, $lignes);
        } catch (DomainException $e) {
            Response::erreur($e->getMessage(), 409);
        }

        Response::json(['commande' => $commande], 201);
    }

    /**
     * GET /api/commande?numero=CC-2026-000123 : la confirmation d'une commande.
     *
     * Réponse : { commande: { numero, statut, totalCents, creeLe, email, lignes: [...] } }
     * (chaque ligne porte ses options figées : groupe, libellé, supplément).
     * Erreurs : 401 si personne n'est connecté, 400 si le numéro est mal formé,
     * 404 si la commande n'existe pas ou appartient à un autre client.
     */
    public function show(Request $requete): void
    {
        $utilisateurId = $this->utilisateurConnecte('Connecte-toi pour consulter ta commande.');
        $numero        = $requete->parametre('numero', '');

        if (preg_match('/^CC-[0-9]{4}-[0-9]{6,}$/', $numero) !== 1) {
            Response::erreur('Le numéro de commande est absent ou invalide.', 400);
        }

        $commande = $this->commandes->findByNumero($numero, $utilisateurId);

        if ($commande === null) {
            Response::erreur('Commande introuvable.', 404);
        }

        // L'e-mail du client vient de sa session : la commande lui appartient.
        Response::json(['commande' => $commande + ['email' => (string) $_SESSION['utilisateur']]]);
    }

    /**
     * GET /api/commandes?statut=&du=&au=&page= : l'historique du client connecté (US SUI-c).
     *
     * Tous les paramètres sont facultatifs : statut (en_cours, prete, retiree ou
     * annulee), du et au (AAAA-MM-JJ, inclusifs), page (à partir de 1).
     * Réponse : { commandes: [{ numero, statut, totalCents, creeLe }], total, page, pages }
     * triées de la plus récente à la plus ancienne.
     * Erreurs : 401 si personne n'est connecté, 400 si un paramètre est invalide.
     */
    public function index(Request $requete): void
    {
        $utilisateurId = $this->utilisateurConnecte('Connecte-toi pour consulter tes commandes.');

        $statut = $requete->parametre('statut', '');
        if ($statut !== '' && !in_array($statut, CommandeModel::STATUTS, true)) {
            Response::erreur('Le statut demandé est invalide.', 400);
        }

        $du = $this->dateValide($requete->parametre('du', ''), 'de début');
        $au = $this->dateValide($requete->parametre('au', ''), 'de fin');

        if ($du !== null && $au !== null && $du > $au) {
            Response::erreur('La date de début doit précéder la date de fin.', 400);
        }

        $page = $requete->parametre('page', '1');
        if (preg_match('/^[0-9]{1,6}$/', $page) !== 1) {
            Response::erreur('Le numéro de page est invalide.', 400);
        }

        Response::json($this->commandes->listerClient(
            $utilisateurId,
            $statut === '' ? null : $statut,
            $du,
            $au,
            (int) $page,
            self::PAR_PAGE
        ));
    }

    /**
     * Contrôle une date de filtre.
     *
     * @param string $brut La valeur reçue ; vide si le filtre est absent.
     * @param string $nom Le nom de la date pour le message d'erreur (« de début », « de fin »).
     * @return string|null La date AAAA-MM-JJ, ou null si le filtre est absent.
     */
    private function dateValide(string $brut, string $nom): ?string
    {
        if ($brut === '') {
            return null;
        }

        if (preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/', $brut, $morceaux) !== 1
            || !checkdate((int) $morceaux[2], (int) $morceaux[3], (int) $morceaux[1])) {
            Response::erreur('La date ' . $nom . ' est invalide.', 400);
        }

        return $brut;
    }

    /**
     * GET /api/commande/reprise?numero=CC-2026-000123 : ce qu'on peut recommander
     * d'une ancienne commande (US SUI-a).
     *
     * Réponse : { numero, lignes: [{ variantId, nom, libelle, quantiteDemandee, quantite,
     * options: [idChoix], statut, motif }] }. statut vaut « ok », « ajustee » (stock
     * partiel : quantite < quantiteDemandee) ou « indisponible » (quantite vaut 0, motif
     * dit pourquoi). Rien n'est écrit : le front ajoute les lignes au panier, et la
     * validation relira tout.
     * Erreurs : 401 si personne n'est connecté, 400 si le numéro est mal formé, 404 si la
     * commande n'existe pas ou appartient à un autre client.
     */
    public function reprise(Request $requete): void
    {
        $utilisateurId = $this->utilisateurConnecte('Connecte-toi pour commander à nouveau.');
        $numero        = $requete->parametre('numero', '');

        if (preg_match('/^CC-[0-9]{4}-[0-9]{6,}$/', $numero) !== 1) {
            Response::erreur('Le numéro de commande est absent ou invalide.', 400);
        }

        $reprise = $this->commandes->preparerReprise($numero, $utilisateurId);

        if ($reprise === null) {
            Response::erreur('Commande introuvable.', 404);
        }

        Response::json($reprise);
    }

    /**
     * L'identifiant du client connecté, lu dans la session.
     *
     * @param string $message Le message de l'erreur 401 si personne n'est connecté.
     */
    private function utilisateurConnecte(string $message): int
    {
        if (!isset($_SESSION['utilisateurId'])) {
            Response::erreur($message, 401);
        }

        return (int) $_SESSION['utilisateurId'];
    }

    /**
     * Contrôle les lignes reçues : un tableau non vide de { variantId, quantite,
     * options } où variante, quantité et identifiants d'options sont des entiers
     * positifs, sans couple variante + options en double (un même format peut
     * revenir avec des options différentes). Les options sont triées et
     * dédoublonnées ; absentes, elles valent [].
     *
     * @param mixed $brut La valeur du corps JSON, de n'importe quel type.
     * @return array<int, array{variantId:int, quantite:int, options:array<int, int>}>
     */
    private function lignesValides(mixed $brut): array
    {
        if (!is_array($brut) || !array_is_list($brut) || $brut === []) {
            Response::erreur('Ta commande ne contient aucun article.', 400);
        }

        if (count($brut) > self::LIGNES_MAX) {
            Response::erreur('Ta commande contient trop de lignes.', 400);
        }

        $lignes = array_map(
            static function (mixed $ligne): ?array {
                if (!is_array($ligne)
                    || !is_int($ligne['variantId'] ?? null) || $ligne['variantId'] < 1
                    || !is_int($ligne['quantite'] ?? null)
                    || $ligne['quantite'] < 1 || $ligne['quantite'] > self::QUANTITE_MAX) {
                    return null;
                }

                $options = $ligne['options'] ?? [];

                if (!is_array($options) || !array_is_list($options) || count($options) > self::OPTIONS_MAX
                    || array_filter($options, static fn (mixed $id): bool => !is_int($id) || $id < 1) !== []) {
                    return null;
                }

                $options = array_values(array_unique($options));
                sort($options);

                return ['variantId' => $ligne['variantId'], 'quantite' => $ligne['quantite'], 'options' => $options];
            },
            $brut
        );

        // Un couple variante + options ne peut figurer qu'une fois.
        $cles = array_map(
            static fn (?array $ligne): ?string => $ligne === null
                ? null
                : $ligne['variantId'] . ':' . implode(',', $ligne['options']),
            $lignes
        );

        if (in_array(null, $lignes, true) || count(array_unique($cles)) !== count($cles)) {
            Response::erreur('Les articles de ta commande sont invalides.', 400);
        }

        return $lignes;
    }
}
