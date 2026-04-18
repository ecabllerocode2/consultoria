# Plan de Desarrollo: Sistema de Automatización de Flujos CURP (V4.0)

> **Estrategia general:** El bot (Worker local) es el núcleo del negocio. La PWA es una herramienta de apoyo. Se desarrolla primero todo lo que permita que el bot opere de forma autónoma y confiable, y la PWA se construye al final sobre la infraestructura ya validada.

---

## Fase 1 — Infraestructura y Configuración Base

**Objetivo:** Tener todos los servicios en la nube configurados y listos antes de escribir una sola línea de lógica de negocio.

### Tareas

1. **Firebase**
   - Crear proyecto en Firebase Console.
   - Habilitar **Firestore** en modo producción con las siguientes colecciones iniciales:
     - `solicitudes` (vacía, con índices sobre `status` y `updatedAt`).
     - `configuracion` (documento único con campos: `gruposClientes`, `grupoAsesores`, `botStatus`, `lastHeartbeat`).
   - Habilitar **Firebase Auth** (proveedor Email/Password para acceso a la PWA en fases futuras).
   - Generar **cuenta de servicio** (JSON) para uso exclusivo del bot desde Node.js (Admin SDK).
   - Habilitar **Firebase Cloud Messaging (FCM)** y obtener la clave del servidor.

2. **Cloudflare R2**
   - Crear cuenta en Cloudflare y habilitar R2 (capa gratuita: 10 GB).
   - Crear bucket `curp-pdfs`.
   - Generar **Access Key ID** y **Secret Access Key** para la API S3 compatible.
   - Anotar el endpoint del bucket.

3. **Repositorio**
   - Crear repositorio en GitHub con estructura monorepo:
     ```
     /
     ├── bot/          ← Worker local Node.js
     ├── pwa/          ← React app (se aborda en Fase 6)
     └── .env.example  ← Variables de entorno documentadas
     ```
   - Crear archivo `.env.example` con todas las variables requeridas sin valores:
     ```
     FIREBASE_PROJECT_ID=
     FIREBASE_SERVICE_ACCOUNT_JSON=
     R2_ENDPOINT=
     R2_ACCESS_KEY_ID=
     R2_SECRET_ACCESS_KEY=
     R2_BUCKET_NAME=
     FCM_SERVER_KEY=
     FCM_DEVICE_TOKEN=
     ```

### Entregable
- Firebase operativo con reglas de seguridad básicas.
- Bucket R2 creado y credenciales verificadas.
- Repositorio con estructura definida y `.env.example` documentado.

---

## Fase 2 — Bot: Núcleo de Conexión y Detección de CURPs

**Objetivo:** El bot se conecta a WhatsApp, escucha los grupos configurados y detecta CURPs, creando registros en Firestore.

### Tareas

1. **Setup del proyecto `bot/`**
   - Inicializar proyecto Node.js (`package.json`).
   - Instalar dependencias:
     - `whatsapp-web.js` — motor de automatización WhatsApp.
     - `qrcode-terminal` — mostrar QR en consola para autenticación inicial.
     - `firebase-admin` — SDK Admin para Firestore.
     - `dotenv` — gestión de variables de entorno.
   - Configurar `LocalAuth` de whatsapp-web.js para persistir la sesión en disco y evitar escanear QR en cada reinicio.

2. **Módulo de conexión WhatsApp (`src/client.js`)**
   - Inicializar cliente con `LocalAuth`.
   - Manejar eventos:
     - `qr` → mostrar QR en terminal.
     - `ready` → loggear confirmación y actualizar `botStatus: true` en Firestore.
     - `disconnected` → loggear y actualizar `botStatus: false` en Firestore.

3. **Módulo de configuración dinámica (`src/config.js`)**
   - Escuchar en tiempo real el documento `configuracion` de Firestore con `onSnapshot`.
   - Exportar siempre los valores actuales de `gruposClientes` y `grupoAsesores`.
   - Esto permite cambiar grupos desde Firestore sin reiniciar el bot.

4. **Módulo de detección de CURPs (`src/curpHandler.js`)**
   - Escuchar el evento `message` del cliente WhatsApp.
   - Filtrar: solo mensajes provenientes de los grupos en `gruposClientes`.
   - Aplicar Regex: `/[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/g`
   - Por cada CURP encontrada:
     - Normalizar: `.toUpperCase().trim()`.
     - Crear o actualizar documento en `solicitudes/{CURP}` con:
       - `curp`, `grupoClienteId`, `msgOriginalId`, `status: 'pendiente'`, `esperandoPdf: false`, `updatedAt`.
     - Enviar mensaje al `grupoAsesores` con el texto de la CURP.
     - Guardar el `msgAsesorId` retornado en el documento Firestore.

