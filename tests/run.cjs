// Tests automatiques de l'outil : moteur de placement (sans navigateur) et parcours principaux
// dans un navigateur simulé (téléphone et ordinateur). Lancement : `npm test` (ou `node tests/run.cjs`).
// Ils démarrent leur propre petit serveur : aucune autre installation que Playwright (Chromium).
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
const PHONE = devices['iPhone 13'];
const DESKTOP = { viewport: { width: 1400, height: 900 } };

// ---------- Mini lanceur ----------
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      let file = path.join(ROOT, url === '/' ? 'index.html' : url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let browser, base;
async function page(opts = PHONE) {
  const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(base);
  await p.waitForFunction(() => window.grenier && document.querySelector('#table-layer [data-table]'));
  return p;
}
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const noOverflow = async (p, where) => {
  const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.ok(w[0] <= w[1], `${where} : la page déborde sur le côté (${w[0]} px pour ${w[1]})`);
};
const done = async (p) => { assert.deepEqual(p.errors, [], 'erreurs JavaScript'); await p.context().close(); };

// ---------- Cohérence ----------
test('même numéro de version dans sw.js et app.js', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/const VERSION = '(v\d+)'/)[1];
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').match(/const APP_VERSION = '(v\d+)'/)[1];
  assert.equal(app, sw);
});
test('tous les fichiers de l\'application sont mis en cache hors connexion', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter((x) => x.endsWith('.js'))) assert.ok(sw.includes(`'js/${f}'`), `js/${f} absent de sw.js`);
});

// ---------- Moteur (sans navigateur) ----------
test('moteur : placement automatique et contraintes', async () => {
  const { optimize, evaluate, placeOne } = await import(path.join(ROOT, 'js/engine.js'));
  const { defaultTables, hasPower } = await import(path.join(ROOT, 'js/room.js'));
  const ex = (id, o = {}) => ({ id, name: id, category: '', tables: 1, electricity: false, zone: '', avoid: [], near: [], locked: false, grilles: 0, ...o });
  const ev = {
    tables: defaultTables(), assignments: {}, settings: { avoidDistance: 2.5, nearDistance: 4, adjacencyGap: 0.5, flagSameCategory: true, grillesAvailable: 0, grillesOnIlot: true },
    exhibitors: [ex('A', { electricity: true }), ex('B', { tables: 2 }), ex('C', { avoid: ['D'] }), ex('D'), ex('E', { grilles: 2 }), ex('F', { waitlist: true })],
  };
  ev.assignments = optimize(ev, { mode: 'fresh', seed: 3, iterations: 20000 }).assignments;
  const r = evaluate(ev);
  assert.equal(r.issues.filter((i) => i.severity === 'error').length, 0, 'aucune erreur');
  const tablesOf = (id) => ev.tables.filter((t) => ev.assignments[t.id] === id);
  assert.ok(tablesOf('A').some(hasPower), "A a l'électricité");
  assert.equal(tablesOf('B').length, 2, 'B a 2 tables');
  assert.equal(tablesOf('F').length, 0, "la liste d'attente n'est pas placée");
  ev.exhibitors.push(ex('G', { prefTables: [40] }));
  const one = placeOne(ev, 'G');
  assert.ok(one.found);
  assert.equal(ev.tables.find((t) => one.assignments[t.id] === 'G').num, 40, 'place précédente reprise');
});

test('codes d\'inscription : aller-retour', async () => {
  global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
  const { registrationCode, findRegistrations } = await import(path.join(ROOT, 'js/code.js'));
  const reg = { e: 'ev1', stand: 'Les Confitures de Léa', fn: 'Léa', ln: 'DURAND', p: 'Confitures', t: 2, g: 0, el: true, ph: '06', em: 'a@b.c', no: '' };
  const found = findRegistrations(`Bonjour\n${registrationCode(reg)}\nMerci\n${registrationCode({ ...reg, fn: 'Zoé' })}`);
  assert.equal(found.length, 2);
  assert.equal(found[0].stand, 'Les Confitures de Léa');
  assert.equal(found[1].fn, 'Zoé');
});

// ---------- Navigateur : téléphone ----------
test('téléphone : démonstration chargée, pages sans débordement', async () => {
  const p = await page();
  assert.equal(await p.evaluate(() => grenier.event.exhibitors.length), 16);
  await noOverflow(p, 'Plan');
  for (const nav of ['list', 'plans', 'settings']) {
    await click(p, `#tabbar [data-nav=${nav}]`);
    assert.ok(await p.evaluate(() => document.documentElement.classList.contains('sub-page')), `${nav} : page dédiée`);
    await noOverflow(p, nav);
  }
  await p.goBack();
  assert.ok(!(await p.evaluate(() => document.documentElement.classList.contains('sub-page'))), 'le retour ramène au plan');
  await done(p);
});

