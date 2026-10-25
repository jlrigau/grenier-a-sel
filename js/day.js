// Jour J : accueil des exposants (liste par table, arrivées), étiquettes de table et plan d'entrée.
import { $, esc, formatDate, ic } from './util.js';
import { ROOM } from './room.js';
import { activeExhibitors, commit, cur, exById, roomSVG, tableNums, tablesSVG, toast } from './app.js';

// Liste par numéro de table, case « arrivé », recherche ; étiquettes de table et plan d'entrée à imprimer.
const firstTable = (ex) => tableNums(ex.id)[0] ?? 9999;
export function renderDay() {
  const ev = cur();
  const list = activeExhibitors(ev).sort((a, b) => firstTable(a) - firstTable(b) || a.name.localeCompare(b.name, 'fr'));
  const arrived = list.filter((e) => e.arrived).length;
  $('#day-count').innerHTML = `<b>${arrived}</b> / ${list.length} exposants arrivés`;
  $('#day-bar').style.width = list.length ? `${Math.round((arrived / list.length) * 100)}%` : '0';
  const q = $('#day-search').value.trim().toLowerCase();
  const shown = list.filter((ex) => !q || `${ex.name} ${ex.products} ${ex.category} ${tableNums(ex.id).join(' ')}`.toLowerCase().includes(q));
  $('#day-list').innerHTML = shown.map((ex) => {
    const nums = tableNums(ex.id);
    return `<li class="day-item ${ex.arrived ? 'arrived' : ''}">
      <span class="day-table ${nums.length ? '' : 'none'}">${nums.length ? nums.join('+') : '—'}</span>
      <div class="day-main"><b>${esc(ex.name)}${ex.electricity ? ` ${ic('zap', 'i-sm')}` : ''}</b><small>${esc(ex.products || ex.category || '')}${ex.paymentStatus === 'pending' ? ' · <span class="tag-pay">À payer</span>' : ''}</small></div>
      ${ex.phone ? `<a class="day-call" href="tel:${esc(ex.phone.replace(/\s/g, ''))}" title="Appeler">${ic('phone')}</a>` : ''}
      <button class="day-check" data-arrived="${ex.id}" aria-pressed="${ex.arrived}" title="${ex.arrived ? 'Arrivé' : 'Marquer arrivé'}">${ic('check')}</button>
    </li>`;
  }).join('') || '<li class="empty">Aucun exposant ne correspond.</li>';
}
$('#day-search').addEventListener('input', renderDay);
$('#tab-day').addEventListener('click', (e) => {
  const a = e.target.closest('[data-arrived]');
  if (a) { commit((ev) => { const x = exById(a.dataset.arrived, ev); x.arrived = !x.arrived; }); return; }
  const act = e.target.closest('[data-day]')?.dataset.day;
  if (act === 'labels') printLabels();
  if (act === 'entrance') printEntrance();
  if (act === 'reset' && confirm('Remettre toutes les arrivées à zéro ?')) commit((ev) => { ev.exhibitors.forEach((x) => { x.arrived = false; }); });
});

function printLabels() {
  const ev = cur();
  const list = activeExhibitors(ev).filter((e) => tableNums(e.id).length).sort((a, b) => firstTable(a) - firstTable(b));
  if (!list.length) { toast("Aucun exposant n'est encore placé.", 'warning'); return; }
  $('#print-area').innerHTML = `<div class="print-labels">${list.map((ex) => {
    const nums = tableNums(ex.id);
    return `<div class="label"><div class="label-num">${nums.length > 1 ? 'Tables' : 'Table'} ${nums.join(' + ')}</div>
      <div class="label-name">${esc(ex.name)}</div><div class="label-sub">${esc(ex.products || ex.category || '')}</div>
      <div class="label-ev">${esc(ev.name)}${ev.date ? ' · ' + formatDate(ev.date) : ''}</div></div>`;
  }).join('')}</div>`;
  window.print();
}
function printEntrance() {
  const ev = cur();
  const B = ROOM.bounds;
  const list = activeExhibitors(ev).filter((e) => tableNums(e.id).length).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  $('#print-area').innerHTML = `<div class="print-page entrance">
    <h1>${esc(ev.name)} — plan des exposants</h1>
    <div class="entrance-body">
      <svg viewBox="-0.8 -1.2 ${B.w + 1.6} ${B.h + 2.8}" class="print-plan"><g>${roomSVG()}</g><g>${tablesSVG(ev, { print: true })}</g></svg>
      <ol class="entrance-index">${list.map((ex) => `<li><b>${tableNums(ex.id).join('+')}</b> ${esc(ex.name)}</li>`).join('')}</ol>
    </div></div>`;
  window.print();
}
