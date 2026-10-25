// Géométrie de la salle du Grenier à Sel de Gainneville.
// Reconstituée d'après le plan papier (cotes approximatives), en mètres.
// Repère : x vers la droite (scène à droite), y vers le bas (hall d'entrée en bas).

export const ROOM = {
  bounds: { x: 0, y: 0, w: 29.5, h: 24.1 },

  // Pièces dessinées sur le plan.
  spaces: [
    { id: 'salle', label: 'Grande salle', x: 0, y: 0, w: 25, h: 14.9, kind: 'main' },
    { id: 'scene', label: 'Scène', x: 25, y: 2.1, w: 4.5, h: 10.3, kind: 'stage' },
    { id: 'sas', label: 'Sas', x: 25, y: 0, w: 4.5, h: 2.1, kind: 'service' },
    { id: 'degagement', label: 'Dégagement', x: 25, y: 12.4, w: 4.5, h: 2.5, kind: 'service' },
    { id: 'hall', label: "Hall d'entrée", x: 8.4, y: 14.9, w: 8.8, h: 9.2, kind: 'main' },
    { id: 'sanit-g', label: 'Sanitaires', x: 0, y: 14.9, w: 2.8, h: 4.3, kind: 'service' },
    { id: 'wc', label: 'WC', x: 2.8, y: 14.9, w: 3.6, h: 4.3, kind: 'service' },
    { id: 'menage', label: 'Ménage', x: 6.4, y: 14.9, w: 2, h: 2.4, kind: 'service' },
    { id: 'local', label: 'Local', x: 6.4, y: 17.3, w: 2, h: 1.9, kind: 'service' },
    { id: 'vestiaire', label: 'Vestiaire\nBuvette', x: 17.2, y: 14.9, w: 2.5, h: 4.3, kind: 'service' },
    { id: 'reserve', label: 'Réserve', x: 19.7, y: 14.9, w: 2.1, h: 4.3, kind: 'service' },
    { id: 'cuisine', label: 'Cuisine', x: 21.8, y: 14.9, w: 4, h: 4.3, kind: 'service' },
    { id: 'sanit-d', label: 'Sanitaires', x: 25.8, y: 14.9, w: 3.7, h: 4.3, kind: 'service' },
    { id: 'annexe-g', label: '', x: 0, y: 19.2, w: 8.4, h: 4.9, kind: 'outside' },
    { id: 'annexe-d', label: '', x: 17.2, y: 19.2, w: 12.3, h: 4.9, kind: 'outside' },
  ],

  // Espaces où l'on peut poser des tables.
  usable: [
    { x: 0, y: 0, w: 25, h: 14.9 },
    { x: 25, y: 2.1, w: 4.5, h: 10.3 },
    { x: 8.4, y: 14.9, w: 8.8, h: 9.2 },
  ],

  // Zones à respecter : clearance/fixed = interdites, reserved = à éviter.
  zones: [
    { id: 'grilles', type: 'reserved', label: 'Espace grilles', x: 6.25, y: 6.1, w: 12, h: 2.1 },
    { id: 'buvette', type: 'reserved', label: 'Espace buvette', x: 14.6, y: 20.6, w: 2.6, h: 3.5 },
    { id: 'accueil', type: 'fixed', label: 'Accueil / caisse', x: 16.6, y: 12.5, w: 0.8, h: 1.7 },
    { id: 'c-ss1', type: 'clearance', label: 'le dégagement de la sortie de secours', x: 0, y: 0, w: 1.6, h: 2.5 },
    { id: 'c-ss2', type: 'clearance', label: 'le dégagement de la sortie de secours', x: 23.6, y: 0, w: 1.4, h: 2.1 },
    { id: 'c-ss3', type: 'clearance', label: 'le dégagement de la sortie de secours', x: 23.6, y: 12.4, w: 1.4, h: 2.5 },
    { id: 'c-sortie', type: 'clearance', label: 'le passage de la porte « Sortie »', x: 8.9, y: 13.5, w: 2, h: 2.8 },
    { id: 'c-entree', type: 'clearance', label: 'le passage de la porte « Entrée »', x: 15, y: 13.5, w: 1.6, h: 2.8 },
    { id: 'c-hall', type: 'clearance', label: "le passage de l'entrée principale", x: 11.4, y: 22.6, w: 3.5, h: 1.5 },
  ],

  // Bandes de stands (tracés rouges du plan papier), à titre indicatif.
  standZones: [
    { x: 0, y: 2.6, w: 2, h: 12.3 },
    { x: 2, y: 12.9, w: 6.2, h: 2 },
    { x: 4.25, y: 4.1, w: 16, h: 6 },
    { x: 2.3, y: 0, w: 18.2, h: 2 },
    { x: 23, y: 3.1, w: 2, h: 8 },
    { x: 11.2, y: 12.9, w: 3.25, h: 2 },
    { x: 18.7, y: 12.9, w: 3.5, h: 2 },
    { x: 8.4, y: 19.7, w: 2, h: 4.25 },
  ],

  doors: [
    { label: 'Sortie', x1: 8.9, y1: 14.9, x2: 10.9, y2: 14.9 },
    { label: 'Entrée', x1: 15, y1: 14.9, x2: 16.6, y2: 14.9 },
    { label: 'Entrée principale', x1: 11.4, y1: 24.1, x2: 14.9, y2: 24.1 },
    { label: '', x1: 25, y1: 0.2, x2: 25, y2: 1.9 },
    { label: '', x1: 25, y1: 12.6, x2: 25, y2: 14.7 },
    { label: '', x1: 0, y1: 0.4, x2: 0, y2: 2.1 },
    { label: '', x1: 29.5, y1: 0.2, x2: 29.5, y2: 1.9 },
    { label: '', x1: 29.5, y1: 12.8, x2: 29.5, y2: 14.5 },
  ],

  exits: [
    { x: 0, y: 1.25, dir: -1 },
    { x: 29.5, y: 1.05, dir: 1 },
    { x: 29.5, y: 13.65, dir: 1 },
  ],
};

