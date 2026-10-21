import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { MessageView } from "../message/index.js";
import template from "./template.html?raw";
import templateAllergene from "./allergene.html?raw";
import templateFormat from "./format.html?raw";
import templateStock from "./stock.html?raw";
import templateSuppression from "./suppression.html?raw";

const IMAGES = import.meta.env.BASE_URL + "images/admin/";

// Formulaire de création ou de modification d'un produit : informations,
// allergènes, formats (un prix, et un stock par service : US OPT-b) et boutons d'action. Les panneaux « Images » et
// « Stock et alerte » sont fournis par la page et insérés à leur place.
// Il ne valide rien et ne décide de rien : il transmet ce qui est saisi.
let FormulaireProduitView = {
  /**
   * @param {{nom: string, categorieId: string, description: string, descriptionLongue: string,
   *          ingredients: string, categories: Array<{id: number, libelle: string}>,
   *          formats: Array<{id: number, libelle: string}>,
   *          allergenes: Array<{id: number, libelle: string}>, allergeneIds: number[],
   *          variantes: Array<{libelle: string, prix: string, stocks: Array<{id: (number|null),
   *          choixId: number, service: string, stock: string}>}>,
   *          edition: boolean, bouton: string, enCours: boolean,
   *          message: ({type: string, texte: string}|null)}} data - categorieId : l'id choisi en
   *   texte ("" si aucun) ; prix et stock : les textes saisis ; edition : faux en création ;
   *   allergeneIds : les allergènes cochés. libelle d'un format est l'un des `formats`.
   *   Chaque format porte un stock par service ; un stock vide veut dire « combinaison non proposée ».
   * @param {{images: DocumentFragment, seuil: (DocumentFragment|null)}} panneaux - les panneaux
   *   préparés par la page ; seuil vaut null en création.
   * @param {{surEnvoi: function(Object): void, surAjoutFormat: function(Object): void,
   *          surRetraitFormat: function(number, Object): void,
   *          surSuppressionProduit: function(): void}} actions - chaque action reçoit l'état saisi
   *   (voir lireEtat), car la page se reconstruit ensuite.
   * @returns {DocumentFragment}
   */
  dom: function (data, panneaux, actions) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        images: IMAGES,
        nom: data.nom,
        description: data.description,
        descriptionLongue: data.descriptionLongue,
        ingredients: data.ingredients,
        bouton: data.bouton,
        enCours: String(data.enCours),
      })
    );

    fragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(data.message));

    fragment.querySelector('select[name="categorie"]').append(
      ...[{ id: "", libelle: "Choisir une catégorie" }].concat(data.categories).map((categorie) => {
        let option = document.createElement("option");
        option.value = String(categorie.id);
        option.textContent = categorie.libelle;
        option.selected = String(categorie.id) === data.categorieId;
        return option;
      })
    );

    fragment.querySelector('slot[name="allergenes"]').replaceWith(
      ...data.allergenes.map((allergene) =>
        htmlToFragment(
          genericRenderer(templateAllergene, {
            id: allergene.id,
            libelle: allergene.libelle,
            coche: data.allergeneIds.includes(allergene.id) ? "checked" : "",
          })
        )
      )
    );

    fragment.querySelector('slot[name="images"]').replaceWith(panneaux.images);

    fragment.querySelector('slot[name="formats"]').replaceWith(
      ...data.variantes.map((variante, index) => {
        let format = htmlToFragment(
          genericRenderer(templateFormat, {
            prix: variante.prix,
            index,
            numero: index + 1,
            images: IMAGES,
            desactive: data.variantes.length === 1 ? "disabled" : "",
            legende: "Stock par service (vide : combinaison non proposée)",
          })
        );

        format.querySelector('select[name="libelle"]').append(
          ...data.formats.map((autre) => {
            let option = document.createElement("option");
            option.value = autre.libelle;
            option.textContent = autre.libelle;
            option.selected = autre.libelle === variante.libelle;
            return option;
          })
        );

        format.querySelector('slot[name="stocks"]').replaceWith(
          ...variante.stocks.map((stock) =>
            htmlToFragment(
              genericRenderer(templateStock, {
                libelle: stock.service,
                stock: stock.stock,
                id: stock.id ?? "",
                choixId: stock.choixId,
                service: stock.service,
              })
            )
          )
        );

        return format;
      })
    );

    let slotSeuil = fragment.querySelector('slot[name="seuil"]');
    if (panneaux.seuil === null) slotSeuil.remove();
    else slotSeuil.replaceWith(panneaux.seuil);

    let slotSuppression = fragment.querySelector('slot[name="suppression"]');
    if (!data.edition) slotSuppression.remove();
    else slotSuppression.replaceWith(htmlToFragment(genericRenderer(templateSuppression, { images: IMAGES })));

    let formulaire = fragment.firstElementChild;

    formulaire.addEventListener("submit", (ev) => {
      // Sans cela, le navigateur rechargerait la page.
      ev.preventDefault();
      if (!data.enCours) actions.surEnvoi(FormulaireProduitView.lireEtat(formulaire));
    });

    // Délégation : un seul écouteur pour les boutons du formulaire.
    formulaire.addEventListener("click", (ev) => {
      let bouton = ev.target.closest("button[data-action]");
      if (bouton === null || bouton.disabled) return;

      if (bouton.dataset.action === "ajouter-format") {
        actions.surAjoutFormat(FormulaireProduitView.lireEtat(formulaire));
      }
      if (bouton.dataset.action === "retirer-format") {
        actions.surRetraitFormat(Number(bouton.dataset.index), FormulaireProduitView.lireEtat(formulaire));
      }
      if (bouton.dataset.action === "supprimer-produit") actions.surSuppressionProduit();
    });

    return fragment;
  },

  /**
   * Lit ce qui est saisi dans le formulaire affiché (champs de texte, tels quels).
   *
   * @param {HTMLFormElement} formulaire - le formulaire du produit.
   * @returns {{nom: string, categorieId: string, description: string, descriptionLongue: string,
   *           ingredients: string, allergeneIds: number[], variantes: Array<{libelle: string, prix: string,
   *           stocks: Array<{id: (number|null), choixId: number, service: string, stock: string}>}>}}
   */
  lireEtat: function (formulaire) {
    let champ = (nom) => formulaire.querySelector(`[name="${nom}"]`).value;

    return {
      nom: champ("nom"),
      categorieId: champ("categorie"),
      description: champ("description"),
      descriptionLongue: champ("descriptionLongue"),
      ingredients: champ("ingredients"),
      allergeneIds: Array.from(formulaire.querySelectorAll('[name="allergene"]:checked')).map((coche) => Number(coche.value)),
      variantes: Array.from(formulaire.querySelectorAll("[data-ligne]")).map((ligne) => ({
        libelle: ligne.querySelector('[name="libelle"]').value,
        prix: ligne.querySelector('[name="prix"]').value,
        stocks: Array.from(ligne.querySelectorAll('[name="stock"]')).map((champ) => ({
          id: champ.dataset.id === "" ? null : Number(champ.dataset.id),
          choixId: Number(champ.dataset.choixId),
          service: champ.dataset.service,
          stock: champ.value,
        })),
      })),
    };
  },
};

export { FormulaireProduitView };
