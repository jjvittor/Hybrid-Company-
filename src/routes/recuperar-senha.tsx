import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/AuthForm";
import { accountHead } from "@/lib/account-schema";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => accountHead("Recuperar senha", "Solicite um link para redefinir a senha."),
  component: () => <AuthForm mode="recover" />,
});
