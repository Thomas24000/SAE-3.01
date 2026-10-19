import { AdminData } from "../../data/admin.js";
import { reload } from "../../lib/navigation.js";
import { htmlToFragment } from "../../lib/utils.js";
import { NavigationAdminView } from "../../ui/navigation-admin/index.js";
import template from "./template.html?raw";

// Sections du back-office. Une section pas encore construite est affichée
// grisée, sans lien (voir GOF-a pour les produits).
const LIENS = [
  { libelle: "Tableau de bord", href: "/admin", icone: "tableau", disponible: true },
  { libelle: "Produits", href: "/admin/produits", icone: "produits", disponible: false },
  { libelle: "Catégories", href: "/admin/categories", icone: "categories", disponible: true },
];

/**
 * Clic sur « Déconnexion » : ferme la session administrateur puis réaffiche la
 * page, qui relit la session et montre alors l'écran de connexion.
 */
async function handlerLogout() {
  try {
    await AdminData.logout();
  } catch (erreur) {
    // La page réaffichée relira la session réelle auprès du serveur.
  }
  reload();
}

/**
 * Layout du back-office, distinct de celui de la boutique : barre de navigation
 * (latérale ou supérieure selon l'écran) et contenu.
 *
 * Sans administrateur connecté (la page vient de le constater auprès du
 * serveur), le layout ne contient que la page : l'écran de connexion occupe
 * toute la fenêtre.
 *
 * @returns {DocumentFragment}
 */
export function AdminLayout() {
  if (AdminData.knownEmail === null) return htmlToFragment("<slot></slot>");

  let layout = htmlToFragment(template);
  layout
    .querySelector('slot[name="navigation"]')
    .replaceWith(NavigationAdminView.dom({ liens: LIENS }, { surDeconnexion: handlerLogout }));
  return layout;
}
