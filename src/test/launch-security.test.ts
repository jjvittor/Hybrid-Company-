// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { digest, issueOrderAccess, orderAccess, validOrderAccess } from "@/lib/checkout.server";
import { authorizedOrder } from "@/lib/orders.server";
import { orderAccessFragment, readOrderAccessFragment } from "@/lib/payment";
import { verifyTurnstile } from "@/lib/turnstile.server";
import { handleCommerce } from "@/lib/commerce-http.server";

const issued = Date.parse("2026-11-19T12:00:00Z");
const ttl = 86_400_000;
const id = "ed31eb1b-c72b-4ca7-af3f-607bd29aac1d";
const actor = "cliente-ficticio";
const fixture = {
  id,
  actor_hash: actor,
  acesso_versao: 1,
  acesso_hash: "guest-marker",
  criado_em: new Date(issued).toISOString(),
};
beforeEach(() => {
  vi.stubEnv("YBRD_SECURITY_PEPPER", "somente-para-testes-com-32-caracteres");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("vincula o link ao pedido e aceita somente as 24 horas assinadas", async () => {
  const token = await orderAccess(id, actor, 1, issued);
  expect(readOrderAccessFragment(orderAccessFragment(token))).toBe(token);
  expect(await validOrderAccess(fixture, token, issued + ttl - 1)).toBe(true);
  expect(await validOrderAccess(fixture, token, issued + ttl)).toBe(false);
  expect(await validOrderAccess({ ...fixture, id: crypto.randomUUID() }, token, issued)).toBe(
    false,
  );
});
it("revoga links anteriores e aceita a nova geração para o mesmo pedido", async () => {
  const old = await orderAccess(id, actor, 1, issued);
  const fresh = await orderAccess(id, actor, 2, issued);
  expect(await validOrderAccess({ ...fixture, acesso_versao: 2 }, old, issued)).toBe(false);
  expect(await validOrderAccess({ ...fixture, acesso_versao: 2 }, fresh, issued)).toBe(true);
});
it("preserva o prazo original dos links legados e a revogação administrativa", async () => {
  const token = "b".repeat(64);
  const legacy = { ...fixture, acesso_versao: 0, acesso_hash: await digest(token) };
  expect(await validOrderAccess(legacy, token, issued + ttl - 1)).toBe(true);
  expect(await validOrderAccess(legacy, token, issued + ttl)).toBe(false);
  expect(await validOrderAccess({ ...legacy, acesso_versao: 1 }, token, issued)).toBe(false);
});
it("uma mensagem anterior à revogação não reemite o link; o reenvio posterior continua válido", async () => {
  const instant = (ms: number) => new Date(issued + ms).toISOString();
  const order = { ...fixture, user_id: null, acesso_versao: 2, acesso_revogado_em: instant(1000) };
  expect(await issueOrderAccess(order, instant(0), issued + 2000)).toBeUndefined();
  expect(await issueOrderAccess(order, instant(1000), issued + 2000)).toBeUndefined();
  const fresh = await issueOrderAccess(order, instant(2000), issued + 2000);
  expect(await validOrderAccess(order, fresh!, issued + 3000)).toBe(true);
  expect(await issueOrderAccess(order, instant(2000), issued + 2000 + ttl)).toBeUndefined();
});
it("exige marcador de convidado mesmo quando a conta do pedido foi excluída", async () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: { ...fixture, user_id: null, acesso_hash: null },
      error: null,
    }),
  };
  await expect(
    authorizedOrder(
      { from: () => query } as unknown as SupabaseClient,
      new Request("https://example.test"),
      { id, acesso: await orderAccess(id, actor, 1, Date.now()) },
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it.each([
  ["ybrd-account", "loja.example.test", false],
  ["ybrd-checkout", "outra.example.test", false],
  ["ybrd-checkout", "loja.example.test", true],
])("confere ação e domínio do desafio (%s, %s)", async (action, hostname, expected) => {
  vi.stubEnv("YBRD_TURNSTILE_SECRET", "local-only");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ success: true, hostname, action })),
  );
  expect(
    await verifyTurnstile("test-token", "loja.example.test", "192.0.2.1", "ybrd-checkout"),
  ).toBe(expected);
});
it("protege a revogação e a leitura dos alertas pela sessão administrativa", async () => {
  vi.stubEnv("SUPABASE_URL", "https://backend.example.test");
  vi.stubEnv("YBRD_SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("YBRD_SITE_ORIGIN", "https://loja.example.test");
  vi.stubEnv("YBRD_CHECKOUT_ENABLED", "true");
  const upstream = vi.fn(async (url: RequestInfo | URL) => {
    expect(String(url)).toContain("/rpc/ybrd_attempt");
    return Response.json({ allowed: true });
  });
  vi.stubGlobal("fetch", upstream);
  for (const action of ["admin-revogar-acesso", "admin-pedidos"]) {
    const req = new Request("https://loja.example.test/api/loja/" + action, {
      method: "POST",
      headers: {
        origin: "https://loja.example.test",
        "cf-connecting-ip": "192.0.2.9",
        "content-type": "application/json",
      },
      body: JSON.stringify(action === "admin-pedidos" ? {} : { id }),
    });
    expect((await handleCommerce(req, action)).status).toBe(401);
  }
  expect(upstream).toHaveBeenCalledTimes(2);
});
