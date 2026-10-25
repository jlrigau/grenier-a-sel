// Passe à la version suivante (v45 → v46) dans sw.js et js/app.js en même temps.
// Le changement de sw.js déclenche la mise à jour automatique de l'application chez les utilisateurs.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const sw = path.join(root, 'sw.js');
const app = path.join(root, 'js/app.js');
const cur = fs.readFileSync(sw, 'utf8').match(/const VERSION = 'v(\d+)'/)[1];
const next = `v${Number(cur) + 1}`;
fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const VERSION = 'v\d+'/, `const VERSION = '${next}'`));
fs.writeFileSync(app, fs.readFileSync(app, 'utf8').replace(/const APP_VERSION = 'v\d+'/, `const APP_VERSION = '${next}'`));
console.log(`Version : v${cur} → ${next}`);
