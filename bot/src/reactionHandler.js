import { client } from './client.js';
import { db } from './firebase.js';
import { getGrupoAsesores } from './config.js';
import { cancelReactionWatch, watchForPdf, cancelPdfWatch } from './watchdog.js';
import { enqueue } from './sendQueue.js';
import { FieldValue } from 'firebase-admin/firestore';

const REACCION_CHECKLIST = '✅';

export function initReactionHandler() {
  client.on('message_reaction', async (reaction) => {
    try {
      // Solo reacciones en el grupo de asesores
      const grupoAsesores = getGrupoAsesores();
      if (!grupoAsesores) return;
      if (reaction.id.remote !== grupoAsesores) return;

      const msgAsesorId = reaction.msgId._serialized;
      const emoji = reaction.reaction;

      // Buscar en Firestore la solicitud que tiene ese msgAsesorId
      const snap = await db
        .collection('solicitudes')
        .where('msgAsesorId', '==', msgAsesorId)
        .limit(1)
        .get();

      if (snap.empty) {
        console.warn(`[ReactionHandler] No se encontró solicitud para msgAsesorId: ${msgAsesorId}`);
        return;
      }

      const docRef = snap.docs[0].ref;
      const data = snap.docs[0].data();
      const { curp, msgOriginalId, grupoClienteId } = data;

      console.log(`[ReactionHandler] Reacción "${emoji}" en CURP ${curp}`);

      if (emoji === REACCION_CHECKLIST) {
        // ✅ — marcar como en revisión, NO replicar al cliente
        await docRef.update({
          esperandoPdf: true,
          ultimaReaccion: emoji,
          status: 'revision',
          updatedAt: FieldValue.serverTimestamp(),
        });
        // Cancelar el timer de "sin reacción" e iniciar el de "sin PDF"
        cancelReactionWatch(curp);
        watchForPdf(curp);
        console.log(`[ReactionHandler] CURP ${curp} marcada como en revisión. Esperando PDF.`);
      } else {
        // Cualquier otra reacción — replicar al cliente
        await docRef.update({
          esperandoPdf: false,
          ultimaReaccion: emoji,
          status: 'error',
          updatedAt: FieldValue.serverTimestamp(),
        });
        // Cancelar ambos timers: el trámite ya tiene respuesta (aunque sea de error)
        cancelReactionWatch(curp);
        cancelPdfWatch(curp);

        // Encolar la reacción al grupo del cliente (cola serializada anti-spam)
        enqueue(grupoClienteId, async () => {
          const msgOriginal = await client.getMessageById(msgOriginalId);
          if (msgOriginal) {
            await msgOriginal.react(emoji);
            console.log(`[ReactionHandler] Reacción "${emoji}" replicada al cliente para CURP ${curp}.`);
          } else {
            console.warn(`[ReactionHandler] Mensaje original no encontrado para CURP ${curp}.`);
          }
        });
      }
    } catch (err) {
      console.error('[ReactionHandler] Error procesando reacción:', err);
    }
  });
}
