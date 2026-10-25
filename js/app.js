import { ROOM, REGIONS, TABLE_SIZE, defaultTables, regionAt, regionLabel, hasPower, wallPower } from './room.js';
import { evaluate, optimize, placeOne, groupAround, tableRect, DEFAULT_SETTINGS, SEVERITY_RANK } from './engine.js';
import { readFiche, guessCategory } from './fiches.js';
import { buildXlsx } from './xlsx.js';

const STORAGE_KEY = 'grenier-a-sel/v1';
const NOTICE_KEY = 'grenier-a-sel/notice-dismissed';
const PALETTE = ['#ffd97a', '#a9d3f5', '#b6e6c6', '#f7a8a0', '#d7c2f5', '#a5e3da', '#f8bfd7', '#ffb38a', '#cfe89a', '#b9c4f3', '#e3d8c8', '#ffe08f', '#c6e2f0', '#f3c9a5'];
// Palettes des versions précédentes : converties à l'ouverture d'un événement.
const OLD_PALETTES = [
  ['#b9d3e8', '#f7d98a', '#c4dfb0', '#f5b9ad', '#d9c8ec', '#a8d8cc', '#f5c8dc', '#e8cba4', '#c3c9ec', '#dbe6a3', '#b3dbe9', '#e6ddd2', '#f2c3b0', '#cfe3d6'],
  ['#8ecae6', '#f6bd60', '#90be6d', '#f28482', '#cdb4db', '#84a59d', '#ffafcc', '#d4a373', '#f9e07f', '#9fa8da', '#a8e6cf', '#ffab91', '#b0bec5', '#c5d86d'],
  ['#b2ccff', '#fedf89', '#a6f4c5', '#fecdca', '#d9d6fe', '#99f6e0', '#fcceee', '#fddcab', '#c7d7fe', '#d0f8ab', '#b9e6fe', '#e4e7ec', '#fecdd6', '#d6bbfb'],
];
const migrateColor = (c) => { for (const old of OLD_PALETTES) if (old.includes(c)) return PALETTE[old.indexOf(c)]; return c; };
const ic = (name, cls = '') => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const NO_CATEGORY_COLOR = '#ece6da';
const SNAP = 0.05;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = (p) => p + Math.random().toString(36).slice(2, 9);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const r2 = (v) => Math.round(v * 100) / 100;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const plural = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;
const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || $('dialog[open]');

// ---------- Données ----------

function newEvent(name, date = '') {
  return {
    id: uid('ev'), name, date, notes: '',
    tables: defaultTables(),
    exhibitors: [], assignments: {}, categoryColors: {}, plans: [], activePlanId: null,
    settings: { ...DEFAULT_SETTINGS }, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

function newExhibitor(fields = {}) {
  return {
    id: uid('ex'), name: '', category: '', tables: 1, electricity: false, zone: '', avoid: [], near: [], locked: false,
    firstName: '', lastName: '', products: '', grilles: 0, phone: '', email: '', payment: '', notes: '', ...fields,
  };
}

function normalizeEvent(ev) {
  const base = newEvent(ev.name || 'Événement');
  const out = { ...base, ...ev };
  out.settings = { ...DEFAULT_SETTINGS, ...(ev.settings || {}) };
  out.exhibitors = (ev.exhibitors || []).map((e) => {
    const ex = newExhibitor({ ...e, avoid: e.avoid || [], near: e.near || [] });
    if (ex.contact && !ex.phone && !ex.email) { if (ex.contact.includes('@')) ex.email = ex.contact; else ex.phone = ex.contact; }
    delete ex.contact;
    return ex;
  });
  out.categoryColors = Object.fromEntries(Object.entries(ev.categoryColors || {}).map(([k, c]) => [k, migrateColor(c)]));
  if (out.name === 'Exemple – Marché de Noël') out.demo = true;
  if (out.demo && /^(Exemple – Marché de Noël|Démonstration \(données fictives\))$/.test(out.name)) out.name = 'Démonstration';
  if (out.demo) {
    const renamed = { 'Miel': 'Miel des Coteaux', 'Confitures': 'Rucher du Vexin', 'Crêpes': 'Crêpes de Mamie', 'Chocolats': 'Chocolaterie Martin', 'Bijoux': 'Bijoux Lune', 'Perles': 'Atelier Perles', 'Poterie': 'Poterie du Grès', 'Luminaires': 'Luminaires Récup', 'Bougies': 'Bougies & Cie', 'Couture': 'Couture Créative', 'Tricots': 'Tricots de Laine', 'Livres': 'Librairie Ambulante', 'Association': 'Club photo', 'Savons': 'Savonnerie du Val', 'Jouets en bois': 'Jouets en bois', 'Peintures': 'Atelier Aquarelle' };
    out.exhibitors.forEach((e) => { const m = e.name.match(/^(.*) \(démo\)$/); if (m && renamed[m[1]]) e.name = renamed[m[1]]; });
  }
  out.assignments = ev.assignments || {};
  delete out.outlets;
  delete out.settings.elecDistance;
  out.plans = ev.plans || [];
  out.tables = (ev.tables || []).map((t) => ({ w: TABLE_SIZE.w, h: TABLE_SIZE.h, rot: 0, blocked: false, ...t }));
  out.exhibitors.forEach((e) => ensureCategoryColor(out, e.category));
  return out;
}

// Événement de démonstration : données entièrement synthétiques. Les noms de stands sont
// inventés, sans nom de personne, téléphone ni e-mail. Il peut être supprimé dans « Réglages ».
const DEMO_EXHIBITORS = [
  // [nom, catégorie, objets vendus, tables, électricité, emplacement, à séparer de]
  ['Miel des Coteaux', 'Alimentation', 'Miel et pain d\'épices', 1, false, '', ['Rucher du Vexin']],
  ['Rucher du Vexin', 'Alimentation', 'Miel, bougies en cire', 1, false, ''],
  ['Crêpes de Mamie', 'Restauration', 'Crêpes et boissons chaudes', 2, true, ''],
  ['Chocolaterie Martin', 'Alimentation', 'Chocolats artisanaux', 1, true, ''],
  ['Bijoux Lune', 'Bijoux', 'Bijoux fantaisie', 1, false, '', ['Atelier Perles']],
  ['Atelier Perles', 'Bijoux', 'Colliers et bracelets en perles', 1, false, ''],
  ['Poterie du Grès', 'Céramique', 'Poteries, vaisselle', 2, false, ''],
  ['Luminaires Récup', 'Décoration', 'Lampes de récupération', 1, true, ''],
  ['Bougies & Cie', 'Décoration', 'Bougies parfumées', 1, false, ''],
  ['Couture Créative', 'Vêtements', 'Sacs et accessoires cousus main', 2, true, ''],
  ['Tricots de Laine', 'Vêtements', 'Bonnets, écharpes', 1, false, ''],
  ['Librairie Ambulante', 'Livres', 'Livres d\'occasion', 2, false, 'pourtour'],
  ['Club photo', 'Association', 'Tirages photo', 2, false, 'hall'],
  ['Savonnerie du Val', 'Cosmétique', 'Savons artisanaux', 1, false, ''],
  ['Jouets en bois', 'Jouets', 'Jouets en bois', 1, false, 'ilot'],
  ['Atelier Aquarelle', 'Art', 'Peintures sur grilles', 1, false, 'ilot'],
];

function makeDemoEvent() {
  const ev = newEvent('Démonstration', '');
  ev.demo = true;
  const byName = {};
  for (const [name, category, products, tables, electricity, zone] of DEMO_EXHIBITORS) {
    const ex = newExhibitor({ name, category, products, tables, electricity, zone, grilles: zone === 'ilot' ? 2 : 0, payment: String(tables * 5) });
    byName[name] = ex;
    ev.exhibitors.push(ex);
    ensureCategoryColor(ev, category);
  }
  for (const [name, , , , , , avoid] of DEMO_EXHIBITORS) if (avoid) byName[name].avoid = avoid.map((n) => byName[n].id);
  byName['Tricots de Laine'].near = [byName['Couture Créative'].id];
  ev.assignments = optimize(ev, { mode: 'fresh', seed: 7, iterations: 20000 }).assignments;
  return ev;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.events) && d.events.length) {
        d.events = d.events.map(normalizeEvent);
        return d;
      }
    }
  } catch (e) { console.warn(e); }
  const demo = makeDemoEvent();
  return { events: [demo], currentId: demo.id };
}

let db = load();
let undoStack = [];
let redoStack = [];

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
  catch (e) { toast("Impossible d'enregistrer dans ce navigateur. Pensez à exporter vos données.", 'error'); }
}

function cur() {
  return db.events.find((e) => e.id === db.currentId) || db.events[0];
}

function commit(fn) {
  const ev = cur();
  const before = JSON.stringify(ev);
  fn(ev);
  if (JSON.stringify(ev) === before) { refresh(); return; }
  ev.updatedAt = Date.now();
  undoStack.push({ id: ev.id, json: before });
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
  save();
  refresh();
  scheduleFileSync();
}

function restore(from, to) {
  const state = from.pop();
  if (!state) return;
  const i = db.events.findIndex((e) => e.id === state.id);
  if (i < 0) return;
  to.push({ id: state.id, json: JSON.stringify(db.events[i]) });
  db.events[i] = JSON.parse(state.json);
  db.currentId = state.id;
  save();
  refresh();
  scheduleFileSync();
}
const undo = () => restore(undoStack, redoStack);
const redo = () => restore(redoStack, undoStack);

// ---------- Helpers métier ----------

function ensureCategoryColor(ev, category) {
  const key = (category || '').trim().toLowerCase();
  if (!key || ev.categoryColors[key]) return;
  const used = new Set(Object.values(ev.categoryColors));
  ev.categoryColors[key] = PALETTE.find((c) => !used.has(c)) || PALETTE[Object.keys(ev.categoryColors).length % PALETTE.length];
}

function colorFor(ex, ev = cur()) {
  const key = (ex.category || '').trim().toLowerCase();
  return (key && ev.categoryColors[key]) || NO_CATEGORY_COLOR;
}

