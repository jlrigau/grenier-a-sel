// Fiche d'inscription en ligne : l'exposant remplit, puis envoie lui-même le message à l'organisateur.
// Rien n'est enregistré : ni sur le site, ni dans le navigateur.
import { decode, registrationCode } from './code.js';

const $ = (s) => document.querySelector(s);
const invite = decode((location.hash.match(/[#&]e=([A-Za-z0-9_-]+)/) || [])[1] || '') || {};
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const longDate = (d) => {
  const date = new Date(d + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return d;
  const t = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

if (invite.n) {
  $('#reg-title').textContent = invite.n;
  document.title = `Inscription · ${invite.n}`;
}
$('#reg-date').textContent = invite.d ? longDate(invite.d) : 'Fiche d’inscription exposant';

let message = '';
let subject = '';

$('#reg-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const v = (k) => (f[k].value || '').trim();
  const el = f.querySelector('input[name=el]:checked');
  const missing = [];
  if (!v('fn')) missing.push('prénom');
  if (!v('ln')) missing.push('nom');
  if (!v('p')) missing.push('objets vendus');
  if (!el) missing.push('électricité');
  if (!v('ph')) missing.push('téléphone');
  const err = $('#reg-error');
  if (missing.length) {
    err.hidden = false;
    err.textContent = `À compléter : ${missing.join(', ')}.`;
    return;
  }
  err.hidden = true;
  const reg = {
    e: invite.id || '', stand: v('stand'), fn: v('fn'), ln: v('ln').toUpperCase(), p: v('p'),
    t: Math.min(3, Math.max(1, Math.round(Number(v('t')) || 1))), g: Math.max(0, Math.round(Number(v('g')) || 0)),
    el: el.value === 'oui', ph: v('ph'), em: v('em'), no: v('no'),
  };
  const who = reg.stand ? `${reg.stand} (${reg.fn} ${reg.ln})` : `${reg.fn} ${reg.ln}`;
  subject = `Inscription${invite.n ? ` « ${invite.n} »` : ''} : ${who}`;
  message = [
    `Inscription${invite.n ? ` — « ${invite.n} »` : ''}${invite.d ? ` (${longDate(invite.d)})` : ''}`,
    `Exposant : ${who}`,
    `Objets vendus : ${reg.p}`,
    `Tables : ${reg.t} · Grilles : ${reg.g} · Électricité : ${reg.el ? 'oui' : 'non'}`,
    `Téléphone : ${reg.ph}${reg.em ? ` · E-mail : ${reg.em}` : ''}`,
    reg.no ? `Remarques : ${reg.no}` : '',
    '',
    'Code pour l’outil Grenier à sel (ne pas modifier) :',
    registrationCode(reg),
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  $('#reg-recap').textContent = message;
  $('#send-mail').hidden = false;
  $('#send-sms').hidden = !invite.t;
  $('#send-share').hidden = !navigator.share;
  $('#send-hint').textContent = invite.m || invite.t ? '' : "L'organisateur n'a pas indiqué d'adresse : envoyez-lui ce message par le moyen habituel.";
  $('#step-form').hidden = true;
  $('#step-send').hidden = false;
  window.scrollTo(0, 0);
});

$('#send-mail').onclick = () => {
  location.href = `mailto:${encodeURIComponent(invite.m || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
};
$('#send-sms').onclick = () => {
  location.href = `sms:${(invite.t || '').replace(/[^\d+]/g, '')}${isIOS ? '&' : '?'}body=${encodeURIComponent(message)}`;
};
$('#send-share').onclick = async () => { try { await navigator.share({ title: subject, text: message }); } catch { /* annulé */ } };
$('#send-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(message); } catch {
    const t = document.createElement('textarea');
    t.value = message; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    t.remove();
  }
  $('#send-copy').textContent = 'Message copié ✓';
  setTimeout(() => { $('#send-copy').textContent = 'Copier le message'; }, 2500);
};
$('#send-back').onclick = () => { $('#step-send').hidden = true; $('#step-form').hidden = false; };
