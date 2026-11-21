# Ring Escape — générateur de vidéos musicales

Tu mets une musique, l'app génère une vidéo verticale (1080×1920, format TikTok / Reels / Shorts) :
une balle rebondit à l'intérieur de centaines d'anneaux concentriques qui tournent.

- Quand la balle **rebondit** sur un anneau → la musique est **étouffée** (filtre passe-bas + volume réduit).
- Quand la balle **passe par l'ouverture** d'un anneau → l'anneau explose, le compteur descend et la musique **s'ouvre**, claire et forte.
- Quand tous les anneaux sont détruits → final avec un visualiseur audio circulaire jusqu'à la fin du morceau.

## Le moment fort

À l'ouverture du fichier, l'app **analyse la musique** (énergie globale + basses) et repère le **moment fort**
(drop / refrain) : l'endroit où l'énergie saute brusquement vers une partie forte et soutenue.

Ensuite elle cale la vidéo dessus :

1. elle choisit le passage du morceau pour que le moment fort tombe vers la fin de la vidéo
   (ex. vidéo de 60 s avec 15 s de moment fort → 45 s de jeu étouffé puis 15 s à fond) ;
2. elle calcule le nombre d'anneaux et la trajectoire pour que la balle casse le **dernier anneau pile au drop** ;
3. au drop : flash, explosion, et la musique passe **à fond** (volume poussé, avec un limiteur pour éviter la saturation)
   pendant que le visualiseur prend le relais.

La courbe affichée montre l'énergie du morceau : en jaune le moment fort, en rose le passage utilisé.
Si la détection ne te plaît pas, **touche la courbe** à l'endroit voulu pour déplacer le moment fort.
Le réglage *Puissance du moment fort* (réglages avancés) contrôle à quel point ça « explose ».

Décoche « Caler la vidéo sur le moment fort » pour revenir au mode simple (début choisi à la main).

## Utilisation

Aucune installation, c'est une page web statique.

```bash
npm start          # ou : python3 -m http.server 5173
# puis ouvrir http://localhost:5173
```

1. Choisis une musique (MP3, M4A, WAV…).
2. (Optionnel) un titre, la durée de la vidéo et la durée du moment fort.
3. **▶ Prévisualiser** pour voir et entendre le résultat, **● Générer la vidéo** pour l'enregistrer.
4. Clique sur **Télécharger la vidéo**.

Change la **graine** pour obtenir une trajectoire différente. Les *réglages avancés* contrôlent la taille des ouvertures,
la vitesse de rotation, la gravité, le niveau d'étouffement du son, etc.

> L'enregistrement se fait en temps réel (une musique de 1 min = 1 min de génération). Garde l'onglet au premier plan.

### Format de sortie

Chrome/Edge récents et Safari produisent un MP4. Si ton navigateur produit un WebM (Firefox), convertis-le :

```bash
ffmpeg -i video.webm -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k video.mp4
```

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/analysis.js` | analyse de la musique et détection du moment fort |
| `src/simulation.js` | physique déterministe (balle, anneaux, ouvertures) + calibrage sur la durée |
| `src/renderer.js` | dessin Canvas : anneaux, balle, particules, compteur, final visualiseur |
| `src/audio.js` | Web Audio : passe-bas + gain pour l'effet étouffé / ouvert |
| `src/recorder.js` | enregistrement canvas + audio via MediaRecorder |
| `src/main.js` | interface |

## Tests

```bash
npm test
```
