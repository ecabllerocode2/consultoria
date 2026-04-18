import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, doc, onSnapshot as onSnap } from 'firebase/firestore';
import { db } from '../firebase.js';

const STATUS_COLORS = {
  pendiente:  'bg-yellow-500/20 text-yellow-300',
  revision:   'bg-blue-500/20 text-blue-300',
  completado: 'bg-green-500/20 text-green-300',
  error:      'bg-red-500/20 text-red-300',
};

const FILTROS = ['todos', 'pendiente', 'revision', 'completado', 'error'];

export default function MonitorTramites() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const [botStatus, setBotStatus] = useState(null);
  const [lastHeartbeat, setLastHeartbeat] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'solicitudes'), orderBy('updatedAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => setSolicitudes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[Firestore] solicitudes:', err.message)
    );
  }, []);

  useEffect(() => {
    return onSnap(
      doc(db, 'configuracion', 'config'),
      (snap) => {
        const data = snap.data() ?? {};
        setBotStatus(data.botStatus ?? false);
        setLastHeartbeat(data.lastHeartbeat?.toDate() ?? null);
      },
      (err) => console.error('[Firestore] config:', err.message)
    );
  }, []);

  const filtradas = filtro === 'todos'
    ? solicitudes
    : solicitudes.filter((s) => s.status === filtro);

  const silencioMin = lastHeartbeat
    ? Math.floor((Date.now() - lastHeartbeat.getTime()) / 60_000)
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Monitor de Trámites</h2>
        {/* Estado del bot */}
        <div className="flex items-center gap-2 text-sm">
          <span className={`w-2.5 h-2.5 rounded-full ${botStatus ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
          <span className={botStatus ? 'text-green-400' : 'text-red-400'}>
            {botStatus ? 'Bot activo' : 'Bot desconectado'}
          </span>
          {lastHeartbeat && (
            <span className="text-gray-500">— último pulso hace {silencioMin} min</span>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {FILTROS.map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filtro === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2 pr-4">CURP</th>
              <th className="text-left py-2 pr-4">Estado</th>
              <th className="text-left py-2 pr-4">Reacción</th>
              <th className="text-left py-2 pr-4">PDF</th>
              <th className="text-left py-2">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((s) => (
              <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2.5 pr-4 font-mono text-xs text-gray-200">{s.curp}</td>
                <td className="py-2.5 pr-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] ?? 'bg-gray-700 text-gray-300'}`}>
                    {s.status}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-lg">{s.ultimaReaccion ?? '—'}</td>
                <td className="py-2.5 pr-4">
                  {s.r2Url
                    ? <a href={s.r2Url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline text-xs">Ver PDF</a>
                    : <span className="text-gray-600 text-xs">—</span>
                  }
                </td>
                <td className="py-2.5 text-gray-500 text-xs">
                  {s.updatedAt?.toDate().toLocaleString('es-MX') ?? '—'}
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-600">Sin trámites.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
