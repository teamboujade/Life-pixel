// Module Sport 1 (sections 3, 8, 13–16) : coach virtuel par vision par ordinateur.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, Header, Card, Button } from '../components/ui';
import ExoskeletonOverlay from '../components/ExoskeletonOverlay';
import { EXERCISES } from '../services/exercises';
import { POSE_HTML } from '../services/poseWebView';
import { smoothKeypoints, formatDuration } from '../utils/geometry';
import { useAppStore } from '../store/useAppStore';
import { colors } from '../theme';

export default function ExoskeletonScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const addWorkoutSession = useAppStore((s) => s.addWorkoutSession);

  const [exercise, setExercise] = useState('pompes');
  const [active, setActive] = useState(false);
  const [facing, setFacing] = useState('user');
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [pose, setPose] = useState(null);
  const [result, setResult] = useState({ count: 0, feedback: 'En attente…', valid: false });
  const [elapsed, setElapsed] = useState(0);
  const [box, setBox] = useState({ width: 0, height: 0 });

  const validatorRef = useRef(null);
  const prevKpRef = useRef(null);
  const startRef = useRef(0);
  const webRef = useRef(null);

  // Chronomètre de séance.
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);

  const start = () => {
    validatorRef.current = EXERCISES[exercise].create();
    prevKpRef.current = null;
    startRef.current = Date.now();
    setElapsed(0);
    setResult({ count: 0, feedback: 'Placez-vous dans le cadre', valid: false });
    setError(null);
    setStatus('Initialisation…');
    setPose(null);
    setActive(true);
  };

  const stop = useCallback(() => {
    const v = validatorRef.current;
    if (v && v.count > 0) {
      addWorkoutSession(exercise, v.count, Math.floor((Date.now() - startRef.current) / 1000));
    }
    validatorRef.current = null;
    setActive(false);
    setPose(null);
  }, [addWorkoutSession, exercise]);

  // Quitter l'onglet arrête et sauvegarde la séance (libère la caméra).
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);
  useFocusEffect(
    useCallback(
      () => () => {
        if (validatorRef.current) stopRef.current();
      },
      [],
    ),
  );

  const onMessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'status') setStatus(msg.message);
    else if (msg.type === 'ready') setStatus('');
    else if (msg.type === 'error') setError(msg.message);
    else if (msg.type === 'pose') {
      const kp = smoothKeypoints(prevKpRef.current, msg.keypoints);
      prevKpRef.current = kp;
      setPose({ keypoints: kp, w: msg.w, h: msg.h });
      if (!kp.length) {
        setResult((r) => ({ ...r, feedback: 'Aucune personne détectée', valid: false }));
        return;
      }
      const out = validatorRef.current?.process(kp, msg.ts);
      if (out) setResult(out);
      else setResult((r) => ({ ...r, feedback: 'Corps pas entièrement visible', valid: false }));
    }
  };

  const flipCamera = () => {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    prevKpRef.current = null;
    webRef.current?.injectJavaScript(`window.setFacing('${next}'); true;`);
  };

  const ex = EXERCISES[exercise];

  if (active) {
    return (
      <Screen>
        <View style={s.cameraBox} onLayout={(e) => setBox(e.nativeEvent.layout)}>
          <WebView
            ref={webRef}
            source={{ html: POSE_HTML, baseUrl: 'https://localhost/' }}
            originWhitelist={['*']}
            javaScriptEnabled
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            mediaCapturePermissionGrantType="grant"
            onMessage={onMessage}
            style={s.web}
          />
          <ExoskeletonOverlay
            keypoints={pose?.keypoints}
            videoW={pose?.w}
            videoH={pose?.h}
            width={box.width}
            height={box.height}
            isValidPosture={result.valid}
          />
          <View style={s.hud} pointerEvents="none">
            <Text style={s.hudCount}>{result.count}</Text>
            <Text style={s.hudUnit}>{ex.unit}</Text>
          </View>
          {(status || error) && (
            <View style={s.banner}>
              <Text style={s.bannerText}>{error ? `Erreur : ${error}` : status}</Text>
            </View>
          )}
        </View>
        <View style={s.controls}>
          <Text style={[s.feedback, { color: result.valid ? colors.accent : colors.text }]}>
            {result.feedback}
          </Text>
          <Text style={s.meta}>
            {ex.label} · {formatDuration(elapsed)}
            {result.angle != null ? ` · angle ${Math.round(result.angle)}°` : ''}
          </Text>
          <View style={s.row}>
            <Button label="Retourner" variant="ghost" onPress={flipCamera} style={s.flex} />
            <Button label="Terminer" variant="accent" onPress={stop} style={s.flex} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Header title="Exosquelette IA" subtitle="Vos répétitions comptées par la caméra, sur l’appareil." />
        <Card title="Exercice">
          <View style={s.chips}>
            {Object.entries(EXERCISES).map(([key, e]) => (
              <Pressable
                key={key}
                onPress={() => setExercise(key)}
                style={[s.chip, exercise === key && s.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: exercise === key }}
              >
                <Text style={[s.chipText, exercise === key && s.chipTextOn]}>{e.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.tip}>{ex.tip}</Text>
        </Card>

        {!permission?.granted ? (
          <Card title="Accès caméra">
            <Text style={s.tip}>
              La caméra sert uniquement à détecter votre squelette. Les images sont analysées sur le téléphone et ne
              sont ni enregistrées ni envoyées.
            </Text>
            {permission?.canAskAgain === false ? (
              <Button label="Ouvrir les réglages" onPress={() => Linking.openSettings()} />
            ) : (
              <Button label="Autoriser la caméra" onPress={requestPermission} />
            )}
          </Card>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <Button label={`Démarrer : ${ex.label}`} variant="accent" onPress={start} />
          </View>
        )}

        <Card title="Seuils de validation" style={{ marginTop: 12 }}>
          {[
            'Pompes : coude < 85° puis > 160°, dos ≥ 155°',
            'Squats : genou < 95° puis > 165°',
            'Abdos : hanche < 55° puis > 130°',
            'Gainage : épaule-hanche-cheville ≥ 170°',
          ].map((line) => (
            <Text key={line} style={s.rule}>
              {line}
            </Text>
          ))}
        </Card>
        <Text style={s.note}>
          Première utilisation : le moteur IA (~13 Mo) est téléchargé gratuitement puis mis en cache.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  cameraBox: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  web: { flex: 1, backgroundColor: '#000' },
  hud: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(15,23,42,0.8)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  hudCount: { color: colors.accent, fontSize: 44, fontWeight: '900', fontVariant: ['tabular-nums'] },
  hudUnit: { color: colors.muted, fontSize: 12 },
  banner: { position: 'absolute', left: 16, right: 16, bottom: 16, backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 10, padding: 12 },
  bannerText: { color: colors.text, textAlign: 'center' },
  controls: { padding: 16, gap: 8, backgroundColor: colors.bg },
  feedback: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  meta: { color: colors.muted, textAlign: 'center', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 12, marginTop: 4 },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  tip: { color: colors.muted, marginTop: 12, marginBottom: 12, lineHeight: 20 },
  rule: { color: colors.text, lineHeight: 24 },
  note: { color: colors.muted, fontSize: 12, paddingHorizontal: 16, marginTop: 4 },
});