test('téléphone : la saisie ne ferme pas les fenêtres (clavier)', async () => {
  const p = await page();
  const typeIn = async (dialog, field) => {
    await p.locator(field).tap();
    await p.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 364 }); visualViewport.dispatchEvent(new Event('resize')); });
    await p.waitForTimeout(350);
    await p.keyboard.type('Essai');
    assert.ok(await p.evaluate((d) => document.querySelector(d).open, dialog), `${dialog} reste ouverte`);
    assert.equal(await p.inputValue(field), 'Essai');
    await p.evaluate(() => { delete visualViewport.height; document.activeElement.blur(); visualViewport.dispatchEvent(new Event('resize')); });
    await p.keyboard.press('Escape');
  };
  await click(p, '#event-btn'); await click(p, '#event-menu [data-ev-new]');
  await typeIn('#event-dialog', '#event-form [name=name]');
  await click(p, '#btn-add-ex');
  await typeIn('#ex-dialog', '#ex-form [name=name]');
  await done(p);
});

test('téléphone : réglages modifiés sans perdre le champ suivant', async () => {
  const p = await page();
  await click(p, '#tabbar [data-nav=settings]');
  await p.locator('#tab-settings [data-ev=name]').tap();
  await p.locator('#tab-settings [data-ev=name]').fill('Marché de Noël');
  await p.locator('#tab-settings [data-set=grillesAvailable]').tap();
  assert.equal(await p.evaluate(() => document.activeElement.dataset.set), 'grillesAvailable');
  await p.evaluate(() => document.activeElement.blur());
  await p.waitForTimeout(500);
  assert.equal(await p.textContent('#event-name'), 'Marché de Noël');
  await done(p);
});

test('inscription en ligne : fiche publique → coller → exposant ajouté', async () => {
  const p = await page();
  await click(p, '#tabbar [data-nav=settings]');
  await p.fill('#tab-settings [data-org=email]', 'orga@example.org');
  await p.evaluate(() => document.activeElement.blur());
  const url = await p.evaluate(() => document.querySelector('#tab-settings a[href*="inscription.html"]').href);
  const q = await p.context().newPage();
  await q.goto(url);
  assert.equal(await q.textContent('#reg-title'), 'Démonstration');
  await q.fill('[name=stand]', 'Les Confitures de Léa'); await q.fill('[name=fn]', 'Léa'); await q.fill('[name=ln]', 'Durand');
  await q.fill('[name=p]', 'Confitures'); await q.fill('[name=t]', '2'); await q.check('input[name=el][value=oui]'); await q.fill('[name=ph]', '0600000000');
  await q.click('button[type=submit]');
  const msg = await q.textContent('#reg-recap');
  assert.match(msg, /GAS1\./);
  await click(p, '#tabbar [data-nav=plan]');
  await click(p, '#btn-paste-reg');
  await p.fill('#paste-text', msg);
  await click(p, '#paste-go');
  assert.equal(await p.inputValue('#fiche-form [name=stand]'), 'Les Confitures de Léa');
  await click(p, '#fiche-add');
  await p.waitForFunction(() => grenier.event.exhibitors.some((x) => x.name === 'Les Confitures de Léa'));
  const placed = await p.evaluate(() => { const e = grenier.event; const x = e.exhibitors.find((y) => y.name === 'Les Confitures de Léa'); return Object.values(e.assignments).filter((v) => v === x.id).length; });
  assert.equal(placed, 2);
  await done(p);
});

test("suivi : liste d'attente libère la table, message prérempli", async () => {
  const p = await page();
  const id = await p.evaluate(() => grenier.event.exhibitors.find((x) => x.name === 'Bijoux Lune').id);
  await click(p, `[data-edit="${id}"]`);
  await p.selectOption('#ex-form [name=paymentStatus]', 'pending');
  await p.check('#ex-form [name=waitlist]');
  await click(p, '#ex-save');
  const tables = await p.evaluate((i) => Object.values(grenier.event.assignments).filter((v) => v === i).length, id);
  assert.equal(tables, 0);
  // la liste d'attente n'est ni « à placer » ni comptée dans les placés
  assert.equal(await p.evaluate(() => document.querySelector('#top-alert').textContent.trim()), '', "pas d'alerte « à placer »");
  assert.match(await p.evaluate(() => document.querySelector('#stats-row .stat').textContent), /15\/15.*1 en liste d'attente/);
  await click(p, `[data-edit="${id}"]`);
  await click(p, '#ex-notify');
  assert.match(await p.inputValue('#notify-text'), /liste d'attente/);
  await done(p);
});

test('téléphone : « retour » après une fenêtre ouverte depuis une autre', async () => {
  const p = await page();
  const id = await p.evaluate(() => grenier.event.exhibitors[0].id);
  await click(p, `[data-edit="${id}"]`);
  await click(p, '#ex-notify');
  assert.ok(await p.evaluate(() => document.querySelector('#notify-dialog').open));
  await p.goBack();
  await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => document.querySelectorAll('dialog[open]').length), 0, 'le retour ferme la fenêtre');
  assert.equal(await p.evaluate(() => history.state), null, "plus d'étape en trop dans l'historique");
  assert.ok(p.url().startsWith(base), "on reste dans l'outil");
  await done(p);
});

