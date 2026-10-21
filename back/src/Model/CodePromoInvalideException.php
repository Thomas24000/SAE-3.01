<?php

declare(strict_types=1);

namespace App\Model;

use DomainException;

/**
 * Le code promotionnel d'une commande n'est pas valable (inconnu ou désactivé).
 *
 * C'est une DomainException particulière : le contrôleur la distingue des autres
 * refus de commande (stock, options) pour que le front retire le code appliqué.
 */
final class CodePromoInvalideException extends DomainException
{
}
