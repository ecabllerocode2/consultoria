import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
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
let reconnectTimeout = null;

client.on('qr', (qr) => {
  console.log('\n[WhatsApp] Escanea el código QR con tu teléfono:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('[WhatsApp] ✅ Bot conectado y listo.');
  if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
  await configRef.set({ botStatus: true }, { merge: true });
  startHeartbeat();
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
