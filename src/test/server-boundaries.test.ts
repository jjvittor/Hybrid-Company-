// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizedOrder } from "@/lib/orders.server";
import { requireAdmin } from "@/lib/fulfillment.server";
import { digest } from "@/lib/checkout.server";
import { commerceAccount, handleAccount } from "@/lib/account-http.server";
import { handleCommerce } from "@/lib/commerce-http.server";
import { readCommerceBody } from "@/lib/commerce-db.server";
import { addressSchema } from "@/lib/shipping";
import { securityHeaders } from "@/lib/security-headers";

import { orderAccessFragment, readOrderAccessFragment } from "@/lib/payment";
it("mantém a credencial de convidado fora do pedido HTTP inicial", () => {
  const token = "a".repeat(64);
  const url = new URL("https://loja.example.test/pedido/1/confirmado");
  url.hash = orderAccessFragment(token);
  expect(url.pathname + url.search).not.toContain(token);
  expect(readOrderAccessFragment(url.hash)).toBe(token);
  expect(readOrderAccessFragment("acesso=invalido")).toBeUndefined();
  expect(orderAccessFragment()).toBe("");
});
const origin = "https://loja.example.test";
const user = "b255196e-f28a-4122-9ff5-9081829659a2";
const session = "db8a9c27-6fe8-4b11-8f93-cce700102951";
function request(path: string, body = "{}", headers: Record<string, string> = {}) {
  return new Request(origin + path, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body,
  });
}
beforeEach(() => {
  vi.stubEnv("YBRD_SITE_ORIGIN", origin);
  vi.stubEnv("SUPABASE_URL", "https://backend.example.test");
  vi.stubEnv("YBRD_SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("YBRD_AUTH_GATEWAY_LOCKED", "true");
  vi.stubEnv("YBRD_SECURITY_PEPPER", "test-pepper-that-is-at-least-32-characters");
  vi.stubEnv("YBRD_CHECKOUT_ENABLED", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Sessões da conta na loja", () => {
  // An opaque test token makes the SDK verify with /auth/v1/user.
  function mockSession(access: string | null, aal = "aal1", adminRole = false) {
    const token = [
      "eyJhbGciOiJIUzI1NiJ9",
      Buffer.from(
        JSON.stringify({
          sub: user,
          session_id: session,
          aal,
          exp: Math.floor(Date.now() / 1000) + 600,
        }),
      ).toString("base64url"),
      "c2lnbmF0dXJl",
    ].join(".");
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: user });
      if (url.endsWith("/rpc/has_role")) return Response.json(adminRole);
      if (url.endsWith("/rpc/ybrd_session_access")) {
        expect(JSON.parse(String(init?.body))).toEqual({
          p_id: session,
          p_user: user,
          p_purpose: "login",
        });
        return Response.json(access);
      }
      throw new Error("Unexpected upstream request");
    });
    vi.stubGlobal("fetch", fetch);
    return request("/api/loja/pedidos", "{}", { cookie: `__Host-ybrd-account-at=${token}` });
  }
  it("reconhece a mesma finalidade login registrada pela autenticação", async () => {
    expect((await commerceAccount(mockSession("ok")))?.id).toBe(user);
  });
  it("nega decisão de sessão desconhecida mesmo com segundo fator", async () => {
    await expect(commerceAccount(mockSession("unexpected", "aal2"))).rejects.toMatchObject({
      status: 401,
    });
  });
  it("exige papel, fator ativo e sessão que concluiu o desafio administrativo", async () => {
    await expect(requireAdmin(mockSession("ok", "aal2", true))).rejects.toMatchObject({
      status: 403,
    });
    await expect(requireAdmin(mockSession("mfa", "aal1", true))).rejects.toMatchObject({
      status: 401,
    });
    await expect(requireAdmin(mockSession("mfa", "aal2", false))).rejects.toMatchObject({
      status: 403,
    });
    await expect(requireAdmin(mockSession("mfa", "aal2", true))).resolves.toMatchObject({
      id: user,
    });
  });
  it("rejeita sessões revogadas", async () => {
    await expect(commerceAccount(mockSession(null))).rejects.toMatchObject({ status: 401 });
  });
  it("exige segundo fator quando ele estiver habilitado", async () => {
    await expect(commerceAccount(mockSession("mfa"))).rejects.toMatchObject({ status: 401 });
    expect((await commerceAccount(mockSession("mfa", "aal2")))?.id).toBe(user);
  });
  it("trata cookie malformado como ausência de sessão", async () => {
    expect(
      await commerceAccount(
        request("/api/loja/pedidos", "{}", { cookie: "__Host-ybrd-account-at=%ZZ" }),
      ),
    ).toBeNull();
    const status = await handleAccount(
      request("/api/conta/status", "{}", { cookie: "__Host-ybrd-account-rt=%ZZ" }),
      "status",
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ user: null });
  });
});

