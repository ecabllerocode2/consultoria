import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase.js';
import { registerFCM } from '../fcm.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = cargando
  const [notifStatus, setNotifStatus] = useState('pending'); // 'pending' | 'granted' | 'denied'

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u ?? null);
      if (u) {
        // Pedir permisos de notificación al autenticarse
        const perm = Notification.permission;
        if (perm === 'granted') {
          setNotifStatus('granted');
          await registerFCM();
        } else if (perm === 'denied') {
          setNotifStatus('denied');
        } else {
          setNotifStatus('ask');
        }
      }
    });
  }, []);

  async function requestNotifPermission() {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setNotifStatus('granted');
      await registerFCM();
    } else {
      setNotifStatus('denied');
    }
  }

  return (
    <AuthContext.Provider value={{ user, notifStatus, requestNotifPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
