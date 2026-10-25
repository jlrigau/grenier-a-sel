// Données de démonstration (fictives) et dessin du plan, partagés par les maquettes.
import { ROOM, defaultTables, hasPower } from '../js/room.js';
import { optimize, evaluate, tableRect } from '../js/engine.js';

const DEMO = [
  ['Miel des Coteaux', 'Alimentation', 1, false, '', ['Rucher du Vexin']],
  ['Rucher du Vexin', 'Alimentation', 1, false, ''],
  ['Crêpes de Mamie', 'Restauration', 2, true, ''],
  ['Chocolaterie Martin', 'Alimentation', 1, true, ''],
  ['Bijoux Lune', 'Bijoux', 1, false, '', ['Atelier Perles']],
  ['Atelier Perles', 'Bijoux', 1, false, ''],
  ['Poterie du Grès', 'Céramique', 2, false, ''],
  ['Luminaires Récup', 'Décoration', 1, true, ''],
  ['Bougies & Cie', 'Décoration', 1, false, ''],
  ['Couture Créative', 'Vêtements', 2, true, ''],
  ['Tricots de Laine', 'Vêtements', 1, false, ''],
  ['Librairie Ambulante', 'Livres', 2, false, 'pourtour'],
  ['Club photo', 'Association', 2, false, 'hall'],
  ['Savonnerie du Val', 'Cosmétique', 1, false, ''],
  ['Jouets en bois', 'Jouets', 1, false, 'ilot'],
  ['Atelier Aquarelle', 'Art', 1, false, 'ilot'],
  ['Brocante du Moulin', 'Brocante', 2, false, ''],
];

export function demoEvent() {
  const ev = { tables: defaultTables(), exhibitors: [], assignments: {}, settings: {} };
  const byName = {};
  DEMO.forEach(([name, category, tables, electricity, zone], i) => {
    const ex = { id: 'e' + i, name, category, tables, electricity, zone, avoid: [], near: [] };
    byName[name] = ex;
    ev.exhibitors.push(ex);
  });
  DEMO.forEach(([name, , , , , avoid]) => { if (avoid) byName[name].avoid = avoid.map((n) => byName[n].id); });
  ev.assignments = optimize(ev, { mode: 'fresh', seed: 7, iterations: 20000 }).assignments;
  // Un exposant non placé et un conflit, pour montrer les états.
  for (const t of Object.keys(ev.assignments)) if (ev.assignments[t] === 'e16') delete ev.assignments[t];
  ev.exhibitors[16].placed = false;
  // Atelier Perles juste à côté de Bijoux Lune : un conflit « à séparer » à montrer.
  const tById = Object.fromEntries(ev.tables.map((t) => [t.id, t]));
  const bl = ev.tables.find((t) => ev.assignments[t.id] === 'e4');
  const next = ev.tables.find((t) => t.num === bl.num + 1);
  const ap = ev.tables.find((t) => ev.assignments[t.id] === 'e5');
  const other = ev.assignments[next.id];
  ev.assignments[next.id] = 'e5';
  if (other) ev.assignments[ap.id] = other; else delete ev.assignments[ap.id];
  void tById;
  const r = evaluate(ev);
  ev.conflictTables = new Set(r.issues.filter((i) => i.severity === 'error').flatMap((i) => i.tables));
  ev.exhibitors.forEach((e) => { e.nums = ev.tables.filter((t) => ev.assignments[t.id] === e.id).map((t) => t.num); });
  return { ev, evaluation: r };
}

export const categories = (ev) => [...new Set(ev.exhibitors.map((e) => e.category))];

