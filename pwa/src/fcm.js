import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { messaging, db } from './firebase.js';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Solicita permiso de notificaciones, obtiene el FCM token
 * y lo guarda en Firestore para que el bot lo use.
 */
export async function registerFCM() {
  if (!messaging) {
    console.warn('[FCM] No soportado en este navegador.');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] Permiso de notificaciones denegado.');
      return null;
    }

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return null;

    // Guardar en Firestore para que el bot/monitor lo lea
    await setDoc(
      doc(db, 'configuracion', 'config'),
      { fcmToken: token },
      { merge: true }
    );
    console.log('[FCM] Token registrado en Firestore.');
    return token;
  } catch (err) {
    // AbortError en localhost es normal — push requiere HTTPS (funcionará en Vercel)
    if (err.name === 'AbortError' || err.code === 'messaging/token-subscribe-failed') {
      console.warn('[FCM] Push no disponible en este entorno (requiere HTTPS). Las notificaciones Firestore siguen activas.');
    } else {
      console.error('[FCM] Error registrando token:', err.message);
    }
    return null;
  }
}

/**
 * Escucha mensajes push cuando la app está en primer plano.
 */
export function onForegroundMessage(callback) {
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    callback(payload);
  });
}
