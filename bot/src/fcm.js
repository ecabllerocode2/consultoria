import admin from 'firebase-admin';
import { db } from './firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

// Cache en memoria del token — se actualiza cuando la PWA lo registre
let cachedToken = process.env.FCM_DEVICE_TOKEN || null;

async function getToken() {
  if (cachedToken) return cachedToken;
  try {
    const snap = await db.collection('configuracion').doc('config').get();
    const token = snap.data()?.fcmToken ?? null;
    if (token) cachedToken = token;
    return token;
  } catch {
    return null;
  }
}

/**
 * Persiste la notificación en Firestore para que la PWA la reciba
 * en tiempo real, independientemente de si FCM push funciona.
 */
async function saveToFirestore(title, body) {
  try {
    await db.collection('notificaciones').add({
      title,
      body,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[FCM] Error guardando notificación en Firestore:', err.message);
  }
}

/**
 * Envía una notificación push al dispositivo registrado
 * y la persiste en Firestore para la PWA.
 */
export async function sendNotification(title, body) {
  console.warn(`[FCM] 🔔 ${title}: ${body}`);

  // Siempre guardar en Firestore — esto es lo que muestra la PWA
  await saveToFirestore(title, body);

  const token = await getToken();
  if (!token) {
    console.warn('[FCM] Sin token FCM configurado — solo guardada en Firestore.');
    return;
  }

  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    console.log('[FCM] ✅ Notificación push enviada correctamente.');
  } catch (err) {
    console.error('[FCM] Error enviando notificación push:', err.message);
  }
}
