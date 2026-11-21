# Ring Escape — chaque rebond joue une note

Générateur de vidéos verticales (1080×1920, TikTok / Reels / Shorts) : une balle rebondit dans **un cercle fermé**.
**Il n'y a pas de musique de fond : chaque rebond joue une note** du morceau. Les rebonds tombent pile au rythme
des notes, donc à la fin on a entendu toute la musique.

## Mutations

- **La balle grossit** à chaque rebond (croissance et taille max réglables).
- **La balle se dédouble** tous les N rebonds (jusqu'à un nombre max de balles).
- **Change de couleur** à chaque rebond.

Les mutations se combinent. Avec plusieurs balles, les notes sont réparties entre elles : le morceau reste en
rythme, et chaque balle a plus de temps pour faire de grands arcs.

## Lancer l'app

```bash
git clone https://github.com/teamboujade/Life-pixel.git
cd Life-pixel
git checkout claude/lucid-clarke-7sof2i
python3 -m http.server 5173     # (Windows : python -m http.server 5173)
```

Puis ouvrir **http://localhost:5173** dans Chrome.

## Utilisation

1. Choisis un **fichier MIDI** (`.mid`), ou clique sur **Essayer avec la démo**.
2. Coche les pistes à jouer (la batterie est décochée par défaut) et choisis tes mutations.
3. Choisis l'instrument, la vitesse du morceau et la durée max (60 s pour TikTok).
4. **▶ Prévisualiser**, puis **● Générer la vidéo** et **Télécharger**.

Pas de MIDI ? Cherche « *nom du morceau* midi » sur internet, ou convertis un MP3 en MIDI avec un outil
gratuit comme Basic Pitch (Spotify).

> L'enregistrement se fait en temps réel : garde l'onglet au premier plan.

## L'algorithme

1. Les notes du MIDI sont regroupées en **coups** : les notes qui démarrent ensemble (accords) = un seul rebond.
2. Chaque coup est confié à la balle libre depuis le plus longtemps (s'il y en a plusieurs).
3. Pour chaque coup, l'app calcule à l'avance un **arc balistique** (avec gravité) qui part du point de contact
   précédent et touche le cercle **exactement à l'instant de la note**. Parmi des dizaines de points
   d'arrivée possibles, elle choisit celui qui :
   - reste à l'intérieur du cercle (en tenant compte de la taille de la balle),
   - ressemble le plus à un vrai rebond (angle de sortie ≈ reflet de l'angle d'arrivée),
   - garde une vitesse de balle régulière.
4. Les mutations sont appliquées au moment du contact (la balle gonfle, ou une copie part en miroir).
5. Pendant la lecture, chaque note est programmée dans le moteur audio au moment exact du contact.

Plus le morceau est rapide, plus la balle enchaîne les rebonds vite.

## Format de sortie

Chrome/Edge et Safari produisent un MP4. Si c'est un WebM (Firefox) :

```bash
ffmpeg -i video.webm -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k video.mp4
```

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/midi.js` | lecture des fichiers MIDI |
| `src/choreography.js` | trajectoires synchronisées sur les notes + mutations |
| `src/synth.js` | synthétiseur (piano, marimba, cloche, synthé) |
| `src/songs.js` | morceau de démo |
| `src/renderer.js` | dessin : cercle, balles, particules, compteur |
| `src/recorder.js` | enregistrement vidéo + audio |
| `src/main.js` | interface |

## Tests

```bash
npm test
```