### Entregable
- El bot se autentica, persiste sesión y se reconecta automáticamente.
- Al recibir un mensaje con CURP en un grupo de clientes, crea el registro en Firestore y notifica al grupo de asesores.
- La lista de grupos se puede actualizar en Firestore sin reiniciar el bot.

---

## Fase 3 — Bot: Gestión de Reacciones

**Objetivo:** El bot interpreta las reacciones de los asesores y las replica selectivamente en el grupo del cliente.

### Tareas

1. **Módulo de reacciones (`src/reactionHandler.js`)**
   - Escuchar el evento `message_reaction` del cliente WhatsApp.
   - Filtrar: solo reacciones en mensajes dentro del `grupoAsesores`.
   - Para cada reacción recibida, buscar en Firestore el documento cuyo `msgAsesorId` coincida con el mensaje reaccionado.
   - **Lógica condicional:**
     - **Reacción `✅`:**
       - Actualizar `esperandoPdf: true` en Firestore.
       - Actualizar `ultimaReaccion: '✅'`.
       - **NO** replicar nada en el grupo del cliente.
     - **Cualquier otra reacción (`⚠️`, `🔓`, `❌`, `💤`):**
       - Actualizar `ultimaReaccion` y `esperandoPdf: false`.
       - Replicar la reacción en el `msgOriginalId` del grupo del cliente.
     - **Caso especial — cambio desde `✅`:** Si el documento tenía `esperandoPdf: true` y llega una nueva reacción distinta de `✅`, ejecutar igualmente la replicación al cliente.

2. **Delay anti-ban para reacciones**
   - Antes de cada acción sobre WhatsApp, aplicar un delay aleatorio de **2 a 5 segundos** usando una función utilitaria `randomDelay(min, max)` en `src/utils.js`.

### Entregable
- Las reacciones de asesores se procesan correctamente según la lógica condicional.
- El estado en Firestore refleja siempre la última reacción y el flag `esperandoPdf`.

---

## Fase 4 — Bot: Procesamiento de PDFs

**Objetivo:** El bot recibe PDFs en el grupo de asesores, los almacena en R2 y los entrega al cliente correcto.

### Tareas

1. **Módulo R2 (`src/r2Client.js`)**
   - Configurar cliente S3 con `@aws-sdk/client-s3` usando las credenciales de Cloudflare R2.
   - Exportar función `uploadPdf(buffer, curp)` que sube el archivo con clave `{CURP}/{timestamp}.pdf` y retorna la URL.

2. **Módulo de procesamiento de PDFs (`src/pdfHandler.js`)**
   - Escuchar el evento `message` filtrando: mensajes de tipo `document` en `grupoAsesores`.
   - Extraer la CURP del `caption` del mensaje mediante la misma Regex.
   - Buscar el documento correspondiente en Firestore usando la CURP.
   - Si `esperandoPdf === true`:
     - Descargar el archivo del mensaje (`message.downloadMedia()`).
     - Subir a R2 con `uploadPdf()`.
     - Reenviar el archivo al `grupoClienteId` con la CURP en el caption.
     - Aplicar delay anti-ban de **5 a 10 segundos** antes del envío.
     - Tras confirmar entrega: reaccionar con `✅` al `msgOriginalId` del cliente.
     - Actualizar Firestore: `status: 'completado'`, `esperandoPdf: false`, `updatedAt`.
   - Si `esperandoPdf === false`: loggear advertencia y no procesar.

### Entregable
- PDFs enviados por asesores son automáticamente entregados al grupo cliente correcto.
- El PDF queda respaldado en Cloudflare R2.
- El estado del trámite se actualiza a `completado`.

---

## Fase 5 — Bot: Resiliencia y Sistema de Heartbeat

**Objetivo:** El bot nunca pierde trámites por reinicios y alerta proactivamente si cae.

### Tareas

1. **Heartbeat (`src/heartbeat.js`)**
   - Cada **60 segundos**, actualizar el campo `lastHeartbeat` en el documento `configuracion` de Firestore con el timestamp actual.
   - Al iniciar el bot, actualizar `botStatus: true`.
   - Al detectar desconexión, actualizar `botStatus: false`.

2. **Monitor de heartbeat para notificaciones push**
   - Implementar un **Cloud Function de Firebase** (o un proceso secundario liviano si se prefiere evitar Cloud Functions):
     - Revisar `lastHeartbeat` periódicamente.
     - Si `now - lastHeartbeat > 3 minutos`: enviar notificación push FCM al token del dispositivo registrado con el mensaje: *"⚠️ ALERTA: El Bot de WhatsApp está fuera de línea. Revisa la conexión o inicia proceso manual."*
   - Guardar el `FCM_DEVICE_TOKEN` en la colección `configuracion` para que sea configurable.