// Initiales pour l'avatar d'un exposant (« Chocolaterie Martin » → « CM »).
function initials(name) {
  const words = (name || '?').replace(/[&()·'’-]/g, ' ').split(/\s+/).filter(Boolean);
  const main = words.filter((w) => w.length > 2 || /^[A-ZÀ-Ý]/.test(w));
  return ((main[0] || words[0] || '?')[0] + ((main[1] || '')[0] || '')).toUpperCase();
}

const exById = (id, ev = cur()) => ev.exhibitors.find((e) => e.id === id);
const tableById = (id, ev = cur()) => ev.tables.find((t) => t.id === id);
const tablesOf = (exId, ev = cur()) => ev.tables.filter((t) => ev.assignments[t.id] === exId);
const tableNums = (exId, ev = cur()) => tablesOf(exId, ev).map((t) => t.num).sort((a, b) => a - b);

function unassign(ev, exId) {
  for (const [tid, eid] of Object.entries(ev.assignments)) if (eid === exId) delete ev.assignments[tid];
}

// Glisser un exposant sur une table : prend un groupe de tables contiguës autour,
// ou échange avec l'exposant déjà présent.
function assignToTable(exId, tableId, { addOnly = false } = {}) {
  const ev = cur();
  const ex = exById(exId);
  const table = tableById(tableId);
  if (!ex || !table) return;
  const owner = ev.assignments[tableId];
  if (owner === exId && !addOnly) return;
  let message = null;
  commit((ev) => {
    if (addOnly) {
      if (owner && owner !== exId) message = `${exById(owner, ev).name} a été retiré de la table ${table.num}`;
      ev.assignments[tableId] = exId;
      return;
    }
    const oldTables = tablesOf(exId, ev).map((t) => t.id);
    if (owner) {
      const other = exById(owner, ev);
      const otherTables = tablesOf(owner, ev).map((t) => t.id);
      unassign(ev, exId);
      unassign(ev, owner);
      otherTables.forEach((t) => { ev.assignments[t] = exId; });
      oldTables.forEach((t) => { ev.assignments[t] = owner; });
      message = oldTables.length ? `${ex.name} et ${other.name} ont échangé leurs places` : `${other.name} a été retiré du plan (non placé)`;
    } else {
      unassign(ev, exId);
      const group = groupAround(ev, tableId, Math.max(1, ex.tables || 1), (tid) => !ev.assignments[tid]);
      group.forEach((t) => { ev.assignments[t] = exId; });
      if (group.length < (ex.tables || 1)) message = `Pas assez de tables libres contiguës : ${ex.name} n'a que ${plural(group.length, 'table')}`;
    }
  });
  ui.selectedEx = exId;
  refresh();
  if (message) toast(message, 'info');
}

// Place un exposant ; si sa place ne respecte pas les contraintes, réajuste le plan
// en déplaçant le moins d'exposants possible (les exposants verrouillés ne bougent pas).
function placeAndAdjust(exId) {
  const ex = exById(exId);
  if (!ex) return;
  const trial = structuredClone(cur());
  const res = placeOne(trial, exId);
  trial.assignments = res.assignments;
  const score = (e) => {
    const r = evaluate(e);
    return r.issues.filter((i) => i.severity === 'error').length * 10 + r.issues.filter((i) => i.type === 'unplaced' || i.type === 'missing').length;
  };
  const mine = (e) => (evaluate(e).byExhibitor.get(exId) || []).filter((i) => i.severity === 'error' || i.type === 'missing' || i.type === 'unplaced');
  let adjusted = 0;
  if (!res.found || mine(trial).length) {
    const before = Object.fromEntries(Object.entries(trial.assignments));
    const opt = optimize(trial, { mode: 'keep', iterations: 30000 });
    const candidate = { ...trial, assignments: opt.assignments };
    if (score(candidate) < score(trial)) {
      trial.assignments = opt.assignments;
      adjusted = trial.exhibitors.filter((e) => e.id !== exId && JSON.stringify(tablesOf(e.id, { ...trial, assignments: before }).map((t) => t.id)) !== JSON.stringify(tablesOf(e.id, trial).map((t) => t.id))).length;
    }
  }
  commit((ev) => { ev.assignments = trial.assignments; });
  ui.selectedEx = exId;
  refresh();
  focusExhibitor(exId);
  const nums = tableNums(exId);
  const problems = (evaluation.byExhibitor.get(exId) || []).filter((i) => i.severity === 'error' || i.type === 'missing');
  if (!nums.length) toast(`${ex.name} ajouté mais non placé : plus de tables libres adaptées.`, 'warning');
  else if (problems.length) toast(`${ex.name} placé (table ${nums.join(', ')}), mais : ${problems[0].msg}`, 'warning');
  else toast(`${ex.name} placé sur ${nums.length > 1 ? 'les tables' : 'la table'} ${nums.join(', ')}${adjusted ? ` · plan réajusté (${plural(adjusted, 'exposant déplacé', 'exposants déplacés')})` : ''}`, 'success', { label: 'Annuler', fn: undo });
}

function runOptimize(mode) {
  const ev = cur();
  if (!ev.exhibitors.length) { toast("Ajoutez d'abord des exposants.", 'info'); return; }
  $('#busy').hidden = false;
  setTimeout(() => {
    try {
      const before = countErrors();
      const res = optimize(ev, { mode, iterations: mode === 'fresh' ? 60000 : 40000 });
      commit((e) => { e.assignments = res.assignments; });
      const after = countErrors();
      const { placed, total, moved } = res.stats;
      const parts = [`${placed}/${total} exposants placés`];
      if (mode === 'keep') parts.push(`${plural(moved, 'exposant déplacé', 'exposants déplacés')}`);
      parts.push(after ? `${plural(after, 'conflit restant', 'conflits restants')}` : 'aucun conflit');
      toast(parts.join(' · ') + (before !== after && mode === 'keep' ? ` (avant : ${before})` : ''), after ? 'warning' : 'success', { label: 'Annuler', fn: undo });
    } finally {
      $('#busy').hidden = true;
    }
  }, 30);
}

const countErrors = () => evaluate(cur()).issues.filter((i) => i.severity === 'error').length;

// ---------- État de l'interface ----------

const ui = {
  mode: 'place', tab: 'exhibitors', filter: 'all', search: '',
  selectedEx: null, selectedTable: null,
  view: { s: 30, tx: 0, ty: 0 },
};
let evaluation = evaluate(cur());

function refresh() {
  const ev = cur();
  if (ui.selectedEx && !exById(ui.selectedEx)) ui.selectedEx = null;
  if (ui.selectedTable && !tableById(ui.selectedTable)) ui.selectedTable = null;
  evaluation = evaluate(ev);
  renderHeader();
  renderSidebar();
  renderMap();
  renderInspector();
  renderLegend();
}

// ---------- En-tête ----------

function renderHeader() {
  const ev = cur();
  const sel = $('#event-select');
  sel.innerHTML = [...db.events]
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.name.localeCompare(b.name))
    .map((e) => `<option value="${e.id}" ${e.id === ev.id ? 'selected' : ''}>${esc(e.name)}</option>`)
    .join('');
  $('#event-date').textContent = ev.date ? formatLongDate(ev.date) : 'Date à préciser';
  $('#event-date').classList.toggle('empty', !ev.date);
  $('#btn-undo').disabled = !undoStack.length;
  $('#btn-redo').disabled = !redoStack.length;
}

function formatLongDate(d) {
  const date = new Date(d + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return d;
  const txt = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
}

// ---------- Chiffres clés ----------

function renderStats() {
  const ev = cur();
  const placed = ev.exhibitors.filter((e) => evaluation.exTables.has(e.id)).length;
  const used = Object.keys(ev.assignments).filter((t) => tableById(t)).length;
  const usable = ev.tables.filter((t) => !t.blocked).length;
  const elec = ev.exhibitors.filter((e) => e.electricity).length;
  const todo = evaluation.issues.filter((i) => i.severity === 'error' || i.severity === 'warning').length;
  const card = (cls, icon, value, label, act) => `<button class="stat ${cls}" ${act ? `data-stat="${act}"` : ''}><span class="stat-ic">${ic(icon)}</span><span><b>${value}</b><span>${label}</span></span></button>`;
  $('#stats-row').innerHTML = [
    card('green', 'users', `${placed}/${ev.exhibitors.length}`, 'exposants placés', 'unplaced'),
    card('sky', 'table2', `${used}/${usable}`, 'tables occupées', ''),
    card('mustard', 'zap', elec, `besoin${elec > 1 ? 's' : ''} d'électricité`, 'power'),
    card(todo ? 'coral' : 'ok', todo ? 'alert' : 'check', todo, todo > 1 ? 'points à régler' : todo ? 'point à régler' : 'tout est en ordre', 'checks'),
  ].join('');
}

function renderNav() {
  const map = { exhibitors: 'plan', checks: 'plan', plans: 'plans', settings: 'settings' };
  $$('#main-nav [data-nav], #tabbar [data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === map[ui.tab]));
}

function renderTopAlert() {
  const box = $('#top-alert');
  const err = evaluation.issues.find((i) => i.severity === 'error');
  const unplaced = cur().exhibitors.filter((e) => !evaluation.exTables.has(e.id)).length;
  if (err) {
    box.innerHTML = `<div class="alert coral">${ic('alert')}<span>${esc(err.msg)}</span><button class="pill tiny coral" data-alert="fix">Corriger</button></div>`;
  } else if (unplaced) {
    box.innerHTML = `<div class="alert mustard">${ic('clock')}<span>${plural(unplaced, 'exposant')} à placer</span><button class="pill tiny mustard" data-alert="fix">Placer</button></div>`;
  } else box.innerHTML = '';
}

// ---------- Barre latérale ----------

function renderSidebar() {
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
  $$('.tab-panel').forEach((p) => { p.hidden = p.id !== 'tab-' + ui.tab; });
  const errors = evaluation.issues.filter((i) => i.severity === 'error').length;
  const warnings = evaluation.issues.filter((i) => i.severity === 'warning').length;
  const badge = $('#checks-badge');
  badge.textContent = errors || warnings || '';
  badge.className = 'badge ' + (errors ? 'error' : warnings ? 'warning' : '');
  if (ui.tab === 'exhibitors') renderExhibitors();
  if (ui.tab === 'checks') renderChecks();
  if (ui.tab === 'plans') renderPlans();
  if (ui.tab === 'settings') renderSettings();
  renderPlanStatus();
  renderListBadge();
  renderStats();
  renderNav();
  renderTopAlert();
}

function exStatus(ex) {
  const issues = evaluation.byExhibitor.get(ex.id) || [];
  const worst = issues.reduce((m, i) => Math.max(m, i.type === 'unplaced' ? 0 : SEVERITY_RANK[i.severity]), 0);
  const placed = evaluation.exTables.has(ex.id);
  return { issues, placed, worst: worst === 3 ? 'error' : worst === 2 ? 'warning' : worst === 1 ? 'info' : 'ok' };
}

function renderExhibitors() {
  const ev = cur();
  const q = ui.search.trim().toLowerCase();
  $$('#ex-filters button').forEach((b) => b.classList.toggle('active', b.dataset.filter === ui.filter));
  const placedCount = ev.exhibitors.filter((e) => evaluation.exTables.has(e.id)).length;
  const needed = ev.exhibitors.reduce((s, e) => s + (Number(e.tables) || 1), 0);
  const free = ev.tables.filter((t) => !ev.assignments[t.id] && !t.blocked).length;
  const grilles = ev.exhibitors.reduce((s, e) => s + (Number(e.grilles) || 0), 0);
  $('#demo-banner').hidden = !ev.demo;
  $('#ex-stats').innerHTML = `<span><b>${placedCount}</b>/${ev.exhibitors.length} placés</span><span><b>${needed}</b> tables demandées / ${ev.tables.filter((t) => !t.blocked).length}</span><span><b>${free}</b> libres</span><span><b>${grilles}</b> grilles${ev.settings.grillesAvailable ? ' / ' + ev.settings.grillesAvailable : ''}</span>`;

  const items = ev.exhibitors
    .map((ex) => ({ ex, st: exStatus(ex) }))
    .filter(({ ex, st }) => {
      if (q && !`${ex.name} ${ex.category} ${ex.products} ${ex.phone} ${ex.email} ${ex.notes}`.toLowerCase().includes(q)) return false;
      if (ui.filter === 'unplaced') return !st.placed;
      if (ui.filter === 'issues') return st.worst === 'error' || st.worst === 'warning' || !st.placed;
      return true;
    })
    .sort((a, b) => a.ex.name.localeCompare(b.ex.name, 'fr'));

  const list = $('#ex-list');
  if (!ev.exhibitors.length) {
    list.innerHTML = `<li class="empty">Aucun exposant pour l'instant.<br>Cliquez sur « + Ajouter un exposant ».</li>`;
    return;
  }
  if (!items.length) {
    list.innerHTML = `<li class="empty">Aucun exposant ne correspond.</li>`;
    return;
  }
  list.innerHTML = items.map(({ ex, st }) => {
    const nums = tableNums(ex.id);
    const selected = ui.selectedEx === ex.id;
    const icon = !st.placed ? `<span class="st st-unplaced" title="Non placé">${ic('circle')}</span>`
      : st.worst === 'error' ? `<span class="st st-error" title="Contrainte non respectée">${ic('alert')}</span>`
      : st.worst === 'warning' ? `<span class="st st-warning" title="À vérifier">${ic('alert')}</span>`
      : `<span class="st st-ok" title="Contraintes respectées">${ic('check')}</span>`;
    let detail = '';
    if (selected) {
      const names = (ids) => ids.map((id) => exById(id)?.name).filter(Boolean).map(esc).join(', ');
      const avoidedBy = ev.exhibitors.filter((o) => (o.avoid || []).includes(ex.id)).map((o) => o.id);
      const rows = [];
      if (ex.zone) rows.push(`<div><span class="k">Emplacement</span> ${esc(regionLabel(ex.zone))}</div>`);
      const avoidAll = [...new Set([...(ex.avoid || []), ...avoidedBy])];
      if (avoidAll.length) rows.push(`<div><span class="k">À séparer de</span> ${names(avoidAll)}</div>`);
      if ((ex.near || []).length) rows.push(`<div><span class="k">Proche de</span> ${names(ex.near)}</div>`);
      if (ex.products) rows.push(`<div><span class="k">Objets vendus</span> ${esc(ex.products)}</div>`);
      if (ex.grilles) rows.push(`<div><span class="k">Grilles</span> ${ex.grilles}</div>`);
      if (ex.phone) rows.push(`<div><span class="k">Téléphone</span> <a href="tel:${esc(ex.phone.replace(/\s/g, ''))}">${esc(ex.phone)}</a></div>`);
      if (ex.email) rows.push(`<div><span class="k">E-mail</span> <a href="mailto:${esc(ex.email)}">${esc(ex.email)}</a></div>`);
      if (ex.payment) rows.push(`<div><span class="k">Règlement</span> ${esc(ex.payment)} €</div>`);
      if (ex.notes) rows.push(`<div><span class="k">Notes</span> ${esc(ex.notes)}</div>`);
      const problems = st.issues.filter((i) => i.type !== 'unplaced');
      detail = `<div class="ex-detail">
        ${rows.join('')}
        ${problems.length ? `<ul class="mini-issues">${problems.map((i) => `<li class="sev-${i.severity}">${esc(i.msg)}</li>`).join('')}</ul>` : ''}
        <div class="btn-row">
          <button class="btn small primary" data-act="auto" data-id="${ex.id}">${st.placed ? 'Replacer automatiquement' : 'Placer automatiquement'}</button>
          ${st.placed ? `<button class="btn small" data-act="unplace" data-id="${ex.id}">Retirer du plan</button>` : ''}
          <button class="btn small" data-act="lock" data-id="${ex.id}">${ex.locked ? 'Déverrouiller' : 'Verrouiller'}</button>
        </div>
      </div>`;
    }
    return `<li class="ex-item ${selected ? 'selected' : ''} ${st.placed ? '' : 'unplaced'}" data-ex="${ex.id}">
      <span class="avatar handle" data-drag="${ex.id}" style="background:${colorFor(ex)}" title="Glisser sur une table du plan">${esc(initials(ex.name))}</span>
      <div class="ex-main">
        <div class="ex-name">${esc(ex.name)}${ex.electricity ? ` <span class="elec" title="Besoin d'électricité">${ic('zap', 'i-sm')}</span>` : ''}${ex.locked ? ` <span class="muted" title="Verrouillé">${ic('lock', 'i-sm')}</span>` : ''}</div>
        <div class="ex-meta">${ex.category ? esc(ex.category) + ' · ' : ''}${plural(ex.tables || 1, 'table')}${ex.grilles ? ` · ${plural(ex.grilles, 'grille')}` : ''}</div>
      </div>
      <span class="where ${nums.length ? '' : 'todo'} st-${st.worst}">${nums.length ? (nums.length > 1 ? 'Tables ' : 'Table ') + nums.join(' + ') : 'À placer'}</span>
      ${icon}
      <button class="icon-btn" data-edit="${ex.id}" title="Modifier">${ic('pen')}</button>
      ${detail}
    </li>`;
  }).join('');
}

function renderChecks() {
  const ev = cur();
  const errors = evaluation.issues.filter((i) => i.severity === 'error');
  const warnings = evaluation.issues.filter((i) => i.severity === 'warning');
  const infos = evaluation.issues.filter((i) => i.severity === 'info');
  const placed = ev.exhibitors.filter((e) => evaluation.exTables.has(e.id)).length;
  const used = Object.keys(ev.assignments).filter((t) => tableById(t)).length;
  const elecNeeds = ev.exhibitors.filter((e) => e.electricity).length;
  const section = (title, list, cls) => list.length ? `<h3 class="${cls}">${title} (${list.length})</h3><ul class="issues">${list.map((i) => {
    const idx = evaluation.issues.indexOf(i);
    return `<li class="sev-${i.severity}" data-issue="${idx}">${esc(i.msg)}</li>`;
  }).join('')}</ul>` : '';
  $('#tab-checks').innerHTML = `
    <div class="summary">
      <div class="kcard"><b>${placed}/${ev.exhibitors.length}</b><span>exposants placés</span></div>
      <div class="kcard"><b>${used}/${ev.tables.length}</b><span>tables attribuées</span></div>
      <div class="kcard ${errors.length ? 'bad' : 'good'}"><b>${errors.length}</b><span>${errors.length > 1 ? 'conflits' : 'conflit'}</span></div>
      <div class="kcard"><b>${elecNeeds}</b><span>besoin${elecNeeds > 1 ? 's' : ''} électrique${elecNeeds > 1 ? 's' : ''}</span></div>
    </div>
    ${!evaluation.issues.length ? `<p class="all-good">${ic('check')} Toutes les contraintes sont respectées.</p>` : ''}
    ${section('Conflits à corriger', errors, 'h-error')}
    ${section('Points à vérifier', warnings, 'h-warning')}
    ${section('Souhaits non satisfaits', infos, 'h-info')}
    ${errors.length || warnings.length ? '<div class="btn-row"><button class="btn primary" data-act="fix">Corriger automatiquement</button></div>' : ''}
  `;
}

function renderSettings() {
  const ev = cur();
  const s = ev.settings;
  $('#tab-settings').innerHTML = `
    <h3>Événement</h3>
    <label>Nom <input data-ev="name" value="${esc(ev.name)}" maxlength="80"></label>
    <label>Date <input type="date" data-ev="date" value="${esc(ev.date)}"></label>
    <label>Notes <textarea data-ev="notes" rows="2">${esc(ev.notes)}</textarea></label>

    <h3>Contraintes</h3>
    <label>Distance minimale entre exposants « à séparer »
      <span class="with-unit"><input type="number" step="0.5" min="0" max="20" data-set="avoidDistance" value="${s.avoidDistance}"> m</span></label>
    <label>Distance pour « proche de »
      <span class="with-unit"><input type="number" step="0.5" min="0" max="30" data-set="nearDistance" value="${s.nearDistance}"> m</span></label>
    <label>Écart max. pour que deux tables soient contiguës
      <span class="with-unit"><input type="number" step="0.1" min="0" max="3" data-set="adjacencyGap" value="${s.adjacencyGap}"> m</span></label>
    <label class="check"><input type="checkbox" data-set="flagSameCategory" ${s.flagSameCategory ? 'checked' : ''}> Éviter deux exposants de même catégorie côte à côte</label>
    <label>Nombre de grilles disponibles (0 = ne pas vérifier)
      <span class="with-unit"><input type="number" step="1" min="0" max="500" data-set="grillesAvailable" value="${s.grillesAvailable}"></span></label>

    <h3>Fiches d'inscription</h3>
    <label class="check"><input type="checkbox" data-set="autoPlaceFiches" ${s.autoPlaceFiches ? 'checked' : ''}> Placer automatiquement chaque nouvelle fiche (et réajuster le plan si besoin)</label>

    <h3>Salle</h3>
    <p class="muted">${ev.tables.length} tables, dont ${ev.tables.filter(hasPower).length} avec accès à l'électricité.
      Règle : seules les tables le long des murs de la grande salle ont l'électricité (pas l'îlot central, ni la scène et ses abords, ni le hall).
      Exceptions possibles en mode « Électricité ».</p>
    <div class="btn-row">
      <button class="btn small" data-act="reset-tables">Revenir aux 48 tables du plan</button>
      <button class="btn small" data-act="reset-power">Électricité : revenir à la règle des murs</button>
    </div>

    <h3>Données</h3>
    <p class="muted">Les plans sont enregistrés dans ce navigateur. Pour les partager ou les sauvegarder, utilisez <b>Données → Exporter</b>, puis <b>Importer</b> sur un autre poste.</p>
    <div class="btn-row">
      <button class="btn small danger" data-act="delete-event">Supprimer cet événement</button>
    </div>
  `;
}

// ---------- Plan (SVG) ----------

const svg = $('#plan');
const viewport = $('#viewport');

function roomSVG() {
  const out = [];
  const B = ROOM.bounds;
  out.push(`<rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" class="building"/>`);
  for (const s of ROOM.spaces) {
    out.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" class="space space-${s.kind}"/>`);
    if (s.label) {
      const lines = s.label.split('\n');
      const big = s.kind === 'main' || s.kind === 'stage';
      const cy = s.id === 'salle' ? 11.5 : s.id === 'hall' ? 18.6 : s.y + s.h / 2;
      const cx = s.id === 'salle' ? 12.5 : s.id === 'hall' ? 12.8 : s.x + s.w / 2;
      lines.forEach((l, i) => out.push(`<text x="${cx}" y="${cy + (i - (lines.length - 1) / 2) * 0.5}" class="space-label ${big ? 'big' : ''}">${esc(l)}</text>`));
    }
  }
  for (const z of ROOM.standZones) out.push(`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" class="stand-zone"/>`);
  for (const z of ROOM.zones) {
    out.push(`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" class="zone zone-${z.type}"/>`);
    if (z.type !== 'clearance') out.push(`<text x="${z.x + z.w / 2}" y="${z.y + z.h / 2}" class="zone-label ${z.w < z.h ? 'vertical' : ''}" ${z.w < z.h ? `transform="rotate(-90 ${z.x + z.w / 2} ${z.y + z.h / 2})"` : ''}>${esc(z.label)}</text>`);
  }
  out.push(`<rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" class="outer-wall"/>`);
  for (const d of ROOM.doors) {
    out.push(`<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" class="door"/>`);
    if (d.label) {
      const below = d.y1 === ROOM.bounds.h;
      out.push(`<text x="${(d.x1 + d.x2) / 2}" y="${d.y1 + (below ? 0.6 : -0.3)}" class="door-label">${esc(d.label)}</text>`);
    }
  }
  for (const e of ROOM.exits) {
    const x2 = e.x + e.dir * 0.9;
    out.push(`<g class="exit"><line x1="${e.x}" y1="${e.y}" x2="${x2}" y2="${e.y}"/><path d="M${x2} ${e.y} l${-e.dir * 0.3} -0.22 v0.44 z"/></g>`);
  }
  out.push(`<text x="${ROOM.bounds.w / 2}" y="-0.5" class="dim">Sorties de secours <tspan class="exit-sym">→</tspan> · cotes approximatives · 1 carreau = 1 m</text>`);
  // Échelle 5 m
  out.push(`<g class="scale"><line x1="0" y1="25" x2="5" y2="25"/><line x1="0" y1="24.8" x2="0" y2="25.2"/><line x1="5" y1="24.8" x2="5" y2="25.2"/><text x="2.5" y="25.6">5 m</text></g>`);
  return out.join('');
}

function gridSVG() {
  const out = [];
  for (let x = 1; x < ROOM.bounds.w; x++) out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${ROOM.bounds.h}"/>`);
  for (let y = 1; y < ROOM.bounds.h; y++) out.push(`<line x1="0" y1="${y}" x2="${ROOM.bounds.w}" y2="${y}"/>`);
  return `<g class="grid">${out.join('')}</g>`;
}

function renderRoom() {
  $('#room-layer').innerHTML = roomSVG() + gridSVG();
}

function tablesSVG(ev, { print = false } = {}) {
  const selectedEx = print ? null : ui.selectedEx;
  const sel = selectedEx ? exById(selectedEx, ev) : null;
  const related = new Map();
  if (sel) {
    for (const id of sel.avoid || []) related.set(id, 'avoid');
    for (const o of ev.exhibitors) if ((o.avoid || []).includes(sel.id)) related.set(o.id, 'avoid');
    for (const id of sel.near || []) if (!related.has(id)) related.set(id, 'near');
  }
  return ev.tables.map((t) => {
    const r = tableRect(t);
    const w = r.x1 - r.x0, h = r.y1 - r.y0;
    const vertical = h > w;
    const ex = exById(ev.assignments[t.id], ev);
    const sev = print ? null : evaluation.tableSeverity.get(t.id);
    const cls = ['tbl'];
    if (ex) cls.push('occupied');
    if (t.blocked) cls.push('blocked');
    if (sev) cls.push('sev-' + sev);
    if (!print && ui.selectedTable === t.id) cls.push('selected');
    if (ex && sel && ex.id === sel.id) cls.push('rel-self');
    if (ex && related.has(ex.id)) cls.push('rel-' + related.get(ex.id));
    if (sel && !ex && ui.mode === 'place' && !(sel.electricity && hasPower(t))) cls.push('dim');
    const powered = hasPower(t);
    if (!print && ui.mode === 'power') cls.push(powered ? 'power-on' : 'power-off');
    const fill = ex ? colorFor(ex, ev) : t.blocked ? '#f4eee6' : '#ffffff';
    const L = Math.max(w, h);
    const fs = 0.25;
    const maxChars = Math.max(3, Math.floor((L - 0.15) / (fs * 0.56)));
    let name = ex ? ex.name : t.blocked ? 'non attribuable' : '';
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '…';
    const rot = vertical ? ' transform="rotate(-90)"' : '';
    const badges = [];
    if (ex && ex.electricity) badges.push('zap');
    if (ex && ex.locked) badges.push('lock');
    const S = 0.2;
    const badgeSvg = badges.map((b, k) => {
      const bx = vertical ? -w / 2 + 0.05 : w / 2 - 0.05 - S * (k + 1);
      const by = vertical ? h / 2 - 0.05 - S * (k + 1) : -h / 2 + 0.05;
      return `<use href="#i-${b}" class="t-icon ${b}" x="${bx}" y="${by}" width="${S}" height="${S}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('');
    return `<g class="${cls.join(' ')}" data-table="${t.id}" transform="translate(${t.x} ${t.y})">
      <rect class="t-body" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="0.13" fill="${fill}"/>
      <circle class="tnum-bg" cx="${-w / 2 + 0.19}" cy="${-h / 2 + 0.19}" r="0.14"/>
      <text class="tnum" x="${-w / 2 + 0.19}" y="${-h / 2 + 0.2}">${t.num}</text>
      ${name ? `<text class="tname ${ex ? '' : 'muted'}" y="0.09"${rot}>${esc(name)}</text>` : ''}
      ${powered ? `<circle class="pwr" cx="${w / 2 - 0.11}" cy="${h / 2 - 0.11}" r="0.07"><title>Électricité disponible</title></circle>` : ''}
      ${badgeSvg}
    </g>`;
  }).join('');
}

function renderMap() {
  const ev = cur();
  $('#table-layer').innerHTML = tablesSVG(ev);
  svg.dataset.mode = ui.mode;
  $$('#mode-switch button').forEach((b) => b.classList.toggle('active', b.dataset.mode === ui.mode));
  const hints = {
    place: isPhone() ? 'Touchez une table pour l\'attribuer · glissez une table occupée vers une autre · deux doigts pour zoomer et déplacer le plan' : 'Glissez un exposant de la liste sur une table · glissez une table occupée vers une autre pour déplacer ou échanger (Maj = ajouter une table) · cliquez une table pour l\'attribuer',
    layout: 'Glissez les tables pour les déplacer · R : pivoter · Suppr : supprimer · flèches : ajuster · Ctrl+D : dupliquer',
    power: 'Tables en jaune : électricité disponible (par défaut, celles le long des murs). Cliquez une table pour ajouter ou retirer l\'électricité.',
  };
  $('#mode-hint').textContent = hints[ui.mode];
  $('#toolbar-extra').innerHTML = ui.mode === 'layout' ? `<button class="btn small" data-act="add-table">${ic('plus')} Table</button>` : '';
}

function renderLegend() {
  const ev = cur();
  const cats = new Map();
  for (const ex of ev.exhibitors) {
    const key = (ex.category || '').trim();
    if (key && !cats.has(key.toLowerCase())) cats.set(key.toLowerCase(), key);
  }
  const items = [...cats.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
    .map(([k, label]) => `<span><i style="background:${ev.categoryColors[k] || NO_CATEGORY_COLOR}"></i>${esc(label)}</span>`);
  $('#legend').innerHTML = `
    <span><i class="lg-free"></i>Libre</span>
    <span><i class="lg-error"></i>Conflit</span>
    <span><i class="lg-power"></i>Électricité disponible</span>
    <span>${ic('zap', 'i-sm')} Besoin d'électricité</span>
    <span class="sep"></span>
    <span><i class="lg-clear"></i>Passage à dégager</span>
    ${items.join('')}`;
}

// ---------- Inspecteur ----------

function renderInspector() {
  const box = $('#inspector');
  const ev = cur();
  const t = ui.selectedTable && tableById(ui.selectedTable);
  if (!t || ui.mode === 'power') { box.hidden = true; return; }
  box.hidden = false;
  const ex = exById(ev.assignments[t.id]);
  const issues = evaluation.issues.filter((i) => i.tables.includes(t.id) && i.type !== 'unplaced');
  const head = `<div class="insp-head"><b>Table ${t.num}</b><span class="muted">${esc(regionLabel(regionAt(t.x, t.y)))}</span><button class="icon-btn" data-act="close-insp" title="Fermer">${ic('x')}</button></div>`;
  const issuesHtml = issues.length ? `<ul class="mini-issues">${issues.map((i) => `<li class="sev-${i.severity}">${esc(i.msg)}</li>`).join('')}</ul>` : '';
  if (ui.mode === 'layout') {
    box.innerHTML = `${head}
      <div class="btn-row">
        <button class="btn small" data-act="rotate">${ic('rotate')} Pivoter</button>
        <button class="btn small" data-act="duplicate">${ic('copy')} Dupliquer</button>
        <button class="btn small danger" data-act="delete-table">${ic('trash')} Supprimer</button>
      </div>
      <div class="insp-grid">
        <label>N° <input type="number" min="1" data-tprop="num" value="${t.num}"></label>
        <label>Longueur <input type="number" step="0.1" min="0.4" max="5" data-tprop="w" value="${t.w}"></label>
        <label>Largeur <input type="number" step="0.1" min="0.4" max="3" data-tprop="h" value="${t.h}"></label>
      </div>
      <label>Électricité
        <select data-act="power-select">
          <option value="auto" ${typeof t.power !== 'boolean' ? 'selected' : ''}>Automatique (${wallPower(t) ? 'oui, le long d\'un mur' : 'non'})</option>
          <option value="yes" ${t.power === true ? 'selected' : ''}>Oui</option>
          <option value="no" ${t.power === false ? 'selected' : ''}>Non</option>
        </select></label>
      <label class="check"><input type="checkbox" data-act="toggle-blocked" ${t.blocked ? 'checked' : ''}> Non attribuable (organisation, réservée…)</label>
      ${issuesHtml}`;
    return;
  }
  const selEx = ui.selectedEx && ui.selectedEx !== ex?.id ? exById(ui.selectedEx) : null;
  const options = [...ev.exhibitors].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((e) => {
    const nums = tableNums(e.id);
    return `<option value="${e.id}" ${ex && ex.id === e.id ? 'selected' : ''}>${esc(e.name)}${e.electricity ? ' (électricité)' : ''}${nums.length ? ` (table ${nums.join(', ')})` : ' — non placé'}</option>`;
  }).join('');
  box.innerHTML = `${head}
    <div class="insp-power ${hasPower(t) ? 'on' : ''}">${ic('zap', 'i-sm')} ${hasPower(t) ? 'Électricité disponible' : 'Pas d\'électricité'}</div>
    ${ex ? `<div class="insp-ex"><span class="dot" style="background:${colorFor(ex)}"></span><b>${esc(ex.name)}</b>${ex.category ? `<span class="muted"> · ${esc(ex.category)}</span>` : ''}</div>` : '<div class="muted">Table libre</div>'}
    <label>Attribuer à
      <select data-act="assign-select"><option value="">— Libre —</option>${options}</select>
    </label>
    <div class="btn-row">
      ${ex ? `<button class="btn small" data-act="free-table">Libérer</button><button class="btn small" data-act="edit-owner">Modifier l'exposant</button>` : ''}
      ${selEx ? `<button class="btn small" data-act="add-to-selected">Ajouter à ${esc(selEx.name)}</button>` : ''}
    </div>
    <label class="check"><input type="checkbox" data-act="toggle-blocked" ${t.blocked ? 'checked' : ''}> Non attribuable</label>
    ${issuesHtml}`;
}

// ---------- Vue : zoom / déplacement ----------

function applyView() {
  const { s, tx, ty } = ui.view;
  viewport.setAttribute('transform', `translate(${tx} ${ty}) scale(${s})`);
}

function fitView() {
  const r = svg.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const bw = ROOM.bounds.w + 1.5, bh = ROOM.bounds.h + 3;
  const s = Math.min(r.width / bw, r.height / bh);
  ui.view = { s, tx: (r.width - ROOM.bounds.w * s) / 2, ty: (r.height - (ROOM.bounds.h + 1) * s) / 2 + 0.5 * s };
  applyView();
}

function toWorld(cx, cy) {
  const r = svg.getBoundingClientRect();
  return { x: (cx - r.left - ui.view.tx) / ui.view.s, y: (cy - r.top - ui.view.ty) / ui.view.s };
}

function zoomAt(cx, cy, factor) {
  const r = svg.getBoundingClientRect();
  const p = toWorld(cx, cy);
  ui.view.s = clamp(ui.view.s * factor, 4, 400);
  ui.view.tx = cx - r.left - p.x * ui.view.s;
  ui.view.ty = cy - r.top - p.y * ui.view.s;
  applyView();
}

function centerOn(x, y) {
  const r = svg.getBoundingClientRect();
  const minScale = Math.min(r.width, r.height) / 14;
  if (ui.view.s < minScale) ui.view.s = minScale;
  ui.view.tx = r.width / 2 - x * ui.view.s;
  ui.view.ty = r.height / 2 - y * ui.view.s;
  applyView();
}

function focusExhibitor(exId) {
  const ts = tablesOf(exId);
  if (!ts.length) return;
  const x = ts.reduce((s, t) => s + t.x, 0) / ts.length;
  const y = ts.reduce((s, t) => s + t.y, 0) / ts.length;
  const r = svg.getBoundingClientRect();
  const p = { x: x * ui.view.s + ui.view.tx, y: y * ui.view.s + ui.view.ty };
  if (p.x < 40 || p.y < 40 || p.x > r.width - 40 || p.y > r.height - 40) centerOn(x, y);
}

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
}, { passive: false });

$('#zoom-in').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.3); };
$('#zoom-out').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.3); };
$('#zoom-fit').onclick = fitView;
new ResizeObserver(() => fitView()).observe(svg);

// ---------- Glisser-déposer ----------

const ghost = $('#ghost');
const pointers = new Map();
let drag = null;

function showGhost(text, color, x, y) {
  ghost.hidden = false;
  ghost.innerHTML = `<span class="dot" style="background:${color}"></span>${esc(text)}`;
  moveGhost(x, y);
}
function moveGhost(x, y) {
  ghost.style.transform = `translate(${x + 12}px, ${y + 8}px)`;
}
function hideGhost() {
  ghost.hidden = true;
  $$('.tbl.drop-target').forEach((el) => el.classList.remove('drop-target'));
}
function tableAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest('[data-table]') : null;
}
function highlightDrop(x, y) {
  const target = tableAt(x, y);
  $$('.tbl.drop-target').forEach((el) => { if (el !== target) el.classList.remove('drop-target'); });
  if (target) target.classList.add('drop-target');
}

// Écran tactile : un doigt sur le fond du plan fait défiler la page (touch-action: pan-y) ;
// un doigt sur une table la déplace, deux doigts zooment et déplacent le plan.
svg.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1 || e.target.closest('[data-table]')) e.preventDefault();
}, { passive: false });
svg.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

svg.addEventListener('pointerdown', (e) => {
  if (e.button !== undefined && e.button > 1) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  svg.setPointerCapture(e.pointerId);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    drag = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    hideGhost();
    return;
  }
  const tEl = e.target.closest('[data-table]');
  const p = toWorld(e.clientX, e.clientY);
  const start = { cx: e.clientX, cy: e.clientY, p };
  const ev = cur();
  if (ui.mode === 'power' && tEl && e.button !== 1) {
    drag = { type: 'power', tableId: tEl.dataset.table, start, orig: { tx: ui.view.tx, ty: ui.view.ty }, moved: false };
  } else if (ui.mode === 'layout' && tEl && e.button !== 1) {
    const t = tableById(tEl.dataset.table);
    drag = { type: 'table', id: t.id, el: tEl, start, orig: { x: t.x, y: t.y }, moved: false };
  } else if (ui.mode === 'place' && tEl && e.button !== 1) {
    drag = { type: 'assign', tableId: tEl.dataset.table, exId: ev.assignments[tEl.dataset.table], start, orig: { tx: ui.view.tx, ty: ui.view.ty }, moved: false };
  } else {
    drag = { type: 'pan', start, orig: { tx: ui.view.tx, ty: ui.view.ty }, moved: false, touch: e.pointerType === 'touch' };
  }
});

svg.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!drag) return;
  if (drag.type === 'pinch') {
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    ui.view.tx += mid.x - drag.mid.x;
    ui.view.ty += mid.y - drag.mid.y;
    zoomAt(mid.x, mid.y, d / drag.dist);
    drag.dist = d; drag.mid = mid;
    return;
  }
  const dx = e.clientX - drag.start.cx, dy = e.clientY - drag.start.cy;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  if (drag.touch && isPhone()) return; // un doigt sur le fond : c'est la page qui défile
  if (drag.type === 'pan' || drag.type === 'power' || (drag.type === 'assign' && !drag.exId)) {
    ui.view.tx = drag.orig.tx + dx;
    ui.view.ty = drag.orig.ty + dy;
    applyView();
  } else if (drag.type === 'table') {
    const p = toWorld(e.clientX, e.clientY);
    drag.x = r2(snap(drag.orig.x + p.x - drag.start.p.x));
    drag.y = r2(snap(drag.orig.y + p.y - drag.start.p.y));
    drag.el.setAttribute('transform', `translate(${drag.x} ${drag.y})`);
    drag.el.classList.add('dragging');
  } else if (drag.type === 'assign') {
    if (!drag.exId) return;
    const ex = exById(drag.exId);
    if (ghost.hidden) showGhost(ex.name, colorFor(ex), e.clientX, e.clientY);
    moveGhost(e.clientX, e.clientY);
    highlightDrop(e.clientX, e.clientY);
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!drag) return;
  const d = drag;
  if (d.type === 'pinch') { if (!pointers.size) drag = null; return; }
  drag = null;
  if (e.type === 'pointercancel') { hideGhost(); renderMap(); return; }
  const ev = cur();
  if (d.type === 'pan' && !d.moved) {
    if (ui.selectedTable || ui.selectedEx) {
      ui.selectedTable = null; ui.selectedEx = null;
      refresh();
    }
  } else if (d.type === 'table') {
    ui.selectedTable = d.id;
    if (d.moved) commit((ev) => { const t = tableById(d.id, ev); t.x = d.x; t.y = d.y; });
    else refresh();
  } else if (d.type === 'power') {
    if (!d.moved) commit((ev) => {
      const t = tableById(d.tableId, ev);
      const next = !hasPower(t);
      if (next === wallPower(t)) delete t.power; else t.power = next;
    });
  } else if (d.type === 'assign') {
    if (d.moved && !d.exId) {
      // simple déplacement de la vue
    } else if (d.moved) {
      const target = tableAt(e.clientX, e.clientY);
      hideGhost();
      if (target && target.dataset.table !== d.tableId) assignToTable(d.exId, target.dataset.table, { addOnly: e.shiftKey });
      else if (!target && e.clientX < $('.sidebar').getBoundingClientRect().right) {
        commit((ev) => unassign(ev, d.exId));
        toast(`${exById(d.exId).name} retiré du plan`, 'info', { label: 'Annuler', fn: undo });
      }
    } else {
      ui.selectedTable = d.tableId;
      if (ev.assignments[d.tableId]) ui.selectedEx = ev.assignments[d.tableId];
      refresh();
    }
  }
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

// Glisser depuis la liste des exposants.
$('#ex-list').addEventListener('pointerdown', (e) => {
  const item = e.target.closest('.ex-item');
  if (!item || e.target.closest('button, .ex-detail')) return;
  const onHandle = e.target.closest('[data-drag]');
  if (e.pointerType !== 'mouse' && !onHandle) return;
  if (e.button !== 0) return;
  const exId = item.dataset.ex;
  const start = { x: e.clientX, y: e.clientY };
  let moved = false;
  const ex = exById(exId);
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
    if (!moved) { moved = true; showGhost(ex.name, colorFor(ex), ev.clientX, ev.clientY); document.body.classList.add('dragging-ex'); }
    ev.preventDefault();
    moveGhost(ev.clientX, ev.clientY);
    highlightDrop(ev.clientX, ev.clientY);
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.body.classList.remove('dragging-ex');
    if (!moved) return;
    const target = ev.type === 'pointerup' ? tableAt(ev.clientX, ev.clientY) : null;
    hideGhost();
    if (target) {
      if (ui.mode !== 'place') { ui.mode = 'place'; }
      assignToTable(exId, target.dataset.table, { addOnly: ev.shiftKey });
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
});

// ---------- Actions de la liste et des panneaux ----------

$('#ex-list').addEventListener('click', (e) => {
  const edit = e.target.closest('[data-edit]');
  if (edit) { openExhibitorDialog(edit.dataset.edit); return; }
  const act = e.target.closest('[data-act]');
  if (act) {
    const id = act.dataset.id;
    if (act.dataset.act === 'auto') placeAndAdjust(id);
    if (act.dataset.act === 'unplace') commit((ev) => unassign(ev, id));
    if (act.dataset.act === 'lock') commit((ev) => { const x = exById(id, ev); x.locked = !x.locked; });
    return;
  }
  if (e.target.closest('.ex-detail')) return;
  const item = e.target.closest('.ex-item');
  if (!item) return;
  const id = item.dataset.ex;
  ui.selectedEx = ui.selectedEx === id ? null : id;
  ui.selectedTable = null;
  refresh();
  if (ui.selectedEx) focusExhibitor(id);
});
$('#ex-list').addEventListener('dblclick', (e) => {
  const item = e.target.closest('.ex-item');
  if (item && !e.target.closest('.ex-detail')) openExhibitorDialog(item.dataset.ex);
});

$('#ex-search').addEventListener('input', (e) => { ui.search = e.target.value; renderExhibitors(); });
$('#ex-filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (b) { ui.filter = b.dataset.filter; renderExhibitors(); }
});
function showTab(tab) {
  ui.tab = tab;
  renderSidebar();
  if (isPhone()) $(tab === 'exhibitors' ? '#map-wrap' : '.sidebar').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const isPhone = () => window.matchMedia('(max-width: 900px)').matches;
function onNav(e) {
  const b = e.target.closest('[data-nav]');
  if (!b) return;
  if (b.dataset.nav === 'list') { openList(); return; }
  if (b.dataset.nav === 'fiches') { $('#fiche-files').click(); return; }
  showTab(b.dataset.nav === 'plan' ? 'exhibitors' : b.dataset.nav);
}
$('#main-nav').addEventListener('click', onNav);
$('#tabbar').addEventListener('click', onNav);
$('#stats-row').addEventListener('click', (e) => {
  const act = e.target.closest('[data-stat]')?.dataset.stat;
  if (act === 'checks') showTab('checks');
  if (act === 'unplaced') { ui.filter = 'unplaced'; showTab('exhibitors'); }
  if (act === 'power') { ui.mode = 'power'; refresh(); }
});
$('#top-alert').addEventListener('click', (e) => {
  if (e.target.closest('[data-alert="fix"]')) runOptimize('keep');
});
$('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) { ui.tab = b.dataset.tab; renderSidebar(); }
});
$('#btn-add-ex').onclick = () => openExhibitorDialog(null);
$('#btn-place-missing').onclick = () => runOptimize('keep');
$('#btn-optimize').onclick = () => {
  if (confirm('Recalculer entièrement le plan ? Les exposants verrouillés restent en place, les autres peuvent tous changer de table. (Annulable avec Ctrl+Z)')) runOptimize('fresh');
};

$('#tab-checks').addEventListener('click', (e) => {
  if (e.target.closest('[data-act="fix"]')) { runOptimize('keep'); return; }
  const li = e.target.closest('[data-issue]');
  if (!li) return;
  const issue = evaluation.issues[+li.dataset.issue];
  if (!issue) return;
  if (issue.exhibitors[0]) {
    ui.selectedEx = issue.exhibitors[0];
    focusExhibitor(issue.exhibitors[0]);
  }
  if (issue.tables[0]) {
    ui.selectedTable = issue.tables[0];
    const t = tableById(issue.tables[0]);
    if (t && !issue.exhibitors[0]) centerOn(t.x, t.y);
  }
  refresh();
});

$('#tab-settings').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.ev) commit((ev) => { ev[el.dataset.ev] = el.value.trim() || (el.dataset.ev === 'name' ? ev.name : ''); });
  if (el.dataset.set) {
    const key = el.dataset.set;
    const val = el.type === 'checkbox' ? el.checked : Math.max(0, parseFloat(el.value) || 0);
    commit((ev) => { ev.settings[key] = val; });
  }
});
$('#tab-settings').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'reset-tables' && confirm('Remplacer toutes les tables par les 48 tables du plan papier ? Les attributions seront perdues. (Annulable avec Ctrl+Z)')) {
    commit((ev) => { ev.tables = defaultTables(); ev.assignments = {}; });
  }
  if (act === 'reset-power') commit((ev) => { ev.tables.forEach((t) => { delete t.power; }); });
  if (act === 'delete-event') {
    const ev = cur();
    if (!confirm(`Supprimer définitivement l'événement « ${ev.name} » ?`)) return;
    db.events = db.events.filter((x) => x.id !== ev.id);
    if (!db.events.length) db.events.push(newEvent('Nouvel événement'));
    db.currentId = db.events[0].id;
    undoStack = []; redoStack = [];
    save(); refresh();
  }
});

$('#mode-switch').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  ui.mode = b.dataset.mode;
  refresh();
});

$('#toolbar-extra').addEventListener('click', (e) => {
  if (e.target.closest('[data-act="add-table"]')) addTable();
});

function addTable(from = null) {
  const ev = cur();
  const r = svg.getBoundingClientRect();
  const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
  const id = uid('t');
  const num = Math.max(0, ...ev.tables.map((t) => t.num)) + 1;
  const t = from
    ? { ...from, id, num, x: r2(from.x + (from.rot % 180 ? from.h : from.w) + 0.1), y: from.y, blocked: false }
    : { id, num, x: r2(snap(c.x)), y: r2(snap(c.y)), w: TABLE_SIZE.w, h: TABLE_SIZE.h, rot: 0, blocked: false };
  ui.selectedTable = id;
  commit((ev) => ev.tables.push(t));
}

$('#inspector').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act || act === 'assign-select' || act === 'toggle-blocked') return;
  const tid = ui.selectedTable;
  if (act === 'close-insp') { ui.selectedTable = null; refresh(); }
  if (act === 'rotate') commit((ev) => { const t = tableById(tid, ev); t.rot = (t.rot + 90) % 180; });
  if (act === 'duplicate') addTable(tableById(tid));
  if (act === 'delete-table') deleteSelected();
  if (act === 'free-table') commit((ev) => { delete ev.assignments[tid]; });
  if (act === 'edit-owner') openExhibitorDialog(cur().assignments[tid]);
  if (act === 'add-to-selected') assignToTable(ui.selectedEx, tid, { addOnly: true });
});
$('#inspector').addEventListener('change', (e) => {
  const el = e.target;
  const tid = ui.selectedTable;
  if (el.dataset.act === 'assign-select') {
    if (el.value) assignToTable(el.value, tid);
    else commit((ev) => { delete ev.assignments[tid]; });
  }
  if (el.dataset.act === 'power-select') {
    commit((ev) => {
      const t = tableById(tid, ev);
      if (el.value === 'auto') delete t.power; else t.power = el.value === 'yes';
    });
  }
  if (el.dataset.act === 'toggle-blocked') {
    commit((ev) => {
      const t = tableById(tid, ev);
      t.blocked = el.checked;
      if (t.blocked) delete ev.assignments[tid];
    });
  }
  if (el.dataset.tprop) {
    const v = parseFloat(el.value);
    if (!(v > 0)) return;
    commit((ev) => { const t = tableById(tid, ev); t[el.dataset.tprop] = el.dataset.tprop === 'num' ? Math.round(v) : r2(v); });
  }
});

