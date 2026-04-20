import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase.js';

export default function GestorGrupos() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const ref = doc(db, 'configuracion', 'config');
    return onSnapshot(ref, (snap) => setConfig(snap.data() ?? {}),
      (err) => console.error('[GestorGrupos]', err.message));
  }, []);

  const disponibles = (config?.gruposDisponibles ?? []);
  const clientes = new Set(config?.gruposClientes ?? []);
  const asesorId = config?.grupoAsesores ?? '';

  const filtrados = search.trim()
    ? disponibles.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : disponibles;

  async function toggleCliente(id) {
    setSaving(true);
    const ref = doc(db, 'configuracion', 'config');
    if (clientes.has(id)) {
      await updateDoc(ref, { gruposClientes: arrayRemove(id) });
    } else {
      await updateDoc(ref, { gruposClientes: arrayUnion(id) });
    }
    setSaving(false);
  }

  async function setAsesor(id) {
    setSaving(true);
    await updateDoc(doc(db, 'configuracion', 'config'), { grupoAsesores: id });
    setSaving(false);
  }

  if (!config) return <p className="text-gray-400">Cargando configuración...</p>;

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-xl font-bold">Gestor de Grupos</h2>

      {disponibles.length === 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 text-yellow-300 text-sm">
          El bot aún no ha enviado la lista de grupos. Conecta WhatsApp desde la página
          <strong> Vincular WA</strong> y la lista aparecerá automáticamente.
        </div>
      )}

      {disponibles.length > 0 && (
        <div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Buscar grupo por nombre..."
            className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* Grupo de asesores */}
      <section className="bg-gray-900 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-200">Grupo de Asesores</h3>
          <span className="text-xs text-gray-500">Solo uno</span>
        </div>

        {/* Actual */}
        {asesorId && (
          <div className="flex items-center justify-between bg-indigo-600/20 border border-indigo-500/30 px-3 py-2 rounded-lg">
            <div>
              <p className="text-sm font-medium text-indigo-300">
                {disponibles.find((g) => g.id === asesorId)?.name ?? 'Grupo desconocido'}
              </p>
              <p className="text-xs text-gray-500 font-mono">{asesorId}</p>
            </div>
            <button
              onClick={() => setAsesor('')}
              className="text-red-400 hover:text-red-300 text-xs transition"
            >
              Quitar
            </button>
          </div>
        )}

        {/* Seleccionar de la lista */}
        {filtrados.map((g) => {
          if (g.id === asesorId) return null;
          return (
            <div key={g.id} className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded-lg">
              <div>
                <p className="text-sm text-gray-200">{g.name}</p>
                <p className="text-xs text-gray-600 font-mono">{g.id}</p>
              </div>
              <button
                onClick={() => setAsesor(g.id)}
                disabled={saving}
                className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition"
              >
                Usar como asesor
              </button>
            </div>
          );
        })}
      </section>

      {/* Grupos de clientes */}
      <section className="bg-gray-900 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-200">Grupos de Clientes</h3>
          <span className="text-xs text-gray-500">{clientes.size} activo(s)</span>
        </div>

        {filtrados.map((g) => {
          const activo = clientes.has(g.id);
          return (
            <div key={g.id}
              className={`flex items-center justify-between px-3 py-2 rounded-lg transition ${
                activo ? 'bg-green-600/20 border border-green-500/30' : 'bg-gray-800'
              }`}>
              <div>
                <p className={`text-sm font-medium ${activo ? 'text-green-300' : 'text-gray-300'}`}>
                  {g.name}
                </p>
                <p className="text-xs text-gray-600 font-mono">{g.id}</p>
              </div>
              <button
                onClick={() => toggleCliente(g.id)}
                disabled={saving}
                className={`text-xs font-medium disabled:opacity-50 transition ${
                  activo
                    ? 'text-red-400 hover:text-red-300'
                    : 'text-green-400 hover:text-green-300'
                }`}
              >
                {activo ? 'Quitar' : 'Agregar'}
              </button>
            </div>
          );
        })}

        {filtrados.length === 0 && (
          <p className="text-sm text-gray-500">
            {search ? 'Sin resultados para esa búsqueda.' : 'Sin grupos disponibles.'}
          </p>
        )}
      </section>
    </div>
  );
}

