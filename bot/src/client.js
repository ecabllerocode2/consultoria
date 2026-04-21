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

// Indica si el cliente está actualmente mostrando un QR (esperando escaneo)
let inQrState = false;

// ─────────────────────────────────────────────
// Listener persistente: siempre activo, maneja:
//   • pairingCodeRequest  → genera código por teléfono
//   • reiniciarQR         → hace logout + reconexión (nuevo QR)
// ─────────────────────────────────────────────
export function initQrListener() {
  return qrRef.onSnapshot(async (snap) => {
    const data = snap.data();
    if (!data) return;

    // ── Señal de reinicio ──────────────────────────────────────────
    if (data.reiniciarQR === true) {
      console.log('[WhatsApp] Señal de reinicio recibida. Desvinculando...');
      await qrRef.set({ reiniciarQR: false }, { merge: true }).catch(() => {});
      inQrState = false;
      try {
        await client.logout();
      } catch {
        // logout puede fallar si ya está desconectado — forzar reinicialización
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => client.initialize().catch(() => {}), 3_000);
      }
      return;
    }

    // ── Solicitud de código por teléfono ──────────────────────────
    if (data.pairingCodeRequest) {
      if (!inQrState) {
        console.log('[WhatsApp] Solicitud de código ignorada — no estamos en estado QR.');
        // Limpiar para no quedar en estado inconsistente
        await qrRef.set({ pairingCodeRequest: null, pairingCodeError: 'El bot no está mostrando un QR. Usa el botón Reiniciar primero.' }, { merge: true }).catch(() => {});
        return;
      }
      const phone = data.pairingCodeRequest;
      await qrRef.set({ pairingCodeRequest: null }, { merge: true }).catch(() => {});

      try {
        console.log(`[WhatsApp] Generando código de emparejamiento para ${phone}…`);
        const code = await client.requestPairingCode(phone);
        const formatted = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
        await qrRef.set({ pairingCode: formatted, pairingCodeError: null }, { merge: true });
        console.log(`[WhatsApp] Código generado: ${formatted}`);
        // Después de requestPairingCode, WhatsApp Web cambia a modo teléfono.
        // Marcamos que ya no estamos en modo QR para evitar confusión.
        inQrState = false;
      } catch (err) {
        console.error('[WhatsApp] Error generando pairing code:', err.message);
        await qrRef.set({ pairingCode: null, pairingCodeError: err.message }, { merge: true }).catch(() => {});
      }
    }
  });
}

client.on('qr', async (qr) => {
  inQrState = true;
  console.log('\n[WhatsApp] Escanea el código QR con tu teléfono:\n');
  qrcode.generate(qr, { small: true });

  try {
    // width=400 y margin=4 para mayor fiabilidad al escanear desde pantalla
    const dataUrl = await QRCode.toDataURL(qr, { width: 400, margin: 4, errorCorrectionLevel: 'M' });
    await qrRef.set({
      dataUrl,
      createdAt: new Date().toISOString(),
      paired: false,
      pairingCode: null,
      pairingCodeError: null,
      reiniciarQR: false,
    });
    console.log('[WhatsApp] QR guardado en Firestore — disponible en la PWA.');
  } catch (err) {
    console.error('[WhatsApp] Error guardando QR en Firestore:', err.message);
  }
});

client.on('ready', async () => {
  inQrState = false;
  console.log('[WhatsApp] ✅ Bot conectado y listo.');
  if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }

  await qrRef.set({ dataUrl: null, paired: true }).catch(() => {});
  await configRef.set({ botStatus: true }, { merge: true });
  startHeartbeat();

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
  inQrState = false;
  console.warn('[WhatsApp] ⚠️ Desconectado. Razón:', reason);
  stopHeartbeat();
  await configRef.set({ botStatus: false }, { merge: true }).catch(() => {});
  await sendNotification(
    '⚠️ Bot de WhatsApp desconectado',
    `Razón: ${reason}. Revisa la conexión o inicia gestión manual.`
  );
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(() => {
    console.log('[WhatsApp] Intentando reconexión automática...');
    client.initialize().catch((err) =>
      console.error('[WhatsApp] Error en reconexión:', err.message)
    );
  }, 15_000);
});


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
let pairingCodeUnsubscribe = null;

client.on('qr', async (qr) => {
  console.log('\n[WhatsApp] Escanea el código QR con tu teléfono:\n');
  qrcode.generate(qr, { small: true });

  // Guardar QR como imagen base64 en Firestore para la PWA
  try {
    const dataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
    await qrRef.set({ dataUrl, createdAt: new Date().toISOString(), paired: false, pairingCode: null, pairingCodeError: null });
    console.log('[WhatsApp] QR guardado en Firestore — disponible en la PWA.');
  } catch (err) {
    console.error('[WhatsApp] Error guardando QR en Firestore:', err.message);
  }

  // Limpiar listener anterior si el QR se regeneró
  if (pairingCodeUnsubscribe) { pairingCodeUnsubscribe(); pairingCodeUnsubscribe = null; }

  // Escuchar solicitudes de código de emparejamiento por número de teléfono
  pairingCodeUnsubscribe = qrRef.onSnapshot(async (snap) => {
    const data = snap.data();
    if (!data?.pairingCodeRequest) return;

    const phone = data.pairingCodeRequest;
    // Limpiar la solicitud de inmediato para no reprocesar
    await qrRef.set({ pairingCodeRequest: null }, { merge: true }).catch(() => {});

    try {
      console.log(`[WhatsApp] Generando código de emparejamiento para ${phone}…`);
      const code = await client.requestPairingCode(phone);
      // Formatear como XXXX-XXXX si tiene 8 chars
      const formatted = code.length === 8
        ? code.slice(0, 4) + '-' + code.slice(4)
        : code;
      await qrRef.set({ pairingCode: formatted, pairingCodeError: null }, { merge: true });
      console.log(`[WhatsApp] Código de emparejamiento generado: ${formatted}`);
    } catch (err) {
      console.error('[WhatsApp] Error generando pairing code:', err.message);
      await qrRef.set({ pairingCode: null, pairingCodeError: err.message }, { merge: true }).catch(() => {});
    }
  });
});

client.on('ready', async () => {
  console.log('[WhatsApp] ✅ Bot conectado y listo.');
  if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
  if (pairingCodeUnsubscribe) { pairingCodeUnsubscribe(); pairingCodeUnsubscribe = null; }

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
