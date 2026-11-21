# Ring Escape — générateur de vidéos musicales

Tu mets une musique, l'app génère une vidéo verticale (1080×1920, format TikTok / Reels / Shorts) :
une balle rebondit à l'intérieur de centaines d'anneaux concentriques qui tournent.

- Quand la balle **rebondit** sur un anneau → la musique est **étouffée** (filtre passe-bas + volume réduit).
- Quand la balle **passe par l'ouverture** d'un anneau → l'anneau explose, le compteur descend et la musique **s'ouvre**, claire et forte.
- Quand tous les anneaux sont détruits → final avec un visualiseur audio circulaire jusqu'à la fin du morceau.

Par défaut, l'app calcule le nombre d'anneaux pour que le dernier tombe ~5 s avant la fin de la musique.

## Utilisation

Aucune installation, c'est une page web statique.

```bash
npm start          # ou : python3 -m http.server 5173
# puis ouvrir http://localhost:5173
```

1. Choisis une musique (MP3, M4A, WAV…).
2. (Optionnel) un titre, le début et la durée du passage à utiliser.
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
| `src/simulation.js` | physique déterministe (balle, anneaux, ouvertures) + calibrage sur la durée |
| `src/renderer.js` | dessin Canvas : anneaux, balle, particules, compteur, final visualiseur |
| `src/audio.js` | Web Audio : passe-bas + gain pour l'effet étouffé / ouvert |
| `src/recorder.js` | enregistrement canvas + audio via MediaRecorder |
| `src/main.js` | interface |

## Tests

```bash
npm test
```
