import { client } from './client.js';
import { db } from './firebase.js';
import { getGruposClientes, getGrupoAsesores } from './config.js';
import { extractCurps, randomDelay } from './utils.js';
import { sendNotification } from './fcm.js';
import { watchForReaction } from './watchdog.js';
import { FieldValue } from 'firebase-admin/firestore';

// Previene procesamiento simultáneo de la misma CURP (race condition)
const procesando = new Set();

export function initCurpHandler() {
  client.on('message', async (msg) => {
    if (msg.fromMe) return;                                     // ignorar mensajes propios
    if (!msg.from.endsWith('@g.us')) return;                    // solo grupos
    if (!getGruposClientes().includes(msg.from)) return;        // solo grupos de clientes
    if (msg.type !== 'chat') return;                            // solo texto plano

    const body = msg.body ?? '';
    const curps = extractCurps(body);

    // Cualquier mensaje sin CURP debe revisarse manualmente
    if (curps.length === 0) {
      const chat = await msg.getChat().catch(() => null);
      const chatName = chat?.name ?? msg.from;
      const preview = body.length > 80 ? `${body.substring(0, 80)}…` : body;
      console.log(`[CurpHandler] Mensaje sin CURP en "${chatName}": "${preview}"`);
      await sendNotification(
        '💬 Mensaje sin CURP — revisión manual',
        `En "${chatName}": "${preview}"`
      );
      return;
    }

    const grupoAsesores = getGrupoAsesores();
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

        await randomDelay(2000, 5000);

        const sentMsg = await client.sendMessage(grupoAsesores, `*${curp}*`);

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
