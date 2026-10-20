import { AdminData } from "../../data/admin.js";
import { ProduitAdminData } from "../../data/produit-admin.js";
import { goTo, readQuery } from "../../lib/navigation.js";
import { statutStock } from "../../lib/stock.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { BarreAdminView } from "../../ui/barre-admin/index.js";
import { EnTetePageView } from "../../ui/en-tete-page/index.js";
import { FormulaireProduitView } from "../../ui/formulaire-produit/index.js";
import { ModaleConfirmationView } from "../../ui/modale-confirmation/index.js";
import { PanneauImagesView } from "../../ui/panneau-images/index.js";
import { PanneauSeuilView } from "../../ui/panneau-seuil/index.js";
import template from "./template.html?raw";

/**
 * Page « Ajouter un produit » (/admin/produits/nouveau) et « Modifier un
 * produit » (/admin/produits/:id/modifier) du back-office (US GOF-a).
 *
 * Le même formulaire sert aux deux : la présence de :id dans l'adresse décide.
 * Les images et le seuil « Bientôt épuisé » s'enregistrent immédiatement
 * (chacun a son bouton) ; le reste, avec « Enregistrer ». Le serveur revalide
 * tout : prix, stocks et fichiers compris.
 *
 * M : le produit saisi, ses images, le seuil, les messages. V : les gabarits.
 * C : charge, valide, envoie, gère images, seuil et suppression.
 */

const NOM_MIN = 2;
const NOM_MAX = 120;
const DESCRIPTION_MAX = 400;
const DESCRIPTION_LONGUE_MAX = 800;
const INGREDIENTS_MAX = 600;
const FORMATS_MAX = 10;
const LIBELLE_FORMAT_MAX = 60;
const TAILLE_IMAGE_MAX = 5 * 1024 * 1024;
const TYPES_IMAGE = ["image/jpeg", "image/png", "image/webp"];

// Messages de réussite, désignés par ?ok=... dans l'adresse (jamais de texte libre).
const SUCCES = {
  cree: "Le produit a été créé. Vous pouvez maintenant ajouter ses images.",
};

let M = {
  id: null, // identifiant du produit modifié, ou null en création
  nomEnregistre: "", // nom du produit tel qu'enregistré (titre de la page)
  slug: "",
  nom: "",
  categorieId: "", // texte, "" si aucune catégorie choisie
  description: "",
  descriptionLongue: "",
  ingredients: "",
  variantes: [], // formats saisis : [{ libelle, prix, stocks: [{ id, choixId, service, stock }] }] (textes)
  services: [], // [{ id, libelle }] : les services du produit (US OPT-b), vide s'il n'en a pas
  categories: [], // [{ id, libelle }]
  images: [], // [{ id, src, miniature, principale }]
  seuil: 5, // seuil « Bientôt épuisé » enregistré
  enCours: false, // vrai pendant l'envoi du formulaire
  imagesEnCours: false, // vrai pendant un envoi d'images
  seuilEnCours: false, // vrai pendant l'enregistrement du seuil
  message: null, // { type, texte } du formulaire, ou null
  messageImages: null, // { type, texte } du panneau images, ou null
  messageSeuil: null, // { type, texte } du panneau seuil, ou null
  suppression: null, // { enCours, message } ou null
};

/**
 * Les stocks d'un format : un par service du produit, ou un seul sans service.
 * . stocksExistants : les variantes déjà enregistrées pour ce format ([] pour un nouveau format)
 * > [{ id, choixId, service, stock }] ; un service sans variante a un stock vide (non proposé)
 *   pour un format existant, "0" pour un nouveau format
 */
M.formatStocks = function (stocksExistants) {
  let nouveau = stocksExistants.length === 0;

  if (M.services.length === 0) {
    let existant = stocksExistants[0];
    return [{ id: existant?.id ?? null, choixId: null, service: "", stock: existant ? String(existant.stock) : "0" }];
  }

  return M.services.map((service) => {
    let existant = stocksExistants.find((variante) => variante.choixId === service.id);

    return {
      id: existant?.id ?? null,
      choixId: service.id,
      service: service.libelle,
      stock: existant ? String(existant.stock) : nouveau ? "0" : "",
    };
  });
};

