<?php

declare(strict_types=1);

namespace App\Core;

use DomainException;

/**
 * Réception, contrôle et redimensionnement des images téléversées (US GOF-a).
 *
 * Une image reçue n'est jamais conservée telle quelle : on vérifie son contenu
 * réel (et non son nom ni le type annoncé par le navigateur), puis on la
 * réencode en JPEG avec GD. Cela supprime les métadonnées et tout contenu
 * étranger caché dans le fichier. Le nom du fichier est aléatoire.
 */
final class Televersement
{
    /** Taille maximale d'un fichier reçu, en octets (5 Mo). */
    public const TAILLE_MAX = 5 * 1024 * 1024;

    /** Plus grand côté de l'image enregistrée, en pixels. */
    private const COTE_MAX = 1200;

    /** Plus grand côté de la miniature, en pixels. */
    private const COTE_MINIATURE = 400;

    /** Au-delà, l'image est refusée : GD décompresse tout en mémoire. */
    private const DIMENSION_MAX = 8000;

    private const QUALITE_JPEG = 85;

    /** Dossier relatif à la racine du site, où sont rangées les images. */
    private const DOSSIER_RELATIF = 'uploads/produits';

    /** Fonction GD de lecture, selon le type réel de l'image. */
    private const LECTEURS = [
        'image/jpeg' => 'imagecreatefromjpeg',
        'image/png'  => 'imagecreatefrompng',
        'image/webp' => 'imagecreatefromwebp',
    ];

