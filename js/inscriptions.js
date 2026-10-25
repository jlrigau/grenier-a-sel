// Inscriptions en ligne : lien d'invitation et collage des inscriptions reçues.
import { $, plural } from './util.js';
import { inviteCode, findRegistrations } from './code.js';
import { cur, db, refresh, save, startFiches } from './app.js';

// L'organisateur partage un lien d'invitation (inscription.html#e=…) ; l'exposant remplit la fiche et
// lui envoie un message contenant un code « GAS1.… » ; collé ici, il ouvre la fiche préremplie.
export const regToFields = (reg) => ({
  stand: reg.stand || '', firstName: reg.fn || '', lastName: reg.ln || '', products: reg.p || '',
  tables: reg.t || 1, grilles: reg.g || 0, electricity: !!reg.el, phone: reg.ph || '', email: reg.em || '',
  notes: reg.no || '', uncertain: new Set(),
});
export const inviteUrl = (ev = cur()) => `${new URL('inscription.html', location.href).href}#e=${inviteCode(ev, db.organizer || {})}`;

const pasteDialog = $('#paste-dialog');
$('#btn-paste-reg').onclick = () => {
  $('#paste-text').value = '';
  $('#paste-status').textContent = '';
  pasteDialog.showModal();
};
$('#paste-cancel').onclick = () => pasteDialog.close();
$('#paste-read').onclick = async () => {
  try { $('#paste-text').value = await navigator.clipboard.readText(); updatePasteStatus(); }
  catch { $('#paste-status').textContent = 'Collage automatique refusé : appuyez longuement dans la zone ci-dessous puis « Coller ».'; }
};
const updatePasteStatus = () => {
  const n = findRegistrations($('#paste-text').value).length;
  $('#paste-status').textContent = $('#paste-text').value.trim() ? (n ? `${plural(n, 'inscription trouvée', 'inscriptions trouvées')}.` : 'Aucun code « GAS1.… » trouvé dans ce texte.') : '';
};
$('#paste-text').addEventListener('input', updatePasteStatus);
$('#paste-go').onclick = () => {
  const regs = findRegistrations($('#paste-text').value);
  if (!regs.length) { updatePasteStatus(); return; }
  const other = regs.find((r) => r.e && r.e !== cur().id);
  if (other) {
    const target = db.events.find((e) => e.id === other.e);
    if (target && confirm(`Cette inscription concerne « ${target.name} ». Passer à cet événement pour l'ajouter ?`)) {
      db.currentId = target.id; save(); refresh();
    }
  }
  pasteDialog.close();
  startFiches(regs.map((reg) => ({ reg })));
};
