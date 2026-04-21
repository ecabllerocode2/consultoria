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

        // Reintentar hasta 3 veces: "Target closed" ocurre cuando la página
        // de WhatsApp Web recarga el QR justo al momento de la solicitud.
        let code;
        for (let intento = 1; intento <= 3; intento++) {
          try {
            // Definir onCodeReceivedEvent en el contexto de la página si aún no existe.
            // wweb.js 1.34+ la necesita para devolver el código via evaluate().
            await client.pupPage.evaluate(() => {
              if (typeof window.onCodeReceivedEvent !== 'function') {
                window.onCodeReceivedEvent = (c) => c;
              }
            });
            code = await client.requestPairingCode(phone);
            break; // éxito — salir del loop
          } catch (err) {
            const esTargetClosed = err.message.includes('Target closed') || err.message.includes('Session closed') || err.message.includes('Execution context was destroyed') || err.message.includes('detached frame') || err.message.includes('Detached');
            if (intento < 3 && esTargetClosed) {
              console.log(`[WhatsApp] Reintento ${intento}/3 — página recargando, esperando 3s…`);
              await new Promise(r => setTimeout(r, 3000));
            } else {
              throw err; // último intento o error desconocido
            }
          }
        }

        console.log(`[WhatsApp] requestPairingCode retornó:`, JSON.stringify(code));
        if (!code) throw new Error('El código retornado está vacío');

        const str = String(code).trim();
        const formatted = str.length === 8 ? `${str.slice(0, 4)}-${str.slice(4)}` : str;
        await qrRef.set({ pairingCode: formatted, pairingCodeError: null }, { merge: true });
        console.log(`[WhatsApp] ✅ Código guardado en Firestore: ${formatted}`);
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
    // Guardar el string crudo PRIMERO para que la PWA lo reciba lo antes posible.
    // La PWA renderiza el QR localmente desde qrString (sin depender del dataUrl).
    await qrRef.set({
      qrString: qr,
      dataUrl: null,
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

