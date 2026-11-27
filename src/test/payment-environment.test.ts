// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MercadoPago, paymentConfig, processPaymentEvents } from "@/lib/payment.server";
import { mercadoPagoCredentials } from "@/lib/service-signatures.server";
import { verifyFulfillmentPayment } from "@/lib/fulfillment.server";

const liveOrigin = "https://loja.example.test";
const staging = "https://homologacao.example.test";
const env = {
  YBRD_MP_SANDBOX: "false", YBRD_SITE_ORIGIN: liveOrigin, YBRD_MP_PRODUCTION_ORIGIN: liveOrigin,
  YBRD_MP_COLLECTOR_ID: "42", YBRD_MP_ACCESS_TOKEN: "credencial-de-producao-ficticia",
  YBRD_MP_WEBHOOK_SECRET: "assinatura-ficticia", YBRD_MP_TEST_ACCESS_TOKEN: "outra-credencial",
  YBRD_MP_TEST_COLLECTOR_ID: "73", YBRD_MP_TEST_WEBHOOK_SECRET: "assinatura-de-teste",
};
const order = "fe8a4c38-d170-4146-a864-f5c11fc04f37";
const receipt = { id: 123, live_mode: true, collector_id: 42, currency_id: "BRL",
  transaction_amount: "29.90", status: "approved", external_reference: order };
const account = new Request(liveOrigin);
const settings = { from: () => ({ select: async () => ({ data: [] }) }) } as unknown as SupabaseClient;

beforeEach(() => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.stubEnv("YBRD_PAYMENT_MOCK", "false");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("exige modo explícito e vincula os ambientes aos domínios", () => {
  expect(mercadoPagoCredentials(env)?.live).toBe(true);
  expect(mercadoPagoCredentials({ ...env, YBRD_MP_SANDBOX: "true", YBRD_SITE_ORIGIN: staging })?.live).toBe(false);
  for (const change of [
    { YBRD_MP_SANDBOX: "" }, { YBRD_MP_SANDBOX: "true" }, { YBRD_SITE_ORIGIN: staging },
    { YBRD_MP_PRODUCTION_ORIGIN: "" }, { YBRD_MP_ACCESS_TOKEN: "TEST-ficticia" },
    { YBRD_MP_ACCESS_TOKEN: env.YBRD_MP_TEST_ACCESS_TOKEN }, { YBRD_MP_COLLECTOR_ID: "" },
  ]) expect(mercadoPagoCredentials({ ...env, ...change })).toBeNull();
  expect(mercadoPagoCredentials(env, staging)).toBeNull();
});

it("mantém o checkout fechado para conta de teste ou recebedor divergente", async () => {
  const req = vi.fn(async () => Response.json({ id: 42, tags: ["test_user"] }));
  vi.stubGlobal("fetch", req);
  await expect(paymentConfig(settings, account)).rejects.toMatchObject({ status: 503 });
  req.mockResolvedValueOnce(Response.json({ id: 73, tags: ["normal"] }));
  await expect(paymentConfig(settings, account)).rejects.toMatchObject({ status: 503 });
  req.mockResolvedValueOnce(Response.json({ id: 42, tags: ["normal"] }));
  await expect(paymentConfig(settings, account)).resolves.toMatchObject({ pix: true, mock: false });
});

it.each([
  { live_mode: false }, { live_mode: undefined }, { collector_id: "73" }, { collector_id: null },
  { id: 456 }, { currency_id: "USD" },
])("recusa comprovante incompatível ou incompleto %o", async (change) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...receipt, ...change })));
  const payment = new MercadoPago(mercadoPagoCredentials(env)!);
  await expect(payment.consultar("123")).rejects.toThrow();
});

it("consulta um recibo incompleto pelo ID sem repetir a cobrança", async () => {
  const external = vi.fn()
    .mockResolvedValueOnce(Response.json({ id: "123" }))
    .mockResolvedValueOnce(Response.json(receipt));
  vi.stubGlobal("fetch", external);
  const payment = new MercadoPago(mercadoPagoCredentials(env)!);
  await expect(payment.criarPix({
    id: order, total_centavos: 2990, email: "teste@example.test", cpf: "00000000000",
    expira_em: "2026-11-26T12:10:00Z", metodo: "pix", parcelas: 1,
    endereco: { destinatario: "Teste" } as Parameters<typeof payment.criarPix>[0]["endereco"],
  })).resolves.toMatchObject({ status: "aprovado", cents: 2990, orderId: order });
  expect(external.mock.calls.map((call) => call[1].method)).toEqual(["POST", "GET"]);
});

function stored(cents = 2990, reference = "123") {
  const data = { provider: "mercado-pago", provider_payment_id: reference, status: "aprovado",
    valor_centavos: cents, orders: { total_centavos: cents } };
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data }) }) }) }) } as unknown as SupabaseClient;
}

it("reconcilia inclusive aprovações antigas antes da expedição", async () => {
  const provider = vi.fn(async () => Response.json(receipt));
  vi.stubGlobal("fetch", provider);
  await expect(verifyFulfillmentPayment(stored(), account, order)).resolves.toBeUndefined();
  for (const changed of [{ live_mode: false }, { collector_id: 73 }, { transaction_amount: "0.01" },
    { external_reference: "ce46b76c-c7a4-48f3-8122-9416a30c0a9b" }, { status: "refunded" }]) {
    provider.mockResolvedValueOnce(Response.json({ ...receipt, ...changed }));
    await expect(verifyFulfillmentPayment(stored(), account, order)).rejects.toThrow();
  }
});

it("preserva o pedido gratuito e exige sua referência interna", async () => {
  const external = vi.fn(); vi.stubGlobal("fetch", external);
  await expect(verifyFulfillmentPayment(stored(0, `sem-cobranca-${order}`), account, order)).resolves.toBeUndefined();
  await expect(verifyFulfillmentPayment(stored(0), account, order)).rejects.toThrow();
  expect(external).not.toHaveBeenCalled();
});

it("descarta comprovante de homologação na conciliação de produção", async () => {
  const rpc = vi.fn(async (name: string) => {
    if (name === "commerce_claim_webhooks") return { data: [{ provider_event_id: "fixture", payment_reference: "123", tentativas: 1 }] };
    throw Error("Operação inesperada");
  });
  const updates = vi.fn(() => ({ eq: async () => ({}) }));
  const db = { rpc, from: () => ({ update: updates }) } as unknown as SupabaseClient;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...receipt, live_mode: false })));
  await processPaymentEvents(db);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(updates).toHaveBeenCalledWith({ disponivel_em: expect.any(String) });
});

it("permite comprovante de teste somente para a loja de homologação", async () => {
  const creds = mercadoPagoCredentials({ ...env, YBRD_SITE_ORIGIN: staging, YBRD_MP_SANDBOX: "true" })!;
  const payment = new MercadoPago(creds);
  const provider = vi.fn(async () => Response.json({ ...receipt, live_mode: false, collector_id: 73 }));
  vi.stubGlobal("fetch", provider);
  await expect(payment.consultar("123")).resolves.toMatchObject({ status: "aprovado", orderId: order });
  provider.mockResolvedValueOnce(Response.json({ ...receipt, collector_id: 73 }));
  await expect(payment.consultar("123")).rejects.toThrow();
});
