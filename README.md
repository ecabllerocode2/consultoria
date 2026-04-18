Este es el documento técnico definitivo de especificaciones para el equipo de desarrollo. Está diseñado para ser una "hoja de ruta" de misión crítica, priorizando la resiliencia del sistema y la transparencia total mediante alertas en tiempo real.
# Especificación Técnica: Sistema de Automatización de Flujos CURP (V4.0 - Resiliente)
## 1. Resumen Ejecutivo
Desarrollo de un ecosistema compuesto por una **PWA de monitoreo** y un **Worker local de automatización** para actuar como intermediario inteligente entre grupos de WhatsApp de clientes y asesores. El sistema debe operar con costo $0 USD utilizando capas gratuitas de servicios en la nube.
## 2. Stack Tecnológico (Obligatorio)
 * **Frontend:** React (Vite) + Tailwind CSS + Firebase SDK.
 * **Despliegue Web:** Vercel.
 * **Base de Datos:** Firestore (Modo Datastore/Real-time).
 * **Almacenamiento:** Cloudflare R2 (S3 API Compatible).
 * **Autenticación:** Firebase Auth.
 * **Motor de Automatización:** Node.js + whatsapp-web.js.
 * **Notificaciones:** Firebase Cloud Messaging (FCM).
## 3. Arquitectura de Datos en Firestore
### Colección: solicitudes (ID del documento = CURP)
 * curp: String (Normalizada).
 * grupoClienteId: String.
 * msgOriginalId: String.
 * msgAsesorId: String.
 * status: Enum (pendiente, revision, error, completado).
 * esperandoPdf: Boolean.
 * ultimaReaccion: String (Emoji).
 * updatedAt: Timestamp.
### Colección: configuracion
 * gruposClientes: Array de Strings (IDs de WhatsApp).
 * grupoAsesores: String (ID del grupo único).
 * botStatus: Boolean (Estado de salud del script).
 * lastHeartbeat: Timestamp.
## 4. Lógica de Operación del Worker (Bot)
### A. Detección y Propagación
 1. Escuchar mensajes en los grupos de la lista gruposClientes.
 2. Extraer CURPs mediante Regex: /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/g.
 3. Por cada CURP encontrada:
   * Crear/Actualizar registro en Firestore.
   * Enviar mensaje individual al grupoAsesores con la CURP.
   * Almacenar el msgAsesorId retornado para seguimiento de reacciones.
### B. Gestión de Reacciones (Espejo Condicional)
 1. **Si Reacción == ✅:** Marcar esperandoPdf = true. **NO** replicar en el cliente.
 2. **Si Reacción != ✅ (⚠️, 🔓, ❌, 💤):** * Actualizar ultimaReaccion.
   * Marcar esperandoPdf = false.
   * Replicar la reacción inmediatamente en el msgOriginalId del cliente.
   * *Nota:* Si un asesor cambia un ✅ por un ⚠️, el bot debe actualizar el cliente al instante.
### C. Procesamiento de PDFs (Key Matching)
 1. Al recibir un PDF en el grupo de asesores, extraer la CURP del **texto del mensaje** (caption).
 2. Consultar en Firestore los datos de origen usando la CURP como llave.
 3. **Acción:** * Subir PDF a Cloudflare R2.
   * Reenviar al grupo del cliente con la CURP en el texto.
   * Reaccionar con ✅ al mensaje original del cliente tras confirmar la entrega del archivo.
   * Actualizar estado a completado.
## 5. Sistema de Monitor de Vida (Plan de Fallo)
Para garantizar que nunca se pierda un trámite por falta de internet o energía:
### A. El "Heartbeat" (Latido de Corazón)
 * El script local debe actualizar el campo lastHeartbeat en Firestore cada **60 segundos**.
### B. Notificaciones Push (FCM)
 * **PWA:** Debe registrarse para recibir notificaciones push mediante Firebase Cloud Messaging.
 * **Cloud Function (o Monitoreo en PWA):** Si el lastHeartbeat es mayor a 3 minutos, se dispara una notificación push crítica al celular: *"⚠️ ALERTA: El Bot de WhatsApp está fuera de línea. Revisa la conexión o inicia proceso manual."*
## 6. Funcionalidades de la PWA (Dashboard)
 1. **Gestor de Grupos:** Interfaz para añadir/quitar IDs de grupos de WhatsApp de la "Lista de Escucha".
 2. **Monitor de Trámites:** Tabla en tiempo real con filtros por estado.
 3. **Carga de Emergencia:** Botón para subir un PDF manualmente y asociarlo a una CURP pendiente en caso de fallo del bot.
 4. **Logs de Actividad:** Visualización de los últimos movimientos para depuración.
## 7. Robustez y Seguridad
 1. **Anti-Ban:** Implementar un delay aleatorio entre cada acción (2-5 seg para reacciones, 5-10 seg para archivos).
 2. **Normalización:** Todas las CURPs deben pasar por .toUpperCase().trim() antes de ser procesadas.
 3. **Persistencia:** Si el bot se reinicia, debe leer las solicitudes pendientes en Firestore para retomar el monitoreo de reacciones de mensajes antiguos.
 4. **Costo $0:** * **Vercel:** Hosting gratis.
   * **Firestore:** 50k lecturas/20k escrituras diarias gratis.
   * **R2:** 10GB de almacenamiento gratis.
   * **FCM:** Notificaciones push gratuitas ilimitadas.
## 8. Plan de Fallos (Protocolo SOP)
 1. **Fallo de Script:** La PWA notifica al usuario. El usuario puede ver en la PWA qué CURPs han llegado y no han sido atendidas para gestionarlas vía WhatsApp Web manualmente.
 2. **Fallo de Internet:** Al recuperar la conexión, el script escanea los mensajes no leídos (historial) para actualizar Firestore con lo ocurrido durante el apagón.
 3. **Cambio de Grupos:** El usuario actualiza la lista en la PWA; el bot detecta el cambio en Firestore vía onSnapshot y actualiza su escucha sin necesidad de reinicio manual.