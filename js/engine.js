// Moteur de contraintes : vérification d'un plan et placement automatique.
import { ROOM, regionAt, regionLabel } from './room.js';

export const DEFAULT_SETTINGS = {
  avoidDistance: 2.5, // distance minimale entre deux exposants « à séparer »
  elecDistance: 3, // distance maximale table ↔ prise
  nearDistance: 4, // distance souhaitée pour « proche de »
  adjacencyGap: 0.5, // écart max pour que deux tables soient contiguës
  flagSameCategory: true, // signaler deux exposants de même catégorie côte à côte
};

export const SEVERITY_RANK = { error: 3, warning: 2, info: 1 };

const WEIGHTS = {
  unplaced: 700, missingTable: 250, elec: 1000, avoid: 1000, badTable: 400,
  zone: 90, near: 12, nearCap: 120, sameCategory: 35, moved: 50,
};

// ---------- Géométrie ----------

export function tableRect(t) {
  const vertical = (t.rot || 0) % 180 !== 0;
  const w = vertical ? t.h : t.w;
  const h = vertical ? t.w : t.h;
  return { x0: t.x - w / 2, y0: t.y - h / 2, x1: t.x + w / 2, y1: t.y + h / 2 };
}

const toRect = (z) => ({ x0: z.x, y0: z.y, x1: z.x + z.w, y1: z.y + z.h });

export function rectDist(a, b) {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.hypot(dx, dy);
}

export function pointRectDist(x, y, r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dy = Math.max(r.y0 - y, 0, y - r.y1);
  return Math.hypot(dx, dy);
}

function overlaps(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0.02 && h > 0.02;
}

function inside(a, o) {
  const e = 0.01;
  return a.x0 >= o.x0 - e && a.y0 >= o.y0 - e && a.x1 <= o.x1 + e && a.y1 <= o.y1 + e;
}

const USABLE = ROOM.usable.map(toRect);
const ZONES = ROOM.zones.map((z) => ({ ...z, r: toRect(z) }));

// ---------- Contexte ----------

export function buildContext(ev) {
  const s = { ...DEFAULT_SETTINGS, ...(ev.settings || {}) };
  const tables = ev.tables;
  const n = tables.length;
  const index = new Map(tables.map((t, i) => [t.id, i]));
  const rects = tables.map(tableRect);
  const dist = new Float64Array(n * n);
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = rectDist(rects[i], rects[j]);
      dist[i * n + j] = d;
      dist[j * n + i] = d;
      if (d <= s.adjacencyGap) { adj[i].push(j); adj[j].push(i); }
    }
  }
  const outlets = ev.outlets || [];
  const elecDist = rects.map((r) => outlets.reduce((m, o) => Math.min(m, pointRectDist(o.x, o.y, r)), Infinity));
  const region = tables.map((t) => regionAt(t.x, t.y));
  const { issues: geo, bad } = geometryIssues(tables, rects);
  return { s, tables, n, index, rects, dist, adj, elecDist, region, geo, badTables: bad };
}

function geometryIssues(tables, rects) {
  const issues = [];
  const bad = new Set();
  tables.forEach((t, i) => {
    const r = rects[i];
    if (!USABLE.some((u) => inside(r, u))) {
      issues.push({ severity: 'error', type: 'outside', msg: `Table ${t.num} : en dehors de l'espace utilisable (mur, local…)`, tables: [t.id], exhibitors: [] });
      bad.add(i);
    }
    for (const z of ZONES) {
      if (!overlaps(r, z.r)) continue;
      if (z.type === 'reserved') {
        issues.push({ severity: 'warning', type: 'zone', msg: `Table ${t.num} : empiète sur l'${z.label.toLowerCase()}`, tables: [t.id], exhibitors: [] });
      } else {
        const what = z.type === 'fixed' ? `la table ${z.label}` : z.label;
        issues.push({ severity: 'error', type: 'clearance', msg: `Table ${t.num} : bloque ${what}`, tables: [t.id], exhibitors: [] });
        bad.add(i);
      }
    }
    for (let j = i + 1; j < tables.length; j++) {
      if (overlaps(r, rects[j])) {
        issues.push({ severity: 'error', type: 'overlap', msg: `Tables ${t.num} et ${tables[j].num} se chevauchent`, tables: [t.id, tables[j].id], exhibitors: [] });
        bad.add(i); bad.add(j);
      }
    }
  });
  return { issues, bad };
}

