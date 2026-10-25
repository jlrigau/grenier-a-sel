import { ROOM, REGIONS, TABLE_SIZE, defaultTables, regionAt, regionLabel, hasPower, wallPower } from './room.js';
import { evaluate, optimize, placeOne, groupAround, tableRect, DEFAULT_SETTINGS, SEVERITY_RANK } from './engine.js';

const STORAGE_KEY = 'grenier-a-sel/v1';
const NOTICE_KEY = 'grenier-a-sel/notice-dismissed';
const PALETTE = ['#8ecae6', '#f6bd60', '#90be6d', '#f28482', '#cdb4db', '#84a59d', '#ffafcc', '#d4a373', '#f9e07f', '#9fa8da', '#a8e6cf', '#ffab91', '#b0bec5', '#c5d86d'];
const NO_CATEGORY_COLOR = '#d9dee6';
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
  return { id: uid('ex'), name: '', category: '', tables: 1, electricity: false, zone: '', avoid: [], near: [], locked: false, contact: '', notes: '', ...fields };
}

function normalizeEvent(ev) {
  const base = newEvent(ev.name || 'Événement');
  const out = { ...base, ...ev };
  out.settings = { ...DEFAULT_SETTINGS, ...(ev.settings || {}) };
  out.exhibitors = (ev.exhibitors || []).map((e) => newExhibitor({ ...e, avoid: e.avoid || [], near: e.near || [] }));
  out.categoryColors = ev.categoryColors || {};
  out.assignments = ev.assignments || {};
  delete out.outlets;
  delete out.settings.elecDistance;
  out.plans = ev.plans || [];
  out.tables = (ev.tables || []).map((t) => ({ w: TABLE_SIZE.w, h: TABLE_SIZE.h, rot: 0, blocked: false, ...t }));
  out.exhibitors.forEach((e) => ensureCategoryColor(out, e.category));
  return out;
}

