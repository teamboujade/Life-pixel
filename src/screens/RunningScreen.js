// Module Sport 2 (sections 4 et 17) : podomètre natif + GPS (formule de Haversine).
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import { Screen, Header, Card, Button, Stat } from '../components/ui';
import { calculateHaversineDistance, formatDuration, formatPace } from '../utils/geometry';
import { useAppStore } from '../store/useAppStore';
import { colors } from '../theme';
import { notify } from '../utils/dialog';

const STRIDE_M = 0.75; // foulée moyenne utilisée si le GPS est indisponible
const MAX_ACCURACY_M = 30; // on ignore les relevés GPS trop imprécis

function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function RunningScreen() {
  const addRun = useAppStore((s) => s.addRun);
  const runs = useAppStore((s) => s.runs);

  const [isTracking, setIsTracking] = useState(false);
  const [timer, setTimer] = useState(0);
  const [steps, setSteps] = useState(0);
  const [gpsKm, setGpsKm] = useState(0);
  const [gpsOn, setGpsOn] = useState(false);
  const [pedoOn, setPedoOn] = useState(false);

  const subs = useRef([]);
  const lastPoint = useRef(null);
  const path = useRef([]);
  const startedAt = useRef(0);

  const distanceKm = gpsOn && gpsKm > 0 ? gpsKm : (steps * STRIDE_M) / 1000;

  useEffect(() => {
    if (!isTracking) return undefined;
    const id = setInterval(() => setTimer(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isTracking]);

  useEffect(() => () => subs.current.forEach((s) => s.remove()), []);

  const start = async () => {
    setTimer(0);
    setSteps(0);
    setGpsKm(0);
    lastPoint.current = null;
    path.current = [];
    startedAt.current = Date.now();

    // Podomètre natif
    let pedo = false;
    try {
      if (await Pedometer.isAvailableAsync()) {
        const { granted } = await Pedometer.requestPermissionsAsync();
        if (granted) {
          subs.current.push(Pedometer.watchStepCount((r) => setSteps(r.steps)));
          pedo = true;
        }
      }
    } catch {
      pedo = false;
    }
    setPedoOn(pedo);

    // GPS
    let gps = false;
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (granted) {
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 2000 },
          ({ coords }) => {
            if (coords.accuracy != null && coords.accuracy > MAX_ACCURACY_M) return;
            const p = { lat: coords.latitude, lon: coords.longitude };
            const prev = lastPoint.current;
            if (prev) {
              const d = calculateHaversineDistance(prev.lat, prev.lon, p.lat, p.lon);
              // Saut > 100 m entre deux relevés = aberration GPS.
              if (d > 0.1) return;
              setGpsKm((km) => km + d);
            }
            lastPoint.current = p;
            path.current.push([p.lat, p.lon]);
          },
        );
        subs.current.push(sub);
        gps = true;
      }
    } catch {
      gps = false;
    }
    setGpsOn(gps);

    if (!pedo && !gps) {
      notify('Capteurs indisponibles', 'Autorisez la localisation ou l’activité physique pour suivre votre course.');
      return;
    }
    setIsTracking(true);
  };

  const stop = () => {
    subs.current.forEach((s) => s.remove());
    subs.current = [];
    setIsTracking(false);
    addRun({
      durationSec: Math.floor((Date.now() - startedAt.current) / 1000),
      km: distanceKm,
      steps,
      path: path.current.length > 500 ? path.current.filter((_, i) => i % 5 === 0) : path.current,
    });
  };

  return (
    <Screen>
      {isTracking && <KeepAwake />}
      <FlatList
        data={isTracking ? [] : runs}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <>
            <Header title="Course" subtitle="Podomètre et GPS du téléphone, sans montre connectée." />
            <Card title={isTracking ? 'Suivi en direct' : 'Nouvelle course'}>
              <Text style={s.timer}>{formatDuration(timer)}</Text>
              <View style={s.stats}>
                <Stat label="Distance" value={distanceKm.toFixed(2)} unit="km" color={colors.accent} />
                <Stat label="Pas" value={steps} />
                <Stat label="Allure" value={formatPace(timer, distanceKm)} unit="/km" />
              </View>
              {isTracking && (
                <Text style={s.sensors}>
                  GPS {gpsOn ? 'actif' : 'inactif'} · Podomètre {pedoOn ? 'actif' : 'inactif'}
                  {!gpsOn ? ' · distance estimée avec la foulée' : ''}
                </Text>
              )}
              <Button
                label={isTracking ? 'Arrêter et enregistrer' : 'Démarrer la course'}
                variant={isTracking ? 'danger' : 'accent'}
                onPress={isTracking ? stop : start}
                style={{ marginTop: 16 }}
              />
            </Card>
            {isTracking ? (
              <Text style={s.hint}>Gardez l’application ouverte pendant la course : l’écran reste allumé.</Text>
            ) : runs.length ? (
              <Text style={s.section}>Historique</Text>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <View style={s.run}>
            <Text style={s.runDate}>
              {new Date(item.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
            <Text style={s.runMain}>{item.km.toFixed(2)} km</Text>
            <Text style={s.runSub}>
              {formatDuration(item.durationSec)} · {formatPace(item.durationSec, item.km)}/km · {item.steps} pas
            </Text>
          </View>
        )}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  timer: { color: colors.text, fontSize: 56, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'], marginBottom: 12 },
  stats: { flexDirection: 'row', gap: 8 },
  sensors: { color: colors.muted, fontSize: 12, marginTop: 12 },
  hint: { color: colors.muted, paddingHorizontal: 16 },
  section: { color: colors.text, fontWeight: '700', fontSize: 16, paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  run: { marginHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  runDate: { color: colors.muted, fontSize: 12, textTransform: 'capitalize' },
  runMain: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 2 },
  runSub: { color: colors.muted, fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
});