/**
 * Une ligne de format vide, prête à remplir.
 * > { libelle: "", prix: "", stocks } (voir formatStocks)
 */
M.emptyFormat = function () {
  return { libelle: "", prix: "", stocks: M.formatStocks([]) };
};

/**
 * Regroupe les variantes reçues (une par combinaison) en formats à saisir.
 * . variantes : [{ id, libelle, choixId, prixCents, stock }]
 * > [{ libelle, prix, stocks }] : un format par libellé, dans l'ordre reçu ; son prix est celui de la
 *   première de ses variantes
 */
M.groupFormats = function (variantes) {
  let libelles = [...new Set(variantes.map((variante) => variante.libelle))];

  return libelles.map((libelle) => {
    let deLeur = variantes.filter((variante) => variante.libelle === libelle);

    return { libelle: libelle, prix: M.priceToText(deLeur[0].prixCents), stocks: M.formatStocks(deLeur) };
  });
};

/**
 * Un prix en centimes affiché comme dans un champ : 350 devient « 3,50 ».
 * . centimes : le prix, en centimes
 * > un texte
 */
M.priceToText = function (centimes) {
  return (centimes / 100).toFixed(2).replace(".", ",");
};

/**
 * Un prix saisi en euros converti en centimes : « 3,50 » ou « 3.5 » donnent 350.
 * . texte : la saisie
 * > un entier de centimes (>= 1), ou null si la saisie n'est pas un prix valide
 */
M.textToPrice = function (texte) {
  let propre = texte.trim().replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(propre)) return null;
  let centimes = Math.round(parseFloat(propre) * 100);
  return centimes >= 1 ? centimes : null;
};

/**
 * Un stock saisi converti en entier.
 * . texte : la saisie
 * > un entier >= 0, ou null si la saisie n'est pas un entier positif
 */
M.textToStock = function (texte) {
  let propre = texte.trim();
  return /^\d{1,7}$/.test(propre) ? Number(propre) : null;
};

/**
 * Reprend l'état saisi dans le formulaire (voir FormulaireProduitView.lireEtat).
 * . etat : { nom, categorieId, description, descriptionLongue, ingredients, variantes }
 */
M.setState = function (etat) {
  M.nom = etat.nom;
  M.categorieId = etat.categorieId;
  M.description = etat.description;
  M.descriptionLongue = etat.descriptionLongue;
  M.ingredients = etat.ingredients;
  M.variantes = etat.variantes;
};

/**
 * Le stock total du produit d'après les formats saisis (une saisie invalide compte 0).
 * > un entier
 */
M.stockTotal = function () {
  return M.variantes
    .flatMap((variante) => variante.stocks)
    .reduce((somme, stock) => somme + (M.textToStock(stock.stock) ?? 0), 0);
};

/**
 * Vérifie le formulaire avant l'envoi. Le serveur revérifie : ce contrôle évite
 * seulement un aller-retour inutile.
 * > un texte d'erreur, ou null si tout est valide
 */
M.validate = function () {
  let nom = M.nom.trim();
  if (nom.length < NOM_MIN || nom.length > NOM_MAX) {
    return `Le nom doit contenir entre ${NOM_MIN} et ${NOM_MAX} caractères.`;
  }
  if (M.categorieId === "") return "Choisissez une catégorie.";
  let description = M.description.trim();
  if (description === "" || description.length > DESCRIPTION_MAX) {
    return `La description est obligatoire (${DESCRIPTION_MAX} caractères au maximum).`;
  }
  if (M.descriptionLongue.trim().length > DESCRIPTION_LONGUE_MAX) {
    return `La description détaillée est limitée à ${DESCRIPTION_LONGUE_MAX} caractères.`;
  }
  if (M.ingredients.trim().length > INGREDIENTS_MAX) {
    return `Les ingrédients sont limités à ${INGREDIENTS_MAX} caractères.`;
  }

  let libelles = [];
  for (let i = 0; i < M.variantes.length; i++) {
    let variante = M.variantes[i];
    let libelle = variante.libelle.trim();
    if (libelle === "" || libelle.length > LIBELLE_FORMAT_MAX) {
      return `Le nom d'un format est obligatoire (${LIBELLE_FORMAT_MAX} caractères au maximum).`;
    }
    if (libelles.includes(libelle.toLowerCase())) return `Deux formats portent le même nom : « ${libelle} ».`;
    libelles.push(libelle.toLowerCase());
    if (M.textToPrice(variante.prix) === null) {
      return `Le prix du format « ${libelle} » doit être un montant en euros supérieur à 0 (par exemple 3,50).`;
    }

    for (let j = 0; j < variante.stocks.length; j++) {
      let stock = variante.stocks[j];
      // Un stock vide retire la combinaison, sauf sans service où le stock est obligatoire.
      if (stock.stock.trim() === "" && stock.choixId !== null) continue;

      if (M.textToStock(stock.stock) === null) {
        let cible = stock.service === "" ? `du format « ${libelle} »` : `« ${stock.service} » du format « ${libelle} »`;
        return `Le stock ${cible} doit être un nombre entier positif ou nul.`;
      }
    }

    if (variante.stocks.every((stock) => stock.choixId !== null && stock.stock.trim() === "")) {
      return `Le format « ${libelle} » doit être proposé avec au moins un service.`;
    }
  }
  return null;
};

