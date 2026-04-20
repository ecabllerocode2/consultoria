import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { db } from './firebase.js';
import { sendNotification } from './fcm.js';
import { startHeartbeat, stopHeartbeat } from './heartbeat.js';
import { recoverPendingSolicitudes } from './recovery.js';

export const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

const configRef = db.collection('configuracion').doc('config');
const qrRef = db.collection('configuracion').doc('qr');
let reconnectTimeout = null;

client.on('qr', async (qr) => {
  console.log('\n[WhatsApp] Escanea el código QR con tu teléfono:\n');
  qrcode.generate(qr, { small: true });

  // Guardar QR como imagen base64 en Firestore para la PWA
  try {
    const dataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
    await qrRef.set({ dataUrl, createdAt: new Date().toISOString(), paired: false });
    console.log('[WhatsApp] QR guardado en Firestore — disponible en la PWA.');
  } catch (err) {
    console.error('[WhatsApp] Error guardando QR en Firestore:', err.message);
  }
});

client.on('ready', async () => {
  console.log('[WhatsApp] ✅ Bot conectado y listo.');
  if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }

  // Limpiar QR de Firestore y marcar como vinculado
  await qrRef.set({ dataUrl: null, paired: true }).catch(() => {});

  await configRef.set({ botStatus: true }, { merge: true });
  startHeartbeat();

  // Guardar lista de grupos disponibles en Firestore para el GestorGrupos
  try {
    const chats = await client.getChats();
    const grupos = chats
      .filter((c) => c.isGroup)
      .map((c) => ({ id: c.id._serialized, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    await configRef.set({ gruposDisponibles: grupos }, { merge: true });
    console.log(`[WhatsApp] ${grupos.length} grupos guardados en Firestore.`);
  } catch (err) {
    console.error('[WhatsApp] Error obteniendo grupos:', err.message);
  }

  await recoverPendingSolicitudes();
});

client.on('authenticated', () => {
  console.log('[WhatsApp] Sesión autenticada correctamente.');
});

client.on('auth_failure', (msg) => {
  console.error('[WhatsApp] ❌ Fallo de autenticación:', msg);
});

client.on('disconnected', async (reason) => {
  console.warn('[WhatsApp] ⚠️ Desconectado. Razón:', reason);
  stopHeartbeat();
  await configRef.set({ botStatus: false }, { merge: true }).catch(() => {});
  await sendNotification(
    '⚠️ Bot de WhatsApp desconectado',
    `Razón: ${reason}. Revisa la conexión o inicia gestión manual.`
  );
  // Reconexión automática tras 15 segundos
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(() => {
    console.log('[WhatsApp] Intentando reconexión automática...');
    client.initialize().catch((err) =>
      console.error('[WhatsApp] Error en reconexión:', err.message)
    );
  }, 15_000);
});
