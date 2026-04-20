/**
 * Proceso independiente de monitoreo del bot.
 * Corre en un proceso separado — si el bot cae, este sigue activo.
 *
 * Uso directo:  node monitor.js
 * Con PM2:      pm2 start monitor.js --name curp-monitor
 */
import 'dotenv/config';
import { db } from './src/firebase.js';
import { sendNotification } from './src/fcm.js';

const MAX_SILENCE_MS    = 90 * 1000;      // 90 s sin latido → alerta
const CHECK_INTERVAL_MS = 30 * 1000;      // Revisar cada 30 s
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;  // No repetir alerta por 5 minutos

let lastAlertTime = 0;

console.log('[Monitor] Iniciado — vigilando heartbeat cada 30s (umbral: 90s).');

async function checkHeartbeat() {
  try {
    const snap = await db.collection('configuracion').doc('config').get();
    if (!snap.exists) {
      console.warn('[Monitor] Documento configuracion/config no encontrado.');
      return;
    }

    const { lastHeartbeat } = snap.data();
    if (!lastHeartbeat) {
      console.warn('[Monitor] lastHeartbeat aún no definido.');
      return;
    }

    const silenceMs  = Date.now() - lastHeartbeat.toDate().getTime();
    const silenceSeg = Math.floor(silenceMs / 1000);
    const silenceMin = Math.floor(silenceMs / 60_000);

    if (silenceMs > MAX_SILENCE_MS) {
      console.error(`[Monitor] ⚠️  Bot sin latido por ${silenceSeg}s.`);

      const cooldownOk = Date.now() - lastAlertTime > ALERT_COOLDOWN_MS;
      if (cooldownOk) {
        lastAlertTime = Date.now();

        const titulo = '🚨 Bot fuera de línea';
        const cuerpo = silenceMs > 120_000
          ? `Sin respuesta hace ${silenceMin} min. Activa la Carga de Emergencia en la PWA.`
          : `Sin respuesta hace ${silenceSeg}s. Puede ser un reinicio automático.`;

        // 1. Notificación push + Firestore
        await sendNotification(titulo, cuerpo);

        // 2. Marcar en Firestore para que la PWA lo refleje aunque FCM falle
        await db.collection('configuracion').doc('config').update({
          botStatus: false,
        }).catch(() => {});
      }
    } else {
      console.log(`[Monitor] ✅ Bot activo — último pulso hace ${silenceSeg}s.`);
    }
  } catch (err) {
    console.error('[Monitor] Error verificando heartbeat:', err.message);
  }
}

// Verificar al iniciar y luego cada 30 s
checkHeartbeat();
setInterval(checkHeartbeat, CHECK_INTERVAL_MS);
