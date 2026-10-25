# Plans · Grenier à Sel de Gainneville

Outil web pour préparer les plans d'exposants de la salle du Grenier à Sel :
on place les exposants sur les tables en glisser-déposer, et l'outil vérifie
(et sait résoudre automatiquement) les contraintes de la salle et des exposants.

**👉 Ouvrir l'application : https://jlrigau.github.io/grenier-a-sel/**

Elle s'utilise directement dans le navigateur (ordinateur, tablette ou
téléphone) et peut être installée sur l'écran d'accueil. Aucune donnée
n'est envoyée en ligne : tout reste sur l'appareil.

## Fonctionnalités

- **Plan de la salle** reconstitué d'après le plan papier : grande salle, scène,
  hall, sanitaires, cuisine… avec les 48 tables par défaut, les sorties de secours
  et les passages à garder libres.
- **Exposants** : nom, catégorie, nombre de tables, besoin d'électricité,
  emplacement souhaité (îlot central, pourtour, scène, hall), exposants dont il
  faut le séparer, exposants dont il veut être proche, verrouillage, contact, notes.
- **Placement** :
  - glisser un exposant de la liste vers une table (il prend automatiquement
    le nombre de tables contiguës dont il a besoin) ;
  - glisser une table occupée vers une autre pour déplacer ou échanger deux
    exposants (Maj = ajouter une table à l'exposant) ;
  - « Enregistrer et placer » : un nouvel exposant est placé automatiquement à
    la meilleure place libre, sans déplacer les autres ;
  - « Placer les non placés » / « Corriger automatiquement » : réorganise en
    déplaçant le moins d'exposants possible ;
  - « Tout réorganiser » : recalcule tout le plan (les exposants verrouillés 🔒
    ne bougent pas).
- **Contrôles en direct** : table sans électricité, exposants à séparer trop
  proches, tables non contiguës, mauvaise zone, même catégorie côte à côte,
  tables qui se chevauchent ou bloquent une sortie de secours…
- **Mode Tables** : ajouter, déplacer, pivoter, redimensionner, supprimer des tables,
  ou les marquer « non attribuables ».
- **Électricité** : seules les tables le long des murs de la grande salle y ont
  accès (pas l'îlot central, ni la scène et ses abords, ni le hall). Le mode
  « Électricité ⚡ » montre ces tables et permet d'ajouter des exceptions.
- **Versions enregistrées** (onglet « Versions ») : enregistrer la disposition des
  tables et la place de chaque exposant sous un nom, pour comparer plusieurs options
  ou revenir en arrière. La liste des exposants reste toujours à jour : en ouvrant
  une version, les exposants inscrits depuis apparaissent « à placer ». Les versions
  s'exportent en .json et se réimportent (sur un autre appareil, la version importée
  rapporte aussi ses exposants) ; export en image PNG via *Données → Image du plan*.
- Plusieurs **événements**, annuler/rétablir (Ctrl+Z / Ctrl+Y), **impression**
  (plan + liste des exposants), export **CSV**, export/import **JSON**.

Les données sont enregistrées dans le navigateur (localStorage). Pour partager
un plan ou changer d'ordinateur : *Données → Exporter*, puis *Importer*.

## Fiches d'inscription

« 📷 Importer des fiches » : on photographie (ou on choisit) une ou plusieurs
fiches d'inscription papier, **une fiche par photo**. L'outil :

1. lit la fiche directement dans le navigateur (OCR Tesseract.js, fourni dans
   `vendor/` : la photo n'est envoyée nulle part) et la remet à l'endroit ;
2. pré-remplit objets vendus, nom, prénom, nombre de tables, grilles,
   électricité, téléphone, e-mail et règlement, et propose une catégorie ;
3. surligne en orange ce qu'il faut vérifier (l'écriture manuscrite n'est
   jamais lue parfaitement) ;
4. à la validation, ajoute l'exposant (ou met à jour sa fiche s'il existe déjà),
   le place et réajuste le plan si nécessaire.

« ✍ Saisir » permet de recopier une fiche à la main avec le même formulaire.

## Inscription en ligne

Dans **Réglages → Inscription en ligne**, l'organisateur indique son e-mail et
partage le lien d'inscription (`inscription.html#e=…`). L'exposant remplit la
fiche sur son téléphone, puis l'envoie lui-même (e-mail, SMS, WhatsApp…) : le
message contient un code `GAS1.…`. Dans l'outil, **« Coller une inscription »**
ouvre la fiche préremplie, à valider. Aucune donnée n'est stockée sur le site :
tout passe par les messages des personnes elles-mêmes.

## Suivi, communication et jour J

