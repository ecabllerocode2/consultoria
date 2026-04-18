import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../firebase.js';

const STATUS_ICON = {
  pendiente:  '🟡',
  revision:   '🔵',
  completado: '🟢',
  error:      '🔴',
};

export default function Logs() {
  const [eventos, setEventos] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, 'solicitudes'),
      orderBy('updatedAt', 'desc'),
      limit(50)
    );
    return onSnapshot(
      q,
      (snap) => setEventos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[Firestore] logs:', err.message)
    );
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Logs de Actividad</h2>
      <p className="text-gray-500 text-sm">Últimos 50 trámites actualizados.</p>

      <div className="space-y-2">
        {eventos.map((e) => (
          <div key={e.id} className="bg-gray-900 rounded-lg px-4 py-3 flex items-start gap-3">
            <span className="text-lg mt-0.5">{STATUS_ICON[e.status] ?? '⚪'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm text-white">{e.curp}</span>
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{e.status}</span>
                {e.ultimaReaccion && <span className="text-base">{e.ultimaReaccion}</span>}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Grupo cliente: <span className="text-gray-400 font-mono">{e.grupoClienteId}</span>
              </p>
              {e.r2Url && (
                <a href={e.r2Url} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:underline">
                  Ver PDF en R2
                </a>
              )}
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">
              {e.updatedAt?.toDate().toLocaleTimeString('es-MX') ?? '—'}
            </span>
          </div>
        ))}
        {eventos.length === 0 && (
          <p className="text-center text-gray-600 py-10">Sin actividad registrada.</p>
        )}
      </div>
    </div>
  );
}