/**
 * Le corps de la requête d'enregistrement : prix en centimes, nombres convertis.
 * > { id?, nom, categorieId, description, descriptionLongue, ingredients, variantes }
 */
M.payload = function () {
  let corps = {
    nom: M.nom,
    categorieId: Number(M.categorieId),
    description: M.description,
    descriptionLongue: M.descriptionLongue,
    ingredients: M.ingredients,
    // Une variante par combinaison proposée ; un stock vide en est absent (et supprime la variante existante).
    variantes: M.variantes.flatMap((variante) =>
      variante.stocks
        .filter((stock) => stock.stock.trim() !== "")
        .map((stock) => {
          let ligne = {
            libelle: variante.libelle,
            choixId: stock.choixId,
            prixCents: M.textToPrice(variante.prix),
            stock: M.textToStock(stock.stock),
          };
          if (stock.id !== null) ligne.id = stock.id;
          return ligne;
        })
    ),
  };
  if (M.id !== null) corps.id = M.id;
  return corps;
};

/**
 * Contrôle des fichiers choisis, avant tout envoi.
 * . fichiers : les File choisis ou déposés
 * > un texte d'erreur, ou null si tous sont acceptables
 */
M.validateFiles = function (fichiers) {
  if (M.images.length + fichiers.length > 10) return "Un produit peut avoir 10 images au maximum.";

  let refuse = fichiers.find((fichier) => !TYPES_IMAGE.includes(fichier.type) || fichier.size > TAILLE_IMAGE_MAX);
  if (refuse !== undefined) {
    return TYPES_IMAGE.includes(refuse.type)
      ? `${refuse.name} : l'image dépasse la taille autorisée (5 Mo).`
      : `${refuse.name} : le fichier doit être une image JPG, PNG ou WebP.`;
  }
  return null;
};

/**
 * Message de succès annoncé par l'adresse (?ok=cree).
 * . code : la valeur du paramètre
 * > { type: "succes", texte }, ou null si le code est inconnu
 */
M.flash = function (code) {
  if (code === null || !(code in SUCCES)) return null;
  return { type: "succes", texte: SUCCES[code] };
};

let C = {};

/**
 * Réinitialise le modèle, lit la session, puis le produit à modifier le cas échéant.
 * . idTexte : le :id de l'adresse, ou undefined en création
 * > true si la page peut s'afficher, false si on a redirigé
 */
C.charger = async function (idTexte) {
  M.id = null;
  M.nomEnregistre = "";
  M.slug = "";
  M.services = [];
  M.setState({
    nom: "",
    categorieId: "",
    description: "",
    descriptionLongue: "",
    ingredients: "",
    variantes: [{ ...M.emptyFormat(), libelle: "Pot 100 ml" }],
  });
  M.images = [];
  M.enCours = M.imagesEnCours = M.seuilEnCours = false;
  M.message = M.messageImages = M.messageSeuil = null;
  M.suppression = null;

  try {
    let session = await AdminData.me();
    if (!session.connecte) {
      goTo("/admin");
      return false;
    }

    if (idTexte === undefined) {
      let reponse = await ProduitAdminData.fetchAll();
      M.categories = reponse.categories;
      M.seuil = reponse.seuilBientotEpuise;
      return true;
    }

    let reponse = await ProduitAdminData.fetchOne(idTexte);
    C.applyProduct(reponse.produit);
    M.categories = reponse.categories;
    M.seuil = reponse.seuilBientotEpuise;
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return false;
    }
    // Identifiant inconnu ou invalide : retour à la liste.
    if (erreur.statut === 404 || erreur.statut === 400) {
      goTo("/admin/produits");
      return false;
    }
    M.message = { type: "erreur", texte: erreur.message };
  }
  return true;
};