function groupDist(ctx, ga, gb) {
  let m = Infinity;
  for (const a of ga) for (const b of gb) m = Math.min(m, ctx.dist[a * ctx.n + b]);
  return m;
}

function isConnected(group, adj) {
  if (group.length <= 1) return true;
  const set = new Set(group);
  const seen = new Set([group[0]]);
  const stack = [group[0]];
  while (stack.length) {
    const t = stack.pop();
    for (const nb of adj[t]) if (set.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
  }
  return seen.size === set.size;
}

const fmt = (d) => d.toFixed(1).replace('.', ',') + ' m';
const tableCount = (ex) => Math.max(1, Math.min(8, Math.round(Number(ex.tables) || 1)));

function relationPairs(exhibitors, key) {
  const ids = new Set(exhibitors.map((e) => e.id));
  const seen = new Set();
  const pairs = [];
  for (const e of exhibitors) {
    for (const other of e[key] || []) {
      if (!ids.has(other) || other === e.id) continue;
      const k = [e.id, other].sort().join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      pairs.push([e.id, other]);
    }
  }
  return pairs;
}

// ---------- Vérification ----------

export function evaluate(ev) {
  const ctx = buildContext(ev);
  const { s } = ctx;
  const issues = [...ctx.geo];
  const exById = new Map(ev.exhibitors.map((e) => [e.id, e]));
  const exTables = new Map();
  for (const [tid, eid] of Object.entries(ev.assignments || {})) {
    const ti = ctx.index.get(tid);
    if (ti === undefined || !exById.has(eid)) continue;
    if (!exTables.has(eid)) exTables.set(eid, []);
    exTables.get(eid).push(ti);
  }
  const numsOf = (g) => g.map((i) => ctx.tables[i].num).sort((a, b) => a - b).join(', ');

  for (const ex of ev.exhibitors) {
    const g = exTables.get(ex.id) || [];
    const want = tableCount(ex);
    const base = { tables: g.map((i) => ctx.tables[i].id), exhibitors: [ex.id] };
    if (!g.length) {
      issues.push({ ...base, severity: 'warning', type: 'unplaced', msg: `${ex.name} n'est pas encore placé` });
      continue;
    }
    if (g.length < want) issues.push({ ...base, severity: 'warning', type: 'missing', msg: `${ex.name} : ${want - g.length} table(s) manquante(s) (${g.length}/${want})` });
    if (g.length > want) issues.push({ ...base, severity: 'info', type: 'extra', msg: `${ex.name} occupe ${g.length} tables pour ${want} demandée(s)` });
    if (!isConnected(g, ctx.adj)) issues.push({ ...base, severity: 'warning', type: 'split', msg: `${ex.name} : tables non contiguës (${numsOf(g)})` });
    if (ex.electricity) {
      const d = Math.min(...g.map((i) => ctx.elecDist[i]));
      if (d > s.elecDistance) {
        const detail = Number.isFinite(d) ? `prise la plus proche à ${fmt(d)}` : 'aucune prise définie';
        issues.push({ ...base, severity: 'error', type: 'elec', msg: `${ex.name} a besoin d'électricité : ${detail} (max ${fmt(s.elecDistance)})` });
      }
    }
    if (ex.zone && g.some((i) => ctx.region[i] !== ex.zone)) {
      issues.push({ ...base, severity: 'warning', type: 'zone', msg: `${ex.name} souhaite être : ${regionLabel(ex.zone)}` });
    }
    const blocked = g.filter((i) => ctx.tables[i].blocked);
    if (blocked.length) issues.push({ ...base, severity: 'warning', type: 'blocked', msg: `${ex.name} est sur une table marquée non attribuable (${numsOf(blocked)})` });
  }

  for (const [a, b] of relationPairs(ev.exhibitors, 'avoid')) {
    const ga = exTables.get(a), gb = exTables.get(b);
    if (!ga || !gb) continue;
    const d = groupDist(ctx, ga, gb);
    if (d < s.avoidDistance) {
      issues.push({
        severity: 'error', type: 'avoid', tables: [...ga, ...gb].map((i) => ctx.tables[i].id), exhibitors: [a, b],
        msg: `${exById.get(a).name} et ${exById.get(b).name} ne doivent pas être voisins (${fmt(d)}, min ${fmt(s.avoidDistance)})`,
      });
    }
  }

  for (const [a, b] of relationPairs(ev.exhibitors, 'near')) {
    const ga = exTables.get(a), gb = exTables.get(b);
    if (!ga || !gb) continue;
    const d = groupDist(ctx, ga, gb);
    if (d > s.nearDistance) {
      issues.push({
        severity: 'info', type: 'near', tables: [...ga, ...gb].map((i) => ctx.tables[i].id), exhibitors: [a, b],
        msg: `${exById.get(a).name} et ${exById.get(b).name} souhaitent être proches (${fmt(d)})`,
      });
    }
  }

  if (s.flagSameCategory) {
    const owner = new Map();
    for (const [eid, g] of exTables) for (const i of g) owner.set(i, eid);
    const seen = new Set();
    for (const [i, a] of owner) {
      const ca = catKey(exById.get(a));
      if (!ca) continue;
      for (const j of ctx.adj[i]) {
        const b = owner.get(j);
        if (!b || b === a || catKey(exById.get(b)) !== ca) continue;
        const k = [a, b].sort().join('|');
        if (seen.has(k)) continue;
        seen.add(k);
        issues.push({
          severity: 'warning', type: 'category', tables: [ctx.tables[i].id, ctx.tables[j].id], exhibitors: [a, b],
          msg: `${exById.get(a).name} et ${exById.get(b).name} (même catégorie « ${exById.get(a).category.trim()} ») sont côte à côte`,
        });
      }
    }
  }

  issues.sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity]);

  const byExhibitor = new Map();
  const tableSeverity = new Map();
  for (const is of issues) {
    for (const e of is.exhibitors) {
      if (!byExhibitor.has(e)) byExhibitor.set(e, []);
      byExhibitor.get(e).push(is);
    }
    if (is.type === 'unplaced' || is.severity === 'info') continue;
    for (const t of is.tables) {
      const cur = tableSeverity.get(t);
      if (!cur || SEVERITY_RANK[is.severity] > SEVERITY_RANK[cur]) tableSeverity.set(t, is.severity);
    }
  }
  return { ctx, issues, byExhibitor, tableSeverity, exTables };
}

