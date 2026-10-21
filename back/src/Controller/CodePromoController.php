<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\CodePromoModel;

/**
 * Vérification d'un code promotionnel avant la commande (US PRO-a).
 *
 * Le client connecté tape un code sur le récapitulatif de sa commande ; cette
 * route lui dit si le code est valable et de combien de pourcents. Elle ne
 * réserve rien : la commande revérifie le code au moment de la validation.
 */
final class CodePromoController
{
    /** Nombre d'essais ratés tolérés par fenêtre, contre la recherche de codes au hasard. */
    private const ESSAIS_MAX = 5;

    /** Durée de la fenêtre, en secondes. */
    private const FENETRE = 60;

    /** Le modèle des codes, fourni à la construction. */
    private CodePromoModel $codes;

    public function __construct(CodePromoModel $codes)
    {
        $this->codes = $codes;
    }

    /**
     * GET /api/code-promo?code=GLACE20 : le code est-il valable ?
     *
     * Réponse : { code, pourcentage } (le code en majuscules).
     * Erreurs : 401 si personne n'est connecté, 400 si le code est vide, 404 s'il est
     * inconnu ou désactivé (même message : on ne dit pas lequel), 429 après trop
     * d'essais ratés d'affilée.
     */
    public function verifier(Request $requete): void
    {
        if (!isset($_SESSION['utilisateurId'])) {
            Response::erreur('Connecte-toi pour utiliser un code promo.', 401);
        }

        $saisie = $requete->parametre('code', '');

        if (trim($saisie) === '') {
            Response::erreur('Saisis un code promo.', 400);
        }

        $maintenant = time();
        $echecs     = array_values(array_filter(
            is_array($_SESSION['codesRates'] ?? null) ? $_SESSION['codesRates'] : [],
            static fn (mixed $date): bool => is_int($date) && $date > $maintenant - self::FENETRE
        ));

        if (count($echecs) >= self::ESSAIS_MAX) {
            Response::erreur('Trop d\'essais : réessaie dans une minute.', 429);
        }

        $code = $this->codes->trouverActif($saisie);

        if ($code === null) {
            $_SESSION['codesRates'] = array_merge($echecs, [$maintenant]);
            Response::erreur('Ce code promo n\'est pas valable.', 404);
        }

        Response::json($code);
    }
}