function deleteSelected() {
  if (ui.mode === 'layout' && ui.selectedTable) {
    const id = ui.selectedTable;
    ui.selectedTable = null;
    commit((ev) => { ev.tables = ev.tables.filter((t) => t.id !== id); delete ev.assignments[id]; });
  }
}

// ---------- Clavier ----------

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !isTyping()) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !isTyping()) { e.preventDefault(); redo(); return; }
  if (isTyping()) return;
  if (e.key === 'Escape') { ui.selectedTable = null; ui.selectedEx = null; refresh(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return; }
  if (ui.mode === 'layout' && ui.selectedTable) {
    const id = ui.selectedTable;
    if (e.key.toLowerCase() === 'r') commit((ev) => { const t = tableById(id, ev); t.rot = (t.rot + 90) % 180; });
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); addTable(tableById(id)); }
    const step = e.shiftKey ? 0.5 : 0.1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      commit((ev) => { const t = tableById(id, ev); t.x = r2(t.x + moves[e.key][0]); t.y = r2(t.y + moves[e.key][1]); });
    }
  }
});

// ---------- Fenêtre exposant ----------

const exDialog = $('#ex-dialog');
const exForm = $('#ex-form');
let editingId = null;
const relationState = { avoid: new Set(), near: new Set() };

function openExhibitorDialog(id) {
  const ev = cur();
  editingId = id;
  const ex = id ? exById(id) : newExhibitor();
  $('#ex-dialog-title').textContent = id ? 'Modifier l’exposant' : 'Nouvel exposant';
  exForm.name.value = ex.name;
  exForm.category.value = ex.category;
  exForm.tables.value = ex.tables || 1;
  exForm.electricity.checked = !!ex.electricity;
  exForm.locked.checked = !!ex.locked;
  exForm.products.value = ex.products || '';
  exForm.grilles.value = ex.grilles || 0;
  exForm.payment.value = ex.payment || '';
  exForm.phone.value = ex.phone || '';
  exForm.email.value = ex.email || '';
  exForm.notes.value = ex.notes || '';
  exForm.zone.innerHTML = `<option value="">Indifférent</option>` + REGIONS.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join('');
  exForm.zone.value = ex.zone || '';
  const cats = [...new Set(ev.exhibitors.map((e) => (e.category || '').trim()).filter(Boolean))].sort();
  $('#category-list').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
  relationState.avoid = new Set(ex.avoid || []);
  relationState.near = new Set(ex.near || []);
  $$('.rel-search', exForm).forEach((i) => { i.value = ''; });
  renderRelations();
  $('#ex-delete').hidden = !id;
  $('#ex-save-place').textContent = id && tablesOf(id).length ? 'Enregistrer et replacer' : 'Enregistrer et placer';
  exDialog.showModal();
  exForm.name.focus();
}

