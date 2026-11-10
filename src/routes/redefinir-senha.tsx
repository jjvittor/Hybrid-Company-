import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AccountLayout, AccountField, FieldError } from "@/components/AccountFields";
import { AccountChallenge } from "@/components/AccountChallenge";
import { useAccount } from "@/components/AccountProvider";
import { Button } from "@/components/ui/button";
import { accountHead, actions } from "@/lib/account-schema";
import { accountRequest, AccountRequestError } from "@/lib/account-api";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => accountHead("Redefinir senha", "Defina uma nova senha para sua conta Ybrd."),
  component: ResetPassword,
});

function ResetPassword() {
  const { clear } = useAccount();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [factors, setFactors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (value) {
      history.replaceState(history.state, "", window.location.pathname);
      if (actions.verify.safeParse({ token: value, type: "recovery" }).success) setToken(value);
      setReady(true);
      return;
    }
    void accountRequest<{ factors: string[] }>("recovery-status")
      .then((data) => {
        setActive(true);
        setFactors(data.factors);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  const handleError = (cause: unknown) =>
    setError(cause instanceof AccountRequestError ? cause.message : "Tente novamente.");
  return (
    <AccountLayout title="REDEFINIR SENHA">
      {!ready ? (
        <p className="mt-5" role="status">
          Validando link…
        </p>
      ) : done ? (
        <>
          <p className="mt-5" role="status">
            Senha alterada. Entre novamente com a nova senha.
          </p>
          <Button asChild className="account-submit mt-5">
            <Link to="/entrar">Entrar</Link>
          </Button>
        </>
      ) : token ? (
        <>
          <p className="mt-5 text-sm">Confirme para redefinir a senha da sua conta.</p>
          <Button
            className="account-submit mt-5"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await accountRequest("verify", { token, type: "recovery" });
                setToken("");
                const state = await accountRequest<{ factors: string[] }>("recovery-status");
                setFactors(state.factors);
                setActive(true);
              } catch (cause) {
                handleError(cause);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Validando…" : "Continuar"}
          </Button>
        </>
      ) : !active ? (
        <>
          <p className="mt-5 text-sm">Este link é inválido ou expirou.</p>
          <Button asChild className="account-submit mt-5">
            <Link to="/recuperar-senha">Solicitar novo link</Link>
          </Button>
        </>
      ) : factors.length ? (
        <AccountChallenge factors={factors} recovery onDone={() => setFactors([])} />
      ) : (
        <form
          method="post"
          className="account-form"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const result = actions.reset.safeParse({ password, confirmation });
            if (!result.success) {
              setError(result.error.issues[0]?.message ?? "Verifique os dados informados.");
              return;
            }
            if (password !== confirmation) {
              setError("As senhas não são iguais.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              await accountRequest("reset", result.data);
              clear();
              setDone(true);
            } catch (cause) {
              handleError(cause);
            } finally {
              setBusy(false);
              setPassword("");
              setConfirmation("");
            }
          }}
        >
          <AccountField
            label="Nova senha"
            name="new-password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            maxLength={128}
          />
          <AccountField
            label="Confirmação de senha"
            name="confirmation"
            type="password"
            value={confirmation}
            onChange={setConfirmation}
            autoComplete="new-password"
            maxLength={128}
          />
          <Button type="submit" className="account-submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </form>
      )}
      <div className="mt-4">
        <FieldError error={error} />
      </div>
    </AccountLayout>
  );
}
