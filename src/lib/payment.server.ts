import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  CommerceError,
  commerceRpc,
  commerceSettings,
  readCommerceBody,
} from "./commerce-db.server";
import { digest, equalSecret, orderActor, placeCheckout, signCommerce } from "./checkout.server";
import { decimalCentavos } from "./shipping.server";
import {
  type CardPayment,
  type PaymentConfig,
  type PaymentInstructions,
  type paySchema,
} from "./payment";

const mockEnabled = () => process.env["YBRD_PAYMENT_MOCK"] === "true";
if (mockEnabled() && process.env["NODE_ENV"] === "production")
  throw new Error("Modo de pagamento de teste bloqueado em produção.");
export function mockAllowed(request: Request) {
  return (
    mockEnabled() &&
    process.env["NODE_ENV"] === "development" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
  );
}
export async function paymentConfig(db: SupabaseClient, request: Request): Promise<PaymentConfig> {
  const mock = mockAllowed(request);
  if (mockEnabled() && !mock) throw new CommerceError(503, "O pagamento está indisponível.");
  const real = Boolean(
    process.env["YBRD_MP_ACCESS_TOKEN"] && process.env["YBRD_MP_WEBHOOK_SECRET"],
  );
  const publicKey = process.env["YBRD_MP_PUBLIC_KEY"] ?? null;
  const settings = await commerceSettings(db);
  return {
    pix: real || mock,
    cartao: mock || (real && Boolean(publicKey)),
    boleto:
      (real || mock) &&
      settings.get("boleto_ativo") === true &&
      (mock || Boolean(process.env["YBRD_MP_BOLETO_METHOD"])),
    publicKey,
    mock,
  };
}
type Charge = {
  id: string;
  total_centavos: number;
  email: string;
  expira_em: string;
  metodo: "pix" | "cartao" | "boleto";
  parcelas: number;
  cpf: string;
};
type GatewayPayment = {
  id: string;
  orderId: string;
  status: string;
  cents: number;
  instructions: PaymentInstructions | null;
};
export interface PaymentProvider {
  criarPix(order: Charge): Promise<GatewayPayment>;
  criarCartao(order: Charge, card?: CardPayment): Promise<GatewayPayment>;
  criarBoleto(order: Charge): Promise<GatewayPayment>;
  consultar(id: string): Promise<GatewayPayment>;
  reembolsar(id: string, cents: number, key: string): Promise<{ approved: boolean; id: string }>;
  verificarWebhook(request: Request, id: string): Promise<boolean>;
}
const rawPayment = z.object({
  id: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,30}$/)]),
  external_reference: z.uuid(),
  status: z.string(),
  transaction_amount: z.union([z.number(), z.string()]),
  currency_id: z.literal("BRL"),
  date_of_expiration: z.string().nullish(),
  point_of_interaction: z
    .object({
      transaction_data: z
        .object({
          qr_code: z.string().max(4096).nullish(),
          qr_code_base64: z.string().max(150000).nullish(),
        })
        .nullish(),
    })
    .nullish(),
  transaction_details: z.object({ external_resource_url: z.url().nullish() }).nullish(),
});
function parsePayment(raw: unknown): GatewayPayment {
  const result = rawPayment.safeParse(raw);
  if (!result.success) throw new CommerceError(502, "Não foi possível confirmar o pagamento.");
  const p = result.data;
  const cents = decimalCentavos(p.transaction_amount);
  if (cents === null)
    throw new CommerceError(502, "Não foi possível confirmar o valor do pagamento.");
  const status =
    (
      {
        approved: "aprovado",
        rejected: "recusado",
        cancelled: "cancelado",
        refunded: "reembolsado",
        charged_back: "revisao",
      } as Record<string, string>
    )[p.status] ?? "pendente";
  const pix = p.point_of_interaction?.transaction_data;
  const qr = pix?.qr_code_base64;
  const boleto = p.transaction_details?.external_resource_url;
  const instructions: PaymentInstructions = {};
  if (pix?.qr_code) instructions.codigoPix = pix.qr_code;
  if (qr && /^[A-Za-z0-9+/]+={0,2}$/.test(qr)) instructions.qrBase64 = qr;
  if (boleto) {
    const url = new URL(boleto);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      /(^|\.)mercadopago\.com(?:\.br)?$/.test(url.hostname)
    )
      instructions.urlBoleto = boleto;
  }
  if (p.date_of_expiration && Number.isFinite(Date.parse(p.date_of_expiration)))
    instructions.expiraEm = p.date_of_expiration;
  return {
    id: String(p.id),
    orderId: p.external_reference,
    status,
    cents,
    instructions: Object.keys(instructions).length ? instructions : null,
  };
}
export async function verifyMercadoPagoSignature(
  request: Request,
  paymentId: string,
  secret: string,
  now = Date.now(),
) {
  const requestId = request.headers.get("x-request-id") ?? "";
  const parts = new Map(
    (request.headers.get("x-signature") ?? "").split(",").map((part) => {
      const [key, value] = part.trim().split("=", 2);
      return [key, value];
    }),
  );
  const ts = parts.get("ts") ?? "";
  const signature = parts.get("v1") ?? "";
  if (
    !secret ||
    !/^\d{1,30}$/.test(paymentId) ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(requestId) ||
    !/^\d{10}(\d{3})?$/.test(ts) ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const stamp = Number(ts) * (ts.length === 10 ? 1000 : 1);
  if (Math.abs(now - stamp) > 300000) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.match(/../g)!.map((byte) => parseInt(byte, 16)));
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    encoder.encode(`id:${paymentId.toLowerCase()};request-id:${requestId};ts:${ts};`),
  );
}
export class MercadoPago implements PaymentProvider {
  private async api(path: string, payload?: object, idempotency?: string) {
    const token = process.env["YBRD_MP_ACCESS_TOKEN"];
    if (!token) throw new CommerceError(503, "Pagamento temporariamente indisponível.");
    const response = await fetch(`https://api.mercadopago.com/v1/payments${path}`, {
      method: payload ? "POST" : "GET",
      signal: AbortSignal.timeout(9000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json" } : {}),
        ...(idempotency ? { "X-Idempotency-Key": idempotency } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!response.ok)
      throw new CommerceError(502, "Não foi possível iniciar o pagamento. Tente novamente.");
    return response.json() as Promise<unknown>;
  }
  private async create(order: Charge, paymentMethodId: string, card?: CardPayment) {
    const origin = process.env["YBRD_SITE_ORIGIN"];
    return parsePayment(
      await this.api(
        "",
        {
          transaction_amount: order.total_centavos / 100,
          description: "Pedido YBRD",
          external_reference: order.id,
          payment_method_id: paymentMethodId,
          payer: { email: order.email, identification: { type: "CPF", number: order.cpf } },
          notification_url: `${origin}/api/loja/webhook-mercado-pago`,
          ...(card
            ? {
                token: card.token,
                installments: order.parcelas,
                ...(card.issuerId ? { issuer_id: card.issuerId } : {}),
              }
            : { date_of_expiration: order.expira_em }),
        },
        order.id,
      ),
    );
  }
  criarPix(order: Charge) {
    return this.create(order, "pix");
  }
  criarCartao(order: Charge, card?: CardPayment) {
    if (!card) throw new CommerceError(422, "Confira os dados do cartão.");
    return this.create(order, card.paymentMethodId, card);
  }
  criarBoleto(order: Charge) {
    const method = process.env["YBRD_MP_BOLETO_METHOD"];
    if (!method || !/^[a-z0-9_]{1,40}$/.test(method))
      throw new CommerceError(422, "Boleto indisponível.");
    return this.create(order, method);
  }
  async consultar(id: string) {
    if (!/^\d{1,30}$/.test(id)) throw new CommerceError(400, "Pagamento inválido.");
    return parsePayment(await this.api(`/${id}`));
  }
  async reembolsar(id: string, cents: number, key: string) {
    if (!/^\d{1,30}$/.test(id)) throw new CommerceError(400, "Pagamento inválido.");
    const result = z
      .object({ id: z.union([z.string(), z.number()]), status: z.string() })
      .parse(await this.api(`/${id}/refunds`, { amount: cents / 100 }, key));
    return { id: String(result.id), approved: result.status === "approved" };
  }
  verificarWebhook(request: Request, id: string) {
    return verifyMercadoPagoSignature(request, id, process.env["YBRD_MP_WEBHOOK_SECRET"] ?? "");
  }
}
class MockPayment implements PaymentProvider {
  private pending(order: Charge): GatewayPayment {
    return {
      id: `mock-${order.id}`,
      orderId: order.id,
      cents: order.total_centavos,
      status: "pendente",
      instructions: null,
    };
  }
  async criarPix(order: Charge) {
    return this.pending(order);
  }
  async criarCartao(order: Charge) {
    return this.pending(order);
  }
  async criarBoleto(order: Charge) {
    return this.pending(order);
  }
  async consultar(): Promise<GatewayPayment> {
    throw new CommerceError(422, "Use o painel de simulação.");
  }
  async reembolsar(_id: string, _cents: number, key: string) {
    return { id: `mock-${key}`, approved: true };
  }
  async verificarWebhook() {
    return false;
  }
}
export function paymentProvider(request: Request) {
  return mockAllowed(request) ? new MockPayment() : new MercadoPago();
}
export async function applyPayment(db: SupabaseClient, payment: GatewayPayment, provider: string) {
  return commerceRpc<string>(db, "commerce_payment_update", {
    p_order: payment.orderId,
    p_provider: provider,
    p_reference: payment.id,
    p_status: payment.status,
    p_paid: payment.cents,
    p_instructions: payment.instructions,
  });
}
export async function payCheckout(
  db: SupabaseClient,
  request: Request,
  headers: Headers,
  input: z.infer<typeof paySchema>,
) {
  const config = await paymentConfig(db, request);
  if (!config[input.metodo]) throw new CommerceError(503, "Este pagamento está indisponível.");
  if (input.metodo === "cartao" && !config.mock && !input.card)
    throw new CommerceError(422, "Confira os dados do cartão.");
  const actor = await orderActor(request, headers, input.account);
  const order = await placeCheckout(db, input, actor);
  if (order.status !== "aguardando_pagamento") return order;
  const stored = await db
    .from("orders")
    .select("id,numero,email,total_centavos,expira_em,metodo,parcelas,customer_hash")
    .eq("id", order.id)
    .eq("actor_hash", actor.hash)
    .single();
  if (stored.error || !stored.data)
    throw new CommerceError(503, "Não foi possível consultar o pedido.");
  if (
    !equalSecret(stored.data.customer_hash, await signCommerce(`cpf:${input.contato.cpf}`)) ||
    stored.data.metodo !== input.metodo
  )
    throw new CommerceError(409, "Os dados deste pedido mudaram.");
  if (Date.parse(stored.data.expira_em) <= Date.now()) {
    await commerceRpc(db, "commerce_expire_orders", { p_limit: 50 });
    return { ...order, status: "expirado" };
  }
  const providerName = config.mock ? "mock" : "mercado-pago";
  const registered = await db
    .from("payments")
    .upsert(
      { order_id: order.id, provider: providerName, valor_centavos: stored.data.total_centavos },
      { onConflict: "order_id", ignoreDuplicates: true },
    );
  if (registered.error) throw new CommerceError(503, "Não foi possível iniciar o pagamento.");
  const existing = await db
    .from("payments")
    .select("provider,provider_payment_id,status")
    .eq("order_id", order.id)
    .single();
  if (existing.error || existing.data.provider !== providerName)
    throw new CommerceError(409, "Este pedido já tem uma tentativa de pagamento.");
  if (existing.data.provider_payment_id) return order;
  if (stored.data.total_centavos === 0) {
    const status = await applyPayment(
      db,
      {
        id: `sem-cobranca-${order.id}`,
        orderId: order.id,
        status: "aprovado",
        cents: 0,
        instructions: null,
      },
      providerName,
    );
    return { ...order, status };
  }
  const provider = paymentProvider(request);
  const charge: Charge = { ...stored.data, cpf: input.contato.cpf };
  const payment =
    charge.metodo === "pix"
      ? await provider.criarPix(charge)
      : charge.metodo === "cartao"
        ? await provider.criarCartao(charge, input.card)
        : await provider.criarBoleto(charge);
  if (payment.orderId !== order.id)
    throw new CommerceError(502, "Não foi possível confirmar o pagamento.");
  return { ...order, status: await applyPayment(db, payment, providerName) };
}
const webhook = z.object({
  id: z.union([z.number().int().nonnegative(), z.string().max(100)]),
  type: z.literal("payment"),
  data: z.object({ id: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,30}$/)]) }),
});
export async function queueMercadoPagoWebhook(db: SupabaseClient, request: Request) {
  const paymentId = new URL(request.url).searchParams.get("data.id") ?? "";
  if (!(await new MercadoPago().verificarWebhook(request, paymentId)))
    throw new CommerceError(401, "Evento não autorizado.");
  const payload = await readCommerceBody(request, 16384);
  const result = webhook.safeParse(payload);
  if (!result.success || String(result.data.data.id) !== paymentId)
    throw new CommerceError(400, "Evento inválido.");
  const saved = await db
    .from("webhook_events")
    .upsert(
      { provider_event_id: `mp:${result.data.id}`, payment_reference: paymentId, payload },
      { onConflict: "provider_event_id", ignoreDuplicates: true },
    );
  if (saved.error) throw new CommerceError(503, "Evento indisponível.");
  return { recebido: true };
}
export async function processPaymentEvents(db: SupabaseClient) {
  const events = await commerceRpc<
    { provider_event_id: string; payment_reference: string; tentativas: number }[]
  >(db, "commerce_claim_webhooks", { p_limit: 4 });
  const provider = new MercadoPago();
  for (const event of events) {
    try {
      const payment = await provider.consultar(event.payment_reference);
      await applyPayment(db, payment, "mercado-pago");
      await db
        .from("webhook_events")
        .update({ processado_em: new Date().toISOString() })
        .eq("provider_event_id", event.provider_event_id);
    } catch {
      await db
        .from("webhook_events")
        .update({
          disponivel_em: new Date(
            Date.now() + Math.min(60, 2 ** event.tentativas) * 60000,
          ).toISOString(),
        })
        .eq("provider_event_id", event.provider_event_id);
    }
  }
  return events.length;
}
export async function checkCron(request: Request) {
  const secret = process.env["YBRD_COMMERCE_CRON_SECRET"];
  const provided = request.headers.get("authorization") ?? "";
  if (
    !secret ||
    secret.length < 32 ||
    !equalSecret(await digest(provided), await digest(`Bearer ${secret}`))
  )
    throw new CommerceError(401, "Solicitação não autorizada.");
}
