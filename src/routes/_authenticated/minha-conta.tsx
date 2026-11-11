import { AccountOrders } from "@/components/AccountOrders";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AccountField, AccountLayout, FieldError } from "@/components/AccountFields";
import { AccountChallenge } from "@/components/AccountChallenge";
import { useAccount } from "@/components/AccountProvider";
import { Button } from "@/components/ui/button";
import { accountRequest, AccountRequestError, type AccountProfile } from "@/lib/account-api";
import { accountHead, actions, passwordIssue, type AccountAction } from "@/lib/account-schema";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  head: () => accountHead("Minha conta", "Gerencie seus dados e a segurança da sua conta Ybrd."),
  loader: () => accountRequest<AccountProfile>("profile"),
  component: MyAccount,
  errorComponent: ({ reset }) => (
    <AccountLayout title="MINHA CONTA">
      <p className="mt-5">Não foi possível carregar seus dados.</p>
      <Button className="account-submit mt-5" onClick={reset}>
        Tentar novamente
      </Button>
    </AccountLayout>
  ),
});

type Mode =
  "change-password" | "change-email" | "mfa-enroll" | "mfa-codes" | "mfa-remove" | "delete";
const titles: Record<Mode, string> = {
  "change-password": "Alterar senha",
  "change-email": "Alterar e-mail",
  "mfa-enroll": "Adicionar autenticador",
  "mfa-codes": "Gerar códigos de recuperação",
  "mfa-remove": "Remover autenticador",
  delete: "Excluir minha conta",
};

