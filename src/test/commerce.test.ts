import { afterEach, describe, expect, it, vi } from "vitest";
import { validCpf } from "@/lib/checkout";
import { defaultCommerce } from "@/lib/commerce";
import { revalidateCart } from "@/lib/commerce-db.server";
import { decimalCentavos } from "@/lib/shipping.server";
import { mockAllowed, verifyMercadoPagoSignature } from "@/lib/payment.server";

afterEach(() => vi.unstubAllEnvs());
describe("Regras comerciais", () => {
  it("confere os dígitos verificadores do CPF e rejeita sequências repetidas", () => {
    expect(validCpf("52998224725")).toBe(true);
    expect(validCpf("52998224726")).toBe(false);
    expect(validCpf("11111111111")).toBe(false);
  });
  it("limita entradas duplicadas pelo estoque e calcula somente com preços do catálogo", () => {
    const result = revalidateCart(
      [
        { slug: "tee", size: "G", quantity: 2 },
        { slug: "tee", size: "G", quantity: 3 },
        { slug: "tee", size: "GG", quantity: 1 },
      ],
      {
        ...defaultCommerce,
        enabled: true,
        products: [
          {
            slug: "tee",
            priceCentavos: 18900,
            editionTotal: 5,
            available: 1,
            variants: [{ size: "G", stock: 1 }],
          },
        ],
      },
    );
    expect(result.items).toEqual([{ slug: "tee", size: "G", quantity: 1 }]);
    expect(result.subtotalCentavos).toBe(18900);
    expect(result.notices).toContain("Último item disponível.");
    expect(result.notices).toContain("Esgotado, removemos da sacola.");
  });
  it("converte valores externos sem aritmética de ponto flutuante", () => {
    expect(decimalCentavos("38.19")).toBe(3819);
    expect(decimalCentavos("0.1")).toBe(10);
    expect(decimalCentavos("1.001")).toBeNull();
    expect(decimalCentavos("-12")).toBeNull();
  });
  it("permite o mock somente em desenvolvimento local", () => {
    vi.stubEnv("YBRD_PAYMENT_MOCK", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect(mockAllowed(new Request("http://localhost/api/loja/pagar"))).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(mockAllowed(new Request("https://loja.example/api/loja/pagar"))).toBe(false);
    expect(mockAllowed(new Request("http://localhost/api/loja/pagar"))).toBe(true);
  });
  it("valida a assinatura e rejeita referência alterada ou timestamp expirado", async () => {
    const secret = "segredo-apenas-para-teste";
    const ts = "1800000000";
    const time = Number(ts) * 1000;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signed = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`id:123;request-id:req-abc;ts:${ts};`),
    );
    const hex = Array.from(new Uint8Array(signed), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const request = new Request("https://loja.example/api/loja/webhook-mercado-pago?data.id=123", {
      headers: { "x-request-id": "req-abc", "x-signature": `ts=${ts},v1=${hex}` },
    });
    await expect(verifyMercadoPagoSignature(request, "123", secret, time)).resolves.toBe(true);
    await expect(verifyMercadoPagoSignature(request, "124", secret, time)).resolves.toBe(false);
    await expect(verifyMercadoPagoSignature(request, "123", secret, time + 301000)).resolves.toBe(
      false,
    );
  });
});