test("aide : page sur téléphone, fenêtre sur ordinateur", async () => {
  const p = await page();
  await click(p, '#btn-help');
  assert.ok(await p.evaluate(() => document.documentElement.classList.contains('sub-page') && !document.querySelector('#tab-help').hidden));
  assert.ok(await p.evaluate(() => document.querySelectorAll('#tab-help .help-item').length) >= 10);
  await done(p);
  const d = await page(DESKTOP);
  await click(d, '#btn-help');
  assert.ok(await d.evaluate(() => document.querySelector('#help-dialog').open));
  await done(d);
});

test('titres des pages de la même taille que « Plan de la salle »', async () => {
  const p = await page();
  const size = (s) => p.evaluate((x) => getComputedStyle(document.querySelector(x)).fontSize, s);
  const ref = await size('.map-toolbar h2');
  await click(p, '#tabbar [data-nav=settings]');
  assert.equal(await size('.page-head h1'), ref);
  await click(p, '#tabbar [data-nav=list]');
  assert.equal(await size('#tab-list .list-head h2'), ref);
  // même espace sous le titre sur toutes les pages
  const gap = () => p.evaluate(() => {
    const title = document.querySelector('#page-head h1') || document.querySelector('#tab-list .list-head h2');
    const panel = [...document.querySelectorAll('.tab-panel')].find((x) => !x.hidden);
    const first = panel.id === 'tab-list' ? document.querySelector('#list-search') : panel.firstElementChild;
    return Math.round(first.getBoundingClientRect().top - title.getBoundingClientRect().bottom);
  });
  const gaps = {};
  for (const nav of ['list', 'plans', 'settings']) { await click(p, `#tabbar [data-nav=${nav}]`); gaps[nav] = await gap(); }
  assert.ok(new Set(Object.values(gaps)).size === 1, `espaces différents sous les titres : ${JSON.stringify(gaps)}`);
  await done(p);
});

test("le logo ramène à l'accueil", async () => {
  const p = await page();
  await click(p, '#tabbar [data-nav=settings]');
  await click(p, '#brand');
  await p.waitForTimeout(600);
  assert.ok(!(await p.evaluate(() => document.documentElement.classList.contains('sub-page'))), 'retour au plan');
  assert.equal(await p.evaluate(() => Math.round(scrollY)), 0, 'en haut de page');
  await p.evaluate(() => scrollTo(0, 900));
  await click(p, '#brand');
  await p.waitForFunction(() => scrollY === 0);
  await done(p);
});

test('jour J : arrivées comptées', async () => {
  const p = await page();
  await click(p, '.tabs [data-tab=day]');
  await click(p, '#day-list .day-check');
  assert.match(await p.textContent('#day-count'), /^1 \/ 16/);
  await done(p);
});

test('sauvegarde : rappel puis fichier complet', async () => {
  const p = await page({ ...PHONE, acceptDownloads: true });
  await click(p, '#event-btn'); await click(p, '#event-menu [data-ev-new]');
  await p.fill('#event-form [name=name]', 'Marché test');
  await p.evaluate(() => document.querySelector('#event-form').requestSubmit());
  await p.waitForFunction(() => grenier.event.name === 'Marché test');
  for (const n of ['A', 'B', 'C']) {
    await click(p, '#btn-add-ex');
    await p.waitForFunction(() => document.querySelector('#ex-dialog').open);
    await p.fill('#ex-form [name=name]', `Stand ${n}`);
    await click(p, '#ex-save');
    await p.waitForFunction((k) => grenier.event.exhibitors.length === k, ['A', 'B', 'C'].indexOf(n) + 1);
  }
  assert.ok(!(await p.evaluate(() => document.querySelector('#backup-alert').hidden)), 'rappel affiché');
  const [dl] = await Promise.all([p.waitForEvent('download'), click(p, '#backup-alert [data-backup]')]);
  const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.equal(data.events.length, 2);
  assert.ok(await p.evaluate(() => document.querySelector('#backup-alert').hidden), 'rappel masqué après sauvegarde');
  await done(p);
});

// ---------- Navigateur : ordinateur ----------
test('ordinateur : liste en fenêtre, export Excel', async () => {
  const p = await page({ ...DESKTOP, acceptDownloads: true });
  await click(p, '#btn-list');
  assert.ok(await p.evaluate(() => document.querySelector('#list-dialog').open));
  const [dl] = await Promise.all([p.waitForEvent('download'), click(p, '[data-list=xlsx]')]);
  const head = fs.readFileSync(await dl.path()).subarray(0, 2).toString();
  assert.equal(head, 'PK', 'fichier .xlsx (zip)');
  await done(p);
});

// ---------- Lancement ----------
(async () => {
  const server = await serve();
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
  let failed = 0;
  for (const t of tests) {
    const t0 = Date.now();
    try {
      await t.fn();
      console.log(`✓ ${t.name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) {
      failed++;
      console.log(`✗ ${t.name}\n  ${String(e.message).split('\n').join('\n  ')}`);
    }
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} test(s) en échec sur ${tests.length}` : `\n${tests.length} tests réussis`);
  process.exit(failed ? 1 : 0);
})();