function renderRelations() {
  const ev = cur();
  for (const rel of ['avoid', 'near']) {
    const q = $(`.rel-search[data-rel="${rel}"]`, exForm).value.trim().toLowerCase();
    const others = ev.exhibitors.filter((e) => e.id !== editingId).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const box = $(`.rel-list[data-rel="${rel}"]`, exForm);
    if (!others.length) { box.innerHTML = '<span class="muted">Aucun autre exposant.</span>'; continue; }
    const reverse = rel === 'avoid' ? new Set(others.filter((o) => (o.avoid || []).includes(editingId)).map((o) => o.id)) : new Set();
    box.innerHTML = others
      .filter((o) => !q || o.name.toLowerCase().includes(q) || relationState[rel].has(o.id))
      .map((o) => `<label class="rel-item"><input type="checkbox" value="${o.id}" ${relationState[rel].has(o.id) ? 'checked' : ''}>
        <span class="dot" style="background:${colorFor(o)}"></span>${esc(o.name)}${reverse.has(o.id) ? ' <em class="muted">(le demande déjà)</em>' : ''}</label>`)
      .join('');
  }
}
$$('.rel-search', exForm).forEach((i) => i.addEventListener('input', renderRelations));
$$('.rel-list', exForm).forEach((box) => box.addEventListener('change', (e) => {
  const set = relationState[box.dataset.rel];
  if (e.target.checked) set.add(e.target.value); else set.delete(e.target.value);
}));

