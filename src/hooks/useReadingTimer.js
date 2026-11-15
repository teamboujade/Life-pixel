// Chronomètre de lecture active (sections 5.2 et 18) : il se met en pause si
// l'application passe en arrière-plan ou si aucune interaction (défilement,
// changement de page, toucher) n'a lieu pendant IDLE_LIMIT_SEC.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export const IDLE_LIMIT_SEC = 120;

export function useActiveReadingMonitor(onPauseRequired) {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') onPauseRequired(true);
    });
    return () => subscription.remove();
  }, [onPauseRequired]);
}

export function useReadingTimer() {
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState(null);
  const lastActivity = useRef(0);

  const markActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const resume = useCallback(() => {
    lastActivity.current = Date.now();
    setPaused(false);
    setPauseReason(null);
  }, []);

  const onBackground = useCallback(() => {
    setPaused(true);
    setPauseReason('Lecture en pause : vous avez quitté l’application.');
  }, []);
  useActiveReadingMonitor(onBackground);

  useEffect(() => {
    if (paused) return undefined;
    lastActivity.current = Date.now();
    const id = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_LIMIT_SEC * 1000) {
        setPaused(true);
        setPauseReason('Lecture en pause : aucune activité depuis 2 minutes.');
        return;
      }
      setActiveSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [paused]);

  return { activeSeconds, paused, pauseReason, markActivity, resume };
}
