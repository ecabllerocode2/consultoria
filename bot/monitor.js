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

const MAX_SILENCE_MS   = 3 * 60 * 1000;  // 3 minutos sin latido → alerta
const CHECK_INTERVAL_MS = 60 * 1000;     // Revisar cada 1 minuto
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // No repetir alerta por 5 minutos

let lastAlertTime = 0;

console.log('[Monitor] Iniciado — vigilando heartbeat del bot cada 60s.');

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
      console.error(`[Monitor] ⚠️  Bot sin latido por ${silenceMin} min.`);

      const cooldownOk = Date.now() - lastAlertTime > ALERT_COOLDOWN_MS;
      if (cooldownOk) {
        await sendNotification(
          '⚠️ ALERTA: Bot fuera de línea',
          `El bot lleva ${silenceMin} min sin responder. Inicia gestión manual de trámites.`
        );
        lastAlertTime = Date.now();
      }
    } else {
      console.log(`[Monitor] ✅ Bot activo — último pulso hace ${silenceSeg}s.`);
    }
  } catch (err) {
    console.error('[Monitor] Error verificando heartbeat:', err.message);
  }
}

// Verificar al iniciar y luego cada minuto
checkHeartbeat();
setInterval(checkHeartbeat, CHECK_INTERVAL_MS);
