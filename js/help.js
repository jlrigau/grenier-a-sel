// Aide intégrée : mode d'emploi par thème (à mettre à jour avec chaque nouvelle fonction).
// Page dédiée sur téléphone, fenêtre sur ordinateur (même contenu).

const SECTIONS = [
  ['Démarrer', `
    <p>Chaque marché, brocante ou salon est un <b>événement</b>. Touchez le <b>titre de l'événement</b> en haut de la page pour passer à un autre événement ou en créer un (<b>+ Nouvel événement</b>).</p>
    <p>L'événement « Démonstration » contient des exposants imaginaires : essayez tout dessus, puis supprimez-le dans Réglages si besoin.</p>
    <p>Une erreur ? Les flèches <b>Annuler</b> et <b>Rétablir</b> de l'en-tête reviennent en arrière.</p>`],
  ['Ajouter des exposants', `
    <ul>
      <li><b>Fiches</b> (bouton jaune en bas sur téléphone) : prenez la fiche papier en photo. L'outil essaie de la lire ; vérifiez et corrigez les champs, surtout l'écriture à la main, puis validez.</li>
      <li><b>Saisir une fiche à la main</b> : même fenêtre, sans photo.</li>
      <li><b>+ Exposant</b> : fiche complète (contraintes, voisins, suivi).</li>
      <li><b>Inscription en ligne</b> : dans Réglages, indiquez votre e-mail et partagez le lien d'inscription. L'exposant remplit sa fiche sur son téléphone et vous l'envoie par message ; copiez ce message puis <b>Coller une inscription</b> : la fiche s'ouvre déjà remplie.</li>
    </ul>
    <p>Sur iPhone, dans n'importe quel champ, l'icône <b>Scanner le texte</b> du clavier lit l'écriture à la main avec l'appareil photo.</p>`],
  ['Placer les exposants', `
    <p>Chaque nouvel exposant est <b>placé automatiquement</b> en respectant les contraintes ; le reste du plan se réajuste si besoin (réglable dans Réglages).</p>
    <ul>
      <li><b>Électricité</b> : seules les tables le long des murs de la grande salle y ont accès.</li>
      <li><b>À séparer</b> / <b>proche de</b> : dans la fiche de l'exposant.</li>
      <li>Deux exposants de même catégorie évitent d'être côte à côte ; ceux qui ont des <b>grilles</b> vont de préférence sur l'îlot central.</li>
      <li>Un exposant déjà venu retrouve en priorité <b>sa table de la dernière édition</b>.</li>
    </ul>
    <p>Pour déplacer : sur ordinateur, glissez un exposant (ou une table occupée) sur une autre table ; sur téléphone, touchez une table puis choisissez l'exposant. <b>Placer les non placés</b> et <b>Tout réorganiser</b> sont en bas de la liste des exposants. L'onglet <b>Contrôles</b> liste ce qui reste à régler.</p>`],
  ['Le plan', `
    <ul>
      <li><b>Placement</b> : attribuer les tables. <b>Tables</b> : déplacer, ajouter, pivoter des tables. <b>Électricité</b> : voir et changer les tables qui ont une prise.</li>
      <li>Zoom avec <b>−</b> et <b>+</b>, ou deux doigts sur téléphone ; le bouton aux quatre coins met le plan en <b>plein écran</b>.</li>
    </ul>`],
  ['Suivi des inscriptions', `
    <ul>
      <li>Dans la fiche d'un exposant : <b>paiement</b> (à payer, payé, mode), <b>confirmation envoyée</b>, <b>liste d'attente</b> (pas de table pour l'instant : sa table est libérée).</li>
      <li>Filtres <b>Non payés</b> et <b>Liste d'attente</b> au-dessus de la liste des exposants.</li>
      <li><b>Prévenir</b> : message prêt avec sa table, envoyé par SMS, e-mail ou copié. <b>E-mails</b> (page Liste) copie toutes les adresses pour un envoi groupé.</li>
    </ul>`],
  ['Liste et export', `
    <p>La page <b>Liste</b> regroupe toutes les informations des exposants : recherche, export <b>Excel</b> ou <b>CSV</b>, impression. Un <b>!</b> sur l'onglet Liste signale qu'elle a changé depuis le dernier export.</p>`],
  ['Versions', `
    <p>Une <b>version</b> garde la disposition des tables et la place de chaque exposant, pour comparer plusieurs plans ou revenir en arrière. La liste des exposants, elle, reste toujours à jour : en ouvrant une version, les nouveaux inscrits apparaissent « à placer ».</p>`],
  ["Le jour de l'événement", `
    <p>Onglet <b>Jour J</b> (à côté d'Exposants et Contrôles) : la liste par numéro de table, une case <b>arrivé</b> pour chaque exposant, la recherche (nom ou numéro de table) et l'appel en un geste. On y imprime aussi les <b>étiquettes de table</b> et le <b>plan d'entrée</b> avec l'index des exposants.</p>`],
  ['Sauvegarder et partager', `
    <p><b>Tout est enregistré uniquement sur cet appareil.</b> S'il est perdu ou changé, les données sont perdues : sauvegardez régulièrement (un rappel apparaît sous le titre quand c'est nécessaire).</p>
    <ul>
      <li><b>Sauvegarder tous les événements</b> (menu ⌄ de l'en-tête ou Réglages) : gardez le fichier, par exemple en vous l'envoyant par mail.</li>
      <li><b>Partager cet événement</b> : envoie le fichier à quelqu'un qui l'ouvre avec <b>Importer</b>.</li>
      <li>Changer d'appareil : sauvegardez sur l'ancien, puis <b>Importer</b> le fichier sur le nouveau.</li>
    </ul>`],
  ["Installer l'application", `
    <p>Sur téléphone, un bandeau propose l'installation dans le navigateur. Sur iPhone : dans Safari, bouton <b>Partager</b> puis <b>Sur l'écran d'accueil</b>. L'application installée s'ouvre en plein écran, marche sans connexion et se met à jour toute seule ; le numéro de version est en bas de chaque page.</p>`],
  ['Confidentialité', `
    <p>Aucune donnée n'est envoyée ni stockée sur le site : ni les exposants, ni les photos des fiches (lues sur l'appareil). Les messages aux exposants et les inscriptions en ligne passent par votre téléphone ou votre messagerie.</p>`],
];

export function helpHTML() {
  return `<p class="help-intro">Le mode d'emploi, thème par thème. Touchez un thème pour l'ouvrir.</p>
    ${SECTIONS.map(([title, body], i) => `<details class="help-item"${i === 0 ? ' open' : ''}><summary>${title}</summary><div class="help-text">${body}</div></details>`).join('')}`;
}