$('#ex-cancel').onclick = () => exDialog.close();
$('#ex-delete').onclick = () => {
  const ex = exById(editingId);
  if (!ex || !confirm(`Supprimer l'exposant « ${ex.name} » ?`)) return;
  const id = editingId;
  exDialog.close();
  commit((ev) => {
    unassign(ev, id);
    ev.exhibitors = ev.exhibitors.filter((e) => e.id !== id);
    ev.exhibitors.forEach((e) => {
      e.avoid = (e.avoid || []).filter((x) => x !== id);
      e.near = (e.near || []).filter((x) => x !== id);
    });
  });
  toast(`${ex.name} supprimé`, 'info', { label: 'Annuler', fn: undo });
};

exForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const action = e.submitter?.value || 'save';
  const name = exForm.name.value.trim();
  if (!name) { exForm.name.focus(); return; }
  const fields = {
    name,
    category: exForm.category.value.trim(),
    tables: clamp(Math.round(Number(exForm.tables.value) || 1), 1, 8),
    electricity: exForm.electricity.checked,
    zone: exForm.zone.value,
    avoid: [...relationState.avoid],
    near: [...relationState.near],
    locked: exForm.locked.checked,
    products: exForm.products.value.trim(),
    grilles: clamp(Math.round(Number(exForm.grilles.value) || 0), 0, 30),
    payment: exForm.payment.value.trim(),
    phone: exForm.phone.value.trim(),
    email: exForm.email.value.trim(),
    notes: exForm.notes.value.trim(),
  };
  const isNew = !editingId;
  const id = editingId || uid('ex');
  commit((ev) => {
    if (isNew) ev.exhibitors.push(newExhibitor({ ...fields, id }));
    else Object.assign(exById(id, ev), fields);
    ensureCategoryColor(ev, fields.category);
  });
  exDialog.close();
  ui.selectedEx = id;
  refresh();
  if (action === 'place') placeAndAdjust(id);
  else if (isNew) toast(`${name} ajouté. Glissez-le sur une table ou utilisez « Placer automatiquement ».`, 'success', { label: 'Placer maintenant', fn: () => placeAndAdjust(id) });
});

