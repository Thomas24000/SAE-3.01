import { htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Pied de page : un composant sans données, qui n'a que son template.
let FooterView = {
  html: function () {
    return template;
  },

  dom: function () {
    return htmlToFragment(template);
  },
};

export { FooterView };
