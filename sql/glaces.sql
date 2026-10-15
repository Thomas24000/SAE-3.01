-- ---------------------------------------------------------------------------
-- SAE301 Ben & Jerry's — catégories, produits et variantes (US DEC-b)
--
-- Ce script s'ajoute à sql/import.sql sans toucher aux tables film et genre.
-- Importez-le depuis phpMyAdmin, dans la même base.
--
-- Le stock est porté par la variante (un pot 100 ml et un pot 465 ml du même
-- parfum ont chacun le leur). Les prix sont des entiers en centimes : un
-- décimal flottant arrondirait mal.
--
-- 3 catégories de 4 produits, chaque produit avec 2 variantes.
-- L'import est rejouable : les tables sont supprimées avant d'être recréées.
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

DROP TABLE IF EXISTS variante;
DROP TABLE IF EXISTS produit;
DROP TABLE IF EXISTS categorie;

-- ---------------------------------------------------------------------------
-- Catégories
-- ---------------------------------------------------------------------------
CREATE TABLE categorie (
    id      TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    libelle VARCHAR(60)      NOT NULL,
    slug    VARCHAR(60)      NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_categorie_slug (slug)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Produits (un parfum de glace)
--
-- teinte : angle de couleur (0-359) qui colore le fond de la carte.
-- image  : chemin du visuel, relatif à la racine du site (front/public/).
-- ---------------------------------------------------------------------------
CREATE TABLE produit (
    id           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    categorie_id TINYINT UNSIGNED  NOT NULL,
    nom          VARCHAR(120)      NOT NULL,
    slug         VARCHAR(120)      NOT NULL,
    description  VARCHAR(400)      NOT NULL,
    teinte       SMALLINT UNSIGNED NOT NULL,
    image        VARCHAR(200)      NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_produit_slug (slug),
    KEY idx_produit_categorie (categorie_id),

    CONSTRAINT fk_produit_categorie
        FOREIGN KEY (categorie_id) REFERENCES categorie (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Variantes (un format de pot) — c'est elle qui porte prix et stock
-- ---------------------------------------------------------------------------
CREATE TABLE variante (
    id         INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    produit_id SMALLINT UNSIGNED NOT NULL,
    libelle    VARCHAR(60)       NOT NULL,
    prix_cents INT UNSIGNED      NOT NULL,
    stock      INT UNSIGNED      NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    UNIQUE KEY uq_variante_produit_libelle (produit_id, libelle),

    CONSTRAINT fk_variante_produit
        FOREIGN KEY (produit_id) REFERENCES produit (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Jeu de données
-- ---------------------------------------------------------------------------
INSERT INTO categorie (id, libelle, slug) VALUES
    (1, 'Pots classiques', 'pots-classiques'),
    (2, 'Sans lactose',    'sans-lactose'),
    (3, 'Sorbets',         'sorbets');

INSERT INTO produit (id, categorie_id, nom, slug, description, teinte, image) VALUES
    (1,  1, 'Cookie Dough',          'cookie-dough',          'Glace vanille avec des morceaux de pâte à cookie et des pépites de chocolat.',            45, 'images/produits/cookie-dough.svg'),
    (2,  1, 'Chocolate Fudge Brownie','chocolate-fudge-brownie','Glace au chocolat avec des morceaux de brownie fondants.',                                 20, 'images/produits/chocolate-fudge-brownie.svg'),
    (3,  1, 'Cherry Garcia',         'cherry-garcia',         'Glace à la cerise avec des morceaux de cerises et des pépites de chocolat.',               350, 'images/produits/cherry-garcia.svg'),
    (4,  1, 'Caramel Chew Chew',     'caramel-chew-chew',     'Glace au caramel, swirl de caramel et morceaux de caramel fondant.',                       35, 'images/produits/caramel-chew-chew.svg'),
    (5,  2, 'Cookie Dough Sans Lactose','cookie-dough-sans-lactose','Pâte à cookie et pépites de chocolat sur une base à l''amande, sans lactose.',       50, 'images/produits/cookie-dough-sans-lactose.svg'),
    (6,  2, 'Peanut Butter Cup',     'peanut-butter-cup',     'Glace au beurre de cacahuète, swirl de beurre de cacahuète et coques de chocolat.',        30, 'images/produits/peanut-butter-cup.svg'),
    (7,  2, 'Chocolate Chip Cookie', 'chocolate-chip-cookie', 'Glace cookie dough sur une base végétale, avec des pépites de chocolat.',                 40, 'images/produits/chocolate-chip-cookie.svg'),
    (8,  2, 'Vanille Caramel Fudge', 'vanille-caramel-fudge', 'Glace vanille, caramel et fudge sur une base à l''amande.',                                 38, 'images/produits/vanille-caramel-fudge.svg'),
    (9,  3, 'Mangue Passion',        'mangue-passion',        'Sorbet à la mangue avec un swirl de fruit de la passion.',                                 42, 'images/produits/mangue-passion.svg'),
    (10, 3, 'Fraise Basilic',        'fraise-basilic',        'Sorbet à la fraise parfumé au basilic, frais et acidulé.',                                 0, 'images/produits/fraise-basilic.svg'),
    (11, 3, 'Citron Menthe',         'citron-menthe',         'Sorbet au citron avec des feuilles de menthe, très désaltérant.',                          95, 'images/produits/citron-menthe.svg'),
    (12, 3, 'Framboise Myrtille',    'framboise-myrtille',    'Sorbet aux framboises et aux myrtilles, intense et fruité.',                               290, 'images/produits/framboise-myrtille.svg');

INSERT INTO variante (produit_id, libelle, prix_cents, stock) VALUES
    (1,  'Pot 100 ml', 290, 40), (1,  'Pot 465 ml', 790, 25),
    (2,  'Pot 100 ml', 290, 35), (2,  'Pot 465 ml', 790, 20),
    (3,  'Pot 100 ml', 290, 30), (3,  'Pot 465 ml', 790, 3),
    (4,  'Pot 100 ml', 290, 28), (4,  'Pot 465 ml', 790, 18),
    (5,  'Pot 100 ml', 320, 22), (5,  'Pot 465 ml', 850, 12),
    (6,  'Pot 100 ml', 320, 26), (6,  'Pot 465 ml', 850, 0),
    (7,  'Pot 100 ml', 320, 18), (7,  'Pot 465 ml', 850, 10),
    (8,  'Pot 100 ml', 320, 20), (8,  'Pot 465 ml', 850, 14),
    (9,  'Pot 100 ml', 270, 32), (9,  'Pot 465 ml', 720, 16),
    (10, 'Pot 100 ml', 270, 27), (10, 'Pot 465 ml', 720, 11),
    (11, 'Pot 100 ml', 270, 24), (11, 'Pot 465 ml', 720, 9),
    (12, 'Pot 100 ml', 270, 29), (12, 'Pot 465 ml', 720, 15);
