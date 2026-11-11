// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actions } from "@/lib/account-schema";
import { handleAccount } from "@/lib/account-http.server";
import { securityHeaders } from "@/lib/security-headers";

const origin = "https://loja.example.test";
function request(action: string, body = "{}", headers?: HeadersInit) {
  return new Request(`${origin}/api/conta/${action}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "cf-connecting-ip": "192.0.2.1",
      ...headers,
    },
    body,
  });
}

describe("Conta Ybrd", () => {
  beforeEach(() => {
    vi.stubEnv("YBRD_SITE_ORIGIN", origin);
    vi.stubEnv("SUPABASE_URL", "https://backend.example.test");
    vi.stubEnv("YBRD_SUPABASE_SECRET_KEY", "sb_secret_only_for_test");
    vi.stubEnv("YBRD_SECURITY_PEPPER", "test-pepper-that-is-at-least-32-characters");
    vi.stubEnv("YBRD_AUTH_GATEWAY_LOCKED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("applies a CSP with nonce and makes account responses non-cacheable", () => {
    const response = securityHeaders(
      request("status"),
      Response.json({ user: null }),
      "test-nonce",
    );
    expect(response.headers.get("Content-Security-Policy")).toContain("'nonce-test-nonce'");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
  });

  it("rejects cross-origin mutations, oversized bodies and unsupported methods", async () => {
    expect(
      (await handleAccount(request("login", "{}", { origin: "https://externo.example" }), "login"))
        .status,
    ).toBe(403);
    expect((await handleAccount(request("login", " ".repeat(8193)), "login")).status).toBe(413);
    expect((await handleAccount(new Request(`${origin}/api/conta/login`), "login")).status).toBe(
      405,
    );
  });

  it("keeps profile endpoints inaccessible without a verified session", async () => {
    expect((await handleAccount(request("profile"), "profile")).status).toBe(401);
    expect(
      (await handleAccount(request("delete", '{"current":"qualquer","confirm":true}'), "delete"))
        .status,
    ).toBe(401);
  });

  it("rejects public calls until the authentication gateway is locked down", async () => {
    vi.stubEnv("YBRD_AUTH_GATEWAY_LOCKED", "false");
    const body = JSON.stringify({ email: "exemplo@example.test", password: "qualquer" });
    expect((await handleAccount(request("login", body), "login")).status).toBe(503);
  });

  it("returns 429 before calling the password endpoint when the quota is exhausted", async () => {
    const mock = vi.fn(() => Promise.resolve(Response.json({ allowed: false })));
    vi.stubGlobal("fetch", mock);
    const body = JSON.stringify({ email: "exemplo@example.test", password: "qualquer" });
    const response = await handleAccount(request("login", body), "login");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("requires CAPTCHA after the server flags three prior login attempts", async () => {
    vi.stubEnv("YBRD_TURNSTILE_SECRET", "turnstile-test-secret");
    const mock = vi.fn(() =>
      Promise.resolve(Response.json({ allowed: true, count: 1, captcha: true })),
    );
    vi.stubGlobal("fetch", mock);
    const body = JSON.stringify({ email: "exemplo@example.test", password: "qualquer" });
    const response = await handleAccount(request("login", body), "login");
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ captcha: true });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("allows only local redirects and rejects edits to roles or profile IDs", () => {
    const credentials = { email: "teste@example.test", password: "exemplo" };
    for (const next of ["https://fora.example", "//fora.example", "/admin", "/\\fora.example"]) {
      expect(actions.login.safeParse({ ...credentials, next }).success).toBe(false);
    }
    expect(actions.login.parse(credentials).next).toBe("/minha-conta");
    expect(
      actions["save-profile"].safeParse({ nome: "Teste", telefone: "", role: "admin" }).success,
    ).toBe(false);
    expect(actions["save-profile"].safeParse({ nome: "Nome\u0000", telefone: "" }).success).toBe(
      false,
    );
  });

  it("rejects weak passwords, reused identity and bcrypt truncation", () => {
    const identity = { nome: "Teste Exemplo", email: "teste@example.test" };
    for (const password of [
      "curta",
      "Senha123456789",
      "Teste Exemplo",
      "teste@example.test",
      "é".repeat(37),
    ]) {
      expect(
        actions.signup.safeParse({ ...identity, password, confirmation: password }).success,
      ).toBe(false);
    }
    const password = "Exemplo Longo 2026! Diferente";
    expect(
      actions.signup.safeParse({ ...identity, password, confirmation: password }).success,
    ).toBe(true);
  });
});