/**
 * Place un produit reçu du serveur dans le modèle.
 * . produit : { id, nom, slug, categorieId, description, descriptionLongue, ingredients, variantes (une par combinaison
 *   format + service), services, images }
 */
C.applyProduct = function (produit) {
  M.id = produit.id;
  M.nomEnregistre = produit.nom;
  M.slug = produit.slug;
  M.services = produit.services;
  M.setState({
    nom: produit.nom,
    categorieId: String(produit.categorieId),
    description: produit.description,
    descriptionLongue: produit.descriptionLongue,
    ingredients: produit.ingredients,
    variantes: M.groupFormats(produit.variantes),
  });
  M.images = produit.images;
};

/**
 * Envoi du formulaire : crée ou modifie, puis va où il faut.
 * . etat : l'état saisi (voir FormulaireProduitView.lireEtat)
 */
C.handler_submit = async function (etat) {
  M.setState(etat);
  M.message = null;

  let probleme = M.validate();
  if (probleme !== null) {
    M.message = { type: "erreur", texte: probleme };
    V.refresh(C.viewData(), 'input[name="nom"]');
    return;
  }

  M.enCours = true;
  V.refresh(C.viewData(), null);

  try {
    if (M.id === null) {
      let reponse = await ProduitAdminData.create(M.payload());
      goTo(`/admin/produits/${reponse.produit.id}/modifier?ok=cree`);
    } else {
      await ProduitAdminData.update(M.payload());
      goTo("/admin/produits?ok=modifie");
    }
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    M.enCours = false;
    M.message = { type: "erreur", texte: erreur.message };
    V.refresh(C.viewData(), 'input[name="nom"]');
  }
};

/**
 * Clic sur « Ajouter un format » : une ligne vide en plus (10 au maximum).
 * . etat : l'état saisi
 */
C.handler_addFormat = function (etat) {
  M.setState(etat);
  M.message = null;

  if (M.variantes.length >= FORMATS_MAX) {
    M.message = { type: "erreur", texte: `Un produit peut avoir ${FORMATS_MAX} formats au maximum.` };
    V.refresh(C.viewData(), null);
    return;
  }

  M.variantes.push(M.emptyFormat());
  V.refresh(C.viewData(), "[data-ligne]:last-of-type input[name='libelle']");
};

/**
 * Clic sur la corbeille d'un format. Il disparaît de la liste ; il n'est
 * supprimé en base qu'à l'enregistrement. Un produit garde au moins un format.
 * . index : la place du format dans la liste
 * . etat : l'état saisi
 */
C.handler_removeFormat = function (index, etat) {
  M.setState(etat);
  M.message = null;

  if (M.variantes.length > 1) M.variantes.splice(index, 1);
  V.refresh(C.viewData(), null);
};

/**
 * Relit l'état du formulaire affiché avant de le reconstruire : les actions
 * immédiates (images, seuil) ne doivent pas perdre ce qui est en cours de saisie.
 */
C.syncForm = function () {
  M.setState(V.readState());
};

/**
 * Fichiers choisis ou déposés : contrôle, envoi, puis mise à jour de la galerie.
 * . fichiers : les File reçus
 */
C.handler_upload = async function (fichiers) {
  C.syncForm();
  M.messageImages = null;

  let probleme = M.validateFiles(fichiers);
  if (probleme !== null) {
    M.messageImages = { type: "erreur", texte: probleme };
    V.refresh(C.viewData(), null);
    return;
  }

  M.imagesEnCours = true;
  V.refresh(C.viewData(), null);

  try {
    let reponse = await ProduitAdminData.uploadImages(M.id, fichiers);
    M.images = reponse.images;
    M.messageImages = {
      type: "succes",
      texte: fichiers.length > 1 ? "Les images ont été ajoutées." : "L'image a été ajoutée.",
    };
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    M.messageImages = { type: "erreur", texte: erreur.message };
    await C.reloadImages();
  }

  M.imagesEnCours = false;
  V.refresh(C.viewData(), null);
};

