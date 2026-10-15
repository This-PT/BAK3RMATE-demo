import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, setStoreId } from './api.js';
import { useAuth } from './auth.jsx';

const Ctx = createContext(null);
export const useStores = () => useContext(Ctx);

const keyFor = (userId) => `kumtun.store.${userId}`;
const remembered = (userId) => {
  try {
    return Number(localStorage.getItem(keyFor(userId))) || null;
  } catch {
    return null;
  }
};
const remember = (userId, id) => {
  try {
    localStorage.setItem(keyFor(userId), String(id));
  } catch {
    /* private mode: fine, we just won't remember */
  }
};

// Holds the list of stores and which one is open. Every page reads the open store from here,
// and the API helper sends it with each request.
export function StoreProvider({ children }) {
  const { user } = useAuth();
  const [stores, setStores] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [error, setError] = useState('');
  const currentRef = useRef(null);

  const choose = useCallback((id) => {
    currentRef.current = id;
    setStoreId(id); // before any page renders, so its first request already carries the store
    remember(user.id, id);
    setCurrentId(id);
  }, [user.id]);

  // Reloads the list. Keeps the open store if it still exists, otherwise falls back to the first.
  const refresh = useCallback(async (preferId) => {
    const list = await api.get('/api/stores');
    const want = preferId ?? currentRef.current ?? remembered(user.id);
    const id = list.find((s) => s.id === want)?.id ?? list[0]?.id ?? null;
    setStores(list);
    if (id !== currentRef.current) choose(id);
    return list;
  }, [choose, user.id]);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);

  const value = {
    stores,
    current: stores?.find((s) => s.id === currentId) ?? null,
    error,
    refresh,
    select: choose,
    async create(name, copyFrom) {
      const store = await api.post('/api/stores', { name, copy_from: copyFrom ?? null });
      await refresh(store.id);
      choose(store.id);
      return store;
    },
    async rename(id, name) {
      await api.patch(`/api/stores/${id}`, { name });
      await refresh();
    },
    async remove(id) {
      await api.del(`/api/stores/${id}`);
      await refresh(id === currentRef.current ? null : currentRef.current);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
