<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Response;
use App\Model\CommandeModel;
use App\Model\ParametreModel;
use App\Model\ProduitModel;

/**
 * Indicateurs du back-office, réservés aux administrateurs.
 */
final class StatsController
{
    /** Nombre de jours couverts par les revenus. */
    private const JOURS_REVENUS = 7;

    /** Nombre de produits dans le classement des meilleures ventes. */
    private const MEILLEURES_VENTES = 5;

    /** Le modèle du catalogue, fourni à la construction. */
    private ProduitModel $produits;

    /** Le modèle des commandes, fourni à la construction. */
    private CommandeModel $commandes;

    /** Le modèle des paramètres (seuil « Bientôt épuisé »), fourni à la construction. */
    private ParametreModel $parametres;

    public function __construct(ProduitModel $produits, CommandeModel $commandes, ParametreModel $parametres)
    {
        $this->produits   = $produits;
        $this->commandes  = $commandes;
        $this->parametres = $parametres;
    }

    /**
     * GET /api/admin/stats : les indicateurs du back-office.
     *
     * Réponse : { total (produits), stockTotal, prixMoyenCents,
     * parCategorie: [{ categorie, nombre }], commandes, commandesAujourdhui,
     * commandesEnCours, bientotEpuises (produits au stock ≤ seuil, épuisés compris) }.
     * Erreur : 401 si aucune session administrateur n'est ouverte.
     */
    public function index(): void
    {
        // La session est déjà ouverte par index.php.
        if (!isset($_SESSION['admin'])) {
            Response::erreur('Connexion administrateur requise.', 401);
        }

        $commandes = $this->commandes->statistiques();

        Response::json($this->produits->statistiques() + [
            'commandes'           => $commandes['total'],
            'commandesAujourdhui' => $commandes['aujourdhui'],
            'commandesEnCours'    => $commandes['enCours'],
            'bientotEpuises'      => $this->produits->compterSousSeuil($this->parametres->seuilBientotEpuise()),
        ]);
    }

    /**
     * GET /api/admin/statistiques : les statistiques détaillées (US PIL-a).
     *
     * Réponse : { genereLe, seuilBientotEpuise, stocks: [{ produit, categorie, stock }],
     * revenus: [{ jour, commandes, totalCents }] (7 derniers jours, annulées exclues),
     * commandes: { total, parStatut: { en_cours, prete, retiree, annulee } },
     * meilleuresVentes: [{ produit, quantite, totalCents }] (5, annulées exclues) }.
     * Les données sont relues à chaque appel et jamais mises en cache.
     * Erreur : 401 si aucune session administrateur n'est ouverte.
     */
    public function detail(): void
    {
        if (!isset($_SESSION['admin'])) {
            Response::erreur('Connexion administrateur requise.', 401);
        }

        $parStatut = $this->commandes->repartitionParStatut();

        // Des chiffres qui changent à chaque commande : le navigateur ne doit rien garder.
        header('Cache-Control: no-store');

        Response::json([
            'genereLe'           => $this->commandes->maintenant(),
            'seuilBientotEpuise' => $this->parametres->seuilBientotEpuise(),
            'stocks'             => $this->produits->stocksParProduit(),
            'revenus'            => $this->commandes->revenusParJour(self::JOURS_REVENUS),
            'commandes'          => ['total' => array_sum($parStatut), 'parStatut' => $parStatut],
            'meilleuresVentes'   => $this->commandes->produitsLesPlusVendus(self::MEILLEURES_VENTES),
        ]);
    }
}
