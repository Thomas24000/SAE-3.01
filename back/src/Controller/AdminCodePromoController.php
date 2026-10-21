<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Core\SessionAdmin;
use App\Model\CodePromoModel;
use DomainException;
use PDOException;

/**
 * Gestion des codes promotionnels par les administrateurs (US PRO-b).
 *
 * Toute route exige une session administrateur ; les écritures exigent en plus le
 * jeton CSRF. Le serveur revalide tout : le formulaire du navigateur ne fait pas foi.
 * Un code ne se renomme pas (les commandes passées le citent) ; on change son
 * pourcentage ou on le désactive, et on ne supprime qu'un code jamais utilisé.
 */
final class AdminCodePromoController
{
    /** Forme d'un code : 3 à 30 caractères, lettres majuscules, chiffres, « - » et « _ ». */
    private const FORMAT_CODE = '/^[A-Z0-9][A-Z0-9_-]{2,29}$/';

    /** Le modèle des codes, fourni à la construction. */
    private CodePromoModel $codes;

    public function __construct(CodePromoModel $codes)
    {
        $this->codes = $codes;
    }

    /**
     * GET /api/admin/codes-promo : les codes avec leurs statistiques d'utilisation.
     *
     * Réponse : { codes: [{ id, code, pourcentage, actif, creeLe, utilisations, reductionCents,
     * chiffreAffairesCents, derniereUtilisation, supprimable }], resume: { nombre, actifs,
     * utilisations, reductionCents } }. Les utilisations ne comptent pas les commandes annulées.
     * Erreur : 401 sans session administrateur.
     */
    public function index(): void
    {
        SessionAdmin::exiger();

        $codes = $this->codes->lister();

        Response::json([
            'codes'  => $codes,
            'resume' => [
                'nombre'         => count($codes),
                'actifs'         => count(array_filter($codes, static fn (array $code): bool => $code['actif'])),
                'utilisations'   => array_sum(array_column($codes, 'utilisations')),
                'reductionCents' => array_sum(array_column($codes, 'reductionCents')),
            ],
        ]);
    }

    /**
     * POST /api/admin/codes-promo : crée un code.
     *
     * Corps : { code, pourcentage, actif? } (actif vaut vrai par défaut)
     * Réponse (201) : { code: { id, code, pourcentage, actif } }
     * Erreurs : 401, 403 (jeton CSRF), 400 (code ou pourcentage invalide), 409 (code déjà pris).
     */
    public function create(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);
        $corps       = $requete->corps();
        $code        = $this->codeValide($corps['code'] ?? null);
        $pourcentage = $this->pourcentageValide($corps['pourcentage'] ?? null);
        $actif       = $this->actifValide($corps['actif'] ?? true);

        try {
            $id = $this->codes->creer($code, $pourcentage, $actif);
        } catch (PDOException $e) {
            // 23000 : violation de contrainte, ici l'unicité du code.
            if ($e->getCode() === '23000') {
                Response::erreur('Ce code existe déjà.', 409);
            }
            throw $e;
        }

        Response::json(['code' => ['id' => $id, 'code' => $code, 'pourcentage' => $pourcentage, 'actif' => $actif]], 201);
    }

    /**
     * POST /api/admin/codes-promo/modifier : change le pourcentage et l'état d'un code.
     *
     * Corps : { id, pourcentage, actif }
     * Réponse : { code: { id, pourcentage, actif } }
     * Erreurs : 401, 403, 400 (champ invalide), 404 (code inconnu).
     */
    public function update(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);
        $corps       = $requete->corps();
        $id          = $this->identifiant($corps['id'] ?? null);
        $pourcentage = $this->pourcentageValide($corps['pourcentage'] ?? null);
        $actif       = $this->actifValide($corps['actif'] ?? null);

        if (!$this->codes->modifier($id, $pourcentage, $actif)) {
            Response::erreur('Code promo introuvable.', 404);
        }

        Response::json(['code' => ['id' => $id, 'pourcentage' => $pourcentage, 'actif' => $actif]]);
    }

    /**
     * POST /api/admin/codes-promo/supprimer : supprime un code jamais utilisé.
     *
     * Corps : { id }
     * Réponse : { supprime: true }
     * Erreurs : 401, 403, 400 (identifiant invalide), 404 (code inconnu), 409 (code déjà utilisé :
     * le désactiver plutôt).
     */
    public function delete(Request $requete): void
    {
        SessionAdmin::exigerEcriture($requete);
        $id = $this->identifiant($requete->corps()['id'] ?? null);

        try {
            $this->codes->supprimer($id);
        } catch (DomainException $e) {
            Response::erreur($e->getMessage(), $e->getCode() > 0 ? $e->getCode() : 400);
        }

        Response::json(['supprime' => true]);
    }

    /**
     * Vérifie un code reçu et le met en majuscules.
     */
    private function codeValide(mixed $valeur): string
    {
        $code = is_string($valeur) ? CodePromoModel::normaliser($valeur) : '';

        if (preg_match(self::FORMAT_CODE, $code) !== 1) {
            Response::erreur(
                'Le code doit contenir de 3 à 30 caractères : lettres, chiffres, « - » ou « _ ».',
                400
            );
        }

        return $code;
    }

    /**
     * Vérifie un pourcentage reçu : un entier de 1 à 100.
     */
    private function pourcentageValide(mixed $valeur): int
    {
        if (is_string($valeur) && preg_match('/^[0-9]{1,3}$/', $valeur) === 1) {
            $valeur = (int) $valeur;
        }

        if (!is_int($valeur) || $valeur < 1 || $valeur > 100) {
            Response::erreur('Le pourcentage doit être un nombre entier de 1 à 100.', 400);
        }

        return $valeur;
    }

    /**
     * Vérifie l'état reçu : un booléen.
     */
    private function actifValide(mixed $valeur): bool
    {
        if (!is_bool($valeur)) {
            Response::erreur('L\'état du code est invalide.', 400);
        }

        return $valeur;
    }

    /**
     * Identifiant de code reçu : un entier positif (400 sinon).
     */
    private function identifiant(mixed $valeur): int
    {
        if (is_int($valeur) && $valeur > 0) {
            return $valeur;
        }
        if (is_string($valeur) && preg_match('/^[1-9][0-9]{0,8}$/', $valeur) === 1) {
            return (int) $valeur;
        }

        Response::erreur('Identifiant de code promo invalide.', 400);
    }
}
