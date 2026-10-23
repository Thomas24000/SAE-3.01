-- ---------------------------------------------------------------------------
-- SAE301 Ben & Jerry's — base de données complète
--
-- Ce script crée toutes les tables de l'application, puis charge le catalogue
-- et les données de démonstration. Importez-le depuis phpMyAdmin, dans votre
-- base. Il est rejouable : les tables sont supprimées avant d'être recréées
-- (y compris celles d'une ancienne version du schéma).
--
-- Organisation :
--   1. Catalogue    : catégories, produits, images, allergènes, formats,
--                     choix (services et toppings)
--   2. Variantes    : produit x format x service, avec prix et stock
--   3. Utilisateurs
--   4. Promotions et paramètres
--   5. Commandes, stock et journaux
--   6. Données      : catalogue, puis démonstration (comptes, codes promo)
--
-- Les prix sont des entiers en centimes. Les textes longs des produits sont des
-- exemples provisoires, pas les vraies informations produit.
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

DROP TABLE IF EXISTS journal_commande;
DROP TABLE IF EXISTS mouvement_topping;
DROP TABLE IF EXISTS mouvement_stock;
DROP TABLE IF EXISTS ligne_commande_option;
DROP TABLE IF EXISTS ligne_commande;
DROP TABLE IF EXISTS commande;
DROP TABLE IF EXISTS statut_commande;
DROP TABLE IF EXISTS parametre;
DROP TABLE IF EXISTS code_promo;
DROP TABLE IF EXISTS utilisateur;
DROP TABLE IF EXISTS variante;
DROP TABLE IF EXISTS categorie_topping;
DROP TABLE IF EXISTS option_choix;
DROP TABLE IF EXISTS option_groupe;
DROP TABLE IF EXISTS format;
DROP TABLE IF EXISTS produit_allergene;
DROP TABLE IF EXISTS allergene;
DROP TABLE IF EXISTS produit_image;
DROP TABLE IF EXISTS produit;
DROP TABLE IF EXISTS categorie;

-- ===========================================================================
-- 1. Catalogue
-- ===========================================================================

-- Les formats, services et toppings sont des référentiels partagés par tous les
-- produits : on ne les recopie jamais produit par produit.
CREATE TABLE categorie (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    libelle     VARCHAR(60)  NOT NULL,
    slug        VARCHAR(60)  NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    cree_le     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modifie_le  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_categorie_slug (slug)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- teinte : angle de couleur (0-359) qui colore le fond de la carte.
CREATE TABLE produit (
    id                 INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    categorie_id       INT UNSIGNED      NOT NULL,
    nom                VARCHAR(120)      NOT NULL,
    slug               VARCHAR(120)      NOT NULL,
    description        VARCHAR(400)      NOT NULL,
    description_longue VARCHAR(800)      NOT NULL,
    ingredients        VARCHAR(600)      NOT NULL,
    teinte             SMALLINT UNSIGNED NOT NULL,
    cree_le            DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modifie_le         DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_produit_slug (slug),
    KEY idx_produit_categorie (categorie_id),

    CONSTRAINT fk_produit_categorie
        FOREIGN KEY (categorie_id) REFERENCES categorie (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Galerie d'un produit. position 1 = visuel principal. chemin : relatif à la
-- racine du site (front/public/).
CREATE TABLE produit_image (
    id         INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    produit_id INT UNSIGNED     NOT NULL,
    chemin     VARCHAR(200)     NOT NULL,
    position   TINYINT UNSIGNED NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_produit_image_position (produit_id, position),

    CONSTRAINT fk_produit_image_produit
        FOREIGN KEY (produit_id) REFERENCES produit (id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Allergènes à déclaration obligatoire : une ligne par allergène, reliée aux
-- produits (et non écrite dans le texte des ingrédients).
CREATE TABLE allergene (
    id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code    VARCHAR(30)  NOT NULL,
    libelle VARCHAR(60)  NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_allergene_code (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE produit_allergene (
    produit_id   INT UNSIGNED NOT NULL,
    allergene_id INT UNSIGNED NOT NULL,

    PRIMARY KEY (produit_id, allergene_id),

    CONSTRAINT fk_produit_allergene_produit
        FOREIGN KEY (produit_id) REFERENCES produit (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_produit_allergene_allergene
        FOREIGN KEY (allergene_id) REFERENCES allergene (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Formats de pot, partagés par tous les produits.
CREATE TABLE format (
    id            INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    libelle       VARCHAR(60)       NOT NULL,
    contenance_ml SMALLINT UNSIGNED NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_format_libelle (libelle)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Choix proposés au client, partagés par tous les produits : le service
-- (cuillère, coupelle, cône : choix unique, obligatoire, qui multiplie les
-- variantes) et les toppings (choix multiple, facultatif, sans stock).
-- Une seule table pour que l'identifiant d'un choix soit unique quel que soit
-- son type : le panier garde une simple liste d'identifiants. supplement_cents
-- s'ajoute au prix de la variante. La clé (id, type) permet aux tables qui
-- suivent d'imposer le type attendu par une clé étrangère composite.
-- stock : nombre de doses d'un topping, commun à tous les produits (une commande
-- en consomme une par topping). NULL pour un service, dont le stock est porté
-- par les variantes.

CREATE TABLE option_choix (
    id               INT UNSIGNED             NOT NULL AUTO_INCREMENT,
    type             ENUM('service', 'topping') NOT NULL,
    libelle          VARCHAR(60)              NOT NULL,
    supplement_cents INT UNSIGNED             NOT NULL DEFAULT 0,
    stock            INT UNSIGNED             NULL,
    position         TINYINT UNSIGNED         NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_option_choix_libelle (type, libelle),
    UNIQUE KEY uq_option_choix_type (id, type),
    CONSTRAINT ck_option_choix_stock CHECK ((type = 'topping') = (stock IS NOT NULL))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Toppings proposés par catégorie (pas de chantilly, qui contient du lait, en
-- sans lactose). type vaut toujours « topping » : la clé composite refuse un
-- choix d'un autre type.
CREATE TABLE categorie_topping (
    categorie_id INT UNSIGNED       NOT NULL,
    choix_id     INT UNSIGNED       NOT NULL,
    type         ENUM('service', 'topping') NOT NULL DEFAULT 'topping',

    PRIMARY KEY (categorie_id, choix_id),
    -- Même ENUM que option_choix (une clé étrangère compare les indices des
    -- valeurs) : le CHECK fixe la seule valeur permise.
    CONSTRAINT ck_categorie_topping_type CHECK (type = 'topping'),

    CONSTRAINT fk_categorie_topping_categorie
        FOREIGN KEY (categorie_id) REFERENCES categorie (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_categorie_topping_choix
        FOREIGN KEY (choix_id, type) REFERENCES option_choix (id, type)
        ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ===========================================================================
-- 2. Variantes
-- ===========================================================================

-- Une variante est une combinaison produit x format x service (un choix de type
-- « service » de option_choix). Elle porte le prix de base (centimes, sans le
-- supplément du service) et le stock. Une combinaison absente de cette table
-- n'existe pas.
CREATE TABLE variante (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    produit_id INT UNSIGNED NOT NULL,
    format_id  INT UNSIGNED NOT NULL,
    service_id INT UNSIGNED NOT NULL,
    service_type ENUM('service', 'topping') NOT NULL DEFAULT 'service',
    prix_cents INT UNSIGNED NOT NULL,
    stock      INT UNSIGNED NOT NULL DEFAULT 0,
    cree_le    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modifie_le DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_variante_combinaison (produit_id, format_id, service_id),
    KEY idx_variante_format (format_id),
    KEY idx_variante_service (service_id),
    -- Dernier garde-fou : le stock ne peut jamais être négatif.
    CONSTRAINT ck_variante_stock CHECK (stock >= 0),
    CONSTRAINT ck_variante_service_type CHECK (service_type = 'service'),

    CONSTRAINT fk_variante_produit
        FOREIGN KEY (produit_id) REFERENCES produit (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_variante_format
        FOREIGN KEY (format_id) REFERENCES format (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    -- service_type vaut toujours « service » : la clé composite refuse un topping.
    CONSTRAINT fk_variante_service
        FOREIGN KEY (service_id, service_type) REFERENCES option_choix (id, type)
        ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ===========================================================================
-- 3. Utilisateurs
-- ===========================================================================

-- email : identifiant de connexion, stocké en minuscules.
-- mot_de_passe : hachage de password_hash(), jamais le mot de passe en clair.
-- role : décidé côté serveur, le navigateur ne peut pas le choisir.
CREATE TABLE utilisateur (
    id           INT UNSIGNED            NOT NULL AUTO_INCREMENT,
    email        VARCHAR(254)            NOT NULL,
    nom          VARCHAR(100)            NULL,
    mot_de_passe VARCHAR(255)            NOT NULL,
    role         ENUM('client', 'admin') NOT NULL DEFAULT 'client',
    cree_le      DATETIME                NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modifie_le   DATETIME                NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_utilisateur_email (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ===========================================================================
-- 4. Promotions et paramètres
-- ===========================================================================

-- code : saisi par le client, stocké en MAJUSCULES (la recherche ignore la
-- casse). actif = 0 : le code n'est plus accepté mais reste dans l'historique.
CREATE TABLE code_promo (
    id          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    code        VARCHAR(30)      NOT NULL,
    pourcentage TINYINT UNSIGNED NOT NULL,
    actif       TINYINT(1)       NOT NULL DEFAULT 1,
    cree_le     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modifie_le  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_code_promo_code (code),
    CONSTRAINT ck_code_promo_pourcentage CHECK (pourcentage BETWEEN 1 AND 100)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Réglages de l'application (clé / valeur).
CREATE TABLE parametre (
    cle    VARCHAR(60)  NOT NULL,
    valeur VARCHAR(255) NOT NULL,

    PRIMARY KEY (cle)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ===========================================================================
-- 5. Commandes, stock et journaux
-- ===========================================================================

-- Commandes. Les lignes sont des instantanés : libellés et prix copiés à la
-- validation, pour qu'une modification du catalogue ne change jamais une
-- commande passée.

CREATE TABLE statut_commande (
    code    VARCHAR(20)      NOT NULL,
    libelle VARCHAR(60)      NOT NULL,
    ordre   TINYINT UNSIGNED NOT NULL,

    PRIMARY KEY (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT INTO statut_commande (code, libelle, ordre) VALUES
    ('en_cours', 'En cours de préparation', 1),
    ('prete',    'Prête à retirer',          2),
    ('retiree',  'Retirée',                  3),
    ('annulee',  'Annulée',                  4);

-- numero : numéro lisible et unique (ex. CC-2026-000123), fabriqué par l'API.
-- total_cents : total à payer, remise déduite. Sous-total = total + remise.
-- code_promo, reduction_* : copiés à la validation, volontairement sans clé
-- étrangère vers code_promo.
CREATE TABLE commande (
    id                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    numero             VARCHAR(20)      NOT NULL,
    utilisateur_id     INT UNSIGNED     NOT NULL,
    statut             VARCHAR(20)      NOT NULL DEFAULT 'en_cours',
    total_cents        INT UNSIGNED     NOT NULL,
    code_promo         VARCHAR(30)      NULL,
    reduction_pourcent TINYINT UNSIGNED NULL,
    reduction_cents    INT UNSIGNED     NOT NULL DEFAULT 0,
    cree_le            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modifie_le         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_commande_numero (numero),
    KEY idx_commande_utilisateur (utilisateur_id),
    KEY idx_commande_statut (statut),

    CONSTRAINT fk_commande_utilisateur
        FOREIGN KEY (utilisateur_id) REFERENCES utilisateur (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_commande_statut
        FOREIGN KEY (statut) REFERENCES statut_commande (code)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- variante_id passe à NULL si la variante est supprimée : la ligne reste
-- lisible grâce à l'instantané. prix_unitaire_cents comprend le prix de la
-- variante, le supplément du service et ceux des toppings.
CREATE TABLE ligne_commande (
    id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    commande_id         INT UNSIGNED      NOT NULL,
    variante_id         INT UNSIGNED      NULL,
    produit_nom         VARCHAR(120)      NOT NULL,
    variante_libelle    VARCHAR(60)       NOT NULL,
    prix_unitaire_cents INT UNSIGNED      NOT NULL,
    quantite            SMALLINT UNSIGNED NOT NULL,

    PRIMARY KEY (id),
    KEY idx_ligne_commande (commande_id),

    CONSTRAINT fk_ligne_commande
        FOREIGN KEY (commande_id) REFERENCES commande (id) ON DELETE CASCADE,
    CONSTRAINT fk_ligne_variante
        FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Toppings (et service) d'une ligne, en instantané : aucune clé vers le catalogue.
CREATE TABLE ligne_commande_option (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ligne_id         INT UNSIGNED NOT NULL,
    groupe_libelle   VARCHAR(60)  NOT NULL,
    choix_libelle    VARCHAR(60)  NOT NULL,
    supplement_cents INT UNSIGNED NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    KEY idx_ligne_commande_option (ligne_id),

    CONSTRAINT fk_ligne_commande_option
        FOREIGN KEY (ligne_id) REFERENCES ligne_commande (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Journal des mouvements de stock : « sortie » à la validation, « retour » à
-- l'annulation. quantite est positive, le sens est donné par le type. La clé
-- unique rend chaque mouvement idempotent. Conservé si la variante disparaît.
CREATE TABLE mouvement_stock (
    id          INT UNSIGNED             NOT NULL AUTO_INCREMENT,
    variante_id INT UNSIGNED             NULL,
    commande_id INT UNSIGNED             NOT NULL,
    type        ENUM('sortie', 'retour') NOT NULL,
    quantite    SMALLINT UNSIGNED        NOT NULL,
    stock_avant INT UNSIGNED             NOT NULL,
    stock_apres INT UNSIGNED             NOT NULL,
    cree_le     DATETIME                 NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_mouvement (commande_id, variante_id, type),
    KEY idx_mouvement_variante (variante_id),

    CONSTRAINT fk_mouvement_variante
        FOREIGN KEY (variante_id) REFERENCES variante (id) ON DELETE SET NULL,
    CONSTRAINT fk_mouvement_commande
        FOREIGN KEY (commande_id) REFERENCES commande (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Journal des doses de toppings : une ligne par topping et par commande (une
-- dose par commande), « sortie » à la validation, « retour » à l'annulation.
-- Même principe que mouvement_stock : la clé unique rend le mouvement
-- idempotent, le journal survit à la suppression du topping (choix_id NULL).
CREATE TABLE mouvement_topping (
    id          INT UNSIGNED             NOT NULL AUTO_INCREMENT,
    choix_id    INT UNSIGNED             NULL,
    commande_id INT UNSIGNED             NOT NULL,
    type        ENUM('sortie', 'retour') NOT NULL,
    stock_avant INT UNSIGNED             NOT NULL,
    stock_apres INT UNSIGNED             NOT NULL,
    cree_le     DATETIME                 NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_mouvement_topping (commande_id, choix_id, type),
    KEY idx_mouvement_topping_choix (choix_id),

    CONSTRAINT fk_mouvement_topping_choix
        FOREIGN KEY (choix_id) REFERENCES option_choix (id) ON DELETE SET NULL,
    CONSTRAINT fk_mouvement_topping_commande
        FOREIGN KEY (commande_id) REFERENCES commande (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Journal des changements de statut par les administrateurs, écrit dans la même
-- transaction que le changement. Jamais modifié ; un admin référencé ne peut
-- pas être supprimé.
CREATE TABLE journal_commande (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    commande_id    INT UNSIGNED NOT NULL,
    admin_id       INT UNSIGNED NOT NULL,
    ancien_statut  VARCHAR(20)  NOT NULL,
    nouveau_statut VARCHAR(20)  NOT NULL,
    cree_le        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_journal_commande (commande_id),
    KEY idx_journal_admin (admin_id),

    CONSTRAINT fk_journal_commande
        FOREIGN KEY (commande_id) REFERENCES commande (id) ON DELETE CASCADE,
    CONSTRAINT fk_journal_admin
        FOREIGN KEY (admin_id) REFERENCES utilisateur (id) ON DELETE RESTRICT,
    CONSTRAINT fk_journal_ancien_statut
        FOREIGN KEY (ancien_statut) REFERENCES statut_commande (code),
    CONSTRAINT fk_journal_nouveau_statut
        FOREIGN KEY (nouveau_statut) REFERENCES statut_commande (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ===========================================================================
-- 6. Données : catalogue
-- ===========================================================================

-- Jeu de données du catalogue : référentiels, produits, variantes. Les textes
-- longs sont des exemples provisoires, pas les vraies informations produit.

INSERT INTO categorie (id, libelle, slug, description) VALUES
    (1, 'Pots classiques', 'pots-classiques', 'Les parfums historiques de Ben & Jerry''s, en pot.'),
    (2, 'Sans lactose',    'sans-lactose',    'Recettes sans produits laitiers, à base de boisson à l''amande.'),
    (3, 'Sorbets',         'sorbets',         'Sorbets aux fruits, frais et sans produits laitiers.');

INSERT INTO format (id, libelle, contenance_ml) VALUES
    (1, 'Pot 100 ml', 100),
    (2, 'Pot 465 ml', 465);

INSERT INTO option_choix (id, type, libelle, supplement_cents, stock, position) VALUES
    (1,  'service', 'Cuillère en bois',        0,  NULL, 1),
    (2,  'service', 'Coupelle',                30, NULL, 2),
    (3,  'service', 'Cône gaufrette',          60, NULL, 3),
    (4,  'topping', 'Sauce chocolat',          50, 120, 1),
    (5,  'topping', 'Sauce caramel',           50, 90,  2),
    (6,  'topping', 'Chantilly',               40, 4,   3),
    (7,  'topping', 'Pépites de chocolat',     40, 60,  4),
    (8,  'topping', 'Amandes effilées',        40, 0,   5),
    (9,  'topping', 'Coulis de fruits rouges', 50, 45,  6),
    (10, 'topping', 'Feuilles de menthe',      30, 80,  7),
    (11, 'topping', 'Éclats de meringue',      40, 35,  8);

INSERT INTO categorie_topping (categorie_id, choix_id) VALUES
    (1, 4), (1, 5), (1, 6), (1, 7),
    (2, 4), (2, 5), (2, 8),
    (3, 9), (3, 10), (3, 11);

INSERT INTO allergene (id, code, libelle) VALUES
    (1, 'lait',           'Lait'),
    (2, 'oeufs',          'Œufs'),
    (3, 'ble',            'Blé (gluten)'),
    (4, 'soja',           'Soja'),
    (5, 'fruits-a-coque', 'Fruits à coque (amande)'),
    (6, 'arachides',      'Arachides');

INSERT INTO produit (id, categorie_id, nom, slug, description, description_longue, ingredients, teinte) VALUES
    (1,  1, 'Cookie Dough', 'cookie-dough',
     'Glace vanille avec des morceaux de pâte à cookie et des pépites de chocolat.',
     'Une glace onctueuse à la vanille, généreusement garnie de morceaux de pâte à cookie et de pépites de chocolat. Un grand classique de la maison, à savourer à la cuillère.',
     'Crème, lait écrémé, sucre, pâte à cookie (farine de blé, beurre, cassonade), pépites de chocolat, jaunes d''œufs, extrait de vanille.', 45),
    (2,  1, 'Chocolate Fudge Brownie', 'chocolate-fudge-brownie',
     'Glace au chocolat avec des morceaux de brownie fondants.',
     'Une glace au chocolat intense, riche en morceaux de brownie moelleux. Pour les amateurs de chocolat qui n''ont pas peur de la gourmandise.',
     'Crème, lait écrémé, sucre, cacao maigre, brownie (farine de blé, œufs, beurre, chocolat), jaunes d''œufs.', 20),
    (3,  1, 'Cherry Garcia', 'cherry-garcia',
     'Glace à la cerise avec des morceaux de cerises et des pépites de chocolat.',
     'Une glace à la cerise douce et acidulée, parsemée de vraies cerises et d''éclats de chocolat noir. Un duo fruité et gourmand.',
     'Crème, lait écrémé, sucre, cerises, pépites de chocolat noir, jaunes d''œufs, arôme naturel de cerise.', 350),
    (4,  1, 'Caramel Chew Chew', 'caramel-chew-chew',
     'Glace au caramel, swirl de caramel et morceaux de caramel fondant.',
     'Une glace au caramel soyeuse, traversée d''un swirl de caramel coulant et de morceaux de caramel fondants. Un voyage 100 % caramel.',
     'Crème, lait écrémé, sucre, caramel (sucre, crème, beurre), jaunes d''œufs, sel de mer.', 35),
    (5,  2, 'Cookie Dough Sans Lactose', 'cookie-dough-sans-lactose',
     'Pâte à cookie et pépites de chocolat sur une base à l''amande, sans lactose.',
     'La version sans lactose du grand classique : une base à l''amande légère, de la pâte à cookie et des pépites de chocolat.',
     'Boisson à l''amande, sucre, pâte à cookie (farine de blé, huile de coco, cassonade), pépites de chocolat, extrait de vanille.', 50),
    (6,  2, 'Peanut Butter Cup', 'peanut-butter-cup',
     'Glace au beurre de cacahuète, swirl de beurre de cacahuète et coques de chocolat.',
     'Du beurre de cacahuète à profusion, un swirl onctueux et de généreuses coques de chocolat croquantes. Sans lactose, pas sans plaisir.',
     'Boisson à l''amande, sucre, beurre de cacahuète, coques de chocolat, cacao.', 30),
    (7,  2, 'Chocolate Chip Cookie', 'chocolate-chip-cookie',
     'Glace cookie dough sur une base végétale, avec des pépites de chocolat.',
     'Une glace cookie dough sur base végétale, avec des pépites de chocolat et une pointe de vanille. Toute la gourmandise, sans lactose.',
     'Base végétale (amande), sucre, pâte à cookie (farine de blé, huile de coco), pépites de chocolat, extrait de vanille.', 40),
    (8,  2, 'Vanille Caramel Fudge', 'vanille-caramel-fudge',
     'Glace vanille, caramel et fudge sur une base à l''amande.',
     'Vanille douce, caramel et fudge se mêlent sur une base à l''amande. Un trio de saveurs rondes et fondantes, sans lactose.',
     'Boisson à l''amande, sucre, caramel, fudge (sucre, cacao, huile de coco), extrait de vanille.', 38),
    (9,  3, 'Mangue Passion', 'mangue-passion',
     'Sorbet à la mangue avec un swirl de fruit de la passion.',
     'Un sorbet à la mangue bien mûre, relevé d''un swirl de fruit de la passion. Exotique, frais et sans produits laitiers.',
     'Purée de mangue, sucre, eau, purée de fruit de la passion, jus de citron.', 42),
    (10, 3, 'Fraise Basilic', 'fraise-basilic',
     'Sorbet à la fraise parfumé au basilic, frais et acidulé.',
     'Un sorbet à la fraise rafraîchi par une touche de basilic. Une association fraîche et acidulée, parfaite en été.',
     'Purée de fraise, sucre, eau, basilic, jus de citron.', 0),
    (11, 3, 'Citron Menthe', 'citron-menthe',
     'Sorbet au citron avec des feuilles de menthe, très désaltérant.',
     'Un sorbet au citron vif et à la menthe fraîche, très désaltérant. L''idéal pour terminer un repas en douceur.',
     'Jus de citron, sucre, eau, feuilles de menthe, zeste de citron.', 95),
    (12, 3, 'Framboise Myrtille', 'framboise-myrtille',
     'Sorbet aux framboises et aux myrtilles, intense et fruité.',
     'Un sorbet intense aux framboises et aux myrtilles, riche en fruits. Fruité, profond et acidulé à souhait.',
     'Purée de framboise, purée de myrtille, sucre, eau, jus de citron.', 290);

INSERT INTO produit_allergene (produit_id, allergene_id) VALUES
    (1, 1), (1, 2), (1, 3), (1, 4),
    (2, 1), (2, 2), (2, 3), (2, 4),
    (3, 1), (3, 2), (3, 4),
    (4, 1), (4, 2),
    (5, 5), (5, 3), (5, 4),
    (6, 6), (6, 5), (6, 4),
    (7, 5), (7, 3), (7, 4),
    (8, 5), (8, 4);

-- Galerie provisoire : trois entrées par produit vers le même visuel, à
-- remplacer par de vraies photos.
INSERT INTO produit_image (produit_id, chemin, position)
SELECT produit.id, CONCAT('images/produits/', produit.slug, '.svg'), positions.n
  FROM produit
 CROSS JOIN (SELECT 1 AS n UNION SELECT 2 UNION SELECT 3) AS positions;

-- Variantes = produit x format x service. Le prix de base dépend de la
-- catégorie et du format ; le stock de départ, du produit et du format (chaque
-- service reçoit le même).
INSERT INTO variante (produit_id, format_id, service_id, prix_cents, stock)
SELECT produit.id, format.id, service.id, tarif.prix_cents, stock_depart.stock
  FROM produit
 CROSS JOIN format
  JOIN option_choix AS service ON service.type = 'service'
  JOIN (SELECT 1 AS categorie_id, 1 AS format_id, 290 AS prix_cents
  UNION SELECT 1, 2, 790 UNION SELECT 2, 1, 320 UNION SELECT 2, 2, 850
  UNION SELECT 3, 1, 270 UNION SELECT 3, 2, 720) AS tarif
    ON tarif.categorie_id = produit.categorie_id AND tarif.format_id = format.id
  JOIN (SELECT 1 AS produit_id, 1 AS format_id, 40 AS stock UNION SELECT 1, 2, 25
  UNION SELECT 2, 1, 35 UNION SELECT 2, 2, 20
  UNION SELECT 3, 1, 30 UNION SELECT 3, 2, 3
  UNION SELECT 4, 1, 28 UNION SELECT 4, 2, 18
  UNION SELECT 5, 1, 22 UNION SELECT 5, 2, 12
  UNION SELECT 6, 1, 26 UNION SELECT 6, 2, 0
  UNION SELECT 7, 1, 18 UNION SELECT 7, 2, 10
  UNION SELECT 8, 1, 20 UNION SELECT 8, 2, 14
  UNION SELECT 9, 1, 32 UNION SELECT 9, 2, 16
  UNION SELECT 10, 1, 27 UNION SELECT 10, 2, 11
  UNION SELECT 11, 1, 24 UNION SELECT 11, 2, 9
  UNION SELECT 12, 1, 29 UNION SELECT 12, 2, 15) AS stock_depart
    ON stock_depart.produit_id = produit.id AND stock_depart.format_id = format.id
 -- Ordre fixe : d'abord les variantes à la cuillère, puis les autres services,
 -- pour que les identifiants des variantes soient stables d'un import à l'autre.
 ORDER BY service.position > 1, produit.id, format.id, service.id;

-- Combinaisons à part, pour voir « Épuisé » et « Bientôt épuisé » alors que le
-- format a encore du stock avec un autre service.
UPDATE variante SET stock = 0
 WHERE (produit_id = 1 AND format_id = 2 AND service_id = 3)
    OR (produit_id = 2 AND format_id = 1 AND service_id = 3);
UPDATE variante SET stock = 4
 WHERE produit_id = 1 AND format_id = 1 AND service_id = 2;

-- ===========================================================================
-- 6. Données : démonstration
-- ===========================================================================

-- Données de démonstration : réglages, codes promo et comptes. NE PAS charger en
-- production.
--   alice@example.com / azerty        (client)
--   admin@example.com / motdepasse    (admin)
-- ANCIEN15 est désactivé, pour tester un refus.

INSERT INTO parametre (cle, valeur) VALUES
    ('seuil_bientot_epuise', '5');

INSERT INTO code_promo (code, pourcentage, actif) VALUES
    ('BIENVENUE10', 10, 1),
    ('GLACE20', 20, 1),
    ('ANCIEN15', 15, 0);

INSERT INTO utilisateur (email, nom, mot_de_passe, role) VALUES
    ('alice@example.com', 'Alice Martin', '$2y$12$usrCg0MWBP4EzYZMwaL.xuLJL2dw9Rz36dZg3tNLXTivNt8NVv3PW', 'client'),
    ('admin@example.com', NULL, '$2y$12$8APxNRkGWxMMBSamJ1eewuXeMWJ7Eq/sZBm.466uy0pt4.MCQWyzi', 'admin');