// Secteurs utilisés pour les préférences d'emplacement des exposants.
export const REGIONS = [
  { id: 'ilot', label: 'Îlot central', x: 4, y: 3.9, w: 16.5, h: 6.4 },
  { id: 'scene', label: 'Scène', x: 25, y: 2.1, w: 4.5, h: 10.3 },
  { id: 'hall', label: "Hall d'entrée", x: 8.4, y: 14.9, w: 8.8, h: 9.2 },
  { id: 'pourtour', label: 'Pourtour de la salle', x: 0, y: 0, w: 25, h: 14.9 },
];

export function regionAt(x, y) {
  const r = REGIONS.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
  return r ? r.id : 'autre';
}

export function regionLabel(id) {
  const r = REGIONS.find((z) => z.id === id);
  return r ? r.label : 'Hors salle';
}

// Tables de 1,80 m (comme indiqué sur les fiches d'inscription).
export const TABLE_SIZE = { w: 1.8, h: 0.8 };

// Les 48 tables du plan papier, placées côté allée dans chaque bande de stands.
export function defaultTables() {
  const tables = [];
  const add = (x, y, rot) => tables.push({
    id: 't' + (tables.length + 1), num: tables.length + 1,
    x: round(x), y: round(y), w: TABLE_SIZE.w, h: TABLE_SIZE.h, rot, blocked: false,
  });
  [3.7, 5.55, 7.4, 9.25, 11.1].forEach((y) => add(1.6, y, 90)); // mur gauche
  [3.35, 5.2, 7.05].forEach((x) => add(x, 13.3, 0)); // bas gauche
  for (let i = 0; i < 10; i++) add(3.3 + i * 1.8, 1.6, 0); // mur du haut
  for (let i = 0; i < 7; i++) add(6.55 + i * 1.9, 4.5, 0); // îlot, côté haut
  add(19.85, 6.15, 90); add(19.85, 8.05, 90); // îlot, bout droit
  for (let i = 0; i < 7; i++) add(17.95 - i * 1.9, 9.7, 0); // îlot, côté bas
  add(4.65, 8.05, 90); add(4.65, 6.15, 90); // îlot, bout gauche
  [4.1, 6.1, 8.1, 10.1].forEach((y) => add(23.4, y, 90)); // devant la scène
  [12, 13.9].forEach((x) => add(x, 13.3, 0)); // entre les portes
  [19.6, 21.45].forEach((x) => add(x, 13.3, 0)); // près de la réserve
  [20.5, 22.4].forEach((y) => add(10, y, 90)); // hall
  [3.8, 10.7].forEach((y) => add(27, y, 90)); // scène
  return tables;
}

// Électricité : seules les tables le long des murs de la grande salle y ont accès
// (ni l'îlot central, ni les tables devant ou sur la scène, ni le hall).
export function wallPower(t) {
  const inSalle = t.x >= 0 && t.x <= 25 && t.y >= 0 && t.y <= 14.9;
  if (!inSalle || t.x > 22.5 || regionAt(t.x, t.y) === 'ilot') return false;
  return t.x < 2.6 || t.y < 2.6 || t.y > 12.3;
}

// Une table peut forcer la règle (power: true/false), sinon la règle des murs s'applique.
export function hasPower(t) {
  return typeof t.power === 'boolean' ? t.power : wallPower(t);
}

function round(v) {
  return Math.round(v * 100) / 100;
}
