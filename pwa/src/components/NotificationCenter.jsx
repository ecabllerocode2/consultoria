import { useEffect, useRef, useState } from 'react';
import {
  collection, onSnapshot, orderBy, query, limit,
  doc, updateDoc, writeBatch, where, getDocs,
} from 'firebase/firestore';
import { db } from '../firebase.js';

export default function NotificationCenter() {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  // Escuchar las últimas 50 notificaciones en tiempo real
  useEffect(() => {
    const q = query(
      collection(db, 'notificaciones'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(q, (snap) =>
      setNotifs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[Notifs]', err.message)
    );
  }, []);

  // Cerrar al hacer clic fuera del panel
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const unread = notifs.filter((n) => !n.read).length;

  async function markRead(id) {
    await updateDoc(doc(db, 'notificaciones', id), { read: true });
  }

  async function markAllRead() {
    const q = query(
      collection(db, 'notificaciones'),
      where('read', '==', false)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = ts.toDate();
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) +
      ' ' + d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Campana */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
        aria-label="Notificaciones"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 flex flex-col max-h-[70vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="font-semibold text-sm">Notificaciones</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition"
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          {/* Lista */}
          <ul className="overflow-y-auto flex-1 divide-y divide-gray-800">
            {notifs.length === 0 && (
              <li className="px-4 py-8 text-center text-gray-600 text-sm">Sin notificaciones</li>
            )}
            {notifs.map((n) => (
              <li
                key={n.id}
                className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800 transition ${
                  n.read ? 'opacity-50' : ''
                }`}
                onClick={() => !n.read && markRead(n.id)}
              >
                {/* Dot no leída */}
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                  n.read ? 'bg-transparent' : 'bg-indigo-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white leading-snug">{n.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 break-words">{n.body}</p>
                  <p className="text-[10px] text-gray-600 mt-1">{formatTime(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
