import 'dotenv/config';
import { client } from './client.js';
import { initConfig } from './config.js';
import { initCurpHandler } from './curpHandler.js';
import { initReactionHandler } from './reactionHandler.js';
import { initPdfHandler } from './pdfHandler.js';

console.log('[Bot] Iniciando sistema CURP...');

// 1. Escuchar configuración dinámica desde Firestore
initConfig();

// 2. Registrar handler de detección de CURPs
initCurpHandler();

// 3. Registrar handler de reacciones
initReactionHandler();

// 4. Registrar handler de PDFs
initPdfHandler();

// 5. Conectar con WhatsApp (mostrará QR en terminal si no hay sesión)
client.initialize();
