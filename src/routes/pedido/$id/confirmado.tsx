import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { OrderPayment } from "@/components/OrderPayment";
import { Button } from "@/components/ui/button";
import { YbrdLogo } from "@/components/YbrdLogo";
import { brl, commerceRequest } from "@/lib/commerce";
import { orderStatusLabels, type OrderDetail } from "@/lib/payment";

export const Route = createFileRoute("/pedido/$id/confirmado")({
  validateSearch: (search: Record<string, unknown>): { acesso?: string } =>
    typeof search["acesso"] === "string" && /^[a-f0-9]{64}$/.test(search["acesso"])
      ? { acesso: search["acesso"] }
      : {},
  head: () => ({
    meta: [
      { title: "Acompanhar pedido — Ybrd" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: OrderPage,
});
function OrderPage() {
  const { id } = Route.useParams();
  const { acesso } = Route.useSearch();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [returnMessage, setReturnMessage] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await commerceRequest<OrderDetail>(
          "pedido-detalhe",
          { id, acesso },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setOrder(data);
        setMessage("");
        if (
          !["entregue", "reembolsado", "cancelado", "expirado", "falha_pagamento"].includes(
            data.status,
          )
        )
          timer = setTimeout(load, data.status === "aguardando_pagamento" ? 15000 : 20000);
      } catch (error) {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error ? error.message : "Não foi possível carregar o pedido.",
          );
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, acesso]);
  const requestReturn = async () => {
    setSending(true);
    try {
      await commerceRequest("solicitar-troca", { id, acesso, motivo: reason.trim() });
      setReason("");
      setReturnMessage("Solicitação recebida. A loja entrará em contato.");
    } catch (error) {
      setReturnMessage(
        error instanceof Error ? error.message : "Não foi possível solicitar a troca.",
      );
    } finally {
      setSending(false);
    }
  };
  return (
    <main className="site-width max-w-3xl space-y-6 py-8">
      <Link to="/" className="wordmark" aria-label="YBRD início">
        <YbrdLogo />
      </Link>
      <h1 className="section-title">{order ? `Pedido ${order.numero}` : "Acompanhar pedido"}</h1>
      {message && <p role="alert">{message}</p>}
      {!order && !message && <p role="status">Carregando pedido.</p>}
      {order && (
        <>
          <OrderPayment id={id} acesso={acesso} mock={order.mock} />
          <section className="space-y-3 border border-border p-4">
            <h2 className="micro">Peças do pedido</h2>
            <ul className="divide-y divide-border">
              {order.itens.map((item) => (
                <li key={item.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-3">
                  <img src={item.imagem} alt="" width={64} height={80} loading="lazy" />
                  <div>
                    <Link
                      to="/produto/$produto"
                      params={{ produto: item.slug }}
                      className="underline"
                    >
                      {item.nome}
                    </Link>
                    <p className="micro">
                      {item.quantidade}× {brl(item.preco_centavos)}
                      {item.tamanho ? ` / ${item.tamanho}` : ""}
                    </p>
                    {[...item.edition_units]
                      .sort((a, b) => a.numero_edicao - b.numero_edicao)
                      .map((unit) => (
                        <p key={unit.numero_edicao} className="micro">
                          ED. {String(unit.numero_edicao).padStart(3, "0")}
                          {item.edicao_total
                            ? ` / ${String(item.edicao_total).padStart(3, "0")}`
                            : ""}
                        </p>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2 border border-border p-4 text-sm">
            <h2 className="micro">Entrega</h2>
            <p>{order.endereco.destinatario}</p>
            <p>
              {order.endereco.rua}, {order.endereco.numero} {order.endereco.complemento} ·{" "}
              {order.endereco.bairro}
            </p>
            <p>
              {order.endereco.cidade} / {order.endereco.uf} · {order.endereco.cep}
            </p>
            <p>
              {order.frete.nome} · até {order.frete.prazoDias} dias úteis
            </p>
            {order.rastreio && <p className="micro">Rastreio {order.rastreio}</p>}
          </section>
          <section className="space-y-2 border border-border p-4 text-sm">
            <h2 className="micro">Resumo</h2>
            <p>Subtotal {brl(order.subtotal_centavos)}</p>
            <p>Frete {brl(order.frete_centavos)}</p>
            <p>Descontos {brl(order.desconto_centavos)}</p>
            <p className="micro">
              Total {brl(order.total_centavos)}
              {order.parcelas > 1 ? ` em ${order.parcelas}x` : ""}
            </p>
            <p>{orderStatusLabels[order.status]}</p>
          </section>
          {["pago", "em_separacao", "enviado", "entregue"].includes(order.status) && (
            <form
              className="space-y-3 border border-border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void requestReturn();
              }}
            >
              <h2 className="micro">Troca ou devolução</h2>
              <label className="grid gap-2 text-sm">
                Conte o que aconteceu
                <textarea
                  required
                  minLength={3}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-20 rounded-md border border-border p-2"
                />
              </label>
              <Button type="submit" disabled={sending} className="rounded-full">
                Enviar solicitação
              </Button>
              {returnMessage && <p role="status">{returnMessage}</p>}
            </form>
          )}
          {order.convidado && (
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/criar-conta">Criar conta na Ybrd</Link>
            </Button>
          )}
        </>
      )}
    </main>
  );
}