/**
 * Relit les images du produit (après un envoi partiel, par exemple).
 */
C.reloadImages = async function () {
  try {
    let reponse = await ProduitAdminData.fetchOne(M.id);
    M.images = reponse.produit.images;
  } catch (erreur) {
    // Les images affichées restent celles d'avant ; le message d'erreur précédent suffit.
  }
};

/**
 * Clic sur l'étoile d'une vignette : cette image devient la principale.
 * . imageId : l'image choisie
 */
C.handler_setMain = async function (imageId) {
  C.syncForm();
  M.messageImages = null;

  try {
    M.images = (await ProduitAdminData.setMainImage(M.id, imageId)).images;
    M.messageImages = { type: "succes", texte: "L'image principale a été changée." };
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    M.messageImages = { type: "erreur", texte: erreur.message };
    await C.reloadImages();
  }
  V.refresh(C.viewData(), null);
};

/**
 * Clic sur la corbeille d'une vignette : l'image est supprimée aussitôt.
 * . imageId : l'image à supprimer
 */
C.handler_deleteImage = async function (imageId) {
  C.syncForm();
  M.messageImages = null;

  try {
    M.images = (await ProduitAdminData.removeImage(M.id, imageId)).images;
    M.messageImages = { type: "succes", texte: "L'image a été supprimée." };
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    M.messageImages = { type: "erreur", texte: erreur.message };
    await C.reloadImages();
  }
  V.refresh(C.viewData(), null);
};

/**
 * Clic sur « Enregistrer le seuil » : réglage commun à tout le catalogue.
 * . texte : le seuil saisi
 */
C.handler_saveThreshold = async function (texte) {
  C.syncForm();
  M.messageSeuil = null;

  let seuil = M.textToStock(texte);
  if (seuil === null || seuil > 100000) {
    M.messageSeuil = { type: "erreur", texte: "Le seuil doit être un nombre entier entre 0 et 100 000." };
    V.refresh(C.viewData(), null);
    return;
  }

  M.seuilEnCours = true;
  V.refresh(C.viewData(), null);

  try {
    let reponse = await ProduitAdminData.saveThreshold(seuil);
    M.seuil = reponse.seuilBientotEpuise;
    M.messageSeuil = { type: "succes", texte: "Le seuil a été enregistré." };
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    M.messageSeuil = { type: "erreur", texte: erreur.message };
  }

  M.seuilEnCours = false;
  V.refresh(C.viewData(), null);
};

/**
 * Clic sur « Supprimer le produit » : ouvre la modale de confirmation.
 */
C.handler_askDelete = function () {
  C.syncForm();
  M.suppression = { enCours: false, message: null };
  V.refresh(C.viewData(), null);
};

/**
 * Fermeture de la modale (Annuler ou Échap).
 */
C.handler_cancelDelete = function () {
  if (M.suppression === null) return;
  M.suppression = null;
  V.refresh(C.viewData(), null);
};

/**
 * Confirmation : supprime le produit puis retourne à la liste.
 */
C.handler_confirmDelete = async function () {
  if (M.suppression === null) return;

  M.suppression.enCours = true;
  M.suppression.message = null;
  V.refresh(C.viewData(), null);

  try {
    await ProduitAdminData.remove(M.id);
    goTo("/admin/produits?ok=supprime");
  } catch (erreur) {
    if (erreur.statut === 401) {
      goTo("/admin");
      return;
    }
    M.suppression.enCours = false;
    M.suppression.message = { type: "erreur", texte: erreur.message };
    V.refresh(C.viewData(), null);
  }
};

/**
 * Les données dont la Vue a besoin pour afficher la page.
 * > { email, titre, sousTitre, nomCourant, formulaire, images, seuil, suppression }
 */
