import { db } from './firebase.js';
import { watchForReaction, watchForPdf } from './watchdog.js';

const TIMEOUT_MS = 5 * 60_000;

/**
 * Calcula cuánto tiempo queda desde `updatedAt` hasta completar `TIMEOUT_MS`.
 * Si ya pasó el tiempo, devuelve 30_000 (dispara casi de inmediato).
 */
function remainingMs(updatedAt) {
  if (!updatedAt) return TIMEOUT_MS;
  const elapsed = Date.now() - updatedAt.toDate().getTime();
  return Math.max(TIMEOUT_MS - elapsed, 30_000);
}

/**
 * Al reiniciarse el bot, escanea Firestore para listar los trámites
 * que estaban en progreso y re-arma los watchdogs con el tiempo restante.
 */
export async function recoverPendingSolicitudes() {
  try {
    const snap = await db
      .collection('solicitudes')
      .where('status', 'in', ['pendiente', 'revision'])
      .get();

    if (snap.empty) {
      console.log('[Recovery] No hay trámites pendientes al reiniciar.');
      return;
    }

    console.log(`[Recovery] ⚠️  ${snap.size} trámite(s) en curso detectados al reiniciar:`);
    snap.forEach((docSnap) => {
      const { curp, status, grupoClienteId, updatedAt } = docSnap.data();
      const delay = remainingMs(updatedAt);
      console.log(`  → CURP: ${curp} | Estado: ${status} | Grupo: ${grupoClienteId} | Watchdog en ${Math.round(delay / 1000)} s`);

      if (status === 'pendiente') {
        watchForReaction(curp, delay);
      } else if (status === 'revision') {
        watchForPdf(curp, delay);
      }
    });
    console.log('[Recovery] El bot retomará el seguimiento automáticamente.');
  } catch (err) {
    console.error('[Recovery] Error leyendo solicitudes pendientes:', err.message);
  }
}
