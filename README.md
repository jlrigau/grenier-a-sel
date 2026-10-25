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
- **Contrôles en direct** : électricité trop loin, exposants à séparer trop
  proches, tables non contiguës, mauvaise zone, même catégorie côte à côte,
  tables qui se chevauchent ou bloquent une sortie de secours…
- **Mode Tables** : ajouter, déplacer, pivoter, redimensionner, supprimer des tables,
  ou les marquer « non attribuables ».
- **Mode Prises ⚡** : placer les prises électriques (leur position par défaut est
  une estimation **à vérifier sur place**).
- Plusieurs **événements**, annuler/rétablir (Ctrl+Z / Ctrl+Y), **impression**
  (plan + liste des exposants), export **CSV**, export/import **JSON**.

Les données sont enregistrées dans le navigateur (localStorage). Pour partager
un plan ou changer d'ordinateur : *Données → Exporter*, puis *Importer*.

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
