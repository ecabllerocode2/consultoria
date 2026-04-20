import { client } from './client.js';
import { db } from './firebase.js';
import { getGrupoAsesores } from './config.js';
import { extractCurps, randomDelay } from './utils.js';
import { uploadPdf } from './r2Client.js';
import { cancelPdfWatch } from './watchdog.js';
import { enqueue } from './sendQueue.js';
import { FieldValue } from 'firebase-admin/firestore';
import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;

export function initPdfHandler() {
  client.on('message', async (msg) => {
    try {
      // Solo documentos en el grupo de asesores
      if (msg.fromMe) return;                    // ignorar mensajes propios
      const grupoAsesores = getGrupoAsesores();
      if (!grupoAsesores) return;
      if (msg.from !== grupoAsesores) return;
      if (msg.type !== 'document') return;

      // Extraer CURP del caption del mensaje
      const caption = msg.body ?? '';
      const curps = extractCurps(caption);

      if (curps.length === 0) {
        console.warn('[PdfHandler] PDF recibido sin CURP en el caption, ignorando.');
        return;
      }

      const curp = curps[0];
      console.log(`[PdfHandler] PDF recibido para CURP: ${curp}`);

      // Buscar solicitud en Firestore
      const docRef = db.collection('solicitudes').doc(curp);
      const snap = await docRef.get();

      if (!snap.exists) {
        console.warn(`[PdfHandler] No existe solicitud para CURP ${curp}.`);
        return;
      }

      const data = snap.data();

      if (!data.esperandoPdf) {
        console.warn(`[PdfHandler] CURP ${curp} no está en espera de PDF, ignorando.`);
        return;
      }

      const { grupoClienteId, msgOriginalId } = data;

      // Descargar el archivo
      const media = await msg.downloadMedia();
      if (!media) {
        console.error(`[PdfHandler] No se pudo descargar el PDF para CURP ${curp}.`);
        return;
      }

      // Subir a Cloudflare R2
      const buffer = Buffer.from(media.data, 'base64');
      const publicUrl = await uploadPdf(buffer, curp);

      // Envío encolado al grupo del cliente con delay anti-spam
      const mediaToSend = new MessageMedia(media.mimetype, media.data, `${curp}.pdf`);
      await enqueue(grupoClienteId, () =>
        client.sendMessage(grupoClienteId, mediaToSend, { caption: curp })
      );
      console.log(`[PdfHandler] PDF enviado al grupo del cliente para CURP ${curp}.`);

      // Delay antes de reaccionar al mensaje original del cliente
      await randomDelay(2000, 4000);

      // Reaccionar con ✅ al mensaje original del cliente
      const msgOriginal = await client.getMessageById(msgOriginalId);
      if (msgOriginal) {
        await msgOriginal.react('✅');
        console.log(`[PdfHandler] ✅ reaccionado al mensaje original del cliente para CURP ${curp}.`);
      } else {
        console.warn(`[PdfHandler] Mensaje original no encontrado para CURP ${curp}.`);
      }

      // Actualizar estado en Firestore
      await docRef.update({
        status: 'completado',
        esperandoPdf: false,
        ultimaReaccion: '✅',
        r2Url: publicUrl,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // PDF recibido — cancelar el temporizador de "sin PDF"
      cancelPdfWatch(curp);

      console.log(`[PdfHandler] CURP ${curp} marcada como completada.`);
    } catch (err) {
      console.error('[PdfHandler] Error procesando PDF:', err);
    }
  });
}
