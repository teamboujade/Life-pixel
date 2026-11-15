// Tableau de bord (section 12) + export des données (section 20).
import React from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Screen, Header, Card, Button, Stat } from '../components/ui';
import { useAppStore } from '../store/useAppStore';
import { exportUserDataToJson, toCsv } from '../services/exportData';
import { formatDuration } from '../utils/geometry';
import { colors } from '../theme';

const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

export default function DashboardScreen() {
  const state = useAppStore();
  const { totals, workouts, runs, readingSessions, readingSpeedPagesPerMin } = state;

  const totalReadingMinutes = Math.floor(readingSessions.reduce((acc, s) => acc + s.activeSeconds, 0) / 60);
  const today = {
    reps: workouts.filter((w) => isToday(w.date) && w.type !== 'gainage').reduce((a, w) => a + w.reps, 0),
    km: runs.filter((r) => isToday(r.date)).reduce((a, r) => a + r.km, 0),
    readMin: Math.floor(readingSessions.filter((s) => isToday(s.date)).reduce((a, s) => a + s.activeSeconds, 0) / 60),
  };

  const share = async (message, title) => {
    try {
      await Share.share({ message, title });
    } catch (e) {
      Alert.alert('Export impossible', e.message);
    }
  };

  const confirmReset = () =>
    Alert.alert('Tout effacer ?', 'Toutes vos statistiques locales seront supprimées. Exportez-les d’abord si besoin.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: state.resetAll },
    ]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Header title="KINÉO — VOS PERFORMANCES" subtitle="100 % local, gratuit, sans compte." />

        <Card title="Aujourd’hui">
          <View style={s.row}>
            <Stat label="Répétitions" value={today.reps} color={colors.accent} />
            <Stat label="Course" value={today.km.toFixed(2)} unit="km" color={colors.accent} />
            <Stat label="Lecture" value={today.readMin} unit="min" color={colors.accent} />
          </View>
        </Card>

        <Card title="Musculation (Exosquelette IA)">
          <View style={s.row}>
            <Stat label="Pompes validées" value={totals.pompes} />
            <Stat label="Squats validés" value={totals.squats} />
          </View>
          <View style={[s.row, { marginTop: 12 }]}>
            <Stat label="Abdominaux validés" value={totals.abdos} />
            <Stat label="Gainage cumulé" value={formatDuration(totals.gainage)} />
          </View>
        </Card>

        <Card title="Endurance & Course">
          <View style={s.row}>
            <Stat label="Distance totale" value={totals.km.toFixed(2)} unit="km" />
            <Stat label="Pas cumulés" value={totals.steps} />
            <Stat label="Sorties" value={runs.length} />
          </View>
        </Card>

        <Card title="Lecture & Savoir">
          <View style={s.row}>
            <Stat label="Temps de lecture certifié" value={totalReadingMinutes} unit="min" />
            <Stat label="Vitesse" value={readingSpeedPagesPerMin} unit="p/min" />
          </View>
        </Card>

        {workouts.length > 0 && (
          <Card title="Dernières séances">
            {workouts.slice(0, 5).map((w) => (
              <Text key={w.id} style={s.line}>
                {new Date(w.date).toLocaleDateString('fr-FR')} · {w.type} ·{' '}
                {w.type === 'gainage' ? formatDuration(w.reps) : `${w.reps} rép.`}
              </Text>
            ))}
          </Card>
        )}

        <Card title="Mes données">
          <Text style={s.help}>Vos données ne quittent jamais le téléphone. Exportez-les quand vous voulez.</Text>
          <View style={s.row}>
            <Button label="Export JSON" variant="ghost" style={s.flex} onPress={() => share(exportUserDataToJson(state), 'Sauvegarde Kinéo')} />
            <Button label="Export CSV" variant="ghost" style={s.flex} onPress={() => share(toCsv(state), 'Historique Kinéo')} />
          </View>
          <Button label="Tout effacer" variant="ghost" onPress={confirmReset} style={{ marginTop: 12 }} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  line: { color: colors.text, paddingVertical: 4, textTransform: 'capitalize' },
  help: { color: colors.muted, marginBottom: 12, lineHeight: 20 },
});