// style : { palette: {catégorie: couleur}, room, building, wall, wallWidth, line, label, labelFont, labelBig,
//           table, tableLine, tableText, numText, font, numFont, radius, hatch, grid, gridColor, showNames, power }
export function planSVG(ev, st) {
  const B = ROOM.bounds;
  const o = [];
  const font = st.font || 'inherit';
  o.push(`<defs><pattern id="h-${st.id}" width="0.3" height="0.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="0.3" height="0.3" fill="${st.service || st.building}"/><line x1="0" y1="0" x2="0" y2="0.3" stroke="${st.hatch}" stroke-width="0.05"/></pattern>
    <pattern id="c-${st.id}" width="0.4" height="0.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.4" stroke="${st.clear || '#f3b0a8'}" stroke-width="0.06"/></pattern></defs>`);
  o.push(`<rect x="0" y="0" width="${B.w}" height="${B.h}" fill="${st.building}"/>`);
  for (const s of ROOM.spaces) {
    const fill = s.kind === 'service' ? `url(#h-${st.id})` : s.kind === 'outside' ? st.building : s.kind === 'stage' ? (st.stage || st.room) : st.room;
    o.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fill}" stroke="${s.kind === 'outside' ? 'none' : st.line}" stroke-width="0.04"/>`);
  }
  if (st.grid) {
    for (let x = 1; x < B.w; x++) o.push(`<line x1="${x}" y1="0" x2="${x}" y2="${B.h}" stroke="${st.gridColor}" stroke-width="0.015"/>`);
    for (let y = 1; y < B.h; y++) o.push(`<line x1="0" y1="${y}" x2="${B.w}" y2="${y}" stroke="${st.gridColor}" stroke-width="0.015"/>`);
  }
  for (const z of ROOM.zones) {
    if (z.type === 'clearance') o.push(`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="url(#c-${st.id})"/>`);
    else o.push(`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="${st.reserved || st.room}" stroke="${st.line}" stroke-width="0.03" stroke-dasharray="0.15 0.1"/>`);
  }
  const lab = (x, y, t, size, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${st.label}" text-anchor="middle" dominant-baseline="middle" font-family="${st.labelFont || font}" ${extra}>${t}</text>`;
  o.push(lab(12.5, 11.5, st.bigCase === 'upper' ? 'GRANDE SALLE' : 'Grande salle', 0.6, `fill-opacity="${st.bigOpacity ?? 0.5}" letter-spacing="${st.bigCase === 'upper' ? 0.15 : 0}" ${st.bigItalic ? 'font-style="italic"' : ''}`));
  o.push(lab(12.8, 18.6, st.bigCase === 'upper' ? "HALL D'ENTRÉE" : "Hall d'entrée", 0.5, `fill-opacity="${st.bigOpacity ?? 0.5}" letter-spacing="${st.bigCase === 'upper' ? 0.12 : 0}" ${st.bigItalic ? 'font-style="italic"' : ''}`));
  o.push(lab(27.25, 7.2, st.bigCase === 'upper' ? 'SCÈNE' : 'Scène', 0.55, `fill-opacity="${st.bigOpacity ?? 0.5}" ${st.bigItalic ? 'font-style="italic"' : ''}`));
  for (const s of ROOM.spaces.filter((x) => x.kind === 'service')) o.push(lab(s.x + s.w / 2, s.y + s.h / 2, s.label.split('\n')[0], 0.32, 'fill-opacity="0.8"'));
  o.push(`<rect x="0" y="0" width="${B.w}" height="${B.h}" fill="none" stroke="${st.wall}" stroke-width="${st.wallWidth || 0.22}"/>`);
  for (const d of ROOM.doors) o.push(`<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="${st.room}" stroke-width="${(st.wallWidth || 0.22) + 0.1}"/>`);
  for (const e of ROOM.exits) { const x2 = e.x + e.dir * 0.8; o.push(`<line x1="${e.x}" y1="${e.y}" x2="${x2}" y2="${e.y}" stroke="${st.exit || '#16a34a'}" stroke-width="0.1"/><path d="M${x2} ${e.y} l${-e.dir * 0.28} -0.2 v0.4 z" fill="${st.exit || '#16a34a'}"/>`); }

  const exById = Object.fromEntries(ev.exhibitors.map((e) => [e.id, e]));
  for (const t of ev.tables) {
    const r = tableRect(t);
    const w = r.x1 - r.x0, h = r.y1 - r.y0, v = h > w;
    const ex = exById[ev.assignments[t.id]];
    const fill = ex ? st.palette[ex.category] : st.table;
    const conflict = st.conflicts && st.conflicts.has(t.id);
    o.push(`<g transform="translate(${t.x} ${t.y})">`);
    o.push(`<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${st.radius ?? 0.06}" fill="${fill}" stroke="${conflict ? (st.danger || '#dc2626') : (ex ? (st.tableLineOcc || st.tableLine) : st.tableLine)}" stroke-width="${conflict ? 0.09 : (st.tableStroke || 0.03)}"/>`);
    if (st.numBadge) {
      o.push(`<circle cx="${-w / 2 + 0.2}" cy="${-h / 2 + 0.2}" r="0.15" fill="${st.numBadge}"/><text x="${-w / 2 + 0.2}" y="${-h / 2 + 0.21}" font-size="0.15" fill="${st.numBadgeText || '#fff'}" text-anchor="middle" dominant-baseline="middle" font-family="${st.numFont || font}" font-weight="700">${t.num}</text>`);
    } else {
      o.push(`<text x="${-w / 2 + 0.07}" y="${-h / 2 + 0.2}" font-size="0.16" fill="${st.numText}" font-family="${st.numFont || font}" font-weight="600">${t.num}</text>`);
    }
    if (ex && st.showNames !== false) {
      const max = Math.floor((Math.max(w, h) - 0.2) / 0.13);
      const name = ex.name.length > max ? ex.name.slice(0, max - 1) + '…' : ex.name;
      o.push(`<text y="0.09" font-size="0.23" fill="${st.tableText}" text-anchor="middle" font-family="${font}" font-weight="${st.nameWeight || 600}" ${v ? 'transform="rotate(-90)"' : ''}>${name}</text>`);
    }
    if (st.power && hasPower(t)) o.push(`<circle cx="${w / 2 - 0.11}" cy="${h / 2 - 0.11}" r="0.065" fill="${st.power}"/>`);
    o.push('</g>');
  }
  return `<svg viewBox="-0.9 -0.9 ${B.w + 1.8} ${B.h + 1.8}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">${o.join('')}</svg>`;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
