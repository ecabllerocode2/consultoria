import { db } from './firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

const INTERVAL_MS = 60_000; // 60 segundos
const configRef = db.collection('configuracion').doc('config');
let _interval = null;

async function pulse() {
  try {
    await configRef.update({
      lastHeartbeat: FieldValue.serverTimestamp(),
      botStatus: true,
    });
  } catch (err) {
    console.error('[Heartbeat] Error actualizando pulso:', err.message);
  }
}

export async function startHeartbeat() {
  if (_interval) clearInterval(_interval);

  // Escribir metadata del proceso al iniciar (útil para detectar reinicios)
  try {
    await configRef.set({
      botStatus: true,
      botStartedAt: FieldValue.serverTimestamp(),
      botPid: process.pid,
    }, { merge: true });
  } catch (err) {
    console.error('[Heartbeat] Error registrando inicio:', err.message);
  }

  pulse(); // Pulso inmediato
  _interval = setInterval(pulse, INTERVAL_MS);
  console.log(`[Heartbeat] Iniciado (PID ${process.pid}) — pulso cada 60s.`);
}

export function stopHeartbeat() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}
