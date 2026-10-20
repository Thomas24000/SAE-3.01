#!/usr/bin/env node

/**
 * Vérifie les invariants structurels de l'architecture front/back du projet.
 * Ce contrôle est volontairement statique : le build Vite reste la validation
 * de compilation et les tests métier restent à la charge de la fonctionnalité.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(process.argv[2] || path.join(scriptDirectory, '../../../..'));
const violations = [];

function exists(relativePath) {
  return fs.existsSync(path.join(projectDirectory, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(projectDirectory, relativePath), 'utf8');
}

function listFiles(relativeDirectory, extension) {
  const directory = path.join(projectDirectory, relativeDirectory);
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    return entry.isDirectory()
      ? listFiles(relativePath, extension)
      : entry.name.endsWith(extension) ? [relativePath] : [];
  });
}

function listJavaScriptFiles(relativeDirectory) {
  return listFiles(relativeDirectory, '.js');
}

// Retire les commentaires pour ne pas signaler une règle citée dans un commentaire.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|#).*$/gm, '');
}

if (process.argv.includes('--help')) {
  console.log(`Usage : node check-mvc.js [racine-du-projet]

Contrôles :
  - présence des couches pages, UI, data, lib et du bootstrap du routeur ;
  - absence d'accès DOM dans les modules data ;
  - absence d'appels réseau directs dans les composants UI ;
  - présence du bootstrap et des routes PHP ;
  - présence du script npm build du front ;
  - aucune boucle foreach / forEach / for...of (front et back) ;
  - declare(strict_types=1) dans chaque fichier PHP du back ;
  - innerHTML en écriture uniquement dans lib/utils.js et lib/router.js ;
  - aucun import de data/ ou de pages/ dans les composants UI.

Code de sortie : 0 si conforme, 1 si une violation est détectée.`);
  process.exit(0);
}

const requiredPaths = [
  'front/src/main.js',
  'front/src/pages',
  'front/src/ui',
  'front/src/data',
  'front/src/lib',
  'front/package.json',
  'back/index.php',
  'back/src/routes.php',
  'back/src/Core/Response.php',
];

requiredPaths.forEach((relativePath) => {
  if (!exists(relativePath)) violations.push(`Élément structurel absent : ${relativePath}`);
});

if (exists('front/src/main.js') && !/\brouter\.start\s*\(/.test(read('front/src/main.js'))) {
  violations.push('front/src/main.js ne démarre pas le routeur avec router.start().');
}

if (exists('front/package.json')) {
  const packageJson = JSON.parse(read('front/package.json'));
  if (packageJson.scripts?.build !== 'vite build') {
    violations.push('front/package.json doit conserver le script de build "vite build".');
  }
}

listJavaScriptFiles('front/src/data').forEach((relativePath) => {
  const source = read(relativePath);
  if (/\b(document|window)\s*[.(]/.test(source) || /\.innerHTML\s*=/.test(source)) {
    violations.push(`${relativePath} accède au DOM alors que data doit rester indépendant de la Vue.`);
  }
});

listJavaScriptFiles('front/src/ui').forEach((relativePath) => {
  const source = read(relativePath);
  if (/\b(fetch|getRequest|postRequest|putRequest|deleteRequest)\s*\(/.test(source)) {
    violations.push(`${relativePath} réalise un appel réseau ; déplacer cet appel dans data/page.`);
  }
});

const loopPattern = /\bforeach\s*\(|\.forEach\s*\(|\bfor\s*\(\s*(const|let|var)\s[^;)]*\bof\b/;
const innerHtmlAllowed = ['front/src/lib/utils.js', 'front/src/lib/router.js'];

listJavaScriptFiles('front/src').map((relativePath) => {
  const source = stripComments(read(relativePath));
  if (loopPattern.test(source)) {
    violations.push(`${relativePath} utilise foreach/forEach/for...of ; préférer for, while ou map.`);
  }
  if (/\.innerHTML\s*=/.test(source) && !innerHtmlAllowed.includes(relativePath.split(path.sep).join('/'))) {
    violations.push(`${relativePath} écrit innerHTML hors des helpers (utils.js, router.js).`);
  }
});

listFiles('back', '.php').map((relativePath) => {
  const source = read(relativePath);
  if (!/declare\(strict_types=1\)/.test(source)) {
    violations.push(`${relativePath} ne déclare pas declare(strict_types=1).`);
  }
  if (/\bforeach\s*\(/.test(stripComments(source))) {
    violations.push(`${relativePath} utilise foreach ; préférer for, while ou array_map.`);
  }
});

listJavaScriptFiles('front/src/ui').map((relativePath) => {
  if (/from\s+['"][^'"]*\/(data|pages)\//.test(read(relativePath))) {
    violations.push(`${relativePath} importe data/ ou pages/ ; un composant UI reste présentatif.`);
  }
});

if (violations.length > 0) {
  console.log(`${violations.length} violation(s) :`);
  violations.forEach((violation) => console.log(`- ${violation}`));
  process.exit(1);
}

console.log('OK : architecture front/back et séparation MVC structurelle conformes.');
