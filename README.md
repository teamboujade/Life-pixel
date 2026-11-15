# Kinéo

Application mobile 100 % gratuite, locale, sans compte ni abonnement, réalisée d'après le cahier des charges « Pixelio Ultimate ». Elle propose quatre onglets :

| Onglet | Fonctions |
|---|---|
| **Tableau de bord** | Totaux (pompes, squats, abdos, gainage, km, pas, minutes de lecture), bilan du jour, export JSON / CSV, remise à zéro |
| **Exosquelette** | Caméra + MediaPipe Pose sur l'appareil, squelette dessiné en direct (vert = posture valide), comptage automatique des pompes, squats et abdos, et chronomètre de gainage |
| **Course** | Podomètre natif + GPS (formule de Haversine), allure, écran maintenu allumé, historique |
| **Lecture** | Livres libres de droits (Project Gutenberg / Gutendex), import de PDF, temps estimé, chronomètre de lecture active (pause automatique en arrière-plan ou après 2 min d'inactivité), vitesse de lecture qui s'ajuste |

## Lancer l'application

Prérequis : Node.js 20 ou plus, et l'application **Expo Go** installée sur le téléphone.

```bash
npm install
npx expo start
```

Scannez ensuite le QR code avec Expo Go (Android) ou avec l'appareil photo (iOS).

Pour obtenir un APK autonome sans passer par Expo Go (compte Expo gratuit) :

```bash
npx eas-cli@latest build -p android --profile preview
```

## Tests

```bash
npm test        # angles, machines à états, Haversine, pagination, export
npx expo lint
```

## Architecture

```
App.js                      navigation par onglets
src/
  screens/                  Dashboard, Exoskeleton, Running, Reader
  components/               ui.js (Carte, Bouton, Stat…), ExoskeletonOverlay (SVG)
  services/
    exercises.js            machines à états Pompes / Squats / Abdos / Gainage
    poseWebView.js          caméra + MediaPipe Pose Landmarker (WebAssembly)
    pdfWebView.js           rendu PDF avec pdf.js
    bookFinder.js           Gutendex, classiques intégrés, import PDF, cache hors-ligne
    reading.js              pagination, estimation, vitesse de lecture
    exportData.js           export JSON / CSV
  store/useAppStore.js      Zustand + stockage persistant local (AsyncStorage)
  hooks/useReadingTimer.js  chronomètre de lecture active (AppState + inactivité)
  utils/geometry.js         angles, lissage, Haversine, formats
```

## Écarts assumés par rapport au cahier des charges

- **Expo SDK 58** (version actuelle) au lieu de SDK 51 : Expo Go ne fait tourner que la dernière version du SDK.
- **AsyncStorage** au lieu de MMKV (le cahier des charges autorise les deux) : MMKV oblige à compiler un build natif, AsyncStorage fonctionne directement dans Expo Go.
- **MediaPipe Tasks (WebAssembly) dans une WebView** au lieu de `@tensorflow/tfjs-react-native`, qui n'est plus compatible avec les versions récentes d'Expo. L'analyse se fait toujours sur le téléphone et les images ne sont jamais envoyées. Seuls le moteur et le modèle (~13 Mo) sont téléchargés gratuitement au premier lancement.
- **Comptage des pages** : le nombre de pages d'un livre est calculé à partir de son vrai texte (≈ 1 800 caractères par page), et non estimé d'après le nombre de téléchargements.
- **Course en arrière-plan** : le suivi ne fonctionne qu'avec l'application ouverte (l'écran reste allumé). Le suivi écran éteint demanderait un build natif.