// ---------- Fiches d'inscription ----------

const ficheDialog = $('#fiche-dialog');
const ficheForm = $('#fiche-form');
const FICHE_LABELS = { products: 'objets vendus', firstName: 'prénom', lastName: 'nom', tables: 'nombre de tables', grilles: 'grilles', electricity: 'électricité', phone: 'téléphone', email: 'e-mail' };
let ficheQueue = [];
let ficheIndex = 0;
let ficheToken = 0;

$('#btn-fiches').onclick = () => $('#fiche-files').click();
$('#btn-fiche-manual').onclick = () => { ficheQueue = [null]; ficheIndex = 0; showFiche(); };
$('#fiche-files').addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  ficheQueue = files;
  ficheIndex = 0;
  showFiche();
});

function setFicheFields(f) {
  ficheForm.reset();
  for (const k of ['products', 'firstName', 'lastName', 'phone', 'email', 'payment', 'notes']) ficheForm[k].value = f[k] || '';
  ficheForm.tables.value = f.tables || 1;
  ficheForm.grilles.value = f.grilles || 0;
  ficheForm.category.value = f.category || guessCategory(f.products);
  $$('input[name=electricity]', ficheForm).forEach((r) => { r.checked = typeof f.electricity === 'boolean' && r.value === (f.electricity ? 'oui' : 'non'); });
  $$('[data-f]', ficheForm).forEach((el) => el.classList.toggle('to-check', !!f.uncertain?.has(el.dataset.f)));
  const todo = [...(f.uncertain || [])].map((k) => FICHE_LABELS[k]).filter(Boolean);
  const warn = $('#fiche-warning');
  warn.hidden = !todo.length;
  warn.textContent = todo.length ? `À vérifier sur la photo : ${todo.join(', ')}.` : '';
}

function setFicheBusy(busy) {
  $('#fiche-progress').hidden = !busy;
  $$('input, button[type=submit]', ficheForm).forEach((el) => { el.disabled = busy; });
}

async function showFiche() {
  const file = ficheQueue[ficheIndex];
  const token = ++ficheToken;
  $('#fiche-count').textContent = ficheQueue.length > 1 ? `(${ficheIndex + 1}/${ficheQueue.length})` : '';
  const cats = [...new Set(cur().exhibitors.map((e) => (e.category || '').trim()).filter(Boolean))].sort();
  $('#category-list').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
  $('#fiche-photo').hidden = !file;
  ficheDialog.classList.toggle('no-photo', !file);
  $('#fiche-img').hidden = true;
  $('#fiche-raw').hidden = true;
  setFicheFields({ uncertain: file ? new Set() : new Set(['electricity']) });
  $('#fiche-warning').hidden = true;
  $('#fiche-add').textContent = ficheIndex < ficheQueue.length - 1 ? 'Ajouter et fiche suivante' : 'Ajouter et placer';
  $('#fiche-skip').hidden = ficheQueue.length < 2;
  if (!ficheDialog.open) ficheDialog.showModal();
  if (!file) { ficheForm.products.focus(); return; }

  setFicheBusy(true);
  $('#fiche-bar').value = 0;
  $('#fiche-step').textContent = 'Lecture de la fiche…';
  const objectUrl = URL.createObjectURL(file);
  try {
    const res = await readFiche(file, ({ step, progress }) => {
      if (token !== ficheToken) return;
      $('#fiche-step').textContent = step + '…';
      $('#fiche-bar').value = progress || 0;
    });
    if (token !== ficheToken) return;
    $('#fiche-img').src = res.preview;
    $('#fiche-text').textContent = res.text;
    $('#fiche-raw').hidden = false;
    setFicheFields(res.fields);
    if (!res.recognized) {
      const warn = $('#fiche-warning');
      warn.hidden = false;
      warn.textContent = "La fiche n'a pas été reconnue (photo floue, plusieurs fiches sur la même photo ?). Recopiez les informations à partir de la photo.";
    }
  } catch (err) {
    if (token !== ficheToken) return;
    console.error(err);
    $('#fiche-img').src = objectUrl;
    setFicheFields({ uncertain: new Set(Object.keys(FICHE_LABELS)) });
    const warn = $('#fiche-warning');
    warn.hidden = false;
    warn.textContent = 'Lecture automatique impossible sur cet appareil. Recopiez les informations à partir de la photo.';
  } finally {
    if (token === ficheToken) {
      $('#fiche-img').hidden = false;
      setFicheBusy(false);
      ficheForm.products.focus();
    }
  }
}

function nextFiche() {
  ficheIndex++;
  if (ficheIndex < ficheQueue.length) showFiche();
  else { ficheToken++; ficheDialog.close(); ficheQueue = []; }
}

$('#fiche-skip').onclick = nextFiche;
$('#fiche-img').onclick = (e) => e.target.classList.toggle('zoomed');
$('#fiche-cancel').onclick = () => { ficheToken++; ficheDialog.close(); ficheQueue = []; };
ficheForm.addEventListener('input', (e) => e.target.closest('[data-f]')?.classList.remove('to-check'));
ficheForm.addEventListener('change', (e) => {
  if (e.target.name === 'products' && !ficheForm.category.value) ficheForm.category.value = guessCategory(e.target.value);
  if (e.target.name === 'tables' && !ficheForm.payment.value) ficheForm.payment.value = String(5 * (Number(e.target.value) || 1));
});

const normalizeKey = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9@.]/gi, '').toLowerCase();

ficheForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const elec = $('input[name=electricity]:checked', ficheForm);
  if (!elec) {
    const fs = $('[data-f=electricity]', ficheForm);
    fs.classList.add('to-check');
    $('#fiche-warning').hidden = false;
    $('#fiche-warning').textContent = 'Indiquez si l’exposant a besoin d’électricité (oui ou non).';
    return;
  }
  const v = (k) => ficheForm[k].value.trim();
  const firstName = v('firstName');
  const lastName = v('lastName').toUpperCase();
  const name = `${firstName} ${lastName}`.trim() || v('products') || 'Exposant';
  const fields = {
    name, firstName, lastName,
    products: v('products'),
    category: v('category') || guessCategory(v('products')),
    tables: clamp(Math.round(Number(v('tables')) || 1), 1, 3),
    grilles: clamp(Math.round(Number(v('grilles')) || 0), 0, 30),
    electricity: elec.value === 'oui',
    phone: v('phone'), email: v('email'), payment: v('payment'), notes: v('notes'),
  };
  const ev = cur();
  const same = ev.exhibitors.find((x) =>
    (fields.email && normalizeKey(x.email) === normalizeKey(fields.email))
    || (fields.phone && normalizeKey(x.phone) === normalizeKey(fields.phone))
    || normalizeKey(x.name) === normalizeKey(name));
  let id;
  if (same && confirm(`« ${same.name} » est déjà inscrit (même nom, téléphone ou e-mail).\n\nOK : mettre à jour sa fiche\nAnnuler : l'ajouter comme nouvel exposant`)) {
    id = same.id;
    commit((ev) => { Object.assign(exById(id, ev), fields); ensureCategoryColor(ev, fields.category); });
  } else {
    id = uid('ex');
    commit((ev) => { ev.exhibitors.push(newExhibitor({ ...fields, id })); ensureCategoryColor(ev, fields.category); });
  }
  const auto = cur().settings.autoPlaceFiches !== false;
  const sameSize = same && same.id === id && tablesOf(id).length === fields.tables;
  if (auto && !(sameSize && !(evaluation.byExhibitor.get(id) || []).some((i) => i.severity === 'error'))) placeAndAdjust(id);
  else toast(`${name} ${same && same.id === id ? 'mis à jour' : 'ajouté'}`, 'success');
  nextFiche();
});

// ---------- Liste des exposants ----------

const LIST_COLUMNS = [
  { key: 'tablesNums', label: 'Table(s)', width: 10, get: (ex) => tableNums(ex.id).join(', '), sort: (ex) => tableNums(ex.id)[0] ?? 999 },
  { key: 'lastName', label: 'NOM', width: 16, get: (ex) => ex.lastName || ex.name },
  { key: 'firstName', label: 'Prénom', width: 14, get: (ex) => ex.firstName },
  { key: 'products', label: 'Objets vendus', width: 32, get: (ex) => ex.products },
  { key: 'category', label: 'Catégorie', width: 14, get: (ex) => ex.category },
  { key: 'tables', label: 'Tables', width: 8, get: (ex) => Number(ex.tables) || 1, num: true },
  { key: 'grilles', label: 'Grilles', width: 8, get: (ex) => Number(ex.grilles) || 0, num: true },
  { key: 'electricity', label: 'Électricité', width: 11, get: (ex) => (ex.electricity ? 'oui' : 'non') },
  { key: 'payment', label: 'Règlement (€)', width: 13, get: (ex) => (ex.payment === '' || ex.payment == null ? '' : Number(String(ex.payment).replace(',', '.')) || ex.payment), num: true },
  { key: 'phone', label: 'Téléphone', width: 16, get: (ex) => ex.phone },
  { key: 'email', label: 'E-mail', width: 30, get: (ex) => ex.email },
  { key: 'zone', label: 'Emplacement souhaité', width: 18, get: (ex) => (ex.zone ? regionLabel(ex.zone) : '') },
  { key: 'avoid', label: 'À séparer de', width: 22, get: (ex) => (ex.avoid || []).map((id) => exById(id)?.name).filter(Boolean).join(', ') },
  { key: 'notes', label: 'Notes', width: 30, get: (ex) => ex.notes },
];
const listUi = { sort: 'lastName', dir: 1, search: '' };
let fileHandle = null; // fichier mis à jour automatiquement (navigateurs compatibles)
let fileHandleEvent = null;
let syncTimer = null;

function sortedExhibitors(ev = cur()) {
  const col = LIST_COLUMNS.find((c) => c.key === listUi.sort) || LIST_COLUMNS[1];
  const key = col.sort || col.get;
  return [...ev.exhibitors].sort((a, b) => {
    const x = key(a), y = key(b);
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr', { numeric: true });
    return r * listUi.dir || a.name.localeCompare(b.name, 'fr');
  });
}

function listRows(ev = cur()) {
  const exs = [...ev.exhibitors].sort((a, b) => (a.lastName || a.name).localeCompare(b.lastName || b.name, 'fr'));
  return [LIST_COLUMNS.map((c) => c.label), ...exs.map((ex) => LIST_COLUMNS.map((c) => c.get(ex)))];
}

const listHash = (ev = cur()) => JSON.stringify(listRows(ev));
const exportInfo = (ev = cur()) => (db.listExports || {})[ev.id] || null;
const isLinked = () => fileHandle && fileHandleEvent === cur().id;
const listOutdated = (ev = cur()) => ev.exhibitors.length > 0 && (!exportInfo(ev) || exportInfo(ev).hash !== listHash(ev));

function markExported(how) {
  db.listExports ||= {};
  db.listExports[cur().id] = { hash: listHash(), at: Date.now(), how };
  save();
  renderListBadge();
  if ($('#list-dialog').open) renderListStatus();
}

function renderListBadge() {
  $('#list-badge').hidden = !listOutdated();
}

function renderListStatus() {
  const info = exportInfo();
  const ev = cur();
  let html;
  if (isLinked()) {
    html = `${ic('link')} Mise à jour automatique de <b>${esc(fileHandle.name)}</b>${info ? ` · dernière écriture le ${formatDateTime(info.at)}` : ''}. <button class="link" data-list="unlink">Arrêter</button>`;
  } else if (!ev.exhibitors.length) html = 'Aucun exposant pour l’instant.';
  else if (!info) html = `${ic('alert')} Cette liste n’a encore jamais été exportée.`;
  else if (listOutdated()) html = `${ic('alert')} <span><b>La liste a changé</b> depuis le dernier export (${formatDateTime(info.at)}, ${esc(info.how)}). Pensez à la réexporter.</span>`;
  else html = `${ic('check')} Liste à jour : dernier export le ${formatDateTime(info.at)} (${esc(info.how)}).`;
  const el = $('#list-status');
  el.innerHTML = html;
  el.className = 'list-status ' + (listOutdated() && !isLinked() ? 'outdated' : 'ok');
}

