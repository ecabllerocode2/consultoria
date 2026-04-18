/**
 * Espera un tiempo aleatorio entre min y max milisegundos.
 * Usar antes de cada acción sobre WhatsApp para reducir riesgo de ban.
 */
export function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Regex oficial para validar CURPs mexicanas. */
export const CURP_REGEX = /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/g;

/**
 * Extrae y normaliza todas las CURPs encontradas en un texto.
 * Retorna un array deduplicado en mayúsculas.
 */
export function extractCurps(text) {
  const matches = text.toUpperCase().trim().match(CURP_REGEX);
  if (!matches) return [];
  return [...new Set(matches)];
}