const catKey = (ex) => (ex && ex.category ? ex.category.trim().toLowerCase() : '');

// ---------- Placement automatique ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tous les groupes de k tables contiguës (parmi les tables autorisées).
export function enumerateGroups(k, adj, allowed, seeds = null, cap = 8000) {
  let frontier = new Map();
  for (let i = 0; i < adj.length; i++) {
    if (allowed[i] && (!seeds || seeds.includes(i))) frontier.set(String(i), [i]);
  }
  for (let size = 2; size <= k; size++) {
    const next = new Map();
    outer: for (const g of frontier.values()) {
      for (const t of g) {
        for (const nb of adj[t]) {
          if (!allowed[nb] || g.includes(nb)) continue;
          const ng = [...g, nb].sort((a, b) => a - b);
          const key = ng.join(',');
          if (!next.has(key)) next.set(key, ng);
          if (next.size >= cap) break outer;
        }
      }
    }
    frontier = next;
  }
  return [...frontier.values()];
}

function prepare(ev, ctx) {
  const exs = ev.exhibitors;
  const exIndex = new Map(exs.map((e, i) => [e.id, i]));
  const pairsOf = (key) => relationPairs(exs, key).map(([a, b]) => [exIndex.get(a), exIndex.get(b)]);
  const owner = new Int32Array(ctx.n).fill(-1);
  const groups = exs.map(() => null);
  for (const [tid, eid] of Object.entries(ev.assignments || {})) {
    const ti = ctx.index.get(tid);
    const ei = exIndex.get(eid);
    if (ti === undefined || ei === undefined) continue;
    owner[ti] = ei;
    (groups[ei] ||= []).push(ti);
  }
  groups.forEach((g) => g && g.sort((a, b) => a - b));
  return {
    exs, exIndex, owner, groups,
    size: exs.map(tableCount),
    cat: exs.map(catKey),
    avoid: pairsOf('avoid'),
    near: pairsOf('near'),
    origKeys: groups.map((g) => (g ? g.join(',') : null)),
  };
}

