import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase.js';
import { registerFCM } from '../fcm.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = cargando

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u ?? null);
      if (u) await registerFCM(); // Registrar FCM al autenticarse
    });
  }, []);

  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
