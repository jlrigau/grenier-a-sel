// Lecture des fiches d'inscription papier (photo) directement dans le navigateur.
// L'OCR (Tesseract.js) est hébergé avec l'outil : aucune image n'est envoyée ailleurs.

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;

let workerPromise = null;
let progressHandler = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Impossible de charger le moteur de lecture'));
    document.head.appendChild(s);
  });
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript(BASE + 'tesseract.min.js');
      const worker = await window.Tesseract.createWorker('fra', 1, {
        workerPath: BASE + 'worker.min.js',
        corePath: BASE + 'core',
        langPath: BASE + 'lang',
        workerBlobURL: false,
        logger: (m) => progressHandler && progressHandler(m),
      });
      return worker;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

// ---------- Image ----------

async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    return img;
  }
}

// Redresse (rotation en degrés), met à une taille adaptée à l'OCR et passe en niveaux de gris contrastés.
function prepareCanvas(bitmap, rotation) {
  const w0 = bitmap.width, h0 = bitmap.height;
  const turned = rotation % 180 !== 0;
  const W = turned ? h0 : w0, H = turned ? w0 : h0;
  const long = Math.max(W, H);
  const scale = long > 2600 ? 2600 / long : long < 1400 ? 1400 / long : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, (-w0 * scale) / 2, (-h0 * scale) / 2, w0 * scale, h0 * scale);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255, max = 0;
  const gray = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    gray[j] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const lo = min + (max - min) * 0.08, hi = max - (max - min) * 0.12;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const v = Math.max(0, Math.min(255, ((gray[j] - lo) / Math.max(1, hi - lo)) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Mots imprimés sur le modèle de fiche : servent à trouver le bon sens de lecture.
const TEMPLATE_WORDS = [/objets/i, /vendus/i, /tables/i, /grilles/i, /lectricit/i, /glement/i, /\bNOM\b/, /pr[ée]nom/i, /t[ée]l[ée]phone/i, /mail/i, /signature/i, /approuv/i];
const templateScore = (text) => TEMPLATE_WORDS.filter((r) => r.test(text)).length;

// ---------- Lecture d'une fiche ----------

export async function readFiche(file, onProgress = () => {}) {
  progressHandler = (m) => {
    if (m.status === 'recognizing text') onProgress({ step: 'Lecture du texte', progress: m.progress });
    else if (m.status) onProgress({ step: 'Préparation du moteur de lecture', progress: m.progress || 0 });
  };
  onProgress({ step: 'Ouverture de la photo', progress: 0 });
  const bitmap = await loadBitmap(file);
  const worker = await getWorker();
  const portrait = bitmap.height > bitmap.width;
  // Les fiches sont au format paysage : une photo en portrait est probablement tournée.
  const order = portrait ? [270, 90, 0, 180] : [0, 180, 270, 90];
  let best = null;
  for (const rotation of order) {
    const canvas = prepareCanvas(bitmap, rotation);
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const score = templateScore(data.text);
    if (!best || score > best.score) best = { rotation, canvas, data, score };
    if (score >= 5) break;
  }
  const fields = parseFicheText(best.data.text);
  const elec = detectCircledChoice(best.canvas, best.data);
  if (elec !== null && fields.electricity === undefined) fields.electricity = elec;
  return {
    fields,
    text: best.data.text,
    recognized: best.score >= 3,
    preview: best.canvas.toDataURL('image/jpeg', 0.85),
  };
}

// « Électricité : oui / non » : le choix entouré (ou souligné) a plus d'encre autour du mot.
// On mesure l'encre dans un anneau autour de la zone attendue des lettres,
// ce qui fonctionne même si l'OCR a inclus le cercle dans le mot.
export function detectCircledChoice(canvas, data) {
  let words = [];
  for (const block of data.blocks || []) for (const par of block.paragraphs || []) for (const line of par.lines || []) {
    if (/lectricit/i.test(line.text)) words = line.words || [];
  }
  if (!words.length) return null;
  const idx = words.findIndex((w) => /lectricit/i.test(w.text));
  const after = words.slice(idx + 1);
  const oui = after.find((w) => /[o0]u[il1]|^[@(]?ui/i.test(w.text));
  const non = after.find((w) => w !== oui && /n[o0][nmr]|^[o0]n$/i.test(w.text));
  if (!oui || !non) return null;
  const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const refH = heights[Math.floor(heights.length / 2)];
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const darkIn = (x0, y0, x1, y1) => {
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
    x1 = Math.min(canvas.width, Math.round(x1)); y1 = Math.min(canvas.height, Math.round(y1));
    if (x1 <= x0 || y1 <= y0) return [0, 0];
    const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 110) dark++;
    return [dark, d.length / 4];
  };
  const ringInk = (w) => {
    const cx = (w.bbox.x0 + w.bbox.x1) / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2;
    const hw = refH * 0.95, hh = refH * 0.5; // zone des 3 lettres
    const m = refH * 0.75;
    const [outer, outerN] = darkIn(cx - hw - m, cy - hh - m, cx + hw + m, cy + hh + m);
    const [inner, innerN] = darkIn(cx - hw, cy - hh, cx + hw, cy + hh);
    return (outer - inner) / Math.max(1, outerN - innerN);
  };
  const a = ringInk(oui), b = ringInk(non);
  if (a > b * 1.5 && a > 0.015) return true;
  if (b > a * 1.5 && b > 0.015) return false;
  return null;
}

// ---------- Analyse du texte ----------

const fixDigits = (s) => s.replace(/[oO]/g, '0').replace(/G/g, '6').replace(/g/g, '9').replace(/[lIi|]/g, '1').replace(/[sS]/g, '5').replace(/[bB]/g, '8').replace(/[zZ]/g, '2');
const clean = (s) => (s || '').replace(/\s+/g, ' ').replace(/^[\s:;.,\-_]+|[\s:;.,\-_]+$/g, '').trim();

export function parseFicheText(raw) {
  const text = (raw || '').replace(/\r/g, '').replace(/[‘’`´]/g, "'").replace(/[«»“”]/g, '"');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const flat = lines.join('\n');
  const uncertain = new Set();
  const f = { firstName: '', lastName: '', products: '', tables: 1, grilles: 0, electricity: false, phone: '', email: '', payment: '', uncertain };

  // Objets vendus : texte après « inscription », jusqu'à « Nombre de tables ».
  let m = flat.match(/inscription\s*[:;.]?\s*([\s\S]*?)(?=\n[^\n]*Nombre\s+de\s+table)/i)
    || flat.match(/inscription\s*[:;.]?\s*([^\n]*)/i);
  f.products = clean(m && m[1]).replace(/\n/g, ' ');
  if (!f.products) uncertain.add('products');

  // Nombre de tables (1 à 3), recoupé avec le règlement « 5€ x N = M€ ».
  const tableLine = lines.find((l) => /table/i.test(l) && /(maxi|1[.,]?8|5\s*€)/i.test(l));
  let tables = null;
  if (tableLine) {
    const after = tableLine.split(/maximum\s*\)?|max\w*\s*\)?\s*[:;]/i).pop();
    const d = fixDigits(after.replace(/^[^:]*:/, '')).match(/[1-3]/);
    if (d) tables = +d[0];
  }
  const payLine = lines.find((l) => /gl[eé]ment|5\s*[€eE]\s*[xX×*]/.test(l)) || '';
  let paidTables = null;
  const countM = payLine.match(/[xX×*]\s*([0-9oOlI|]{1,2})\b/);
  if (countM && /^[1-3]$/.test(fixDigits(countM[1]))) paidTables = +fixDigits(countM[1]);
  const amountM = payLine.match(/=\s*([0-9oOlIsS]{1,3})\s*(?:€|e\b|E\b|euro)?/);
  if (amountM && /^\d+$/.test(fixDigits(amountM[1]))) {
    const amount = +fixDigits(amountM[1]);
    if (amount) {
      f.payment = String(amount);
      if (!paidTables && amount % 5 === 0 && amount / 5 >= 1 && amount / 5 <= 3) paidTables = amount / 5;
    }
  }
  if (tables && paidTables && tables !== paidTables) uncertain.add('tables');
  f.tables = tables || paidTables || 1;
  if (!tables && !paidTables) uncertain.add('tables');
  if (!f.payment) f.payment = String(f.tables * 5);

  // Grilles
  m = flat.match(/grill\w*\s*[:;.]?\s*([0-9oOlIsSzZ]{1,2})\b/i);
  if (m && /^\d+$/.test(fixDigits(m[1]))) f.grilles = +fixDigits(m[1]);
  else uncertain.add('grilles');

  // Électricité « oui / non » : le mot entouré au stylo devient illisible pour l'OCR,
  // c'est donc celui qui reste net qui n'a PAS été choisi. Toujours à faire vérifier.
  const elecLine = (lines.find((l) => /lectricit/i.test(l)) || '').replace(/^.*?lectricit\S*\s*[:;.]?/i, '');
  const ouiClean = /(^|[\s\/\-.:])oui(?=$|[\s\/\-.])/i.test(elecLine);
  const nonClean = /(^|[\s\/\-.:])non(?=$|[\s\/\-.])/i.test(elecLine);
  const ouiMarked = /[({\[]\s*\S{0,1}u[il1]|[o0gc@6]u[il1]\s*[)}\]]/i.test(elecLine);
  const nonMarked = /[({\[]\s*\S{0,2}[o0]n|n[o0][nm]\s*[)}\]]/i.test(elecLine);
  if (ouiMarked && !nonMarked) f.electricity = true;
  else if (nonMarked && !ouiMarked) f.electricity = false;
  else if (ouiClean && !nonClean) f.electricity = false;
  else if (nonClean && !ouiClean) f.electricity = true;
  else f.electricity = undefined;
  uncertain.add('electricity');

  // NOM / Prénom
  const nameLine = lines.find((l) => /\bN[O0]M\b/.test(l) && !/pr[ée]c[ée]d/i.test(l)) || '';
  m = nameLine.match(/\bN[O0]M\b\s*[:;.]?\s*(.*?)\s*(?:Pr[ée]n[o0]m\s*[:;.]?\s*(.*))?$/);
  if (m) {
    f.lastName = clean(m[1]).replace(/[^A-Za-zÀ-ÿ' \-]/g, '').trim();
    f.firstName = clean(m[2]).replace(/[^A-Za-zÀ-ÿ' \-]/g, '').trim();
  }
  if (!f.firstName) {
    const pl = lines.find((l) => /Pr[ée]n[o0]m/i.test(l));
    if (pl) f.firstName = clean(pl.split(/Pr[ée]n[o0]m/i).pop()).replace(/[^A-Za-zÀ-ÿ' \-]/g, '').trim();
  }
  f.lastName = f.lastName.toUpperCase();
  f.firstName = f.firstName.toLowerCase().replace(/(^|[\s\-'])\p{L}/gu, (c) => c.toUpperCase());
  if (!f.lastName) uncertain.add('lastName');
  if (!f.firstName) uncertain.add('firstName');

  // Téléphone : 10 chiffres commençant par 0.
  const phoneLine = lines.find((l) => /t[ée]l[ée]ph|phone|N°\s*t/i.test(l));
  const findPhone = (s) => {
    const digits = fixDigits(s.replace(/[^0-9oOlIsSbBzZgG|]/g, ''));
    const p = digits.match(/0[1-9]\d{8}/);
    return p ? p[0].replace(/(\d{2})(?=\d)/g, '$1 ') : '';
  };
  f.phone = phoneLine ? findPhone(phoneLine.replace(/.*ph\w*/i, '')) : '';
  if (!f.phone) {
    for (const l of lines) {
      if ((l.match(/\d/g) || []).length < 8 || /gl[eé]ment/i.test(l)) continue;
      const p = findPhone(l);
      if (p) { f.phone = p; break; }
    }
  }
  if (!f.phone) uncertain.add('phone');

  // Adresse e-mail
  const mailLine = lines.find((l) => /@/.test(l)) || lines.find((l) => /mail/i.test(l)) || '';
  let email = mailLine.replace(/^.*?\bmail\b\s*[:;.]?/i, '').replace(/\s+/g, '').replace(/[,;]/g, '.').toLowerCase();
  email = email.replace(/\(a\)|\[a\]/g, '@');
  const em = email.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/);
  f.email = em ? em[0] : '';
  if (!f.email) uncertain.add('email');

  return f;
}

// ---------- Catégorie à partir des objets vendus ----------

const CATEGORY_KEYWORDS = [
  ['Bijoux', ['bijou', 'collier', 'bracelet', 'boucle', 'bague', 'perle']],
  ['Livres', ['livre', 'bd', 'roman', 'librairie', 'bouquin', 'revue']],
  ['Jouets', ['jouet', 'jeux', 'jeu ', 'peluche', 'puzzle', 'poupée', 'lego']],
  ['Vêtements', ['vêtement', 'vetement', 'habit', 'pull', 'robe', 'chaussure', 'sac', 'tricot', 'couture', 'textile']],
  ['Décoration', ['déco', 'deco', 'bougie', 'lampe', 'luminaire', 'cadre', 'vase', 'cousin', 'coussin']],
  ['Art', ['peinture', 'tableau', 'aquarelle', 'dessin', 'sculpture', 'gravure', 'photo']],
  ['Bois', ['bois', 'tourn', 'menuis', 'ébénist']],
  ['Céramique', ['poterie', 'céramique', 'ceramique', 'faïence', 'grès']],
  ['Alimentation', ['miel', 'confiture', 'chocolat', 'gâteau', 'gateau', 'biscuit', 'vin', 'épice', 'fromage', 'crêpe', 'sirop', 'thé']],
  ['Cosmétique', ['savon', 'cosmét', 'parfum', 'crème', 'creme', 'bien-être']],
  ['Brocante', ['brocante', 'occasion', 'vintage', 'disque', 'vinyle', 'vaisselle', 'objets divers']],
  ['Papeterie', ['carte', 'papeterie', 'agenda', 'carnet', 'cahier', 'calendrier']],
  ['Artisanat', ['artisan', 'fait main', 'crochet', 'broderie', 'cuir', 'verre', 'macramé']],
];

export function guessCategory(products) {
  const p = ` ${(products || '').toLowerCase()} `;
  for (const [cat, keys] of CATEGORY_KEYWORDS) if (keys.some((k) => p.includes(k))) return cat;
  return '';
}