function renderList() {
  const ev = cur();
  const q = listUi.search.trim().toLowerCase();
  const exs = sortedExhibitors(ev).filter((ex) => !q || LIST_COLUMNS.map((c) => c.get(ex)).join(' ').toLowerCase().includes(q));
  const totals = {
    tables: ev.exhibitors.reduce((s, e) => s + (Number(e.tables) || 1), 0),
    grilles: ev.exhibitors.reduce((s, e) => s + (Number(e.grilles) || 0), 0),
    elec: ev.exhibitors.filter((e) => e.electricity).length,
    pay: ev.exhibitors.reduce((s, e) => s + (Number(String(e.payment || '').replace(',', '.')) || 0), 0),
  };
  $('#list-count').textContent = `(${ev.exhibitors.length})`;
  $('#list-table').innerHTML = `
    <thead><tr>${LIST_COLUMNS.map((c) => `<th data-sort="${c.key}" class="${c.num ? 'num' : ''} ${listUi.sort === c.key ? 'sorted' : ''}">${esc(c.label)}${listUi.sort === c.key ? (listUi.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${exs.map((ex) => `<tr data-ex="${ex.id}">${LIST_COLUMNS.map((c) => {
      const v = c.get(ex);
      const lab = `data-label="${esc(c.label)}"`;
      if (c.key === 'electricity') return `<td ${lab} class="${ex.electricity ? '' : 'empty'}">${ex.electricity ? `<span class="elec">${ic('zap', 'i-sm')}</span> oui` : '<span class="muted">non</span>'}</td>`;
      if (c.key === 'lastName') return `<td ${lab} class="name"><span class="dot" style="background:${colorFor(ex)}"></span> <b>${esc(v)}</b></td>`;
      if (c.key === 'tablesNums') return `<td ${lab} class="tables">${v ? esc(v) : '<span class="warn-text">non placé</span>'}</td>`;
      const shown = v === 0 && c.key === 'grilles' ? '' : v;
      return `<td ${lab} class="${c.num ? 'num' : ''} ${shown === '' || shown == null ? 'empty' : ''}">${esc(shown)}</td>`;
    }).join('')}</tr>`).join('') || `<tr><td colspan="${LIST_COLUMNS.length}" class="muted">Aucun exposant.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="5"><b>Total</b> : ${plural(ev.exhibitors.length, 'exposant')}</td><td class="num"><b>${totals.tables}</b></td><td class="num"><b>${totals.grilles}</b></td><td><b>${totals.elec}</b> oui</td><td class="num"><b>${totals.pay}</b> €</td><td colspan="${LIST_COLUMNS.length - 9}"></td></tr></tfoot>`;
  renderListStatus();
}

function openList() {
  listUi.search = '';
  $('#list-search').value = '';
  $('#list-link').hidden = !('showSaveFilePicker' in window);
  renderList();
  if (!$('#list-dialog').open) $('#list-dialog').showModal();
}

const listFileName = (ext) => `exposants-${slug(cur().name)}.${ext}`;
const xlsxBlob = () => buildXlsx(listRows(), { sheetName: 'Exposants', widths: LIST_COLUMNS.map((c) => c.width) });

function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function exportCsv() {
  const csv = listRows().map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  saveBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), listFileName('csv'));
  markExported('CSV');
}

function exportXlsx() {
  saveBlob(xlsxBlob(), listFileName('xlsx'));
  markExported('Excel');
}

function printList() {
  const ev = cur();
  const rows = listRows(ev);
  $('#print-area').innerHTML = `<div class="print-page">
    <h1>Exposants — ${esc(ev.name)}${ev.date ? ' — ' + formatDate(ev.date) : ''}</h1>
    <p class="print-sub">Grenier à Sel de Gainneville · ${plural(ev.exhibitors.length, 'exposant')} · imprimé le ${formatDateTime(Date.now())}</p>
    <table class="print-table"><thead><tr>${rows[0].map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.slice(1).map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  window.print();
  markExported('impression');
}

async function linkFile() {
  try {
    fileHandle = await window.showSaveFilePicker({
      suggestedName: listFileName('xlsx'),
      types: [{ description: 'Classeur Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
    });
    fileHandleEvent = cur().id;
    await writeLinkedFile();
    toast(`La liste sera réécrite dans ${fileHandle.name} à chaque modification (tant que l'outil reste ouvert).`, 'success');
  } catch (e) {
    if (e.name !== 'AbortError') toast("Impossible d'utiliser ce fichier.", 'error');
  }
}

async function writeLinkedFile() {
  if (!isLinked()) return;
  try {
    const w = await fileHandle.createWritable();
    await w.write(xlsxBlob());
    await w.close();
    markExported(`fichier ${fileHandle.name}`);
  } catch (e) {
    toast(`Écriture impossible dans ${fileHandle.name} (fichier ouvert dans Excel ?). Nouvel essai à la prochaine modification.`, 'warning');
  }
}

function scheduleFileSync() {
  renderListBadge();
  if ($('#list-dialog').open) renderList();
  if (!fileHandle) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(writeLinkedFile, 1200);
}

$('#btn-list').onclick = openList;
$('#list-search').addEventListener('input', (e) => { listUi.search = e.target.value; renderList(); });
$('#list-dialog').addEventListener('click', (e) => {
  const th = e.target.closest('th[data-sort]');
  if (th) {
    if (listUi.sort === th.dataset.sort) listUi.dir *= -1; else { listUi.sort = th.dataset.sort; listUi.dir = 1; }
    renderList();
    return;
  }
  const act = e.target.closest('[data-list]')?.dataset.list;
  if (act === 'close') $('#list-dialog').close();
  if (act === 'xlsx') exportXlsx();
  if (act === 'csv') exportCsv();
  if (act === 'print') printList();
  if (act === 'link') linkFile();
  if (act === 'unlink') { fileHandle = null; fileHandleEvent = null; renderListStatus(); }
  const row = e.target.closest('tr[data-ex]');
  if (row && !act) openExhibitorDialog(row.dataset.ex);
});

// ---------- Événements ----------

const eventDialog = $('#event-dialog');
$('#btn-new-event').onclick = () => {
  $('#event-form').reset();
  eventDialog.showModal();
};
$('#event-cancel').onclick = () => eventDialog.close();
$('#event-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const name = f.name.value.trim();
  if (!name) return;
  const src = cur();
  let ev;
  if (f.base.value === 'copy') ev = { ...structuredClone(src), id: uid('ev'), name, date: f.date.value };
  else {
    ev = newEvent(name, f.date.value);
    if (f.base.value !== 'default') {
      ev.tables = structuredClone(src.tables);
      ev.settings = { ...src.settings };
    }
    if (f.base.value === 'exhibitors') {
      ev.exhibitors = structuredClone(src.exhibitors);
      ev.categoryColors = { ...src.categoryColors };
    }
  }
  db.events.push(normalizeEvent(ev));
  db.currentId = ev.id;
  ui.selectedEx = null; ui.selectedTable = null;
  save();
  eventDialog.close();
  refresh();
  toast(`Événement « ${name} » créé`, 'success');
});
$('#event-select').addEventListener('change', (e) => {
  db.currentId = e.target.value;
  ui.selectedEx = null; ui.selectedTable = null;
  save();
  refresh();
});

$('#btn-undo').onclick = undo;
$('#btn-redo').onclick = redo;

// ---------- Import / export ----------

const dataMenu = $('#data-menu');
$('#btn-data-menu').onclick = (e) => { e.stopPropagation(); dataMenu.hidden = !dataMenu.hidden; };
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) dataMenu.hidden = true; });

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'plan';

dataMenu.addEventListener('click', (e) => {
  const act = e.target.closest('[data-action]')?.dataset.action;
  if (!act) return;
  dataMenu.hidden = true;
  const ev = cur();
  if (act === 'export-event') download(`grenier-a-sel-${slug(ev.name)}.json`, JSON.stringify({ app: 'grenier-a-sel', version: 1, events: [ev] }, null, 2), 'application/json');
  if (act === 'export-all') download(`grenier-a-sel-tous-les-evenements.json`, JSON.stringify({ app: 'grenier-a-sel', version: 1, events: db.events }, null, 2), 'application/json');
  if (act === 'import') $('#import-file').click();
  if (act === 'export-png') exportPNG();
  if (act === 'list') openList();
});

$('#import-file').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  for (const file of files) await importFile(file);
});

async function importFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.kind === 'plan' || data.kind === 'plans') {
      const n = importPlans(data);
      if (!n) throw new Error('format');
      ui.tab = 'plans';
      refresh();
      toast(`${plural(n, 'plan importé', 'plans importés')} dans « ${cur().name} ». Cliquez « Ouvrir » pour l'afficher.`, 'success');
      return;
    }
    const events = Array.isArray(data.events) ? data.events : data.tables ? [data] : null;
    if (!events || !events.length) throw new Error('format');
    const ids = new Set(db.events.map((x) => x.id));
    let first = null;
    for (const raw of events) {
      const ev = normalizeEvent(raw);
      if (ids.has(ev.id)) {
        if (confirm(`L'événement « ${ev.name} » existe déjà. Le remplacer par la version importée ?\n(Annuler = l'importer comme copie)`)) {
          db.events = db.events.filter((x) => x.id !== ev.id);
        } else {
          ev.id = uid('ev');
          ev.name += ' (importé)';
        }
      }
      db.events.push(ev);
      first ||= ev.id;
    }
    db.currentId = first;
    save();
    refresh();
    toast(`${plural(events.length, 'événement importé', 'événements importés')}`, 'success');
  } catch (err) {
    toast(`${file.name} : fichier invalide, impossible de l’importer.`, 'error');
  }
}

// ---------- Plans enregistrés ----------

const PLAN_FIELDS = ['tables', 'exhibitors', 'assignments', 'settings', 'categoryColors'];
const planData = (ev) => structuredClone(Object.fromEntries(PLAN_FIELDS.map((f) => [f, ev[f]])));
// Une version sert à retrouver une disposition : tables, places et réglages.
// La liste des exposants, elle, reste toujours celle de l'événement (elle est
// aussi copiée dans la version pour sa miniature et pour l'import sur un autre appareil).
const layoutKey = (d) => JSON.stringify([d.tables, d.assignments, d.settings]);
const samePlan = (ev, plan) => layoutKey(ev) === layoutKey(plan.data);
const activePlan = (ev = cur()) => ev.plans.find((p) => p.id === ev.activePlanId) || null;

function isUnsaved(ev = cur()) {
  const p = activePlan(ev);
  if (p) return !samePlan(ev, p);
  return ev.exhibitors.length > 0 && !ev.plans.some((pl) => samePlan(ev, pl));
}

