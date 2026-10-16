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

function listJavaScriptFiles(relativeDirectory) {
  const directory = path.join(projectDirectory, relativeDirectory);
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    return entry.isDirectory()
      ? listJavaScriptFiles(relativePath)
      : entry.name.endsWith('.js') ? [relativePath] : [];
  });
}

if (process.argv.includes('--help')) {
  console.log(`Usage : node check-mvc.js [racine-du-projet]

Contrôles :
  - présence des couches pages, UI, data, lib et du bootstrap du routeur ;
  - absence d'accès DOM dans les modules data ;
  - absence d'appels réseau directs dans les composants UI ;
  - présence du bootstrap et des routes PHP ;
  - présence du script npm build du front.

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

if (violations.length > 0) {
  console.log(`${violations.length} violation(s) :`);
  violations.forEach((violation) => console.log(`- ${violation}`));
  process.exit(1);
}

console.log('OK : architecture front/back et séparation MVC structurelle conformes.');
