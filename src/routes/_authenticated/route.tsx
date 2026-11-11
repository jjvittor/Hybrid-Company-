import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { accountRequest, type AccountStatus } from "@/lib/account-api";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { user } = await accountRequest<AccountStatus>("status").catch(() => ({ user: null }));
    if (!user) throw redirect({ to: "/entrar", replace: true });
  },
  component: Outlet,
});
