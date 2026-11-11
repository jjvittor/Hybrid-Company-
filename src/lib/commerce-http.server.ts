import {
  checkCron,
  queueMercadoPagoWebhook,
  processPaymentEvents,
  paymentConfig,
  payCheckout,
  mockAllowed,
  applyPayment,
} from "./payment.server";
import { mockPaymentSchema, orderLocator, paySchema } from "./payment";
import { authorizedOrder, orderPaymentView } from "./orders.server";
import { checkoutSchema } from "./checkout";
import { getPolicies, orderActor, requireCommerceAccount, reviewCheckout } from "./checkout.server";
import { z } from "zod";
import { cartInput, defaultCommerce, type CartEntry } from "./commerce";
import { commerceAccount } from "./account-http.server";
import {
  CommerceError,
  commerceBackend,
  commerceCatalog,
  commerceRate,
  commerceRpc,
  readCommerceBody,
  revalidateCart,
} from "./commerce-db.server";
import { lookupCep, quoteShipping } from "./shipping.server";
import { cepSchema, shippingInput } from "./shipping";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export async function handleCommerce(request: Request, operation: string, context?: unknown) {
  try {
    if (request.method !== "POST")
      return Response.json(
        { message: "Método não disponível." },
        { status: 405, headers: { ...headers, Allow: "POST" } },
      );
    const enabled = process.env["YBRD_CHECKOUT_ENABLED"] === "true";
    if (operation === "webhook-mercado-pago" || operation === "tarefas") {
      if (!enabled) throw new CommerceError(503, "Loja indisponível.");
      if (operation === "tarefas") {
        await checkCron(request);
        const db = commerceBackend();
        const expirados = await commerceRpc(db, "commerce_expire_orders", { p_limit: 100 });
        return Response.json({ expirados, eventos: await processPaymentEvents(db) }, { headers });
      }
      const db = commerceBackend();
      const event = await queueMercadoPagoWebhook(db, request);
      const worker = context as { waitUntil?: (task: Promise<unknown>) => void } | undefined;
      if (worker?.waitUntil) worker.waitUntil(processPaymentEvents(db).catch(() => {}));
      return Response.json(event, { headers });
    }
    const origin = new URL(request.url).origin;
    if (
      request.headers.get("origin") !== origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new CommerceError(403, "Solicitação não autorizada.");
    if (operation === "catalogo" && !enabled) return Response.json(defaultCommerce, { headers });
    if (!enabled || process.env["YBRD_SITE_ORIGIN"] !== origin)
      throw new CommerceError(503, "Compras ainda indisponíveis.");
    const db = commerceBackend();
    await commerceRate(
      db,
      request,
      operation,
      operation === "frete" || operation === "cep" ? 30 : 90,
    );
    if (operation === "cep") {
      const input = z.object({ cep: cepSchema }).parse(await readCommerceBody(request));
      return Response.json(await lookupCep(input.cep), { headers });
    }
    if (operation === "frete") {
      const input = shippingInput.parse(await readCommerceBody(request));
      return Response.json(await quoteShipping(db, input.cep, input.items), { headers });
    }
    if (operation === "politicas") return Response.json(await getPolicies(db), { headers });
    if (operation === "enderecos") {
      const user = await requireCommerceAccount(request);
      const result = await db
        .from("addresses")
        .select("id,endereco")
        .eq("user_id", user.id)
        .limit(20);
      if (result.error) throw new CommerceError(503, "Não foi possível consultar os endereços.");
      return Response.json({ enderecos: result.data }, { headers });
    }
    if (operation === "pagamento-config")
      return Response.json(await paymentConfig(db, request), { headers });
    if (operation === "pedido-status") {
      const locator = orderLocator.parse(await readCommerceBody(request));
      return Response.json(await orderPaymentView(db, request, locator), { headers });
    }
    if (operation === "simular-pagamento") {
      if (!mockAllowed(request)) throw new CommerceError(404, "Página não encontrada.");
      const parsed = mockPaymentSchema.parse(await readCommerceBody(request));
      const order = await authorizedOrder(db, request, parsed);
      const payment = await db
        .from("payments")
        .select("provider,provider_payment_id")
        .eq("order_id", order.id)
        .single();
      if (
        payment.error ||
        payment.data.provider !== "mock" ||
        !payment.data.provider_payment_id ||
        order.status !== "aguardando_pagamento"
      )
        throw new CommerceError(409, "A simulação já foi concluída.");
      if (parsed.resultado === "expirar") {
        const result = await db
          .from("orders")
          .update({ status: "expirado" })
          .eq("id", order.id)
          .eq("status", "aguardando_pagamento");
        if (result.error) throw new CommerceError(409, "Não foi possível expirar o pedido.");
      } else {
        await applyPayment(
          db,
          {
            id: payment.data.provider_payment_id,
            orderId: order.id,
            cents: order.total_centavos,
            instructions: null,
            status: parsed.resultado === "aprovar" ? "aprovado" : "recusado",
          },
          "mock",
        );
      }
      return Response.json(await orderPaymentView(db, request, parsed), { headers });
    }
    if (operation === "revisao" || operation === "pagar") {
      const input = await readCommerceBody(request);
      const responseHeaders = new Headers(headers);
      if (operation === "revisao") {
        const parsed = checkoutSchema.parse(input);
        const actor = await orderActor(request, responseHeaders, parsed.account);
        return Response.json(await reviewCheckout(db, parsed, actor.hash), {
          headers: responseHeaders,
        });
      }
      return Response.json(
        await payCheckout(db, request, responseHeaders, paySchema.parse(input)),
        { headers: responseHeaders },
      );
    }
    if (operation === "catalogo") return Response.json(await commerceCatalog(db), { headers });
    if (operation !== "sacola") throw new CommerceError(404, "Página não encontrada.");
    const input = cartInput.parse(await readCommerceBody(request));
    const identity = input.account ? await commerceAccount(request) : null;
    if (input.account && !identity) throw new CommerceError(401, "Entre novamente na sua conta.");
    await commerceRpc(db, "commerce_expire_orders", { p_limit: 20 });
    const catalog = await commerceCatalog(db);
    const stored = identity
      ? await commerceRpc<{ items: CartEntry[]; notices: string[] }>(db, "commerce_cart", {
          p_user: identity.id,
          p_merge: input.mergeId ?? null,
          p_items: revalidateCart(input.items, catalog).items,
          p_change: input.change ?? null,
        })
      : { items: input.items, notices: [] };
    return Response.json(
      { ...revalidateCart(stored.items, catalog, stored.notices), catalog },
      { headers },
    );
  } catch (error) {
    if (error instanceof CommerceError)
      return Response.json({ message: error.message }, { status: error.status, headers });
    if (error instanceof z.ZodError)
      return Response.json({ message: "Confira os dados informados." }, { status: 400, headers });
    return Response.json(
      { message: "Não foi possível concluir. Tente novamente." },
      { status: 503, headers },
    );
  }
}
