import type { SupabaseClient } from "@supabase/supabase-js";
import { commerceAccount } from "./account-http.server";
import { digest, equalSecret, orderActor } from "./checkout.server";
import { CommerceError } from "./commerce-db.server";
import type { OrderPaymentView } from "./payment";

type Locator = { id: string; acesso?: string | undefined };
export async function authorizedOrder(db: SupabaseClient, request: Request, locator: Locator) {
  const { data, error } = await db.from("orders").select("*").eq("id", locator.id).maybeSingle();
  const denied = new CommerceError(404, "Pedido não encontrado.");
  if (error || !data) throw denied;
  if (data.user_id) {
    const user = await commerceAccount(request).catch(() => null);
    if (user?.id !== data.user_id) throw denied;
  } else if (locator.acesso && data.acesso_hash) {
    if (!equalSecret(await digest(locator.acesso), data.acesso_hash)) throw denied;
  } else {
    const guest = await orderActor(request, new Headers(), false);
    if (!equalSecret(guest.hash, data.actor_hash)) throw denied;
  }
  return data;
}
export async function orderPaymentView(
  db: SupabaseClient,
  request: Request,
  locator: Locator,
): Promise<OrderPaymentView> {
  const order = await authorizedOrder(db, request, locator);
  if (order.status === "aguardando_pagamento" && Date.parse(order.expira_em) <= Date.now()) {
    const expired = await db
      .from("orders")
      .update({ status: "expirado" })
      .eq("id", order.id)
      .eq("status", "aguardando_pagamento")
      .select("status")
      .maybeSingle();
    if (expired.error) throw new CommerceError(503, "Não foi possível atualizar o pedido.");
    if (expired.data) order.status = expired.data.status;
    else return orderPaymentView(db, request, locator);
  }
  const payment = await db
    .from("payments")
    .select("instrucoes,provider,status")
    .eq("order_id", order.id)
    .maybeSingle();
  if (payment.error) throw new CommerceError(503, "Não foi possível consultar o pagamento.");
  return {
    numero: order.numero,
    status: order.status,
    totalCentavos: order.total_centavos,
    expiraEm: order.expira_em,
    revisao: order.revisao_manual,
    instrucoes: order.status === "aguardando_pagamento" ? (payment.data?.instrucoes ?? null) : null,
  };
}