    /**
     * Contrôle, redimensionne et enregistre une image téléversée.
     *
     * @param array{name:string, tmp_name:string, error:int, size:int} $fichier Un élément de Request::fichiers().
     * @return string Chemin de l'image, relatif à la racine du site
     *                (ex. « uploads/produits/3fa9c2e1b7d04a58.jpg »). La miniature se
     *                déduit avec cheminMiniature().
     * @throws DomainException Avec un message en français si le fichier est refusé.
     */
    public static function enregistrerImage(array $fichier): string
    {
        if (!function_exists('imagecreatetruecolor')) {
            throw new DomainException('Le traitement des images n\'est pas disponible sur le serveur.');
        }

        if ($fichier['error'] === UPLOAD_ERR_INI_SIZE || $fichier['error'] === UPLOAD_ERR_FORM_SIZE) {
            throw new DomainException('L\'image dépasse la taille autorisée (5 Mo).');
        }
        if ($fichier['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($fichier['tmp_name'])) {
            throw new DomainException('Le téléversement a échoué : réessayez.');
        }
        if ($fichier['size'] > self::TAILLE_MAX) {
            throw new DomainException('L\'image dépasse la taille autorisée (5 Mo).');
        }

        $infos = @getimagesize($fichier['tmp_name']);
        $type  = is_array($infos) ? (string) ($infos['mime'] ?? '') : '';
        if ($infos === false || !isset(self::LECTEURS[$type])) {
            throw new DomainException('Le fichier doit être une image JPG, PNG ou WebP.');
        }
        if ($infos[0] > self::DIMENSION_MAX || $infos[1] > self::DIMENSION_MAX) {
            throw new DomainException('L\'image est trop grande (8000 pixels au maximum par côté).');
        }

        $lecteur = self::LECTEURS[$type];
        $source  = @$lecteur($fichier['tmp_name']);
        if ($source === false) {
            throw new DomainException('L\'image est illisible ou corrompue.');
        }
        $source = self::redresser($source, $fichier['tmp_name'], $type);

        $dossier = dirname(__DIR__, 3) . '/' . self::DOSSIER_RELATIF;
        if (!is_dir($dossier) && !mkdir($dossier, 0755, true) && !is_dir($dossier)) {
            throw new DomainException('Impossible d\'enregistrer l\'image sur le serveur.');
        }

        $nom    = bin2hex(random_bytes(8));
        $chemin = self::DOSSIER_RELATIF . '/' . $nom . '.jpg';

        $principale = self::reduire($source, self::COTE_MAX);
        $miniature  = self::reduire($source, self::COTE_MINIATURE);

        $ecrites = imagejpeg($principale, dirname(__DIR__, 3) . '/' . $chemin, self::QUALITE_JPEG)
            && imagejpeg($miniature, dirname(__DIR__, 3) . '/' . self::cheminMiniature($chemin), self::QUALITE_JPEG);
        if (!$ecrites) {
            self::supprimer($chemin);
            throw new DomainException('Impossible d\'enregistrer l\'image sur le serveur.');
        }

        return $chemin;
    }

    /**
     * Chemin de la miniature d'une image téléversée.
     *
     * @param string $chemin Chemin relatif de l'image.
     * @return string Le chemin de la miniature, ou le même chemin pour une image
     *                qui n'a pas été téléversée (visuel d'origine du catalogue).
     */
    public static function cheminMiniature(string $chemin): string
    {
        if (!self::estTeleversee($chemin)) {
            return $chemin;
        }

        return substr($chemin, 0, -4) . '-m.jpg';
    }

    /**
     * Supprime du disque une image téléversée et sa miniature. Les chemins qui
     * ne viennent pas d'un téléversement (visuels du catalogue) sont ignorés.
     *
     * @param string $chemin Chemin relatif de l'image.
     */
    public static function supprimer(string $chemin): void
    {
        if (!self::estTeleversee($chemin)) {
            return;
        }

        @unlink(dirname(__DIR__, 3) . '/' . $chemin);
        @unlink(dirname(__DIR__, 3) . '/' . self::cheminMiniature($chemin));
    }

    /**
     * Le chemin désigne-t-il une image produite par enregistrerImage() ?
     */
    private static function estTeleversee(string $chemin): bool
    {
        return preg_match('#^' . self::DOSSIER_RELATIF . '/[a-f0-9]{16}\.jpg$#', $chemin) === 1;
    }

    /**
     * Applique l'orientation EXIF d'une photo (un téléphone tenu à la verticale
     * enregistre l'image couchée), puisque le réencodage supprime ces métadonnées.
     *
     * @param \GdImage $image L'image lue.
     * @return \GdImage L'image dans le bon sens.
     */
    private static function redresser(\GdImage $image, string $fichier, string $type): \GdImage
    {
        if ($type !== 'image/jpeg' || !function_exists('exif_read_data')) {
            return $image;
        }

        $exif        = @exif_read_data($fichier);
        $orientation = is_array($exif) ? (int) ($exif['Orientation'] ?? 1) : 1;
        $angle       = [3 => 180, 6 => -90, 8 => 90][$orientation] ?? 0;

        if ($angle === 0) {
            return $image;
        }

        $tournee = imagerotate($image, $angle, 0);

        return $tournee === false ? $image : $tournee;
    }

    /**
     * Copie réduite d'une image : son plus grand côté ne dépasse pas $cote, sans
     * jamais agrandir. Le fond est blanc (une transparence PNG devient blanche).
     *
     * @param \GdImage $source L'image d'origine.
     * @param int $cote Plus grand côté autorisé, en pixels.
     * @return \GdImage La nouvelle image.
     */
    private static function reduire(\GdImage $source, int $cote): \GdImage
    {
        $largeur = imagesx($source);
        $hauteur = imagesy($source);
        $ratio   = min(1.0, $cote / max($largeur, $hauteur));
        $nouvelleLargeur = max(1, (int) round($largeur * $ratio));
        $nouvelleHauteur = max(1, (int) round($hauteur * $ratio));

        $copie = imagecreatetruecolor($nouvelleLargeur, $nouvelleHauteur);
        imagefill($copie, 0, 0, (int) imagecolorallocate($copie, 255, 255, 255));
        imagecopyresampled($copie, $source, 0, 0, 0, 0, $nouvelleLargeur, $nouvelleHauteur, $largeur, $hauteur);

        return $copie;
    }
}
