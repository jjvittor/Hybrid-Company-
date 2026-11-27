import { timingSafeEqual } from "node:crypto";

export function mercadoPagoCredentials(
  env: Readonly<Record<string, string | undefined>>,
  origin = env["YBRD_SITE_ORIGIN"],
) {
  if (!origin || origin !== env["YBRD_SITE_ORIGIN"] || env["YBRD_PAYMENT_MOCK"] === "true")
    return null;
  let site: URL;
  try {
    site = new URL(origin);
  } catch {
    return null;
  }
  if (site.origin !== origin) return null;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
  const live = env["YBRD_MP_SANDBOX"] === "false";
  if (!live && env["YBRD_MP_SANDBOX"] !== "true") return null;
  if (local) {
    if (live || env["NODE_ENV"] === "production" || !["http:", "https:"].includes(site.protocol))
      return null;
  } else {
    const production = env["YBRD_MP_PRODUCTION_ORIGIN"];
    if (!production || !production.startsWith("https://") || site.protocol !== "https:") return null;
    try {
      if (new URL(production).origin !== production || (origin === production) !== live) return null;
    } catch {
      return null;
    }
  }
  const prefix = live ? "YBRD_MP_" : "YBRD_MP_TEST_";
  const accessToken = env[prefix + "ACCESS_TOKEN"];
  const publicKey = env[prefix + "PUBLIC_KEY"] || null;
  const webhookSecret = env[prefix + "WEBHOOK_SECRET"];
  const collectorId = env[prefix + "COLLECTOR_ID"];
  if (!accessToken || !webhookSecret || !collectorId || !/^[1-9]\d{0,19}$/.test(collectorId))
    return null;
  if (
    live &&
    (/^TEST-/i.test(accessToken) ||
      (publicKey && /^TEST-/i.test(publicKey)) ||
      accessToken === env["YBRD_MP_TEST_ACCESS_TOKEN"] ||
      webhookSecret === env["YBRD_MP_TEST_WEBHOOK_SECRET"] ||
      (publicKey && publicKey === env["YBRD_MP_TEST_PUBLIC_KEY"]))
  )
    return null;
  return { live, collectorId, accessToken, publicKey, webhookSecret };
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
