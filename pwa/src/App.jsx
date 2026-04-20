import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import GestorGrupos from './pages/GestorGrupos.jsx';
import MonitorTramites from './pages/MonitorTramites.jsx';
import CargaEmergencia from './pages/CargaEmergencia.jsx';
import Logs from './pages/Logs.jsx';
import VincularWhatsApp from './pages/VincularWhatsApp.jsx';

const PAGES = {
  tramites:   <MonitorTramites />,
  grupos:     <GestorGrupos />,
  emergencia: <CargaEmergencia />,
  logs:       <Logs />,
  vincular:   <VincularWhatsApp />,
};

function NotifPrompt({ onAllow, onDeny }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full space-y-5 text-center shadow-2xl">
        <div className="text-5xl">🔔</div>
        <h2 className="text-xl font-bold">Activar notificaciones</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          El bot te envía alertas cuando llegan mensajes sin CURP, cuando un asesor
          no responde en 5 minutos o cuando el bot se desconecta.
          <br /><br />
          Las notificaciones son <span className="text-white font-medium">necesarias</span> para
          operar correctamente.
        </p>
        <button
          onClick={onAllow}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition"
        >
          Permitir notificaciones
        </button>
        <button
          onClick={onDeny}
          className="w-full text-gray-500 hover:text-gray-400 text-sm transition"
        >
          Continuar sin notificaciones
        </button>
      </div>
    </div>
  );
}

function AppInner() {
  const { user, notifStatus, requestNotifPermission } = useAuth();
  const [page, setPage] = useState('tramites');
  const [notifDismissed, setNotifDismissed] = useState(false);

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="text-gray-500">Cargando...</span>
      </div>
    );
  }

  if (!user) return <Login />;

  // Mostrar modal de permisos si están pendientes y no fue descartado
  const showNotifPrompt = notifStatus === 'ask' && !notifDismissed;

  return (
    <>
      {showNotifPrompt && (
        <NotifPrompt
          onAllow={async () => { await requestNotifPermission(); }}
          onDeny={() => setNotifDismissed(true)}
        />
      )}
      <Layout active={page} onNav={setPage}>
        {PAGES[page]}
      </Layout>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
