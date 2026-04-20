import { client } from './client.js';
import { db } from './firebase.js';
import { getGruposClientes, getGrupoAsesores } from './config.js';
import { extractCurps, randomDelay } from './utils.js';
import { sendNotification } from './fcm.js';
import { watchForReaction } from './watchdog.js';
import { enqueue } from './sendQueue.js';
import { FieldValue } from 'firebase-admin/firestore';

// Previene procesamiento simultáneo de la misma CURP (race condition)
const procesando = new Set();

/** Obtiene el nombre del chat, con fallback al ID */
async function getChatName(msg) {
  const chat = await msg.getChat().catch(() => null);
  return chat?.name ?? msg.from;
}

/** Construye preview truncado del mensaje */
function preview(body, max = 100) {
  const clean = body.trim();
  return clean.length > max ? `${clean.substring(0, max)}…` : clean;
}

export function initCurpHandler() {
  client.on('message', async (msg) => {
    if (msg.fromMe) return;
    if (!msg.from.endsWith('@g.us')) return;

    const body = msg.body ?? '';
    const curps = extractCurps(body);
    const grupoAsesores = getGrupoAsesores();

    // ── Mensajes del grupo de ASESORES sin CURP ──────────────────────────────
    if (msg.from === grupoAsesores && msg.type === 'chat') {
      if (curps.length === 0) {
        const chatName = await getChatName(msg);
        const msg_preview = preview(body);
        console.log(`[CurpHandler] Mensaje sin CURP en asesores "${chatName}": "${msg_preview}"`);
        await sendNotification(
          `💼 Mensaje en asesores — revisión manual`,
          `Grupo "${chatName}"\n"${msg_preview}"`
        );
      }
      return; // el bot no procesa mensajes de asesores más allá de esto
    }

    // ── Mensajes de grupos de CLIENTES ───────────────────────────────────────
    if (!getGruposClientes().includes(msg.from)) return;
    if (msg.type !== 'chat') return;

    // Cualquier mensaje sin CURP debe revisarse manualmente
    if (curps.length === 0) {
      const chatName = await getChatName(msg);
      const msg_preview = preview(body);
      console.log(`[CurpHandler] Mensaje sin CURP en clientes "${chatName}": "${msg_preview}"`);
      await sendNotification(
        `💬 Mensaje en clientes — revisión manual`,
        `Grupo "${chatName}"\n"${msg_preview}"`
      );
      return;
    }

    if (!grupoAsesores) {
      console.warn('[CurpHandler] grupoAsesores no configurado, ignorando mensaje.');
      return;
    }

    for (const curp of curps) {
      // Lock: evitar procesamiento simultáneo de la misma CURP
      if (procesando.has(curp)) {
        console.warn(`[CurpHandler] CURP ${curp} ya está siendo procesada, ignorando duplicado.`);
        continue;
      }
      procesando.add(curp);

      try {
        console.log(`[CurpHandler] CURP detectada: ${curp} en grupo ${msg.from}`);

        await db.collection('solicitudes').doc(curp).set({
          curp,
          grupoClienteId: msg.from,
          msgOriginalId: msg.id._serialized,
          status: 'pendiente',
          esperandoPdf: false,
          ultimaReaccion: null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // Envío encolado: espera turno + delay aleatorio antes de enviar al asesor
        const sentMsg = await enqueue(grupoAsesores, () =>
          client.sendMessage(grupoAsesores, `*${curp}*`)
        );

        await db.collection('solicitudes').doc(curp).update({
          msgAsesorId: sentMsg.id._serialized,
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Iniciar vigilancia: si en 5 min no hay reacción, notificar
        watchForReaction(curp);

        console.log(`[CurpHandler] CURP ${curp} registrada y notificada a asesores.`);
      } catch (err) {
        console.error(`[CurpHandler] Error procesando CURP ${curp}:`, err);
      } finally {
        procesando.delete(curp); // siempre liberar el lock
      }
    }
  });
}
