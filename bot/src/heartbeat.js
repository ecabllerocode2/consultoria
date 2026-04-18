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

export function startHeartbeat() {
  if (_interval) clearInterval(_interval);
  pulse(); // Pulso inmediato al conectar
  _interval = setInterval(pulse, INTERVAL_MS);
  console.log('[Heartbeat] Iniciado — pulso cada 60 segundos.');
}

export function stopHeartbeat() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}
