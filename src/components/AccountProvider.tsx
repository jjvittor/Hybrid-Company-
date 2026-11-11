import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { accountRequest, type AccountStatus } from "@/lib/account-api";

const AccountContext = createContext({
  user: null as AccountStatus["user"],
  refresh: async (): Promise<AccountStatus> => ({ user: null }),
  clear: () => {},
});
export const useAccount = () => useContext(AccountContext);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountStatus["user"]>(null);
  const refresh = useCallback(async () => {
    const status = await accountRequest<AccountStatus>("status");
    setUser(status.user);
    return status;
  }, []);
  const clear = useCallback(() => setUser(null), []);
  useEffect(() => {
    const sync = () => void refresh().catch(clear);
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [refresh, clear]);
  return (
    <AccountContext.Provider value={{ user, refresh, clear }}>{children}</AccountContext.Provider>
  );
}
