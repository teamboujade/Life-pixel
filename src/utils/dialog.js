// Boîtes de dialogue multiplateformes (Alert ne fait rien dans un navigateur).
import { Alert, Platform } from 'react-native';

export function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export function confirmDestructive(title, message, actionLabel, onConfirm) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Annuler', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
