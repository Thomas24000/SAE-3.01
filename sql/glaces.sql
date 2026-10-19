-- ---------------------------------------------------------------------------
-- SAE301 Ben & Jerry's — catégories, produits et variantes (US DEC-b)
--
-- Ce script crée toutes les tables de l'application. Importez-le depuis
-- phpMyAdmin, dans votre base.
--
-- Le stock est porté par la variante (un pot 100 ml et un pot 465 ml du même
-- parfum ont chacun le leur). Les prix sont des entiers en centimes : un
-- décimal flottant arrondirait mal.
--
-- 3 catégories de 4 produits, chaque produit avec 2 variantes et 2 groupes
-- d'options (service, toppings).
-- Les textes de description longue et d'ingrédients/allergènes sont des exemples
-- provisoires : ils ne remplacent pas les vraies informations produit.
-- L'import est rejouable : les tables sont supprimées avant d'être recréées.
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

DROP TABLE IF EXISTS parametre;
DROP TABLE IF EXISTS option_choix;
DROP TABLE IF EXISTS option_groupe;
DROP TABLE IF EXISTS mouvement_stock;
DROP TABLE IF EXISTS ligne_commande;
DROP TABLE IF EXISTS commande;
DROP TABLE IF EXISTS utilisateur;
DROP TABLE IF EXISTS produit_image;
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
    description VARCHAR(255) NOT NULL,

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
-- description_longue, ingredients : textes de la fiche détail. Les allergènes
-- font partie du texte des ingrédients.
-- ---------------------------------------------------------------------------
CREATE TABLE produit (
    id           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    categorie_id TINYINT UNSIGNED  NOT NULL,
    nom          VARCHAR(120)      NOT NULL,
    slug         VARCHAR(120)      NOT NULL,
    description  VARCHAR(400)      NOT NULL,
    teinte       SMALLINT UNSIGNED NOT NULL,
    image        VARCHAR(200)      NOT NULL,
    description_longue VARCHAR(800) NOT NULL,
    ingredients        VARCHAR(600) NOT NULL,

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
-- Images de la galerie d'un produit, de la première (visuel principal) à la
-- dernière. chemin : relatif à la racine du site (front/public/).
-- ---------------------------------------------------------------------------
CREATE TABLE produit_image (
    id         INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    produit_id SMALLINT UNSIGNED NOT NULL,
    chemin     VARCHAR(200)      NOT NULL,
    position   TINYINT UNSIGNED  NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_produit_image_position (produit_id, position),

    CONSTRAINT fk_produit_image_produit
        FOREIGN KEY (produit_id) REFERENCES produit (id)
        ON DELETE CASCADE
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
    -- Dernier garde-fou (US STK-a) : le stock ne peut jamais être négatif.
    CONSTRAINT ck_variante_stock CHECK (stock >= 0),

    CONSTRAINT fk_variante_produit
        FOREIGN KEY (produit_id) REFERENCES produit (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Options d'un produit (US OPT-c), en deux niveaux
--
-- option_groupe : une question posée sur la fiche produit (« Service »,
-- « Toppings »). multiple = 1 permet de cocher plusieurs choix, sinon un seul.
-- obligatoire = 1 impose au moins un choix avant l'ajout au panier.
-- option_choix : une réponse possible. supplement_cents s'ajoute au prix de la
-- variante (centimes, 0 si gratuit). Le serveur relit ces prix : le navigateur
-- ne fait jamais foi. Le figement dans les lignes de commande est l'US OPT-a.
-- ---------------------------------------------------------------------------
CREATE TABLE option_groupe (
    id          INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    produit_id  SMALLINT UNSIGNED NOT NULL,
    libelle     VARCHAR(60)       NOT NULL,
    multiple    TINYINT(1)        NOT NULL DEFAULT 0,
    obligatoire TINYINT(1)        NOT NULL DEFAULT 0,
    position    TINYINT UNSIGNED  NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_option_groupe_libelle (produit_id, libelle),

    CONSTRAINT fk_option_groupe_produit
        FOREIGN KEY (produit_id) REFERENCES produit (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE option_choix (
    id               INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    groupe_id        INT UNSIGNED     NOT NULL,
    libelle          VARCHAR(60)      NOT NULL,
    supplement_cents INT UNSIGNED     NOT NULL DEFAULT 0,
    position         TINYINT UNSIGNED NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_option_choix_libelle (groupe_id, libelle),

    CONSTRAINT fk_option_choix_groupe
        FOREIGN KEY (groupe_id) REFERENCES option_groupe (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Paramètres de l'application (US STK-b) : un couple clé / valeur par réglage.
-- seuil_bientot_epuise : stock à partir duquel (inclus) une variante est
-- « Bientôt épuisé ». Modifiable à terme depuis le back-office.
-- ---------------------------------------------------------------------------
CREATE TABLE parametre (
    cle    VARCHAR(60)  NOT NULL,
    valeur VARCHAR(255) NOT NULL,

    PRIMARY KEY (cle)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Utilisateurs (US CMD-c)
--
-- email : identifiant de connexion, unique (stocké en minuscules par l'API).
-- mot_de_passe : hachage produit par password_hash() (jamais le mot de passe
-- en clair) ; 255 caractères laissent la place aux futurs algorithmes.
-- role : décidé ici, côté serveur ; le navigateur ne peut pas le choisir.
-- ---------------------------------------------------------------------------
CREATE TABLE utilisateur (
    id           INT UNSIGNED            NOT NULL AUTO_INCREMENT,
    email        VARCHAR(254)            NOT NULL,
    mot_de_passe VARCHAR(255)            NOT NULL,
    role         ENUM('client', 'admin') NOT NULL DEFAULT 'client',
    cree_le      DATETIME                NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_utilisateur_email (email)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Commandes (US CMD-a)
--
-- numero : numéro lisible et unique (ex. CC-2026-000123), fabriqué par l'API
-- à partir de l'identifiant de la commande.
-- statut : une commande validée naît « en_cours ».
-- total_cents : somme des lignes, figée à la validation (centimes).
-- ---------------------------------------------------------------------------
CREATE TABLE commande (
    id             INT UNSIGNED                                        NOT NULL AUTO_INCREMENT,
    numero         VARCHAR(20)                                         NOT NULL,
    utilisateur_id INT UNSIGNED                                        NOT NULL,
    statut         ENUM('en_cours', 'prete', 'retiree', 'annulee')     NOT NULL DEFAULT 'en_cours',
    total_cents    INT UNSIGNED                                        NOT NULL,
    cree_le        DATETIME                                            NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_commande_numero (numero),
    KEY idx_commande_utilisateur (utilisateur_id),

    CONSTRAINT fk_commande_utilisateur
        FOREIGN KEY (utilisateur_id) REFERENCES utilisateur (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Lignes de commande
--
-- Instantané : le nom du produit, le format et le prix unitaire sont copiés au
-- moment de la commande. Un changement de prix ou de libellé ultérieur ne
-- modifie donc jamais une commande passée. variante_id passe à NULL si la
-- variante est supprimée, la ligne reste lisible grâce à l'instantané.
-- ---------------------------------------------------------------------------
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
        FOREIGN KEY (commande_id) REFERENCES commande (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ligne_variante
        FOREIGN KEY (variante_id) REFERENCES variante (id)
        ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Journal des mouvements de stock (US STK-a)
--
-- Une ligne par variante et par mouvement : « sortie » à la validation d'une
-- commande, « retour » à son annulation. quantite est toujours positive, le
-- sens est donné par le type. stock_avant / stock_apres permettent de rejouer
-- l'historique. La clé unique rend chaque mouvement idempotent : une commande
-- ne peut ni sortir ni revenir deux fois le stock d'une même variante.
-- Le journal est conservé même si la variante est supprimée (variante_id NULL).
-- ---------------------------------------------------------------------------
CREATE TABLE mouvement_stock (
    id          INT UNSIGNED         NOT NULL AUTO_INCREMENT,
    variante_id INT UNSIGNED         NULL,
    commande_id INT UNSIGNED         NOT NULL,
    type        ENUM('sortie', 'retour') NOT NULL,
    quantite    SMALLINT UNSIGNED    NOT NULL,
    stock_avant INT UNSIGNED         NOT NULL,
    stock_apres INT UNSIGNED         NOT NULL,
    cree_le     DATETIME             NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_mouvement (commande_id, variante_id, type),
    KEY idx_mouvement_variante (variante_id),

    CONSTRAINT fk_mouvement_variante
        FOREIGN KEY (variante_id) REFERENCES variante (id)
        ON DELETE SET NULL,
    CONSTRAINT fk_mouvement_commande
        FOREIGN KEY (commande_id) REFERENCES commande (id)
        ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Jeu de données
-- ---------------------------------------------------------------------------
INSERT INTO categorie (id, libelle, slug, description) VALUES
    (1, 'Pots classiques', 'pots-classiques', 'Les grands classiques crémeux de la maison, riches en morceaux et en swirls.'),
    (2, 'Sans lactose',    'sans-lactose',    'Des glaces onctueuses préparées sans lactose, pour que tout le monde se régale.'),
    (3, 'Sorbets',         'sorbets',         'Des sorbets fruités et rafraîchissants, sans produits laitiers.');

INSERT INTO produit (id, categorie_id, nom, slug, description, teinte, image, description_longue, ingredients) VALUES
    (1,  1, 'Cookie Dough',          'cookie-dough',          'Glace vanille avec des morceaux de pâte à cookie et des pépites de chocolat.',            45, 'images/produits/cookie-dough.svg',
     'Une glace onctueuse à la vanille, généreusement garnie de morceaux de pâte à cookie et de pépites de chocolat. Un grand classique de la maison, à savourer à la cuillère.',
     'Crème, lait écrémé, sucre, pâte à cookie (farine de blé, beurre, cassonade), pépites de chocolat, jaunes d''œufs, extrait de vanille. Allergènes : lait, œufs, blé, soja.'),
    (2,  1, 'Chocolate Fudge Brownie','chocolate-fudge-brownie','Glace au chocolat avec des morceaux de brownie fondants.',                                 20, 'images/produits/chocolate-fudge-brownie.svg',
     'Une glace au chocolat intense, riche en morceaux de brownie moelleux. Pour les amateurs de chocolat qui n''ont pas peur de la gourmandise.',
     'Crème, lait écrémé, sucre, cacao maigre, brownie (farine de blé, œufs, beurre, chocolat), jaunes d''œufs. Allergènes : lait, œufs, blé, soja.'),
    (3,  1, 'Cherry Garcia',         'cherry-garcia',         'Glace à la cerise avec des morceaux de cerises et des pépites de chocolat.',               350, 'images/produits/cherry-garcia.svg',
     'Une glace à la cerise douce et acidulée, parsemée de vraies cerises et d''éclats de chocolat noir. Un duo fruité et gourmand.',
     'Crème, lait écrémé, sucre, cerises, pépites de chocolat noir, jaunes d''œufs, arôme naturel de cerise. Allergènes : lait, œufs, soja.'),
    (4,  1, 'Caramel Chew Chew',     'caramel-chew-chew',     'Glace au caramel, swirl de caramel et morceaux de caramel fondant.',                       35, 'images/produits/caramel-chew-chew.svg',
     'Une glace au caramel soyeuse, traversée d''un swirl de caramel coulant et de morceaux de caramel fondants. Un voyage 100 % caramel.',
     'Crème, lait écrémé, sucre, caramel (sucre, crème, beurre), jaunes d''œufs, sel de mer. Allergènes : lait, œufs.'),
    (5,  2, 'Cookie Dough Sans Lactose','cookie-dough-sans-lactose','Pâte à cookie et pépites de chocolat sur une base à l''amande, sans lactose.',       50, 'images/produits/cookie-dough-sans-lactose.svg',
     'La version sans lactose du grand classique : une base à l''amande légère, de la pâte à cookie et des pépites de chocolat.',
     'Boisson à l''amande, sucre, pâte à cookie (farine de blé, huile de coco, cassonade), pépites de chocolat, extrait de vanille. Allergènes : fruits à coque (amande), blé, soja.'),
    (6,  2, 'Peanut Butter Cup',     'peanut-butter-cup',     'Glace au beurre de cacahuète, swirl de beurre de cacahuète et coques de chocolat.',        30, 'images/produits/peanut-butter-cup.svg',
     'Du beurre de cacahuète à profusion, un swirl onctueux et de généreuses coques de chocolat croquantes. Sans lactose, pas sans plaisir.',
     'Boisson à l''amande, sucre, beurre de cacahuète, coques de chocolat, cacao. Allergènes : arachides, fruits à coque (amande), soja.'),
    (7,  2, 'Chocolate Chip Cookie', 'chocolate-chip-cookie', 'Glace cookie dough sur une base végétale, avec des pépites de chocolat.',                 40, 'images/produits/chocolate-chip-cookie.svg',
     'Une glace cookie dough sur base végétale, avec des pépites de chocolat et une pointe de vanille. Toute la gourmandise, sans lactose.',
     'Base végétale (amande), sucre, pâte à cookie (farine de blé, huile de coco), pépites de chocolat, extrait de vanille. Allergènes : fruits à coque (amande), blé, soja.'),
    (8,  2, 'Vanille Caramel Fudge', 'vanille-caramel-fudge', 'Glace vanille, caramel et fudge sur une base à l''amande.',                                 38, 'images/produits/vanille-caramel-fudge.svg',
     'Vanille douce, caramel et fudge se mêlent sur une base à l''amande. Un trio de saveurs rondes et fondantes, sans lactose.',
     'Boisson à l''amande, sucre, caramel, fudge (sucre, cacao, huile de coco), extrait de vanille. Allergènes : fruits à coque (amande), soja.'),
    (9,  3, 'Mangue Passion',        'mangue-passion',        'Sorbet à la mangue avec un swirl de fruit de la passion.',                                 42, 'images/produits/mangue-passion.svg',
     'Un sorbet à la mangue bien mûre, relevé d''un swirl de fruit de la passion. Exotique, frais et sans produits laitiers.',
     'Purée de mangue, sucre, eau, purée de fruit de la passion, jus de citron. Allergènes : aucun.'),
    (10, 3, 'Fraise Basilic',        'fraise-basilic',        'Sorbet à la fraise parfumé au basilic, frais et acidulé.',                                 0, 'images/produits/fraise-basilic.svg',
     'Un sorbet à la fraise rafraîchi par une touche de basilic. Une association fraîche et acidulée, parfaite en été.',
     'Purée de fraise, sucre, eau, basilic, jus de citron. Allergènes : aucun.'),
    (11, 3, 'Citron Menthe',         'citron-menthe',         'Sorbet au citron avec des feuilles de menthe, très désaltérant.',                          95, 'images/produits/citron-menthe.svg',
     'Un sorbet au citron vif et à la menthe fraîche, très désaltérant. L''idéal pour terminer un repas en douceur.',
     'Jus de citron, sucre, eau, feuilles de menthe, zeste de citron. Allergènes : aucun.'),
    (12, 3, 'Framboise Myrtille',    'framboise-myrtille',    'Sorbet aux framboises et aux myrtilles, intense et fruité.',                               290, 'images/produits/framboise-myrtille.svg',
     'Un sorbet intense aux framboises et aux myrtilles, riche en fruits. Fruité, profond et acidulé à souhait.',
     'Purée de framboise, purée de myrtille, sucre, eau, jus de citron. Allergènes : aucun.');

-- Galerie provisoire : trois entrées par produit, qui pointent toutes vers le
-- visuel du produit. À remplacer par de vraies photos.
INSERT INTO produit_image (produit_id, chemin, position)
SELECT produit.id, produit.image, positions.n
  FROM produit
 CROSS JOIN (SELECT 1 AS n UNION SELECT 2 UNION SELECT 3) AS positions;

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

-- Options : chaque produit a un groupe « Service » (un seul choix, obligatoire)
-- et un groupe « Toppings » (plusieurs choix, facultatif).
INSERT INTO option_groupe (produit_id, libelle, multiple, obligatoire, position)
SELECT id, 'Service',  0, 1, 1 FROM produit
UNION ALL
SELECT id, 'Toppings', 1, 0, 2 FROM produit;

INSERT INTO option_choix (groupe_id, libelle, supplement_cents, position)
SELECT g.id, c.libelle, c.supplement_cents, c.position
  FROM option_groupe g
 CROSS JOIN (
       SELECT 'Cuillère en bois' AS libelle, 0 AS supplement_cents, 1 AS position
 UNION SELECT 'Coupelle',                   30,                      2
 UNION SELECT 'Cône gaufrette',             60,                      3
 ) AS c
 WHERE g.libelle = 'Service';

-- Toppings adaptés à la catégorie : pas de chantilly (lait) pour le sans
-- lactose, des garnitures fruitées pour les sorbets.
INSERT INTO option_choix (groupe_id, libelle, supplement_cents, position)
SELECT g.id, t.libelle, t.supplement_cents, t.position
  FROM option_groupe g
  JOIN produit p ON p.id = g.produit_id
  JOIN (
       SELECT 1 AS categorie_id, 'Sauce chocolat' AS libelle, 50 AS supplement_cents, 1 AS position
 UNION SELECT 1, 'Sauce caramel',      50, 2
 UNION SELECT 1, 'Chantilly',          40, 3
 UNION SELECT 1, 'Pépites de chocolat', 40, 4
 UNION SELECT 2, 'Sauce chocolat',     50, 1
 UNION SELECT 2, 'Sauce caramel',      50, 2
 UNION SELECT 2, 'Amandes effilées',   40, 3
 UNION SELECT 3, 'Coulis de fruits rouges', 50, 1
 UNION SELECT 3, 'Feuilles de menthe', 30, 2
 UNION SELECT 3, 'Éclats de meringue', 40, 3
  ) AS t ON t.categorie_id = p.categorie_id
 WHERE g.libelle = 'Toppings';

INSERT INTO parametre (cle, valeur) VALUES
    ('seuil_bientot_epuise', '5');

-- Comptes de démonstration : alice@example.com / azerty (client),
-- admin@example.com / motdepasse (admin). Les mots de passe sont stockés hachés.
INSERT INTO utilisateur (email, mot_de_passe, role) VALUES
    ('alice@example.com', '$2y$12$usrCg0MWBP4EzYZMwaL.xuLJL2dw9Rz36dZg3tNLXTivNt8NVv3PW', 'client'),
    ('admin@example.com', '$2y$12$8APxNRkGWxMMBSamJ1eewuXeMWJ7Eq/sZBm.466uy0pt4.MCQWyzi', 'admin');
