import { createContext, useContext, useState } from 'react';

// Demo plans: the choice is kept in this browser only. Nothing is charged, and the server does not enforce the limit.
export const PLANS = { free: { stores: 1 }, monthly: { stores: 10 }, annual: { stores: 10 } };
const KEY = 'kumtun.plan';

const Ctx = createContext(null);
export const usePlan = () => useContext(Ctx);

function saved() {
  try {
    const p = localStorage.getItem(KEY);
    return p in PLANS ? p : 'free';
  } catch {
    return 'free';
  }
}

export function PlanProvider({ children }) {
  const [plan, setPlanState] = useState(saved);
  const setPlan = (p) => {
    setPlanState(p);
    try { localStorage.setItem(KEY, p); } catch { /* private window: just don't remember */ }
  };
  return <Ctx.Provider value={{ plan, setPlan, storeLimit: PLANS[plan].stores }}>{children}</Ctx.Provider>;
}
