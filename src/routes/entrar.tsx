import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/AuthForm";
import { accountHead } from "@/lib/account-schema";

export const Route = createFileRoute("/entrar")({
  head: () => accountHead("Entrar", "Acesse sua conta Ybrd com e-mail e senha."),
  validateSearch: (search: Record<string, unknown>): { next?: "/" } =>
    search["next"] === "/" ? { next: "/" } : {},
  component: Login,
});
function Login() {
  const { next } = Route.useSearch();
  return <AuthForm next={next ?? "/minha-conta"} />;
}