function makeCost(ctx, P, { stability }) {
  const { s, n, dist, adj, elecDist, region, badTables } = ctx;
  const gd = (ga, gb) => {
    let m = Infinity;
    for (const a of ga) for (const b of gb) { const d = dist[a * n + b]; if (d < m) m = d; }
    return m;
  };
  return () => {
    const { groups, owner, exs, size } = P;
    let c = 0;
    for (let e = 0; e < exs.length; e++) {
      const g = groups[e];
      if (!g) { c += WEIGHTS.unplaced; continue; }
      if (g.length < size[e]) c += WEIGHTS.missingTable * (size[e] - g.length);
      if (exs[e].electricity) {
        let m = Infinity;
        for (const t of g) if (elecDist[t] < m) m = elecDist[t];
        if (m > s.elecDistance) c += WEIGHTS.elec + (Number.isFinite(m) ? m * 10 : 0);
      }
      if (exs[e].zone) for (const t of g) if (region[t] !== exs[e].zone) { c += WEIGHTS.zone; break; }
      for (const t of g) if (badTables.has(t)) { c += WEIGHTS.badTable; break; }
      if (stability && P.origKeys[e] && P.origKeys[e] !== g.join(',')) c += WEIGHTS.moved;
    }
    for (const [a, b] of P.avoid) {
      if (!groups[a] || !groups[b]) continue;
      const d = gd(groups[a], groups[b]);
      if (d < s.avoidDistance) c += WEIGHTS.avoid * (1 + (s.avoidDistance - d) / s.avoidDistance);
    }
    for (const [a, b] of P.near) {
      if (!groups[a] || !groups[b]) continue;
      const d = gd(groups[a], groups[b]);
      if (d > s.nearDistance) c += Math.min(WEIGHTS.nearCap, WEIGHTS.near * (d - s.nearDistance));
    }
    if (s.flagSameCategory) {
      for (let i = 0; i < n; i++) {
        const a = owner[i];
        if (a < 0 || !P.cat[a]) continue;
        for (const j of adj[i]) {
          if (j <= i) continue;
          const b = owner[j];
          if (b >= 0 && b !== a && P.cat[b] === P.cat[a]) c += WEIGHTS.sameCategory;
        }
      }
    }
    return c;
  };
}

function setGroup(P, e, g) {
  const old = P.groups[e];
  if (old) for (const t of old) if (P.owner[t] === e) P.owner[t] = -1;
  P.groups[e] = g;
  if (g) for (const t of g) P.owner[t] = e;
}

function toAssignments(ctx, P) {
  const out = {};
  P.groups.forEach((g, e) => g && g.forEach((t) => { out[ctx.tables[t].id] = P.exs[e].id; }));
  return out;
}

function allowedMask(ctx, P, fixed) {
  return ctx.tables.map((t, i) => !t.blocked && !ctx.badTables.has(i) && !(P.owner[i] >= 0 && fixed[P.owner[i]]));
}

// Place un seul exposant sur le meilleur groupe de tables libres, sans toucher aux autres.
export function placeOne(ev, exId) {
  const ctx = buildContext(ev);
  const P = prepare(ev, ctx);
  const e = P.exIndex.get(exId);
  if (e === undefined) return { found: false, assignments: ev.assignments };
  setGroup(P, e, null);
  const allowed = ctx.tables.map((t, i) => !t.blocked && !ctx.badTables.has(i) && P.owner[i] === -1);
  const cost = makeCost(ctx, P, { stability: false });
  for (let k = P.size[e]; k >= 1; k--) {
    const cands = enumerateGroups(k, ctx.adj, allowed);
    if (!cands.length) continue;
    let best = null, bestCost = Infinity;
    for (const g of cands) {
      setGroup(P, e, g);
      const c = cost();
      if (c < bestCost) { bestCost = c; best = g; }
    }
    setGroup(P, e, best);
    return { found: true, partial: k < P.size[e], assignments: toAssignments(ctx, P) };
  }
  return { found: false, assignments: toAssignments(ctx, P) };
}

