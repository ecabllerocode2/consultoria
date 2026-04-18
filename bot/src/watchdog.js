import { db } from './firebase.js';
import { sendNotification } from './fcm.js';

const TIMEOUT_MS = 5 * 60_000; // 5 minutos

// Timers activos: curp → timeoutId
const reactionTimers = new Map();
const pdfTimers = new Map();

/**
 * Inicia un temporizador para la CURP indicada.
 * Si transcurre `delayMs` sin que el asesor reaccione (status sigue
 * en 'pendiente'), envía una notificación FCM.
 *
 * @param {string} curp
 * @param {number} [delayMs] — tiempo de espera (default 5 min; recovery lo ajusta)
 */
export function watchForReaction(curp, delayMs = TIMEOUT_MS) {
  if (reactionTimers.has(curp)) clearTimeout(reactionTimers.get(curp));

  const t = setTimeout(async () => {
    reactionTimers.delete(curp);
    try {
      const snap = await db.collection('solicitudes').doc(curp).get();
      if (!snap.exists) return;
      if (snap.data().status === 'pendiente') {
        console.warn(`[Watchdog] ⏰ ${curp} sin reacción del asesor tras 5 min.`);
        await sendNotification(
          '⏰ Sin reacción del asesor',
          `La CURP ${curp} lleva más de 5 min sin respuesta en el grupo de asesores.`
        );
      }
    } catch (err) {
      console.error('[Watchdog] Error verificando reacción:', err.message);
    }
  }, Math.max(delayMs, 30_000)); // mínimo 30 s para no disparar al instante en recovery

  reactionTimers.set(curp, t);
  console.log(`[Watchdog] Vigilando reacción para ${curp} (${Math.round(delayMs / 1000)} s).`);
}

export function cancelReactionWatch(curp) {
  if (reactionTimers.has(curp)) {
    clearTimeout(reactionTimers.get(curp));
    reactionTimers.delete(curp);
    console.log(`[Watchdog] Temporizador de reacción cancelado para ${curp}.`);
  }
}

/**
 * Inicia un temporizador para la CURP indicada.
 * Si transcurre `delayMs` sin que el asesor envíe el PDF
 * (esperandoPdf sigue en true), envía una notificación FCM.
 */
export function watchForPdf(curp, delayMs = TIMEOUT_MS) {
  if (pdfTimers.has(curp)) clearTimeout(pdfTimers.get(curp));

  const t = setTimeout(async () => {
    pdfTimers.delete(curp);
    try {
      const snap = await db.collection('solicitudes').doc(curp).get();
      if (!snap.exists) return;
      if (snap.data().esperandoPdf === true) {
        console.warn(`[Watchdog] ⏰ ${curp} marcada ✅ pero sin PDF tras 5 min.`);
        await sendNotification(
          '⏰ Sin PDF del asesor',
          `La CURP ${curp} fue marcada ✅ hace más de 5 min y aún no se ha recibido el PDF.`
        );
      }
    } catch (err) {
      console.error('[Watchdog] Error verificando PDF:', err.message);
    }
  }, Math.max(delayMs, 30_000));

  pdfTimers.set(curp, t);
  console.log(`[Watchdog] Vigilando PDF para ${curp} (${Math.round(delayMs / 1000)} s).`);
}

export function cancelPdfWatch(curp) {
  if (pdfTimers.has(curp)) {
    clearTimeout(pdfTimers.get(curp));
    pdfTimers.delete(curp);
    console.log(`[Watchdog] Temporizador de PDF cancelado para ${curp}.`);
  }
}
