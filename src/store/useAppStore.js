// Store global (section 7) : Zustand + persistance locale sur l'appareil.
// AsyncStorage est utilisé (variante autorisée par la spec) car il fonctionne
// dans Expo Go sans build natif ; aucune donnée ne quitte le téléphone.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateReadingSpeed } from '../services/reading';

const emptyTotals = { pompes: 0, squats: 0, abdos: 0, gainage: 0, km: 0, steps: 0 };
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const useAppStore = create(
  persist(
    (set, get) => ({
      workouts: [],
      runs: [],
      readingSessions: [],
      totals: emptyTotals,
      readingSpeedPagesPerMin: 1.0,
      bookProgress: {}, // { [bookId]: { page, totalPages, title } }

      addWorkoutSession: (type, reps, durationSec) => {
        if (reps <= 0) return;
        const session = { id: newId(), date: new Date().toISOString(), type, reps, durationSec };
        const { totals } = get();
        set({
          workouts: [session, ...get().workouts],
          totals: { ...totals, [type]: (totals[type] ?? 0) + reps },
        });
      },

      addRun: ({ durationSec, km, steps, path }) => {
        if (durationSec < 5) return;
        const run = { id: newId(), date: new Date().toISOString(), durationSec, km, steps, path };
        const { totals } = get();
        set({
          runs: [run, ...get().runs],
          totals: { ...totals, km: totals.km + km, steps: totals.steps + steps },
        });
      },

      addReadingSession: ({ bookId, title, pagesRead, activeSeconds, totalPages }) => {
        if (activeSeconds < 5) return;
        const session = {
          id: newId(),
          date: new Date().toISOString(),
          bookId,
          title,
          pagesRead,
          totalPages,
          activeSeconds,
        };
        set({
          readingSessions: [session, ...get().readingSessions],
          readingSpeedPagesPerMin: updateReadingSpeed(
            get().readingSpeedPagesPerMin,
            pagesRead,
            activeSeconds,
          ),
        });
      },

      setBookProgress: (bookId, progress) =>
        set({ bookProgress: { ...get().bookProgress, [bookId]: progress } }),

      resetAll: () =>
        set({
          workouts: [],
          runs: [],
          readingSessions: [],
          totals: emptyTotals,
          readingSpeedPagesPerMin: 1.0,
          bookProgress: {},
        }),
    }),
    {
      name: 'kineo-local-db',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
