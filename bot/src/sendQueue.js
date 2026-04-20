/**
 * Cola de envíos a WhatsApp.
 *
 * Garantiza que nunca se envíen dos mensajes simultáneamente al mismo destino,
 * independientemente de cuántas CURPs lleguen a la vez.
 *
 * Cada envío espera:
 *   - A que el envío anterior termine
 *   - Un delay aleatorio configurable entre mensajes
 *
 * Uso:
 *   import { enqueue } from './sendQueue.js';
 *   const result = await enqueue(() => client.sendMessage(...));
 */

import { randomDelay } from './utils.js';

// Delay entre mensajes enviados al mismo destino (ms)
const MIN_DELAY = 3_000;
const MAX_DELAY = 7_000;

// Una cola por destino (chatId) para no mezclar grupos
const queues = new Map(); // chatId → Promise (tail)

/**
 * Encola una función de envío para el destino dado.
 * @param {string} destId  - ID del grupo/chat destino (para serializar por destino)
 * @param {() => Promise} fn - Función que realiza el envío
 */
export function enqueue(destId, fn) {
  const prev = queues.get(destId) ?? Promise.resolve();

  const next = prev
    .then(() => randomDelay(MIN_DELAY, MAX_DELAY))
    .then(() => fn())
    .catch((err) => {
      console.error(`[SendQueue] Error en envío a ${destId}:`, err.message);
      throw err;
    });

  // Limpiar la referencia cuando termine para no acumular memoria
  queues.set(destId, next.catch(() => {}).then(() => {
    if (queues.get(destId) === next) queues.delete(destId);
  }));

  return next;
}