describe("Limites HTTP", () => {
  it.each([
    "application/json",
    "Application/JSON; charset=UTF-8",
    "application/json ; charset=utf-8",
  ])("aceita JSON com Content-Type %s", async (type) => {
    expect(
      await readCommerceBody(request("/api/loja/sacola", "{}", { "content-type": type })),
    ).toEqual({});
  });
  it.each(["text/plain", "text/html", "application/x-www-form-urlencoded"])(
    "rejeita formato %s",
    async (type) => {
      await expect(
        readCommerceBody(request("/api/loja/sacola", "{}", { "content-type": type })),
      ).rejects.toMatchObject({ status: 415 });
    },
  );
  it.each(["{", "undefined", ""])("rejeita JSON inválido %s", async (body) => {
    await expect(readCommerceBody(request("/api/loja/sacola", body))).rejects.toMatchObject({
      status: 400,
    });
  });
  it("limita corpo com e sem Content-Length", async () => {
    for (const headers of [{}, { "content-length": "20000" }]) {
      await expect(
        readCommerceBody(request("/api/loja/sacola", " ".repeat(16385), headers)),
      ).rejects.toMatchObject({ status: 413 });
    }
  });
  it("rejeita mutações entre origens, mesmo com checkout desativado", async () => {
    const response = await handleCommerce(
      request("/api/loja/catalogo", "{}", { origin: "https://externo.test" }),
      "catalogo",
    );
    expect(response.status).toBe(403);
  });
  it("descarta operações desconhecidas antes do banco", async () => {
    vi.stubEnv("YBRD_CHECKOUT_ENABLED", "true");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect((await handleCommerce(request("/api/loja/desconhecida"), "desconhecida")).status).toBe(
      404,
    );
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    ["{}", 200],
    ['{"extra":1}', 400],
    [" ".repeat(16385), 413],
  ] as const)("valida o corpo de consulta pública do catálogo (caso %#)", async (body, status) => {
    expect((await handleCommerce(request("/api/loja/catalogo", body), "catalogo")).status).toBe(
      status,
    );
  });
  it("bloqueia compras e webhooks enquanto a loja está desabilitada", async () => {
    for (const operation of [
      "pagar",
      "revisao",
      "webhook-mercado-pago",
      "tarefas",
      "admin-pedidos",
    ]) {
      expect((await handleCommerce(request(`/api/loja/${operation}`), operation)).status).toBe(503);
    }
  });
  it.each(["/minha-conta", "/checkout", "/pedido/teste/confirmado", "/admin/pedidos", "/entrar"])(
    "evita cache e envio de referência em %s",
    (path) => {
      const response = securityHeaders(
        new Request(origin + path),
        new Response("<html></html>", { headers: { "content-type": "text/html" } }),
        "test",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    },
  );
});

const address = {
  cep: "70040900",
  destinatario: "Pessoa Teste",
  telefone: "61999999999",
  rua: "Rua Teste",
  numero: "1",
  complemento: "",
  bairro: "Centro",
  cidade: "Brasília",
  uf: "DF",
};
it.each(["destinatario", "rua", "numero", "complemento", "bairro", "cidade"])(
  "rejeita controles em endereço.%s",
  (field) => {
    expect(addressSchema.safeParse(address).success).toBe(true);
    expect(addressSchema.safeParse({ ...address, [field]: "Teste\u0000" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...address, [field]: "\nTeste" }).success).toBe(false);
  },
);

it("retorna 401 na loja quando o JWT expirou, sem converter em indisponibilidade", async () => {
  vi.stubEnv("YBRD_CHECKOUT_ENABLED", "true");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ allowed: true })),
  );
  const response = await handleCommerce(
    request("/api/loja/sacola", JSON.stringify({ account: true, items: [] }), {
      "cf-connecting-ip": "192.0.2.1",
      cookie: "__Host-ybrd-account-at=invalid-token",
    }),
    "sacola",
  );
  expect(response.status).toBe(401);
});

describe("Autorização de pedidos", () => {
  function database(order: object | null) {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: order, error: null }),
    };
    return { from: () => query } as unknown as SupabaseClient;
  }
  it("não revela pedido de outro usuário apenas pelo ID", async () => {
    const db = database({ id: session, user_id: user });
    await expect(
      authorizedOrder(db, request("/api/loja/pedido-detalhe"), { id: session }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("rejeita token incorreto e aceita somente o segredo correspondente ao pedido de convidado", async () => {
    const access = "a".repeat(64);
    const db = database({
      id: session,
      user_id: null,
      acesso_hash: await digest(access),
      acesso_versao: 0,
      criado_em: new Date().toISOString(),
    });
    await expect(
      authorizedOrder(db, request("/api/loja/pedido-detalhe"), {
        id: session,
        acesso: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await authorizedOrder(db, request("/api/loja/pedido-detalhe"), {
          id: session,
          acesso: access,
        })
      ).id,
    ).toBe(session);
  });
  it("retorna a mesma recusa para pedido inexistente", async () => {
    await expect(
      authorizedOrder(database(null), request("/api/loja/pedido-detalhe"), { id: session }),
    ).rejects.toMatchObject({ status: 404, message: "Pedido não encontrado." });
  });
});