function formatDateTime(ts) {
  return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function planSummary(plan) {
  const r = evaluate(plan.data);
  return {
    placed: plan.data.exhibitors.filter((e) => r.exTables.has(e.id)).length,
    total: plan.data.exhibitors.length,
    errors: r.issues.filter((i) => i.severity === 'error').length,
  };
}

function planThumb(data) {
  const B = ROOM.bounds;
  const spaces = ROOM.spaces.map((s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" class="thumb-${s.kind}"/>`).join('');
  const tables = data.tables.map((t) => {
    const r = tableRect(t);
    const ex = data.exhibitors.find((e) => e.id === data.assignments[t.id]);
    return `<rect x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0}" height="${r.y1 - r.y0}" fill="${ex ? colorFor(ex, data) : '#fff'}" class="thumb-table"/>`;
  }).join('');
  return `<svg class="plan-thumb" viewBox="-0.3 -0.3 ${B.w + 0.6} ${B.h + 0.6}" aria-hidden="true">${spaces}<rect x="0" y="0" width="${B.w}" height="${B.h}" class="thumb-wall"/>${tables}</svg>`;
}

function renderPlanStatus() {
  const ev = cur();
  const p = activePlan(ev);
  const unsaved = isUnsaved(ev);
  $('#plans-badge').hidden = !unsaved;
  const pill = $('#plan-status');
  pill.className = 'plan-pill' + (unsaved ? ' unsaved' : '');
  pill.textContent = p ? `Plan : ${p.name}${unsaved ? ' (modifié)' : ''}` : unsaved ? 'Plan non enregistré' : `${plural(ev.plans.length, 'plan enregistré', 'plans enregistrés')}`;
  pill.title = 'Voir les plans enregistrés';
}
$('#plan-status').onclick = () => { ui.tab = 'plans'; renderSidebar(); };

function renderPlans() {
  const ev = cur();
  const act = activePlan(ev);
  const unsaved = isUnsaved(ev);
  const status = act
    ? (unsaved ? `Basé sur « ${esc(act.name)} » — <b>modifié, non enregistré</b>` : `« ${esc(act.name)} » — enregistré`)
    : (unsaved ? '<b>Plan en cours non enregistré</b>' : 'Rien de nouveau à enregistrer');
  const plans = [...ev.plans].sort((a, b) => b.savedAt - a.savedAt);
  $('#tab-plans').innerHTML = `
    <h3>Plan en cours</h3>
    <p class="plan-status ${unsaved ? 'unsaved' : ''}">${status}</p>
    ${act && unsaved ? `<button class="btn primary block" data-act="plan-update" data-id="${act.id}">Mettre à jour « ${esc(act.name)} »</button>` : ''}
    <form class="save-row" data-form="save-plan">
      <input name="name" maxlength="60" required value="Version ${ev.plans.length + 1}" aria-label="Nom du plan">
      <button class="btn ${act && unsaved ? '' : 'primary'}" title="Enregistrer comme nouveau plan">Enregistrer</button>
    </form>

    <h3>Plans enregistrés (${plans.length})</h3>
    ${plans.length ? `<ul class="plan-list">${plans.map((p) => {
      const s = planSummary(p);
      const open = p.id === ev.activePlanId;
      return `<li class="plan-item ${open ? 'active' : ''}">
        ${planThumb(p.data)}
        <div class="plan-info">
          <div><b>${esc(p.name)}</b>${open ? ' <span class="tag">ouvert</span>' : ''}</div>
          <small>Enregistré le ${formatDateTime(p.savedAt)}</small>
          <small>${s.placed}/${s.total} exposants placés · ${s.errors ? `<span class="err">${plural(s.errors, 'conflit')}</span>` : 'aucun conflit'}</small>
          <div class="btn-row">
            <button class="btn small primary" data-act="plan-open" data-id="${p.id}">Ouvrir</button>
            <button class="btn small" data-act="plan-export" data-id="${p.id}">Exporter</button>
            <button class="btn small" data-act="plan-rename" data-id="${p.id}">Renommer</button>
            <button class="btn small danger" data-act="plan-delete" data-id="${p.id}" title="Supprimer">${ic('trash')}</button>
          </div>
        </div>
      </li>`;
    }).join('')}</ul>` : '<p class="muted">Aucun plan enregistré pour cet événement.</p>'}

    <h3>Fichiers</h3>
    <div class="btn-row">
      <button class="btn" data-act="plan-import">Importer des plans (.json)…</button>
      ${plans.length ? '<button class="btn" data-act="plan-export-all">Exporter tous les plans</button>' : ''}
    </div>
    <p class="muted">Une version garde la disposition des tables et la place de chaque exposant.
      La liste des exposants, elle, reste toujours à jour : en ouvrant une version, les exposants inscrits depuis
      apparaissent « à placer ».
      Exportez une version en fichier .json pour la garder ou l'envoyer, puis réimportez-la ici pour la revoir ou la reprendre.
      « Données → Image du plan » donne une image à partager.</p>`;
}

function exportPlanFile(plans, filename) {
  const ev = cur();
  const payload = plans.length === 1
    ? { app: 'grenier-a-sel', version: 1, kind: 'plan', event: ev.name, eventDate: ev.date, plan: plans[0] }
    : { app: 'grenier-a-sel', version: 1, kind: 'plans', event: ev.name, eventDate: ev.date, plans };
  download(filename, JSON.stringify(payload, null, 2), 'application/json');
}

function importPlans(data) {
  const list = data.kind === 'plan' ? [data.plan] : data.plans;
  let n = 0;
  commit((ev) => {
    for (const raw of list || []) {
      if (!raw || !raw.data || !Array.isArray(raw.data.tables)) continue;
      let name = raw.name || 'Plan importé';
      if (ev.plans.some((p) => p.name === name)) name += ' (importé)';
      ev.plans.push({ id: uid('pl'), name, savedAt: raw.savedAt || Date.now(), data: planData(normalizeEvent({ name, ...raw.data })) });
      n++;
    }
  });
  return n;
}

function openPlan(id) {
  const ev = cur();
  const p = ev.plans.find((x) => x.id === id);
  if (!p) return;
  if (ev.activePlanId === id && !isUnsaved(ev)) { toast(`« ${p.name} » est déjà ouvert`, 'info'); return; }
  if (isUnsaved(ev) && !confirm(`Le plan en cours contient des modifications non enregistrées.\nOuvrir « ${p.name} » quand même ?\n(Vous pourrez revenir en arrière avec Ctrl+Z)`)) return;
  ui.selectedEx = null; ui.selectedTable = null;
  const data = structuredClone(p.data);
  const current = new Set(ev.exhibitors.map((e) => e.id));
  // Version venue d'ailleurs (import) sans aucun exposant en commun : on reprend aussi ses exposants.
  const foreign = data.exhibitors.length > 0 && !data.exhibitors.some((e) => current.has(e.id));
  let gone = 0;
  commit((ev) => {
    if (foreign) {
      ev.exhibitors.push(...data.exhibitors);
      data.exhibitors.forEach((e) => current.add(e.id));
    }
    ev.tables = data.tables;
    ev.settings = { ...ev.settings, ...data.settings };
    ev.categoryColors = { ...data.categoryColors, ...ev.categoryColors };
    const tableIds = new Set(ev.tables.map((t) => t.id));
    ev.assignments = {};
    for (const [tid, eid] of Object.entries(data.assignments)) {
      if (!tableIds.has(tid)) continue;
      if (current.has(eid)) ev.assignments[tid] = eid; else gone++;
    }
    ev.activePlanId = id;
  });
  const placed = new Set(Object.values(cur().assignments));
  const toPlace = cur().exhibitors.filter((e) => !placed.has(e.id)).length;
  const parts = [`Version « ${p.name} » ouverte`];
  if (toPlace) parts.push(`${plural(toPlace, 'exposant', 'exposants')} à placer`);
  if (gone) parts.push(`${plural(gone, 'table libérée', 'tables libérées')} (exposants supprimés depuis)`);
  toast(parts.join(' · '), toPlace ? 'warning' : 'success', toPlace ? { label: 'Placer', fn: () => runOptimize('keep') } : { label: 'Annuler', fn: undo });
}

$('#tab-plans').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (!name) return;
  const id = uid('pl');
  commit((ev) => {
    ev.plans.push({ id, name, savedAt: Date.now(), data: planData(ev) });
    ev.activePlanId = id;
  });
  toast(`Plan « ${name} » enregistré`, 'success', { label: 'Exporter', fn: () => exportPlanFile([activePlan()], `plan-${slug(cur().name)}-${slug(name)}.json`) });
});

$('#tab-plans').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const ev = cur();
  const p = ev.plans.find((x) => x.id === btn.dataset.id);
  switch (btn.dataset.act) {
    case 'plan-open': openPlan(p.id); break;
    case 'plan-update':
      commit((ev) => { const x = ev.plans.find((y) => y.id === p.id); x.data = planData(ev); x.savedAt = Date.now(); });
      toast(`Plan « ${p.name} » mis à jour`, 'success');
      break;
    case 'plan-export': exportPlanFile([p], `plan-${slug(ev.name)}-${slug(p.name)}.json`); break;
    case 'plan-export-all': exportPlanFile(ev.plans, `plans-${slug(ev.name)}.json`); break;
    case 'plan-import': $('#import-file').click(); break;
    case 'plan-rename': {
      const name = prompt('Nouveau nom du plan', p.name);
      if (name && name.trim()) commit((ev) => { ev.plans.find((y) => y.id === p.id).name = name.trim(); });
      break;
    }
    case 'plan-delete':
      if (!confirm(`Supprimer le plan enregistré « ${p.name} » ?`)) return;
      commit((ev) => {
        ev.plans = ev.plans.filter((y) => y.id !== p.id);
        if (ev.activePlanId === p.id) ev.activePlanId = null;
      });
      toast(`Plan « ${p.name} » supprimé`, 'info', { label: 'Annuler', fn: undo });
      break;
  }
});

// Image PNG du plan en cours (styles intégrés pour un fichier autonome).
async function exportPNG() {
  const ev = cur();
  const B = ROOM.bounds;
  const css = [...document.styleSheets].flatMap((sh) => {
    try { return [...sh.cssRules].map((r) => r.cssText); } catch { return []; }
  }).join('\n');
  const vb = [-0.8, -2.2, B.w + 1.6, B.h + 4.4];
  const scale = 70;
  const p = activePlan(ev);
  const title = `${ev.name}${ev.date ? ' — ' + formatDate(ev.date) : ''}${p ? ' · ' + p.name : ''}`;
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${vb[2] * scale}" height="${vb[3] * scale}" viewBox="${vb.join(' ')}">
    <style>${css} text { font-family: system-ui, sans-serif; }</style>
    ${$('#svg-defs').innerHTML}
    <rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#ffffff"/>
    <text x="0" y="-1.2" style="font-size:0.7px;font-weight:700;fill:#1f2933">${esc(title)}</text>
    <g>${roomSVG()}</g><g>${tablesSVG(ev, { print: true })}</g>
  </svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  try {
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `plan-${slug(ev.name)}${p ? '-' + slug(p.name) : ''}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }, 'image/png');
  } catch {
    toast("Impossible de générer l'image. Utilisez « Imprimer » puis « Enregistrer en PDF ».", 'error');
  }
}

// ---------- Impression ----------

$('#btn-print').onclick = () => {
  const ev = cur();
  const B = ROOM.bounds;
  const list = [...ev.exhibitors].sort((a, b) => (tableNums(a.id)[0] ?? 999) - (tableNums(b.id)[0] ?? 999) || a.name.localeCompare(b.name, 'fr'));
  $('#print-area').innerHTML = `
    <div class="print-page">
      <h1>${esc(ev.name)}${ev.date ? ' — ' + formatDate(ev.date) : ''}${activePlan(ev) ? ` · ${esc(activePlan(ev).name)}${isUnsaved(ev) ? ' (modifié)' : ''}` : ''}</h1>
      <p class="print-sub">Grenier à Sel de Gainneville · ${ev.exhibitors.length} exposants · ${ev.tables.length} tables</p>
      <svg viewBox="-0.8 -1.2 ${B.w + 1.6} ${B.h + 2.8}" class="print-plan">
        <g>${roomSVG()}</g><g>${tablesSVG(ev, { print: true })}</g>
      </svg>
    </div>
    <div class="print-page">
      <h2>Liste des exposants</h2>
      <table class="print-table">
        <thead><tr><th>Table(s)</th><th>Exposant</th><th>Objets vendus</th><th>Grilles</th><th>Élec.</th><th>Téléphone</th><th>Règl.</th><th>Notes</th></tr></thead>
        <tbody>${list.map((ex) => `<tr><td>${tableNums(ex.id).join(', ') || '—'}</td><td>${esc(ex.name)}</td><td>${esc(ex.products || ex.category)}</td><td>${ex.grilles || ''}</td><td>${ex.electricity ? 'oui' : ''}</td><td>${esc(ex.phone)}</td><td>${ex.payment ? esc(ex.payment) + ' €' : ''}</td><td>${esc(ex.notes)}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  window.print();
};

// ---------- Notifications ----------

function toast(message, kind = 'info', action = null) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { el.remove(); action.fn(); };
    el.appendChild(b);
  }
  const close = document.createElement('button');
  close.className = 'close';
  close.innerHTML = ic('x');
  close.title = 'Fermer';
  close.onclick = () => el.remove();
  el.appendChild(close);
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), action ? 9000 : 5000);
}

// ---------- Démarrage ----------

try { if (!localStorage.getItem(NOTICE_KEY)) $('#notice').hidden = false; } catch { $('#notice').hidden = false; }
$('#notice-close').onclick = () => {
  $('#notice').hidden = true;
  try { localStorage.setItem(NOTICE_KEY, '1'); } catch { /* ignore */ }
};

renderRoom();
save();
refresh();
fitView();

// ---------- Application installable (PWA) ----------

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
// Mode application installée : l'en-tête passe sous la barre d'état du téléphone.
document.documentElement.classList.toggle('standalone', standalone());
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installPrompt = null;

// Une nouvelle publication installe un nouveau service worker qui prend la main tout de suite :
// la page se recharge alors une fois pour être entièrement à jour (comme Encrine). Jamais au premier
// enregistrement, jamais deux fois en moins de 30 s. Au retour dans l'application, on vérifie s'il y a du nouveau.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const sw = navigator.serviceWorker;
  let hadController = !!sw.controller;
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    let last = 0;
    try { last = Number(sessionStorage.getItem('grenier-a-sel/reload') || 0); } catch { /* ignore */ }
    if (Date.now() - last < 30000) return;
    reloading = true;
    try { sessionStorage.setItem('grenier-a-sel/reload', String(Date.now())); } catch { /* ignore */ }
    location.reload();
  });
  sw.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((e) => console.warn('Service worker', e));
}
// Demande au navigateur de ne pas effacer les données locales (plans, exposants).
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#btn-install').hidden = false;
});
window.addEventListener('appinstalled', () => {
  $('#btn-install').hidden = true;
  installPrompt = null;
  toast("Application installée sur l'écran d'accueil", 'success');
});
if (!standalone() && isIOS) $('#btn-install').hidden = false;

$('#btn-install').onclick = async () => {
  if (installPrompt) {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') $('#btn-install').hidden = true;
    installPrompt = null;
    return;
  }
  $('#install-steps').innerHTML = isIOS
    ? `<ol><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez le bouton <b>Partager</b> <span class="kbd">${ic('share', 'i-sm')}</span> (en bas sur iPhone, en haut sur iPad).</li><li>Choisissez <b>« Sur l'écran d'accueil »</b>, puis <b>Ajouter</b>.</li></ol>`
    : `<ol><li>Ouvrez le menu du navigateur <span class="kbd">⋮</span>.</li><li>Choisissez <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b>.</li></ol>`;
  $('#install-dialog').showModal();
};
$('#install-close').onclick = () => $('#install-dialog').close();

// Accès pour le débogage depuis la console.
window.grenier = { get event() { return cur(); }, evaluate: () => evaluate(cur()) };
