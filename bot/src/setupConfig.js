/**
 * Script utilitario — configura los grupos en Firestore.
 * Ejecutar UNA SOLA VEZ.
 * Uso: node src/setupConfig.js
 */
import 'dotenv/config';
import { db } from './firebase.js';

const config = {
  gruposClientes: [
    '120363427117043968@g.us', // Clientes prueba 2
    '120363424837167409@g.us', // Clientes prueba
  ],
  grupoAsesores: '120363424689195333@g.us', // Asesores prueba
  botStatus: false,
  lastHeartbeat: null,
};

await db.collection('configuracion').doc('config').set(config);
console.log('✅ Configuración guardada en Firestore:', config);
process.exit(0);
