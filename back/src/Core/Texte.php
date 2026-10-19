<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Petits outils de texte partagés par les contrôleurs du back-office.
 */
final class Texte
{
    /**
     * Texte reçu sans espaces superflus (début, fin et doublons).
     *
     * @param mixed $valeur La valeur du corps JSON, de n'importe quel type.
     * @return string Le texte nettoyé, ou '' si la valeur n'est pas un texte.
     */
    public static function nettoyer(mixed $valeur): string
    {
        if (!is_string($valeur)) {
            return '';
        }

        return trim((string) preg_replace('/\s+/u', ' ', $valeur));
    }

    /**
     * Slug d'un nom : minuscules, sans accents, mots séparés par des tirets.
     * « Sans Lactose » devient « sans-lactose ».
     *
     * @return string Le slug, ou '' si le nom ne contient ni lettre ni chiffre.
     */
    public static function slug(string $libelle): string
    {
        $sansAccents = strtr(mb_strtolower($libelle), [
            'à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
            'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u',
            'ç' => 'c', 'œ' => 'oe', 'æ' => 'ae', 'ÿ' => 'y',
        ]);

        return trim((string) preg_replace('/[^a-z0-9]+/', '-', $sansAccents), '-');
    }
}