- Suivi de chaque inscription : paiement (à payer / payé, mode), confirmation
  envoyée, **liste d'attente** (l'exposant n'est pas placé et sa table est libérée).
- **Prévenir** un exposant : message prérempli avec sa table, envoyé par SMS,
  e-mail ou partage ; « E-mails » copie toutes les adresses pour un envoi groupé.
- Onglet **Jour J** : liste par table avec case « arrivé », recherche, appel ;
  impression des **étiquettes de table** et d'un **plan d'entrée** avec index.
- **Sauvegarde** : rappel quand des données n'ont pas été sauvegardées depuis
  quelques jours ; « Sauvegarder tous les événements » et « Partager cet
  événement » passent par la feuille de partage du téléphone.

## Liste des exposants

« 📋 Liste des exposants » affiche toutes les inscriptions (issues des fiches ou
saisies) dans un tableau triable, avec les totaux (tables, grilles, électricité,
règlements). Export **Excel (.xlsx)**, **CSV** ou impression. Un badge
« à réexporter » apparaît dès que la liste a changé depuis le dernier export.
Sur Chrome/Edge (ordinateur), « Fichier mis à jour automatiquement » réécrit
un fichier Excel choisi à chaque modification, tant que l'outil est ouvert.

## Application installable

L'outil est une PWA. Sur téléphone, dans le navigateur, un bandeau en bas de
l'écran propose de l'installer (« Plus tard » le masque une semaine) ; sur
ordinateur, un bouton « Installer » apparaît dans l'en-tête quand le navigateur
le permet. Sur iPhone/iPad : Safari → Partager → « Sur l'écran d'accueil ».
Une fois installé, il fonctionne hors connexion, lecture des fiches comprise
(`sw.js`). Le numéro de version est affiché en bas de chaque page.

## Données

Aucune donnée ne quitte le navigateur : tout est enregistré en localStorage.
Pour sauvegarder ou changer de poste, utiliser les exports/imports .json
(événements ou plans) ; l'outil ne contient aucun serveur.

## Utilisation en local

Aucune installation : il suffit de servir le dossier, par exemple
`python3 -m http.server` puis ouvrir http://localhost:8000.

## Publication

Le workflow `.github/workflows/pages.yml` publie le site sur GitHub Pages à
chaque push sur `main` (Settings → Pages → Source : **GitHub Actions**).

## Exemple fourni

L'événement « Démonstration (données fictives) » créé au premier lancement ne
contient que des données synthétiques : noms de stands inventés,
aucun nom de personne, téléphone ou e-mail. Il peut être supprimé dans
« Réglages ». Le dépôt ne contient aucune donnée personnelle.

## Design

Direction « Marché » : vert sapin, moutarde et crème, cartes arrondies et
pastilles, police Outfit (fournie dans `vendor/fonts`, licence OFL), icônes
vectorielles intégrées (`index.html`, symboles `#i-*`). Logo : un étal de marché
à auvent rayé avec un cristal de sel (`icons/logo.svg`). Les couleurs et
arrondis sont définis comme variables en tête de `css/style.css`.

## Structure

- `js/room.js` : géométrie de la salle (en mètres), tables et prises par défaut.
- `js/engine.js` : vérification des contraintes et placement automatique
  (glouton + recuit simulé ; liste d'attente, grilles sur l'îlot, place précédente).
- `js/app.js` : interface (plan SVG, glisser-déposer, formulaires, stockage, navigation).
- `js/util.js` : petits outils généraux (DOM, texte, dates, fichiers).
- `js/day.js` : onglet Jour J (arrivées, étiquettes, plan d'entrée).
- `js/messages.js` : « Prévenir » un exposant, e-mails de tous.
- `js/inscriptions.js` et `js/code.js` : lien d'inscription et codes échangés ;
  `inscription.html` + `js/inscription.js` : fiche publique remplie par les exposants.
- `js/fiches.js` : lecture des photos de fiches (Tesseract, sur l'appareil).
- `js/xlsx.js` : export Excel.

## Tests et développement

- `npm test` lance les tests automatiques (`tests/run.cjs`) : moteur de placement,
  codes d'inscription, et parcours dans un navigateur simulé (téléphone et
  ordinateur : pages, clavier, retour, inscription en ligne, suivi, jour J,
  sauvegarde, export Excel). Ils tournent aussi sur GitHub à chaque envoi
  (`.github/workflows/tests.yml`).
- `npm run version:bump` passe à la version suivante dans `sw.js` et
  `js/app.js` en même temps (un test vérifie qu'elles sont identiques) : à faire
  à chaque publication pour que les applications installées se mettent à jour.