// Optimise tout le plan.
// mode « keep » : garde au maximum les emplacements actuels ; « fresh » : repart de zéro.
// Les exposants verrouillés ne bougent jamais.
export function optimize(ev, { mode = 'keep', iterations = 40000, seed = Date.now() } = {}) {
  const rand = mulberry32(seed);
  const ctx = buildContext(ev);
  const P = prepare(ev, ctx);
  const fixed = P.exs.map((e) => !!e.locked);
  if (mode === 'fresh') P.exs.forEach((_, e) => { if (!fixed[e]) setGroup(P, e, null); });
  const allowed = allowedMask(ctx, P, fixed);
  const cost = makeCost(ctx, P, { stability: mode === 'keep' });

  const cache = new Map();
  const groupsOfSize = (k) => {
    if (!cache.has(k)) cache.set(k, enumerateGroups(k, ctx.adj, allowed));
    return cache.get(k);
  };
  const isFree = (g, e) => g.every((t) => P.owner[t] === -1 || P.owner[t] === e);

  // 1) Placement glouton des exposants non placés, les plus contraints d'abord.
  const difficulty = (e) => (P.exs[e].electricity ? 4 : 0) + (P.exs[e].zone ? 2 : 0) + P.size[e]
    + P.avoid.filter(([a, b]) => a === e || b === e).length * 2;
  const todo = P.exs.map((_, e) => e).filter((e) => !fixed[e] && !P.groups[e]).sort((a, b) => difficulty(b) - difficulty(a));
  for (const e of todo) {
    let best = null, bestCost = Infinity;
    for (let k = P.size[e]; k >= 1 && !best; k--) {
      for (const g of groupsOfSize(k)) {
        if (!isFree(g, e)) continue;
        setGroup(P, e, g);
        const c = cost();
        if (c < bestCost) { bestCost = c; best = g; }
      }
    }
    setGroup(P, e, best);
  }

  // 2) Recuit simulé : déplacements et échanges.
  const movable = P.exs.map((_, e) => e).filter((e) => !fixed[e]);
  let current = cost();
  let bestCost = current;
  let bestGroups = P.groups.slice();
  if (movable.length) {
    const bySize = new Map();
    for (const e of movable) {
      if (!bySize.has(P.size[e])) bySize.set(P.size[e], []);
      bySize.get(P.size[e]).push(e);
    }
    const T0 = 400, T1 = 0.5;
    for (let it = 0; it < iterations; it++) {
      const T = T0 * Math.pow(T1 / T0, it / iterations);
      const e = movable[(rand() * movable.length) | 0];
      let undo;
      if (rand() < 0.6) {
        const cands = groupsOfSize(P.size[e]);
        if (!cands.length) continue;
        const g = cands[(rand() * cands.length) | 0];
        if (!isFree(g, e)) continue;
        const old = P.groups[e];
        setGroup(P, e, g);
        undo = () => setGroup(P, e, old);
      } else {
        const peers = bySize.get(P.size[e]);
        const f = peers[(rand() * peers.length) | 0];
        if (f === e || (!P.groups[e] && !P.groups[f])) continue;
        const ge = P.groups[e], gf = P.groups[f];
        setGroup(P, e, null); setGroup(P, f, null);
        setGroup(P, e, gf); setGroup(P, f, ge);
        undo = () => { setGroup(P, e, null); setGroup(P, f, null); setGroup(P, e, ge); setGroup(P, f, gf); };
      }
      const c = cost();
      const delta = c - current;
      if (delta <= 0 || rand() < Math.exp(-delta / T)) {
        current = c;
        if (c < bestCost) { bestCost = c; bestGroups = P.groups.slice(); }
      } else {
        undo();
      }
    }
  }
  P.owner.fill(-1);
  P.groups = P.exs.map(() => null);
  bestGroups.forEach((g, e) => setGroup(P, e, g));

  const assignments = toAssignments(ctx, P);
  const moved = P.exs.filter((_, e) => P.origKeys[e] && P.origKeys[e] !== (P.groups[e] || []).join(',')).length;
  const placed = P.groups.filter(Boolean).length;
  return { assignments, stats: { moved, placed, total: P.exs.length, cost: bestCost } };
}

// Groupe de k tables contiguës contenant la table visée, le plus compact possible.
export function groupAround(ev, tableId, k, isFree) {
  const ctx = buildContext(ev);
  const ti = ctx.index.get(tableId);
  if (ti === undefined) return [];
  const allowed = ctx.tables.map((t, i) => i === ti || (!t.blocked && isFree(t.id)));
  for (let size = k; size >= 1; size--) {
    const groups = enumerateGroups(size, ctx.adj, allowed, [ti]);
    if (!groups.length) continue;
    const score = (g) => g.reduce((acc, t) => acc + ctx.dist[t * ctx.n + ti] + Math.hypot(ctx.tables[t].x - ctx.tables[ti].x, ctx.tables[t].y - ctx.tables[ti].y), 0);
    groups.sort((a, b) => score(a) - score(b));
    return groups[0].map((i) => ctx.tables[i].id);
  }
  return [tableId];
}
