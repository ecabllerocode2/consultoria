/**
 * Script utilitario — lista todos los grupos de WhatsApp con sus IDs.
 * Ejecutar UNA SOLA VEZ para obtener los IDs y configurar Firestore.
 * Uso: node src/listGroups.js
 */
import 'dotenv/config';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('ready', async () => {
  console.log('\n=== GRUPOS DE WHATSAPP ===\n');
  const chats = await client.getChats();
  const grupos = chats.filter((c) => c.isGroup);

  if (grupos.length === 0) {
    console.log('No se encontraron grupos.');
  } else {
    grupos.forEach((g) => {
      console.log(`Nombre : ${g.name}`);
      console.log(`ID     : ${g.id._serialized}`);
      console.log('---');
    });
  }

  console.log('\nCopia los IDs que necesites y agrégalos en Firestore.');
  await client.destroy();
  process.exit(0);
});

client.on('auth_failure', () => {
  console.error('Error de autenticación. Borra .wwebjs_auth y vuelve a escanear el QR.');
  process.exit(1);
});

client.initialize();
