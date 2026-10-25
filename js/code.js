// Codes échangés entre la fiche d'inscription en ligne (inscription.html) et l'outil.
// Tout passe par des messages envoyés par les personnes elles-mêmes : rien n'est stocké sur le site.
//  - lien d'invitation : inscription.html#e=<code de l'événement>
//  - inscription reçue : texte contenant « GAS1.<code> »

const toB64url = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export const encode = (obj) => toB64url(JSON.stringify(obj));
export function decode(s) {
  try { return JSON.parse(fromB64url(s)); } catch { return null; }
}

// Invitation : nom, date et contact de l'organisateur (tels qu'il choisit de les donner).
export const inviteCode = (ev, contact = {}) => encode({ v: 1, id: ev.id, n: ev.name, d: ev.date || '', m: contact.email || '', t: contact.phone || '' });

// Inscription remplie par l'exposant.
export const REG_PREFIX = 'GAS1.';
export const registrationCode = (reg) => REG_PREFIX + encode({ v: 1, ...reg });

// Toutes les inscriptions présentes dans un texte collé (un ou plusieurs messages).
export function findRegistrations(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/GAS1\.([A-Za-z0-9_-]{8,})/g)) {
    const reg = decode(m[1]);
    if (reg && typeof reg === 'object') out.push(reg);
  }
  return out;
}
