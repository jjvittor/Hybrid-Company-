import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AccountField, AccountLayout, FieldError } from "./AccountFields";
import { AccountChallenge } from "./AccountChallenge";
import { useAccount } from "./AccountProvider";
import { Turnstile } from "./Turnstile";
import { accountRequest, AccountRequestError, type AccountStatus } from "@/lib/account-api";
import { actions, genericEmailMessage } from "@/lib/account-schema";

type Mode = "login" | "signup" | "recover";
export function AuthForm({
  mode = "login",
  next = "/minha-conta",
}: {
  mode?: Mode;
  next?: "/" | "/minha-conta";
}) {
  const navigate = useNavigate();
  const { refresh, clear } = useAccount();
  const [values, setValues] = useState({
    nome: "",
    email: "",
    password: "",
    confirmation: "",
    website: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [requiresCaptcha, setRequiresCaptcha] = useState(mode !== "login");
  const [widget, setWidget] = useState(0);
  const [factors, setFactors] = useState<string[]>([]);
  const [link, setLink] = useState<{ token: string; type: "signup" | "email_change" }>();
  const login = mode === "login";
  const signup = mode === "signup";

  useEffect(() => {
    if (!login) return;
    if (window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get("token");
      const type = params.get("type");
      if (token && (type === "signup" || type === "email_change")) {
        history.replaceState(history.state, "", window.location.pathname + window.location.search);
        if (actions.verify.safeParse({ token, type }).success) setLink({ token, type });
        else setError("Este link é inválido ou expirou.");
      }
    }
    void refresh()
      .then((status) => setFactors(status.factors ?? []))
      .catch(clear);
  }, [login, refresh, clear]);

  const update = (key: keyof typeof values, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFields((prev) => ({ ...prev, [key]: "" }));
    setError("");
  };
  const showError = (cause: unknown) => {
    if (cause instanceof AccountRequestError) {
      setError(cause.message);
      if (cause.captcha) setRequiresCaptcha(true);
    } else setError("Não foi possível concluir. Tente novamente.");
  };

  const submit = async (event: FormEvent, action: Mode | "resend" = mode) => {
    event.preventDefault();
    if (busy) return;
    const shared = { email: values.email, website: values.website, captcha: captcha || undefined };
    const credentials = { password: values.password };
    const input =
      action === "login"
        ? { ...shared, ...credentials, next }
        : action === "signup"
          ? { ...shared, ...credentials, nome: values.nome, confirmation: values.confirmation }
          : shared;
    const result = actions[action].safeParse(input);
    if (!result.success) {
      setFields(
        Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message])),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await accountRequest<{ next?: "/" | "/minha-conta" }>(action, result.data);
      if (action === "login") {
        const status: AccountStatus = await refresh();
        if (status.factors?.length) setFactors(status.factors);
        else if (status.user)
          await navigate({ to: response.next === "/" ? "/" : "/minha-conta", replace: true });
        else setError("E-mail ou senha incorretos.");
      } else {
        setMessage(genericEmailMessage);
      }
    } catch (cause) {
      showError(cause);
    } finally {
      setValues((prev) => ({ ...prev, password: "", confirmation: "" }));
      setCaptcha("");
      setWidget((value) => value + 1);
      setBusy(false);
    }
  };

  if (link)
    return (
      <AccountLayout title="CONFIRMAR E-MAIL">
        <p className="mt-5 text-sm">Confirme o endereço de e-mail para continuar.</p>
        <Button
          className="account-submit mt-5"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const data = await accountRequest<{ message: string }>("verify", link);
              setMessage(data.message);
            } catch (cause) {
              showError(cause);
            } finally {
              setLink(undefined);
              setBusy(false);
            }
          }}
        >
          {busy ? "Confirmando…" : "Confirmar e-mail"}
        </Button>
      </AccountLayout>
    );

  if (factors.length)
    return (
      <AccountLayout title="VERIFICAÇÃO EM DUAS ETAPAS">
        <AccountChallenge
          factors={factors}
          onDone={async () => {
            const status = await refresh();
            if (status.user) await navigate({ to: next, replace: true });
          }}
          onRecovered={() => {
            clear();
            setFactors([]);
            setMessage("Autenticador removido. Entre com sua senha e configure um novo.");
          }}
        />
        <Button
          variant="link"
          className="px-0"
          onClick={async () => {
            try {
              await accountRequest("logout", { all: false });
              clear();
              setFactors([]);
            } catch (cause) {
              showError(cause);
            }
          }}
        >
          Voltar para entrar
        </Button>
        <FieldError error={error} />
      </AccountLayout>
    );

  const title = login ? "ENTRAR" : signup ? "CRIAR CONTA" : "RECUPERAR SENHA";
  return (
    <AccountLayout title={title}>
      {message && (
        <p role="status" className="mt-5 text-sm">
          {message}
        </p>
      )}
      <form
        className="account-form"
        noValidate
        onSubmit={(event) =>
          void submit(event, signup && message === genericEmailMessage ? "resend" : mode)
        }
      >
        <div className="account-honeypot" aria-hidden="true">
          <label>
            Site
            <input
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={values.website}
              onChange={(event) => update("website", event.target.value)}
            />
          </label>
        </div>
        {signup && !message && (
          <AccountField
            label="Nome"
            name="nome"
            value={values.nome}
            onChange={(value) => update("nome", value)}
            error={fields["nome"]}
            autoComplete="name"
            maxLength={80}
          />
        )}
        <AccountField
          label="E-mail"
          name="email"
          type="email"
          value={values.email}
          onChange={(value) => update("email", value)}
          error={fields["email"]}
          autoComplete={login ? "username" : "email"}
        />
        {(login || (signup && !message)) && (
          <AccountField
            label="Senha"
            name="password"
            type="password"
            value={values.password}
            onChange={(value) => update("password", value)}
            error={fields["password"]}
            autoComplete={signup ? "new-password" : "current-password"}
            maxLength={128}
          />
        )}
        {signup && !message && (
          <AccountField
            label="Confirmação de senha"
            name="confirmation"
            type="password"
            value={values.confirmation}
            onChange={(value) => update("confirmation", value)}
            error={fields["confirmation"]}
            autoComplete="new-password"
            maxLength={128}
          />
        )}
        {login && (
          <Button asChild variant="link" className="justify-start px-0 text-xs">
            <Link to="/recuperar-senha">Esqueci minha senha</Link>
          </Button>
        )}
        {requiresCaptcha && <Turnstile key={widget} onToken={setCaptcha} />}
        <FieldError error={error} />
        <Button
          type="submit"
          className="account-submit"
          disabled={busy || (requiresCaptcha && !captcha)}
        >
          {busy
            ? "Enviando…"
            : login
              ? "Entrar"
              : signup
                ? message
                  ? "Reenviar e-mail"
                  : "Criar conta"
                : "Enviar link"}
        </Button>
      </form>
      <div className="mt-5 text-center text-sm">
        <Button asChild variant="link">
          <Link to={login ? "/criar-conta" : "/entrar"}>
            {login ? "Criar uma conta" : "Voltar para entrar"}
          </Link>
        </Button>
      </div>
    </AccountLayout>
  );
}