function MyAccount() {
  const initial = Route.useLoaderData();
  const { user, clear } = useAccount();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({
    nome: initial.profile.nome,
    telefone: initial.profile.telefone ?? "",
  });
  const [factors, setFactors] = useState(initial.factors);
  const [mode, setMode] = useState<Mode>();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [email, setEmail] = useState("");
  const [factorId, setFactorId] = useState(factors[0]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [setup, setSetup] = useState<{ id: string; secret: string }>();
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const showError = (cause: unknown) =>
    setError(
      cause instanceof AccountRequestError
        ? cause.message
        : "Não foi possível concluir. Tente novamente.",
    );
  const resetFields = () => {
    setCurrent("");
    setPassword("");
    setConfirmation("");
    setEmail("");
    setConfirmDelete(false);
  };
  const open = (next?: Mode) => {
    resetFields();
    setSetup(undefined);
    setCodes([]);
    setError("");
    setMessage("");
    setMode(next);
  };
  const leave = async (to: "/" | "/entrar") => {
    clear();
    await navigate({ to, replace: true });
  };
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    return run(async () => {
      const result = actions["save-profile"].safeParse(profile);
      if (!result.success) {
        setError(result.error.issues[0]?.message ?? "Verifique os dados informados.");
        return;
      }
      const saved = await accountRequest<AccountProfile>("save-profile", result.data);
      setProfile({ nome: saved.profile.nome, telefone: saved.profile.telefone ?? "" });
      setMessage("Alterações salvas.");
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mode) return;
    return run(async () => {
      const input =
        mode === "change-password"
          ? { current, password, confirmation }
          : mode === "change-email"
            ? { current, email }
            : mode === "delete"
              ? { current, confirm: confirmDelete }
              : mode === "mfa-remove"
                ? { current, id: factorId }
                : { current };
      const result = actions[mode].safeParse(input);
      if (!result.success) {
        setError(result.error.issues[0]?.message ?? "Verifique os dados informados.");
        return;
      }
      if (mode === "change-password") {
        const issue = passwordIssue(password, user?.email ?? "", profile.nome);
        if (issue || password !== confirmation) {
          setError(issue ?? "As senhas não são iguais.");
          return;
        }
      }
      try {
        if (mode === "mfa-enroll") {
          setSetup(await accountRequest<{ id: string; secret: string }>(mode, { current }));
          return;
        }
        if (mode === "mfa-codes") {
          const response = await accountRequest<{ codes: string[] }>(mode, { current });
          setCodes(response.codes);
          return;
        }
        const response = await accountRequest<{ message?: string }>(
          mode as AccountAction,
          result.data,
        );
        setMode(undefined);
        if (mode === "change-email")
          setMessage(response.message ?? "Confira sua caixa de entrada.");
        else await leave(mode === "delete" ? "/" : "/entrar");
      } finally {
        resetFields();
      }
    });
  };

  return (
    <AccountLayout title="MINHA CONTA">
      <section className="account-block">
        <h2 className="micro">DADOS</h2>
        <form method="post" className="account-form" noValidate onSubmit={save}>
          <AccountField
            label="Nome"
            name="nome"
            value={profile.nome}
            onChange={(nome) => setProfile((prev) => ({ ...prev, nome }))}
            autoComplete="name"
            maxLength={80}
          />
          <AccountField
            label="E-mail"
            name="email"
            value={user?.email ?? ""}
            type="email"
            readOnly
            autoComplete="email"
          />
          <AccountField
            label="Telefone (opcional)"
            name="telefone"
            value={profile.telefone}
            onChange={(telefone) => setProfile((prev) => ({ ...prev, telefone }))}
            type="tel"
            autoComplete="tel"
            maxLength={20}
          />
          <Button type="submit" className="account-submit" disabled={busy}>
            {busy ? "Aguarde…" : "Salvar alterações"}
          </Button>
        </form>
      </section>

      <section className="account-block">
        <h2 className="micro mb-4">SEGURANÇA</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => open("change-password")}>
            Alterar senha
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => open("change-email")}>
            Alterar e-mail
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => open("mfa-enroll")}>
            {factors.length ? "Adicionar autenticador" : "Ativar 2FA"}
          </Button>
          {factors.length > 0 && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => open("mfa-codes")}>
                Códigos de recuperação
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setFactorId(factors[0]);
                  open("mfa-remove");
                }}
              >
                Remover autenticador
              </Button>
            </>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await accountRequest("logout", { all: true });
                await leave("/");
              })
            }
          >
            Sair de todos os dispositivos
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => open("delete")}>
            Excluir minha conta
          </Button>
        </div>
        {mode && (
          <div className="mt-5">
            <h3 className="text-sm">{titles[mode]}</h3>
            {setup ? (
              <>
                <p className="my-3 text-sm">
                  Adicione a chave ao seu aplicativo autenticador como código baseado em tempo.
                </p>
                <code className="break-all">{setup.secret}</code>
                <AccountChallenge
                  key={setup.id}
                  factors={[setup.id]}
                  onDone={async () => {
                    setSetup(undefined);
                    setFactors((prev) => [...prev, setup.id]);
                    open("mfa-codes");
                    setMessage(
                      "Verificação em duas etapas ativada. Gere seus códigos de recuperação.",
                    );
                  }}
                />
              </>
            ) : codes.length ? (
              <>
                <p className="my-3 text-sm">
                  Guarde os códigos em local seguro. Eles serão exibidos uma vez. Usar um código
                  invalida os demais e remove os autenticadores antigos.
                </p>
                <ul className="grid gap-1 font-mono text-xs break-all">
                  {codes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
              </>
            ) : (
              <form method="post" className="account-form" onSubmit={submit} noValidate>
                {mode === "delete" && (
                  <p className="text-sm">
                    A exclusão remove sua conta e seus dados pessoais. Esta ação é permanente.
                  </p>
                )}
                {mode === "mfa-codes" && (
                  <p className="text-sm">Gerar novos códigos invalida os anteriores.</p>
                )}
                {mode === "mfa-remove" && (
                  <label className="account-field">
                    Autenticador
                    <select
                      className="account-input"
                      value={factorId}
                      onChange={(event) => setFactorId(event.target.value)}
                    >
                      {factors.map((id, index) => (
                        <option key={id} value={id}>
                          Autenticador {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <AccountField
                  label="Senha atual"
                  name="current-password"
                  type="password"
                  value={current}
                  onChange={setCurrent}
                  autoComplete="current-password"
                  maxLength={128}
                />
                {mode === "change-email" && (
                  <AccountField
                    label="Novo e-mail"
                    name="new-email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                  />
                )}
                {mode === "change-password" && (
                  <>
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
                  </>
                )}
                {mode === "delete" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={confirmDelete}
                      onChange={(event) => setConfirmDelete(event.target.checked)}
                    />{" "}
                    Confirmo a exclusão da conta
                  </label>
                )}
                <Button
                  type="submit"
                  className="account-submit"
                  disabled={busy || (mode === "delete" && !confirmDelete)}
                >
                  {busy ? "Aguarde…" : titles[mode]}
                </Button>
              </form>
            )}
            <Button variant="link" className="px-0" disabled={busy} onClick={() => open()}>
              {codes.length ? "Fechar códigos" : "Cancelar"}
            </Button>
          </div>
        )}
      </section>

      <div className="mt-4">
        <FieldError error={error} />
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </div>
      <AccountOrders />
      <Button
        variant="link"
        className="mt-6 px-0"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await accountRequest("logout", { all: false });
            await leave("/");
          })
        }
      >
        Sair
      </Button>
    </AccountLayout>
  );
}
