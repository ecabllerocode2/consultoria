import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase.js';

export default function GestorGrupos() {
  const [config, setConfig] = useState(null);
  const [nuevoCliente, setNuevoCliente] = useState('');
  const [nuevoAsesor, setNuevoAsesor] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ref = doc(db, 'configuracion', 'config');
    return onSnapshot(ref, (snap) => setConfig(snap.data() ?? {}));
  }, []);

  async function agregarCliente() {
    if (!nuevoCliente.trim()) return;
    setSaving(true);
    await updateDoc(doc(db, 'configuracion', 'config'), {
      gruposClientes: arrayUnion(nuevoCliente.trim()),
    });
    setNuevoCliente('');
    setSaving(false);
  }

  async function quitarCliente(id) {
    await updateDoc(doc(db, 'configuracion', 'config'), {
      gruposClientes: arrayRemove(id),
    });
  }

  async function guardarAsesor() {
    if (!nuevoAsesor.trim()) return;
    setSaving(true);
    await updateDoc(doc(db, 'configuracion', 'config'), {
      grupoAsesores: nuevoAsesor.trim(),
    });
    setNuevoAsesor('');
    setSaving(false);
  }

  if (!config) return <p className="text-gray-400">Cargando configuración...</p>;

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-xl font-bold">Gestor de Grupos</h2>

      {/* Grupo de asesores */}
      <section className="bg-gray-900 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-gray-200">Grupo de Asesores</h3>
        <p className="text-sm text-gray-400 font-mono bg-gray-800 px-3 py-2 rounded-lg">
          {config.grupoAsesores || <span className="text-yellow-400">Sin configurar</span>}
        </p>
        <div className="flex gap-2">
          <input
            value={nuevoAsesor}
            onChange={(e) => setNuevoAsesor(e.target.value)}
            placeholder="ID del grupo (ej: 120363...@g.us)"
            className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={guardarAsesor}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            Guardar
          </button>
        </div>
      </section>

      {/* Grupos de clientes */}
      <section className="bg-gray-900 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-gray-200">Grupos de Clientes</h3>
        <ul className="space-y-2">
          {(config.gruposClientes ?? []).map((id) => (
            <li key={id} className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded-lg">
              <span className="text-sm font-mono text-gray-300">{id}</span>
              <button
                onClick={() => quitarCliente(id)}
                className="text-red-400 hover:text-red-300 text-sm transition"
              >
                Quitar
              </button>
            </li>
          ))}
          {(config.gruposClientes ?? []).length === 0 && (
            <p className="text-sm text-gray-500">Sin grupos configurados.</p>
          )}
        </ul>
        <div className="flex gap-2">
          <input
            value={nuevoCliente}
            onChange={(e) => setNuevoCliente(e.target.value)}
            placeholder="ID del grupo cliente"
            className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={agregarCliente}
            disabled={saving}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            Agregar
          </button>
        </div>
      </section>
    </div>
  );
}
