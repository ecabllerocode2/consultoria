import { db } from './firebase.js';

// Estado en memoria — se actualiza via onSnapshot
const state = {
  gruposClientes: [],
  grupoAsesores: null,
};

/**
 * Inicia la escucha en tiempo real del documento de configuración.
 * Cualquier cambio en Firestore se refleja inmediatamente en `state`
 * sin necesidad de reiniciar el bot.
 */
export function initConfig() {
  const docRef = db.collection('configuracion').doc('config');

  docRef.onSnapshot((snap) => {
    if (!snap.exists) {
      console.warn('[Config] Documento "configuracion/config" no existe en Firestore. Créalo manualmente.');
      return;
    }

    const data = snap.data();
    state.gruposClientes = data.gruposClientes ?? [];
    state.grupoAsesores = data.grupoAsesores ?? null;

    console.log(`[Config] Actualizado — gruposClientes: ${state.gruposClientes.length} grupo(s), grupoAsesores: ${state.grupoAsesores}`);
  }, (err) => {
    console.error('[Config] Error al escuchar configuración:', err);
  });
}

/** Retorna la lista actualizada de grupos de clientes. */
export function getGruposClientes() {
  return state.gruposClientes;
}

/** Retorna el ID del grupo de asesores. */
export function getGrupoAsesores() {
  return state.grupoAsesores;
}