function makeDemoEvent() {
  const ev = newEvent('Exemple – Marché de Noël', '');
  const list = [
    ['Miel des Coteaux', 'Alimentation', 1, false, '', ['Rucher du Vexin']],
    ['Rucher du Vexin', 'Alimentation', 1, false, ''],
    ['Crêpes de Mamie', 'Restauration', 2, true, ''],
    ['Chocolaterie Martin', 'Alimentation', 1, true, ''],
    ['Bijoux Lune', 'Bijoux', 1, false, '', ['Atelier Perles']],
    ['Atelier Perles', 'Bijoux', 1, false, ''],
    ['Poterie du Grès', 'Artisanat', 2, false, ''],
    ['Luminaires Récup', 'Décoration', 1, true, ''],
    ['Bougies & Cie', 'Décoration', 1, false, ''],
    ['Couture Créative', 'Textile', 2, true, ''],
    ['Tricots de Laine', 'Textile', 1, false, ''],
    ['Librairie Ambulante', 'Livres', 2, false, 'pourtour'],
    ['Club photo', 'Association', 2, false, 'hall'],
    ['Savonnerie artisanale', 'Cosmétique', 1, false, ''],
    ['Jouets en bois', 'Artisanat', 1, false, 'ilot'],
    ['Peintures sur grilles', 'Art', 1, false, 'ilot'],
  ];
  const byName = {};
  for (const [name, category, tables, electricity, zone] of list) {
    const ex = newExhibitor({ name, category, tables, electricity, zone });
    byName[name] = ex;
    ev.exhibitors.push(ex);
    ensureCategoryColor(ev, category);
  }
  for (const [name, , , , , avoid] of list) if (avoid) byName[name].avoid = avoid.map((n) => byName[n].id);
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

function autoPlace(exId) {
  const ex = exById(exId);
  if (!ex) return;
  const res = placeOne(cur(), exId);
  if (!res.found) {
    toast(`Aucune table libre pour ${ex.name}.`, 'warning', { label: 'Réorganiser le plan', fn: () => runOptimize('keep') });
    return;
  }
  commit((ev) => { ev.assignments = res.assignments; });
  ui.selectedEx = exId;
  refresh();
  focusExhibitor(exId);
  const problems = (evaluation.byExhibitor.get(exId) || []).filter((i) => i.severity === 'error' || i.type === 'missing');
  if (problems.length) {
    toast(`${ex.name} placé, mais : ${problems[0].msg}`, 'warning', { label: 'Réorganiser les autres', fn: () => runOptimize('keep') });
  } else {
    toast(`${ex.name} placé sur ${tableNums(exId).length > 1 ? 'les tables' : 'la table'} ${tableNums(exId).join(', ')}`, 'success');
  }
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
    .map((e) => `<option value="${e.id}" ${e.id === ev.id ? 'selected' : ''}>${esc(e.name)}${e.date ? ' — ' + formatDate(e.date) : ''}</option>`)
    .join('');
  $('#btn-undo').disabled = !undoStack.length;
  $('#btn-redo').disabled = !redoStack.length;
}

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
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
  $('#ex-stats').innerHTML = `<span><b>${placedCount}</b>/${ev.exhibitors.length} placés</span><span><b>${needed}</b> tables demandées / ${ev.tables.filter((t) => !t.blocked).length}</span><span><b>${free}</b> libres</span>`;

  const items = ev.exhibitors
    .map((ex) => ({ ex, st: exStatus(ex) }))
    .filter(({ ex, st }) => {
      if (q && !`${ex.name} ${ex.category} ${ex.contact} ${ex.notes}`.toLowerCase().includes(q)) return false;
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
    const icon = !st.placed ? '<span class="st st-unplaced" title="Non placé">○</span>'
      : st.worst === 'error' ? '<span class="st st-error" title="Contrainte non respectée">!</span>'
      : st.worst === 'warning' ? '<span class="st st-warning" title="À vérifier">!</span>'
      : '<span class="st st-ok" title="OK">✓</span>';
    let detail = '';
    if (selected) {
      const names = (ids) => ids.map((id) => exById(id)?.name).filter(Boolean).map(esc).join(', ');
      const avoidedBy = ev.exhibitors.filter((o) => (o.avoid || []).includes(ex.id)).map((o) => o.id);
      const rows = [];
      if (ex.zone) rows.push(`<div><span class="k">Emplacement</span> ${esc(regionLabel(ex.zone))}</div>`);
      const avoidAll = [...new Set([...(ex.avoid || []), ...avoidedBy])];
      if (avoidAll.length) rows.push(`<div><span class="k">À séparer de</span> ${names(avoidAll)}</div>`);
      if ((ex.near || []).length) rows.push(`<div><span class="k">Proche de</span> ${names(ex.near)}</div>`);
      if (ex.contact) rows.push(`<div><span class="k">Contact</span> ${esc(ex.contact)}</div>`);
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
      <span class="handle" data-drag="${ex.id}" title="Glisser sur une table du plan">⠿</span>
      <span class="dot" style="background:${colorFor(ex)}"></span>
      <div class="ex-main">
        <div class="ex-name">${esc(ex.name)}</div>
        <div class="ex-meta">${ex.category ? esc(ex.category) + ' · ' : ''}${plural(ex.tables || 1, 'table')}${ex.electricity ? ' · <span class="elec" title="Besoin d\'électricité">⚡</span>' : ''}${ex.locked ? ' · 🔒' : ''}</div>
        <div class="ex-where">${nums.length ? 'Table' + (nums.length > 1 ? 's' : '') + ' ' + nums.join(', ') : 'Non placé'}</div>
      </div>
      ${icon}
      <button class="icon-btn" data-edit="${ex.id}" title="Modifier">✎</button>
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
      <div class="card"><b>${placed}/${ev.exhibitors.length}</b><span>exposants placés</span></div>
      <div class="card"><b>${used}/${ev.tables.length}</b><span>tables attribuées</span></div>
      <div class="card ${errors.length ? 'bad' : 'good'}"><b>${errors.length}</b><span>${errors.length > 1 ? 'conflits' : 'conflit'}</span></div>
      <div class="card"><b>${elecNeeds}</b><span>besoin${elecNeeds > 1 ? 's' : ''} électrique${elecNeeds > 1 ? 's' : ''}</span></div>
    </div>
    ${!evaluation.issues.length ? '<p class="all-good">✓ Toutes les contraintes sont respectées.</p>' : ''}
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
  out.push(`<text x="${ROOM.bounds.w / 2}" y="-0.5" class="dim">Sorties de secours <tspan class="exit-sym">➜</tspan> · cotes approximatives · 1 carreau = 1 m</text>`);
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
    const fill = ex ? colorFor(ex, ev) : t.blocked ? '#e7e5e4' : '#ffffff';
    const L = Math.max(w, h);
    const fs = 0.25;
    const maxChars = Math.max(3, Math.floor((L - 0.15) / (fs * 0.56)));
    let name = ex ? ex.name : t.blocked ? 'non attribuable' : '';
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '…';
    const rot = vertical ? ' transform="rotate(-90)"' : '';
    const badges = [];
    if (ex && ex.electricity) badges.push('⚡');
    if (ex && ex.locked) badges.push('🔒');
    const bx = vertical ? -w / 2 + 0.06 : w / 2 - 0.06;
    const by = vertical ? h / 2 - 0.08 : -h / 2 + 0.24;
    return `<g class="${cls.join(' ')}" data-table="${t.id}" transform="translate(${t.x} ${t.y})">
      <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="0.05" fill="${fill}"/>
      <text class="tnum" x="${-w / 2 + 0.07}" y="${-h / 2 + 0.2}">${t.num}</text>
      ${name ? `<text class="tname ${ex ? '' : 'muted'}" y="0.09"${rot}>${esc(name)}</text>` : ''}
      ${powered ? `<circle class="pwr" cx="${w / 2 - 0.11}" cy="${h / 2 - 0.11}" r="0.07"><title>Électricité disponible</title></circle>` : ''}
      ${badges.length ? `<text class="tbadge" x="${bx}" y="${by}" text-anchor="${vertical ? 'start' : 'end'}">${badges.join('')}</text>` : ''}
    </g>`;
  }).join('');
}

function renderMap() {
  const ev = cur();
  $('#table-layer').innerHTML = tablesSVG(ev);
  svg.dataset.mode = ui.mode;
  $$('#mode-switch button').forEach((b) => b.classList.toggle('active', b.dataset.mode === ui.mode));
  const hints = {
    place: 'Glissez un exposant de la liste sur une table · glissez une table occupée vers une autre pour déplacer ou échanger (Maj = ajouter une table) · cliquez une table pour l\'attribuer',
    layout: 'Glissez les tables pour les déplacer · R : pivoter · Suppr : supprimer · flèches : ajuster · Ctrl+D : dupliquer',
    power: 'Tables en jaune : électricité disponible (par défaut, celles le long des murs). Cliquez une table pour ajouter ou retirer l\'électricité.',
  };
  $('#mode-hint').textContent = hints[ui.mode];
  $('#toolbar-extra').innerHTML = ui.mode === 'layout' ? '<button class="btn small" data-act="add-table">+ Table</button>' : '';
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
    <span>⚡ Besoin d'électricité</span>
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
  const head = `<div class="insp-head"><b>Table ${t.num}</b><span class="muted">${esc(regionLabel(regionAt(t.x, t.y)))}</span><button class="icon-btn" data-act="close-insp" title="Fermer">×</button></div>`;
  const issuesHtml = issues.length ? `<ul class="mini-issues">${issues.map((i) => `<li class="sev-${i.severity}">${esc(i.msg)}</li>`).join('')}</ul>` : '';
  if (ui.mode === 'layout') {
    box.innerHTML = `${head}
      <div class="btn-row">
        <button class="btn small" data-act="rotate">↻ Pivoter</button>
        <button class="btn small" data-act="duplicate">⧉ Dupliquer</button>
        <button class="btn small danger" data-act="delete-table">Supprimer</button>
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
    return `<option value="${e.id}" ${ex && ex.id === e.id ? 'selected' : ''}>${esc(e.name)}${e.electricity ? ' ⚡' : ''}${nums.length ? ` (table ${nums.join(', ')})` : ' — non placé'}</option>`;
  }).join('');
  box.innerHTML = `${head}
    <div class="muted">${hasPower(t) ? '⚡ Électricité disponible' : 'Pas d\'électricité'}</div>
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
    drag = { type: 'pan', start, orig: { tx: ui.view.tx, ty: ui.view.ty }, moved: false };
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
    if (act.dataset.act === 'auto') autoPlace(id);
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
$('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) { ui.tab = b.dataset.tab; renderSidebar(); }
});
$('#btn-add-ex').onclick = () => openExhibitorDialog(null);
$('#btn-place-missing').onclick = () => runOptimize('keep');
$('#btn-optimize').onclick = () => {
  if (confirm('Recalculer entièrement le plan ? Les exposants verrouillés 🔒 restent en place, les autres peuvent tous changer de table. (Annulable avec Ctrl+Z)')) runOptimize('fresh');
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
  exForm.contact.value = ex.contact || '';
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
    contact: exForm.contact.value.trim(),
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
  if (action === 'place') autoPlace(id);
  else if (isNew) toast(`${name} ajouté. Glissez-le sur une table ou utilisez « Placer automatiquement ».`, 'success', { label: 'Placer maintenant', fn: () => autoPlace(id) });
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
  if (act === 'export-csv') {
    const rows = [['Exposant', 'Catégorie', 'Tables demandées', 'Tables attribuées', 'Électricité', 'Emplacement souhaité', 'À séparer de', 'Contact', 'Notes']];
    for (const ex of [...ev.exhibitors].sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
      rows.push([ex.name, ex.category, ex.tables, tableNums(ex.id).join(' '), ex.electricity ? 'oui' : '', ex.zone ? regionLabel(ex.zone) : '',
        (ex.avoid || []).map((id) => exById(id)?.name).filter(Boolean).join(', '), ex.contact, ex.notes]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    download(`exposants-${slug(ev.name)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  }
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
const samePlan = (ev, plan) => JSON.stringify(planData(ev)) === JSON.stringify(plan.data);
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
  pill.textContent = p ? `Plan : ${p.name}${unsaved ? ' (modifié)' : ' ✓'}` : unsaved ? 'Plan non enregistré' : `${plural(ev.plans.length, 'plan enregistré', 'plans enregistrés')}`;
  pill.title = 'Voir les plans enregistrés';
}
$('#plan-status').onclick = () => { ui.tab = 'plans'; renderSidebar(); };

function renderPlans() {
  const ev = cur();
  const act = activePlan(ev);
  const unsaved = isUnsaved(ev);
  const status = act
    ? (unsaved ? `Basé sur « ${esc(act.name)} » — <b>modifié, non enregistré</b>` : `« ${esc(act.name)} » — enregistré ✓`)
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
            <button class="btn small danger" data-act="plan-delete" data-id="${p.id}" title="Supprimer">🗑</button>
          </div>
        </div>
      </li>`;
    }).join('')}</ul>` : '<p class="muted">Aucun plan enregistré pour cet événement.</p>'}

    <h3>Fichiers</h3>
    <div class="btn-row">
      <button class="btn" data-act="plan-import">Importer des plans (.json)…</button>
      ${plans.length ? '<button class="btn" data-act="plan-export-all">Exporter tous les plans</button>' : ''}
    </div>
    <p class="muted">Un plan enregistré conserve les tables, les exposants et leurs places.
      Exportez-le en fichier .json pour le garder ou l'envoyer, puis réimportez-le ici pour le revoir ou le reprendre.
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
  commit((ev) => { Object.assign(ev, structuredClone(p.data)); ev.activePlanId = id; });
  toast(`Plan « ${p.name} » ouvert`, 'success', { label: 'Annuler', fn: undo });
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
        <thead><tr><th>Table(s)</th><th>Exposant</th><th>Catégorie</th><th>⚡</th><th>Contact</th><th>Notes</th></tr></thead>
        <tbody>${list.map((ex) => `<tr><td>${tableNums(ex.id).join(', ') || '—'}</td><td>${esc(ex.name)}</td><td>${esc(ex.category)}</td><td>${ex.electricity ? '⚡' : ''}</td><td>${esc(ex.contact)}</td><td>${esc(ex.notes)}</td></tr>`).join('')}</tbody>
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
  close.textContent = '×';
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

// Accès pour le débogage depuis la console.
window.grenier = { get event() { return cur(); }, evaluate: () => evaluate(cur()) };
