import { timingSafeEqual } from "node:crypto";

export function webhookSecret(env: Readonly<Record<string, string | undefined>>) {
  return env["YBRD_MP_SANDBOX"] === "false"
    ? env["YBRD_MP_WEBHOOK_SECRET"]
    : env["YBRD_MP_TEST_WEBHOOK_SECRET"];
}

export function validMaintenanceKey(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 32) return false;
  const encoder = new TextEncoder();
  const supplied = encoder.encode(request.headers.get("authorization") ?? "");
  const expected = encoder.encode(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function verifyMercadoPagoSignature(
  request: Request,
  paymentId: string,
  secret: string,
  now = Date.now(),
) {
  const requestId = request.headers.get("x-request-id") ?? "";
  const header = request.headers.get("x-signature") ?? "";
  if (!header || header.length > 512) return false;
  const parts = new Map(
    header.split(",").map((part) => {
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
