import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import GestorGrupos from './pages/GestorGrupos.jsx';
import MonitorTramites from './pages/MonitorTramites.jsx';
import CargaEmergencia from './pages/CargaEmergencia.jsx';
import Logs from './pages/Logs.jsx';

const PAGES = {
  tramites:   <MonitorTramites />,
  grupos:     <GestorGrupos />,
  emergencia: <CargaEmergencia />,
  logs:       <Logs />,
};

function AppInner() {
  const user = useAuth();
  const [page, setPage] = useState('tramites');

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="text-gray-500">Cargando...</span>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <Layout active={page} onNav={setPage}>
      {PAGES[page]}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
