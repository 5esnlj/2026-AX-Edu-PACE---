import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { Session } from "./types";

const SessionContext = createContext<{
  user: Session | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    const session = await api<Session>("/session");
    setUser(session);
  };
  useEffect(() => {
    refresh()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  const logout = async () => {
    await api("/session", { method: "DELETE" });
    setUser(null);
  };
  return (
    <SessionContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  );
}
export const useSession = () => useContext(SessionContext);
