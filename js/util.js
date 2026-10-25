// Petits outils généraux (DOM, texte, dates, fichiers), sans état.

export const ic = (name, cls = '') => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const SNAP = 0.05;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const uid = (p) => p + Math.random().toString(36).slice(2, 9);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const r2 = (v) => Math.round(v * 100) / 100;
export const snap = (v) => Math.round(v / SNAP) * SNAP;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const plural = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;
// Écran tactile : on évite d'ouvrir le clavier tout seul à l'ouverture d'une fenêtre.
export const touchScreen = () => window.matchMedia('(pointer: coarse)').matches;
// Champ où l'on tape au clavier (pas une case à cocher ni un bouton).
export const isTextField = (el) => !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
  || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(el.type)));
export function formatLongDate(d) {
  const date = new Date(d + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return d;
  const txt = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}
export function formatDate(d) {
  const [y, m, day] = d.split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
}
export function formatDateTime(ts) {
  return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'plan';
export const normalizeKey = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9@.]/gi, '').toLowerCase();
export function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* ancien navigateur */ }
  const t = document.createElement('textarea');
  t.value = text; document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  t.remove();
  return true;
}
