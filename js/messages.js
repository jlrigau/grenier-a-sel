// Messages aux exposants : « Prévenir » (SMS, e-mail, partage, copie) et e-mails de tous.
// L'envoi part du téléphone ou de la messagerie de l'organisateur : rien ne passe par l'outil.
import { $, copyText, formatLongDate, plural } from './util.js';
import { commit, cur, exById, isIOS, tableNums, toast } from './app.js';

// Tous les e-mails de l'événement (hors liste d'attente) : copiés, prêts à coller en copie cachée.
export async function copyEmails() {
  const mails = [...new Set(cur().exhibitors.filter((e) => !e.waitlist && /@/.test(e.email || '')).map((e) => e.email.trim()))];
  if (!mails.length) { toast("Aucune adresse e-mail dans la liste.", 'warning'); return; }
  await copyText(mails.join(', '));
  toast(`${plural(mails.length, 'adresse copiée', 'adresses copiées')} : collez-les dans le champ « Cci » de votre messagerie.`, 'success',
    { label: 'Écrire', fn: () => { location.href = `mailto:?bcc=${encodeURIComponent(mails.join(','))}&subject=${encodeURIComponent(cur().name)}`; } });
}

// ---------- Prévenir un exposant (message prérempli) ----------
export function notifyText(ex, ev = cur()) {
  const nums = tableNums(ex.id);
  const who = ex.firstName || ex.name;
  const when = ev.date ? ` le ${formatLongDate(ev.date).toLowerCase()}` : '';
  const where = ex.waitlist ? "Vous êtes pour l'instant sur liste d'attente : nous vous recontactons dès qu'une table se libère."
    : nums.length ? `Votre emplacement : ${nums.length > 1 ? 'tables' : 'table'} ${nums.join(' et ')}${ex.electricity ? ' (avec électricité)' : ''}.`
    : 'Votre emplacement vous sera communiqué prochainement.';
  const pay = ex.paymentStatus === 'pending' && ex.payment ? `\nRèglement attendu : ${ex.payment} €.` : '';
  return `Bonjour ${who},\n\nMerci pour votre inscription à « ${ev.name} »${when} au Grenier à Sel de Gainneville.\n${where}${pay}\n\nÀ bientôt !`;
}
export function openNotify(id) {
  const ex = exById(id);
  if (!ex) return;
  const text = notifyText(ex);
  const phone = (ex.phone || '').replace(/[^\d+]/g, '');
  const subject = `${cur().name} : votre emplacement`;
  $('#notify-title').textContent = `Prévenir ${ex.name}`;
  $('#notify-text').value = text;
  $('#notify-sms').hidden = !phone;
  $('#notify-mail').hidden = !ex.email;
  $('#notify-share').hidden = !navigator.share;
  $('#notify-dialog').dataset.id = id;
  $('#notify-dialog').dataset.phone = phone;
  $('#notify-dialog').dataset.subject = subject;
  $('#notify-hint').textContent = !phone && !ex.email ? "Pas de téléphone ni d'e-mail pour cet exposant : copiez le message pour l'envoyer autrement." : '';
  $('#notify-dialog').showModal();
}
$('#notify-dialog').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-notify]');
  if (!b) return;
  const dlg = $('#notify-dialog');
  const ex = exById(dlg.dataset.id);
  const text = $('#notify-text').value;
  const how = b.dataset.notify;
  if (how === 'close') { dlg.close(); return; }
  if (how === 'sms') location.href = `sms:${dlg.dataset.phone}${isIOS ? '&' : '?'}body=${encodeURIComponent(text)}`;
  if (how === 'mail') location.href = `mailto:${encodeURIComponent(ex.email)}?subject=${encodeURIComponent(dlg.dataset.subject)}&body=${encodeURIComponent(text)}`;
  if (how === 'share') { try { await navigator.share({ text }); } catch { return; } }
  if (how === 'copy') { await copyText(text); toast('Message copié', 'success'); }
  if (ex && !ex.confirmed && !ex.waitlist) commit((ev) => { exById(ex.id, ev).confirmed = true; });
  dlg.close();
});
