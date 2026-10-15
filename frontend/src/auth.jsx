import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setStoreId, setUnauthorizedHandler } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

// Who is logged in. `user` is undefined while we check, null when nobody is, and { id, email, name } when someone is.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [config, setConfig] = useState({ google: false });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setStoreId(null);
      setUser(null);
    });
    api.get('/api/auth/config').then(setConfig).catch(() => {});
    api.get('/api/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  const login = useCallback(async (email, password) => setUser((await api.post('/api/auth/login', { email, password })).user), []);
  const register = useCallback(async (fields) => setUser((await api.post('/api/auth/register', fields)).user), []);
  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setStoreId(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, config, login, register, logout }}>{children}</Ctx.Provider>;
}
