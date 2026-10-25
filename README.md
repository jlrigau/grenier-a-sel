# Plans · Grenier à Sel de Gainneville

Outil web pour préparer les plans d'exposants de la salle du Grenier à Sel :
on place les exposants sur les tables en glisser-déposer, et l'outil vérifie
(et sait résoudre automatiquement) les contraintes de la salle et des exposants.

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
- **Plans enregistrés** (onglet « Plans ») : enregistrer plusieurs versions d'un
  plan, les rouvrir, les comparer en vignette, les exporter en .json et les
  réimporter plus tard ; export en image PNG via *Données → Image du plan*.
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

## Structure

- `js/room.js` : géométrie de la salle (en mètres), tables et prises par défaut.
- `js/engine.js` : vérification des contraintes et placement automatique
  (glouton + recuit simulé).
- `js/app.js` : interface (plan SVG, glisser-déposer, formulaires, stockage).
