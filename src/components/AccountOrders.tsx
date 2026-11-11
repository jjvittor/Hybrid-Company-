import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { brl, commerceRequest } from "@/lib/commerce";
import { orderStatusLabels, type OrderListItem } from "@/lib/payment";

export function AccountOrders() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [message, setMessage] = useState("Carregando pedidos.");
  useEffect(() => {
    const controller = new AbortController();
    void commerceRequest<{ pedidos: OrderListItem[] }>("pedidos", {}, controller.signal)
      .then((data) => {
        setOrders(data.pedidos);
        setMessage(data.pedidos.length ? "" : "Você ainda não tem pedidos.");
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("O histórico de pedidos está indisponível.");
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="space-y-3 border-t border-border pt-5">
      <h2 className="micro">Meus pedidos</h2>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <ul className="space-y-2">
        {orders.map((order) => (
          <li key={order.id} className="border border-border p-3 text-sm">
            <Link
              to="/pedido/$id/confirmado"
              params={{ id: order.id }}
              search={{}}
              className="underline"
            >
              {order.numero}
            </Link>
            <p>
              {orderStatusLabels[order.status]} · {brl(order.total_centavos)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