C.viewData = function () {
  let edition = M.id !== null;

  return {
    email: AdminData.knownEmail ?? "",
    titre: edition ? `Modifier « ${M.nomEnregistre} »` : "Ajouter un produit",
    sousTitre: edition ? `Adresse : /produit/${M.slug}` : "Renseignez le produit, ses formats et ses prix",
    nomCourant: edition ? M.nomEnregistre : "Ajouter un produit",
    formulaire: {
      nom: M.nom,
      categorieId: M.categorieId,
      description: M.description,
      descriptionLongue: M.descriptionLongue,
      ingredients: M.ingredients,
      categories: M.categories,
      variantes: M.variantes,
      edition,
      bouton: edition ? "Enregistrer les modifications" : "Créer le produit",
      enCours: M.enCours,
      message: M.message,
    },
    images: { actif: edition, enCours: M.imagesEnCours, images: M.images, message: M.messageImages },
    seuil: edition
      ? {
          seuil: String(M.seuil),
          stock: M.stockTotal(),
          statut: statutStock(M.stockTotal(), M.seuil),
          enCours: M.seuilEnCours,
          message: M.messageSeuil,
        }
      : null,
    suppression:
      M.suppression === null
        ? null
        : { nom: M.nomEnregistre, enCours: M.suppression.enCours, message: M.suppression.message },
  };
};

C.init = async function (params) {
  if (!(await C.charger(params.id))) return document.createDocumentFragment();
  M.message = M.flash(readQuery("ok"));
  return V.init(C.viewData());
};

let V = {};

V.racine = null; // élément racine de la page affichée

V.init = function (data) {
  let fragment = V.createPageFragment(data);
  V.racine = fragment.firstElementChild;
  return fragment;
};

/**
 * L'état saisi dans le formulaire affiché.
 * > voir FormulaireProduitView.lireEtat
 */
V.readState = function () {
  return FormulaireProduitView.lireEtat(V.racine.querySelector("form"));
};

// Toute la page se reconstruit à partir du modèle ; les champs saisis
// survivent parce qu'ils sont dans le modèle. Une modale ouverte est rouverte.
V.refresh = function (data, focusSelector) {
  let fragment = V.createPageFragment(data);
  let nouvelleRacine = fragment.firstElementChild;
  V.racine.replaceWith(fragment);
  V.racine = nouvelleRacine;

  let dialog = nouvelleRacine.querySelector("dialog");
  if (dialog !== null) {
    dialog.showModal();
    return;
  }
  if (focusSelector !== null) document.querySelector(focusSelector)?.focus();
};

V.createPageFragment = function (data) {
  let page = htmlToFragment(genericRenderer(template, { nomCourant: data.nomCourant }));

  page.querySelector('slot[name="barre"]').replaceWith(
    BarreAdminView.dom({ section: "Produits", email: data.email })
  );
  page.querySelector('slot[name="entete"]').replaceWith(
    EnTetePageView.dom({ titre: data.titre, sousTitre: data.sousTitre, action: null })
  );

  let panneaux = {
    images: PanneauImagesView.dom(data.images, {
      surFichiers: C.handler_upload,
      surPrincipale: C.handler_setMain,
      surSuppression: C.handler_deleteImage,
    }),
    seuil:
      data.seuil === null
        ? null
        : PanneauSeuilView.dom(data.seuil, { surEnregistrement: C.handler_saveThreshold }),
  };
  page.querySelector('slot[name="formulaire"]').replaceWith(
    FormulaireProduitView.dom(data.formulaire, panneaux, {
      surEnvoi: C.handler_submit,
      surAjoutFormat: C.handler_addFormat,
      surRetraitFormat: C.handler_removeFormat,
      surSuppressionProduit: C.handler_askDelete,
    })
  );

  let slotModale = page.querySelector('slot[name="modale"]');
  if (data.suppression === null) {
    slotModale.remove();
  } else {
    slotModale.replaceWith(
      ModaleConfirmationView.dom(
        {
          titre: `Supprimer le produit « ${data.suppression.nom} » ?`,
          texte: "Le produit, ses formats et ses images seront supprimés définitivement. Les commandes déjà passées restent consultables.",
          bouton: "Supprimer",
          enCours: data.suppression.enCours,
          message: data.suppression.message,
        },
        { surConfirmation: C.handler_confirmDelete, surAnnulation: C.handler_cancelDelete }
      )
    );
  }

  return page;
};

export function AdminProduitPage(params) {
  return C.init(params);
}
