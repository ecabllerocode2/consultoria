import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationCenter from './NotificationCenter.jsx';

const NAV = [
  { id: 'tramites',   label: '📊 Trámites' },
  { id: 'grupos',     label: '📋 Grupos' },
  { id: 'emergencia', label: '🆘 Emergencia' },
  { id: 'vincular',   label: '📱 Vincular WA' },
  { id: 'logs',       label: '🖥️ Logs' },
];

export default function Layout({ active, onNav, children }) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function navigate(id) {
    onNav(id);
    setSidebarOpen(false); // cerrar en móvil al navegar
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between gap-3 z-40">
        <div className="flex items-center gap-3">
          {/* Hamburguesa — solo en móvil */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
            aria-label="Abrir menú"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-lg tracking-tight">CURP Bot</span>
        </div>

        <div className="flex items-center gap-2">
          <NotificationCenter />
          <span className="text-gray-400 text-sm hidden sm:block">{user?.email}</span>
          <button
            onClick={() => signOut(auth)}
            className="text-sm text-gray-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-gray-800"
          >
            Salir
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Overlay para cerrar sidebar en móvil */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <nav className={`
          fixed md:static top-0 left-0 h-full md:h-auto
          w-52 bg-gray-900 border-r border-gray-800
          flex flex-col gap-1 p-3 z-40
          transform transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
          pt-16 md:pt-3
        `}>
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                active === item.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
