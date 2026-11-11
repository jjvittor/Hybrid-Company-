import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { YbrdLogo } from "@/components/YbrdLogo";
import { commerceInputClass } from "@/components/ShippingFields";
import { brl, commerceRequest } from "@/lib/commerce";
import { orderStatusLabels, type OrderListItem } from "@/lib/payment";

export const Route = createFileRoute("/admin/pedidos")({
  head: () => ({
    meta: [
      { title: "Administração de pedidos — Ybrd" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminOrders,
});
type ReturnRow = { id: string; motivo: string; status: string };
type AdminOrder = OrderListItem & { return_requests: ReturnRow[] };
const nextStatus: Record<string, "em_separacao" | "enviado" | "entregue"> = {
  pago: "em_separacao",
  em_separacao: "enviado",
  enviado: "entregue",
};
const nextLabel: Record<string, string> = {
  em_separacao: "Iniciar separação",
  enviado: "Registrar envio",
  entregue: "Confirmar entrega",
};
function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [message, setMessage] = useState("Carregando pedidos.");
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [refund, setRefund] = useState<Record<string, string>>({});
  const keys = useRef(new Map<string, string>());
  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await commerceRequest<{ pedidos: AdminOrder[] }>("admin-pedidos", {}, signal);
    setOrders(data.pedidos);
    setMessage(data.pedidos.length ? "" : "Ainda não há pedidos.");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((error) => {
      if (!controller.signal.aborted) setMessage(error.message);
    });
    return () => controller.abort();
  }, [load]);
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      await load();
      setMessage(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o pedido.");
    } finally {
      setBusy(false);
    }
  };
  const sendRefund = async (order: AdminOrder) => {
    const amount = refund[order.id]?.trim().replace(",", ".") ?? "";
    const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(amount);
    const cents =
      order.refund?.valor_centavos ??
      (match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : 0);
    if (cents <= 0) throw new Error("Informe o valor do reembolso em reais.");
    const key = order.refund?.id ?? keys.current.get(order.id) ?? crypto.randomUUID();
    keys.current.set(order.id, key);
    const data = await commerceRequest<{ concluido: boolean }>("admin-reembolso", {
      id: order.id,
      idempotencia: key,
      valorCentavos: cents,
    });
    if (data.concluido) keys.current.delete(order.id);
    return data.concluido ? "Reembolso confirmado." : "Reembolso aguardando confirmação.";
  };
  return (
    <main className="site-width max-w-4xl space-y-6 py-8">
      <Link to="/" className="wordmark" aria-label="YBRD início">
        <YbrdLogo />
      </Link>
      <h1 className="section-title">Administração de pedidos</h1>
      {message && (
        <p role="status" className="border border-border p-3 text-sm">
          {message}
        </p>
      )}
      {orders.map((order) => {
        const next = nextStatus[order.status];
        return (
          <article key={order.id} className="space-y-3 border border-border p-4">
            <h2 className="micro">
              {order.numero} · {brl(order.total_centavos)}
            </h2>
            <p className="text-sm">
              {orderStatusLabels[order.status]}
              {order.revisao_manual ? " · Revisão manual" : ""}
            </p>
            {order.rastreio && <p className="micro">Rastreio {order.rastreio}</p>}
            {next && !order.revisao_manual && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await commerceRequest("admin-status", {
                      id: order.id,
                      status: next,
                      ...(next === "enviado" ? { rastreio: tracking[order.id] ?? "" } : {}),
                    });
                    return "Pedido atualizado.";
                  });
                }}
              >
                {next === "enviado" && (
                  <label className="grid gap-1 text-sm">
                    Código de rastreio
                    <input
                      value={tracking[order.id] ?? ""}
                      minLength={3}
                      maxLength={80}
                      required
                      onChange={(e) => setTracking({ ...tracking, [order.id]: e.target.value })}
                      className={commerceInputClass}
                    />
                  </label>
                )}
                <Button type="submit" disabled={busy}>
                  {nextLabel[next]}
                </Button>
              </form>
            )}
            {(order.refund ||
              (["pago", "em_separacao", "enviado", "entregue"].includes(order.status) &&
                !order.revisao_manual)) && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => sendRefund(order));
                }}
              >
                {order.refund ? (
                  <p className="text-sm">Reembolso pendente {brl(order.refund.valor_centavos)}</p>
                ) : (
                  <label className="grid gap-1 text-sm">
                    Reembolso em R$
                    <input
                      inputMode="decimal"
                      placeholder="0,00"
                      required
                      value={refund[order.id] ?? ""}
                      onChange={(e) => setRefund({ ...refund, [order.id]: e.target.value })}
                      className={commerceInputClass}
                    />
                  </label>
                )}
                <Button type="submit" variant="outline" disabled={busy}>
                  {order.refund ? "Consultar reembolso" : "Confirmar reembolso"}
                </Button>
              </form>
            )}
            {order.return_requests.map((request) => (
              <div key={request.id} className="space-y-2 border-t border-border pt-3 text-sm">
                <p className="micro">Troca ou devolução</p>
                <p className="whitespace-pre-wrap">{request.motivo}</p>
                <label className="grid gap-1">
                  Status da solicitação
                  <select
                    className={commerceInputClass}
                    value={request.status}
                    disabled={busy}
                    onChange={(e) => {
                      const status = e.target.value;
                      void run(async () => {
                        await commerceRequest("admin-troca", { id: request.id, status });
                        return "Solicitação atualizada.";
                      });
                    }}
                  >
                    {[
                      ["aberto", "Aberta"],
                      ["em_analise", "Em análise"],
                      ["aprovado", "Aprovada"],
                      ["recusado", "Recusada"],
                      ["concluido", "Concluída"],
                    ].map(([value, label]) => (
                      <option key={value} value={value} disabled={value === "aberto"}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </article>
        );
      })}
    </main>
  );
}
