import 'dotenv/config';
import { client, initQrListener } from './client.js';
import { initConfig } from './config.js';
import { initCurpHandler } from './curpHandler.js';
import { initReactionHandler } from './reactionHandler.js';
import { initPdfHandler } from './pdfHandler.js';
import { setWhatsappClient } from './fcm.js';

console.log('[Bot] Iniciando sistema CURP...');

// Inyectar cliente en fcm.js para envíos de notificación por WhatsApp
setWhatsappClient(client);

// 1. Escuchar configuración dinámica desde Firestore
initConfig();

// 2. Listener persistente de Firestore para QR y comandos (reiniciar, código por teléfono)
initQrListener();

// 3. Registrar handler de detección de CURPs
initCurpHandler();

// 4. Registrar handler de reacciones
initReactionHandler();

// 5. Registrar handler de PDFs
initPdfHandler();

// 6. Conectar con WhatsApp (mostrará QR en terminal si no hay sesión)
client.initialize();
