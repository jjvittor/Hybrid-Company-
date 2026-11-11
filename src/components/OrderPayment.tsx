import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { brl, commerceRequest } from "@/lib/commerce";
import { orderStatusLabels, type OrderPaymentView } from "@/lib/payment";

export function OrderPayment({
  id,
  acesso,
  mock = false,
}: {
  id: string;
  acesso?: string | undefined;
  mock?: boolean | undefined;
}) {
  const [view, setView] = useState<OrderPaymentView | null>(null);
  const [message, setMessage] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      try {
        const data = await commerceRequest<OrderPaymentView>(
          "pedido-status",
          { id, acesso },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setView(data);
        setMessage("");
        if (data.status === "aguardando_pagamento")
          timer = setTimeout(poll, Math.min(30000, 5000 + Math.floor(attempts++ / 6) * 5000));
      } catch (error) {
        if (controller.signal.aborted) return;
        setMessage(error instanceof Error ? error.message : "Não foi possível consultar o pedido.");
        if (attempts++ < 5) timer = setTimeout(poll, Math.min(30000, 5000 * attempts));
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, acesso]);
  useEffect(() => {
    if (!view || view.status !== "aguardando_pagamento") return;
    const tick = () =>
      setSeconds(Math.max(0, Math.ceil((Date.parse(view.expiraEm) - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [view]);
  const simulate = async (resultado: "aprovar" | "recusar" | "expirar") => {
    setBusy(true);
    try {
      setView(
        await commerceRequest<OrderPaymentView>("simular-pagamento", { id, acesso, resultado }),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível simular.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 border border-border p-4">
      {message && <p role="status">{message}</p>}
      {view ? (
        <>
          <p className="micro">
            {view.numero} / {brl(view.totalCentavos)}
          </p>
          <p role="status">
            {view.revisao
              ? "Pagamento em revisão"
              : (orderStatusLabels[view.status] ?? "Status do pedido")}
          </p>
          {view.status === "aguardando_pagamento" && !view.revisao && (
            <>
              <p className="micro">
                Reserva expira em {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
              </p>
              {view.instrucoes?.qrBase64 && (
                <img
                  src={`data:image/png;base64,${view.instrucoes.qrBase64}`}
                  alt="QR Code Pix"
                  width={180}
                  height={180}
                  className="bg-white p-2"
                />
              )}
              {view.instrucoes?.codigoPix && (
                <>
                  <label className="grid gap-1 text-sm">
                    Pix copia e cola
                    <textarea
                      readOnly
                      value={view.instrucoes.codigoPix}
                      className="w-full rounded-md border border-border p-2 font-mono text-xs"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(view.instrucoes!.codigoPix!)
                        .then(() => setMessage("Código Pix copiado."))
                        .catch(() => setMessage("Selecione e copie o código Pix."));
                    }}
                  >
                    Copiar Pix
                  </Button>
                </>
              )}
              {view.instrucoes?.urlBoleto && (
                <a
                  href={view.instrucoes.urlBoleto}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Abrir boleto
                </a>
              )}
              {mock && (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <p className="micro w-full">Simulação local de pagamento</p>
                  {(["aprovar", "recusar", "expirar"] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void simulate(value)}
                    >
                      {value}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        !message && <p role="status">Consultando pedido.</p>
      )}
    </section>
  );
}
