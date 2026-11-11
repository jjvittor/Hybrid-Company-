import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { commerceInputClass } from "@/components/ShippingFields";
import type { CardPayment } from "@/lib/payment";

type HostedField = {
  mount(id: string): HostedField;
  unmount(): void;
  on(event: "binChange", handler: (data: { bin?: string }) => void): void;
};
type MercadoPagoInstance = {
  fields: {
    create(
      type: "cardNumber" | "expirationDate" | "securityCode",
      options: { placeholder: string },
    ): HostedField;
    createCardToken(data: {
      cardholderName: string;
      identificationType: "CPF";
      identificationNumber: string;
    }): Promise<{ id?: string }>;
  };
  getInstallments(input: {
    amount: string;
    bin: string;
    paymentTypeId: "credit_card";
  }): Promise<{ payer_costs?: { installments: number; installment_rate: number }[] }[]>;
  getPaymentMethods(input: { bin: string }): Promise<{
    results: { id: string; payment_type_id: string; issuer?: { id: string | number } }[];
  }>;
};
type MercadoPagoConstructor = new (key: string, options: { locale: string }) => MercadoPagoInstance;
declare global {
  interface Window {
    MercadoPago?: MercadoPagoConstructor;
  }
}
let sdkLoad: Promise<MercadoPagoConstructor> | undefined;
function loadSdk() {
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago);
  sdkLoad ??= new Promise<MercadoPagoConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () =>
      window.MercadoPago
        ? resolve(window.MercadoPago)
        : reject(new Error("O formulário do cartão não abriu."));
    script.onerror = () => reject(new Error("O formulário do cartão não abriu."));
    document.head.appendChild(script);
  }).catch((error) => {
    sdkLoad = undefined;
    throw error;
  });
  return sdkLoad;
}
export type CardHandle = {
  tokenize(cpf: string, totalCentavos: number, parts: number): Promise<CardPayment>;
};
export const MercadoPagoCard = forwardRef<CardHandle, { publicKey: string }>(
  function MercadoPagoCard({ publicKey }, ref) {
    const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const [holder, setHolder] = useState("");
    const [message, setMessage] = useState("Carregando formulário seguro do cartão.");
    const instance = useRef<MercadoPagoInstance | null>(null);
    const binRef = useRef("");
    const brand = useRef<Omit<CardPayment, "token"> | null>(null);
    useEffect(() => {
      let mounted = true;
      const fields: HostedField[] = [];
      let lastBin = "";
      void loadSdk()
        .then((Sdk) => {
          if (!mounted) return;
          const mp = new Sdk(publicKey, { locale: "pt-BR" });
          const number = mp.fields
            .create("cardNumber", { placeholder: "Número do cartão" })
            .mount(`${id}-number`);
          fields.push(number);
          fields.push(
            mp.fields.create("expirationDate", { placeholder: "MM/AA" }).mount(`${id}-expiry`),
          );
          fields.push(mp.fields.create("securityCode", { placeholder: "CVV" }).mount(`${id}-cvv`));
          instance.current = mp;
          number.on("binChange", ({ bin }) => {
            lastBin = bin ?? "";
            binRef.current = lastBin;
            brand.current = null;
            if (!bin) return;
            void mp
              .getPaymentMethods({ bin })
              .then((result) => {
                if (!mounted || lastBin !== bin) return;
                const method = result.results.find(
                  (value) => value.payment_type_id === "credit_card",
                );
                if (method)
                  brand.current = {
                    paymentMethodId: method.id,
                    ...(method.issuer?.id ? { issuerId: String(method.issuer.id) } : {}),
                  };
              })
              .catch(() => {});
          });
          setMessage("");
        })
        .catch(() => {
          if (mounted) setMessage("Não foi possível abrir o formulário do cartão. Tente Pix.");
        });
      return () => {
        mounted = false;
        fields.forEach((field) => field.unmount());
        instance.current = null;
        brand.current = null;
      };
    }, [id, publicKey]);
    useImperativeHandle(
      ref,
      () => ({
        async tokenize(cpf, totalCentavos, parts) {
          const mp = instance.current;
          const method = brand.current;
          if (!mp || !method || holder.trim().length < 2)
            throw new Error("Confira os dados do cartão.");
          if (parts > 1) {
            const plans = await mp
              .getInstallments({
                amount: (totalCentavos / 100).toFixed(2),
                bin: binRef.current,
                paymentTypeId: "credit_card",
              })
              .catch(() => []);
            if (
              !plans.some((plan) =>
                plan.payer_costs?.some(
                  (option) => option.installments === parts && option.installment_rate === 0,
                ),
              )
            ) {
              throw new Error(
                "Estas parcelas sem juros não estão disponíveis. Escolha outra opção.",
              );
            }
          }
          try {
            const result = await mp.fields.createCardToken({
              cardholderName: holder.trim(),
              identificationType: "CPF",
              identificationNumber: cpf,
            });
            if (!result.id) throw new Error("Token ausente.");
            return { token: result.id, ...method };
          } catch {
            throw new Error("Confira os dados do cartão.");
          }
        },
      }),
      [holder],
    );
    return (
      <fieldset className="space-y-3 border border-border p-3">
        <legend className="micro">Cartão de crédito</legend>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        <label className="grid gap-1 text-sm">
          Nome impresso no cartão
          <input
            autoComplete="cc-name"
            maxLength={80}
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            className={commerceInputClass}
            required
          />
        </label>
        <div
          id={`${id}-number`}
          className="h-11 rounded-md border border-border p-2"
          aria-label="Número do cartão"
        />
        <div className="grid grid-cols-2 gap-3">
          <div
            id={`${id}-expiry`}
            className="h-11 rounded-md border border-border p-2"
            aria-label="Validade"
          />
          <div
            id={`${id}-cvv`}
            className="h-11 rounded-md border border-border p-2"
            aria-label="Código de segurança"
          />
        </div>
      </fieldset>
    );
  },
);