3. **Persistencia en reinicios (`src/recovery.js`)**
   - Al iniciar el bot (evento `ready`), consultar en Firestore todas las solicitudes con `status: 'pendiente'` o `status: 'revision'`.
   - Para cada una: reactivar el seguimiento de reacciones en memoria (cargar `msgAsesorId` al estado interno del bot).
   - Loggear cuántos trámites pendientes se recuperaron.

4. **Manejo de historial en reconexión**
   - Al reconectarse tras una caída, procesar los mensajes no leídos del grupo de asesores para detectar PDFs que llegaron durante el apagón.

### Entregable
- El bot es tolerante a reinicios: retoma el estado de trámites pendientes.
- Las alertas push se disparan automáticamente si el bot deja de latir por más de 3 minutos.

---

## Fase 6 — PWA: Dashboard de Monitoreo

**Objetivo:** Construir la interfaz visual sobre la infraestructura ya validada por el bot.

> Esta fase se aborda únicamente cuando las Fases 1–5 estén en producción y operativas.

### Tareas

1. **Setup del proyecto `pwa/`**
   - Crear app con Vite + React + Tailwind CSS.
   - Instalar Firebase SDK (Firestore, Auth, FCM).
   - Configurar despliegue en **Vercel** (conexión con repositorio GitHub).

2. **Autenticación**
   - Pantalla de login con Firebase Auth (Email/Password).
   - Proteger todas las rutas con guard de autenticación.

3. **Módulo: Gestor de Grupos**
   - Lectura y escritura del documento `configuracion` en Firestore.
   - UI para añadir/quitar IDs de grupos de la lista `gruposClientes`.
   - Campo para actualizar el ID del `grupoAsesores`.

4. **Módulo: Monitor de Trámites**
   - Tabla en tiempo real con `onSnapshot` sobre la colección `solicitudes`.
   - Columnas: CURP, Grupo Cliente, Estado, Última Reacción, Última Actualización.
   - Filtros por `status`: pendiente / revision / error / completado.

5. **Módulo: Carga de Emergencia**
   - Selector de CURP (lista de solicitudes con `esperandoPdf: true`).
   - Uploader de PDF que sube directamente a R2 y actualiza Firestore.
   - Permite operación manual cuando el bot está caído.

6. **Módulo: Logs de Actividad**
   - Visualización de los últimos eventos registrados.
   - Indicador de estado del bot (verde/rojo según `botStatus` y `lastHeartbeat`).

7. **Notificaciones Push (FCM en PWA)**
   - Solicitar permiso de notificaciones al usuario al iniciar sesión.
   - Registrar el `FCM_DEVICE_TOKEN` en Firestore (`configuracion`).
   - Configurar el Service Worker para recibir mensajes push en background.

### Entregable
- PWA desplegada en Vercel con autenticación.
- Dashboard funcional con datos en tiempo real.
- Notificaciones push operativas en el navegador/dispositivo del operador.

---

## Resumen de Fases y Dependencias

| Fase | Nombre | Depende de | Prioridad |
|------|--------|-----------|-----------|
| 1 | Infraestructura y Config Base | — | Crítica |
| 2 | Bot: Detección de CURPs | Fase 1 | Crítica |
| 3 | Bot: Gestión de Reacciones | Fase 2 | Alta |
| 4 | Bot: Procesamiento de PDFs | Fase 3 | Alta |
| 5 | Bot: Resiliencia y Heartbeat | Fase 4 | Alta |
| 6 | PWA Dashboard | Fases 1–5 operativas | Normal |

---

## Variables de Entorno Requeridas (`.env`)

```env
# Firebase Admin SDK
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=   # Ruta al archivo JSON de cuenta de servicio

# Cloudflare R2
R2_ENDPOINT=                     # https://<account_id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=curp-pdfs

# Firebase Cloud Messaging
FCM_SERVER_KEY=                  # Para envío de notificaciones desde el bot/función
```

---

## Criterios de Éxito por Fase

- **Fase 2:** Un mensaje con CURP en un grupo de clientes genera un registro en Firestore y un mensaje en el grupo de asesores en menos de 3 segundos.
- **Fase 3:** Una reacción de asesor se refleja (o no, según la lógica) en el grupo del cliente dentro de los delays anti-ban configurados.
- **Fase 4:** Un PDF enviado por un asesor llega al grupo del cliente correcto y el trámite queda marcado como `completado` en Firestore.
- **Fase 5:** Al reiniciar el bot, los trámites pendientes se recuperan automáticamente. Si el bot cae más de 3 minutos, llega una notificación push al dispositivo.
- **Fase 6:** El dashboard muestra el estado en tiempo real y permite operar manualmente en caso de fallo del bot.
