import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, doc, onSnapshot as onSnap } from 'firebase/firestore';
import { db } from '../firebase.js';

const STATUS_COLORS = {
  pendiente:  'bg-yellow-500/20 text-yellow-300',
  revision:   'bg-blue-500/20 text-blue-300',
  completado: 'bg-green-500/20 text-green-300',
  error:      'bg-red-500/20 text-red-300',
};

const STATUS_LIST = ['todos', 'pendiente', 'revision', 'completado', 'error'];

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(date, dateStr) {
  return toLocalDateStr(date) === dateStr;
}

export default function MonitorTramites() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [lastHeartbeat, setLastHeartbeat] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Refrescar "ahora" cada 30s para que el tiempo de silencio se actualice en pantalla
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

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
        setLastHeartbeat(data.lastHeartbeat?.toDate() ?? null);
      },
      (err) => console.error('[Firestore] config:', err.message)
    );
  }, []);

  // Bot se considera activo si el último pulso llegó hace menos de 2 minutos.
  // Esto evita mostrar "activo" si el bot se cayó sin actualizar botStatus.
  const STALE_MS = 2 * 60_000;
  const silencioMs = lastHeartbeat ? now - lastHeartbeat.getTime() : null;
  const isActive = silencioMs !== null && silencioMs < STALE_MS;
  const silencioMin = silencioMs !== null ? Math.floor(silencioMs / 60_000) : null;
  const silencioSeg = silencioMs !== null ? Math.floor((silencioMs % 60_000) / 1000) : null;

  const porFecha = fechaFiltro
    ? solicitudes.filter((s) => {
        const d = s.updatedAt?.toDate();
        return d && isSameDay(d, fechaFiltro);
      })
    : solicitudes;

  const filtradas = filtroStatus === 'todos'
    ? porFecha
    : porFecha.filter((s) => s.status === filtroStatus);

  const contadores = {
    total:      porFecha.length,
    pendiente:  porFecha.filter((s) => s.status === 'pendiente').length,
    revision:   porFecha.filter((s) => s.status === 'revision').length,
    completado: porFecha.filter((s) => s.status === 'completado').length,
    error:      porFecha.filter((s) => s.status === 'error').length,
    conPdf:     porFecha.filter((s) => s.r2Url).length,
  };

  const hoyStr = toLocalDateStr(new Date());

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Monitor de Trámites</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
          <span className={isActive ? 'text-green-400' : 'text-red-400'}>
            {isActive ? 'Bot activo' : lastHeartbeat ? 'Bot desconectado' : 'Sin datos'}
          </span>
          {lastHeartbeat && (
            <span className="text-gray-500">
              — hace {silencioMin > 0 ? `${silencioMin} min` : `${silencioSeg}s`}
            </span>
          )}
        </div>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: 'Total',      value: contadores.total,      color: 'text-white',       bg: 'bg-gray-800' },
          { label: 'Pendiente',  value: contadores.pendiente,  color: 'text-yellow-300',  bg: 'bg-yellow-500/10' },
          { label: 'Revisión',   value: contadores.revision,   color: 'text-blue-300',    bg: 'bg-blue-500/10' },
          { label: 'Completado', value: contadores.completado, color: 'text-green-300',   bg: 'bg-green-500/10' },
          { label: 'Error',      value: contadores.error,      color: 'text-red-300',     bg: 'bg-red-500/10' },
          { label: 'Con PDF',    value: contadores.conPdf,     color: 'text-indigo-300',  bg: 'bg-indigo-500/10' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Filtro por status */}
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_LIST.map((f) => (
            <button
              key={f}
              onClick={() => setFiltroStatus(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filtroStatus === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-700 hidden sm:block" />

        {/* Filtro por fecha */}
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setFechaFiltro(fechaFiltro === hoyStr ? '' : hoyStr)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              fechaFiltro === hoyStr ? 'bg-teal-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Hoy
          </button>
          <input
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            className="bg-gray-800 text-gray-300 text-sm rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 [color-scheme:dark]"
          />
          {fechaFiltro && (
            <button
              onClick={() => setFechaFiltro('')}
              className="text-gray-500 hover:text-gray-300 text-sm transition"
              title="Quitar filtro de fecha"
            >
              ✕
            </button>
          )}
        </div>
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
                <td colSpan={5} className="py-8 text-center text-gray-600">
                  {fechaFiltro ? `Sin trámites el ${fechaFiltro}.` : 'Sin trámites.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
