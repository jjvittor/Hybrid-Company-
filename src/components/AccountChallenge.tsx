import { useState, type FormEvent } from "react";
import { AccountField, FieldError } from "./AccountFields";
import { Button } from "./ui/button";
import { accountRequest, AccountRequestError } from "@/lib/account-api";
import { actions } from "@/lib/account-schema";

export function AccountChallenge({
  factors,
  recovery = false,
  onDone,
  onRecovered,
}: {
  factors: string[];
  recovery?: boolean;
  onDone: () => void | Promise<void>;
  onRecovered?: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState(factors[0]);
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const result = useBackup
      ? actions["mfa-recover"].safeParse({ code })
      : actions["mfa-verify"].safeParse({ id: selected, code, recovery });
    if (!result.success) {
      setError(
        useBackup
          ? "Digite um código de recuperação válido."
          : "Digite os seis dígitos do aplicativo.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await accountRequest(useBackup ? "mfa-recover" : "mfa-verify", result.data);
      if (useBackup) await onRecovered?.();
      else await onDone();
    } catch (err) {
      setError(err instanceof AccountRequestError ? err.message : "Tente novamente.");
    } finally {
      setCode("");
      setBusy(false);
    }
  };
  return (
    <form className="account-form" onSubmit={submit} noValidate>
      <p className="text-sm">
        {useBackup
          ? "O código encerra as sessões e desativa o autenticador perdido. Ative outro após entrar."
          : "Digite o código do seu aplicativo autenticador."}
      </p>
      {!useBackup && factors.length > 1 && (
        <label className="account-field">
          Autenticador
          <select
            className="account-input"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
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
        label={useBackup ? "Código de recuperação" : "Código do autenticador"}
        name="mfa-code"
        value={code}
        onChange={setCode}
        maxLength={useBackup ? 32 : 6}
        autoComplete={useBackup ? "off" : "one-time-code"}
        inputMode={useBackup ? "text" : "numeric"}
      />
      <FieldError error={error} />
      <Button type="submit" className="account-submit" disabled={busy}>
        {busy ? "Verificando…" : "Verificar"}
      </Button>
      {onRecovered && (
        <Button
          variant="link"
          type="button"
          disabled={busy}
          onClick={() => {
            setCode("");
            setError("");
            setUseBackup(!useBackup);
          }}
        >
          {useBackup ? "Usar aplicativo autenticador" : "Usar código de recuperação"}
        </Button>
      )}
    </form>
  );
}
