import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { brl, commerceRequest, type CartEntry } from "@/lib/commerce";
import {
  cepMask,
  digits,
  phoneMask,
  states,
  type AddressDraft,
  type ShippingReply,
} from "@/lib/shipping";

export const commerceInputClass =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
export function AddressFields({
  address,
  onChange,
}: {
  address: AddressDraft;
  onChange: (value: AddressDraft) => void;
}) {
  const current = useRef(address);
  current.current = address;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lookup = async () => {
    setMessage("");
    setBusy(true);
    try {
      const found = await commerceRequest<Pick<AddressDraft, "rua" | "bairro" | "cidade" | "uf">>(
        "cep",
        { cep: address.cep },
      );
      if (current.current.cep === address.cep) onChange({ ...current.current, ...found });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preencha o endereço à mão.");
    } finally {
      setBusy(false);
    }
  };
  const fields = [
    ["destinatario", "Destinatário", "shipping name", 80],
    ["telefone", "Telefone", "shipping tel", 15],
    ["rua", "Rua", "shipping address-line1", 100],
    ["numero", "Número", "off", 20],
    ["complemento", "Complemento", "shipping address-line2", 60],
    ["bairro", "Bairro", "shipping address-level3", 60],
    ["cidade", "Cidade", "shipping address-level2", 60],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex items-end gap-2 sm:col-span-2">
        <label className="grid flex-1 gap-1 text-sm">
          CEP
          <input
            autoComplete="shipping postal-code"
            inputMode="numeric"
            value={cepMask(address.cep)}
            onChange={(e) => onChange({ ...address, cep: digits(e.target.value).slice(0, 8) })}
            className={commerceInputClass}
            required
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={busy || address.cep.length !== 8}
          onClick={() => void lookup()}
        >
          {busy ? "Buscando" : "Buscar CEP"}
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm sm:col-span-2">
          {message}
        </p>
      )}
      {fields.map(([key, label, autocomplete, max]) => (
        <label key={key} className="grid gap-1 text-sm">
          {label}
          <input
            autoComplete={autocomplete}
            inputMode={key === "telefone" ? "tel" : undefined}
            maxLength={max}
            value={key === "telefone" ? phoneMask(address[key]) : address[key]}
            onChange={(e) =>
              onChange({
                ...address,
                [key]: key === "telefone" ? digits(e.target.value).slice(0, 11) : e.target.value,
              })
            }
            className={commerceInputClass}
            required={key !== "complemento"}
          />
        </label>
      ))}
      <label className="grid gap-1 text-sm">
        UF
        <select
          autoComplete="shipping address-level1"
          className={commerceInputClass}
          value={address.uf}
          onChange={(e) => onChange({ ...address, uf: e.target.value })}
          required
        >
          <option value="">Selecione</option>
          {states.map((uf) => (
            <option key={uf}>{uf}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
export function CartShipping({ items }: { items: CartEntry[] }) {
  const [cep, setCep] = useState("");
  const [result, setResult] = useState<ShippingReply | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const quote = async () => {
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const response = await commerceRequest<ShippingReply>("frete", { cep: digits(cep), items });
      if (!response.options.length) setMessage("Frete indisponível para este CEP.");
      setResult(response);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível calcular o frete.");
    } finally {
      setBusy(false);
    }
  };
  const cheapest = result?.options[0];
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          Frete por CEP
          <input
            value={cep}
            inputMode="numeric"
            autoComplete="postal-code"
            onChange={(e) => {
              setCep(cepMask(e.target.value));
              setResult(null);
              setMessage("");
            }}
            className={commerceInputClass}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={busy || digits(cep).length !== 8}
          onClick={() => void quote()}
        >
          {busy ? "Calculando" : "Calcular"}
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {cheapest && result && (
        <>
          <p className="text-sm">
            {cheapest.nome} · até {cheapest.prazoDias} dias úteis · {brl(cheapest.precoCentavos)}
          </p>
          <p className="micro flex justify-between gap-3">
            <span>Total estimado</span>
            <span>{brl(result.subtotalCentavos + cheapest.precoCentavos)}</span>
          </p>
        </>
      )}
    </div>
  );
}
