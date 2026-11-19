import type { SupabaseClient } from "@supabase/supabase-js";
import { commerceAccount } from "./account-http.server";
import { CommerceError, commerceRpc, commerceSettings } from "./commerce-db.server";
import {
  merchantPolicies,
  type CheckoutInput,
  type CheckoutPrice,
  type CheckoutReview,
  type PlacedOrder,
  type placeOrderSchema,
} from "./checkout";
import type { z } from "zod";
import { quoteShipping } from "./shipping.server";

const encoder = new TextEncoder();
const guestCookie = "__Host-ybrd-shop";
const toHex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (n) => n.toString(16).padStart(2, "0")).join("");
export async function digest(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
export async function signCommerce(value: string) {
  const pepper = process.env["YBRD_SECURITY_PEPPER"];
  if (!pepper || pepper.length < 32) throw new CommerceError(503, "Compras ainda indisponíveis.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(`ybrd-shop:${value}`)));
}
export function equalSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
export async function requireCommerceAccount(request: Request) {
  const account = await commerceAccount(request).catch(() => null);
  if (!account) throw new CommerceError(401, "Entre novamente na sua conta.");
  return account;
}
export async function orderActor(request: Request, headers: Headers, account: boolean) {
  if (account) {
    const user = await requireCommerceAccount(request);
    return { user: user.id, hash: await signCommerce(`user:${user.id}`) };
  }
  const existing = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((pair) => pair.startsWith(`${guestCookie}=`))
    ?.slice(guestCookie.length + 1);
  const token =
    existing && /^[a-f0-9]{64}$/.test(existing)
      ? existing
      : toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  if (token !== existing)
    headers.append(
      "Set-Cookie",
      `${guestCookie}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    );
  return { user: null, hash: await signCommerce(`guest:${token}`) };
}
const linkLifetime = 24 * 60 * 60;
export async function orderAccess(id: string, actor: string, version: number, issuedAt: number) {
  if (!Number.isSafeInteger(version) || version < 0 || !Number.isFinite(issuedAt))
    throw new CommerceError(503, "Acesso ao pedido indisponível.");
  const expires = Math.floor(issuedAt / 1000) + linkLifetime;
  const signature = await signCommerce(`order-link:v1:${id}:${actor}:${version}:${expires}`);
  return `v1.${expires}.${signature}`;
}

export async function validOrderAccess(
  order: {
    id: string;
    actor_hash: string;
    acesso_versao: number;
    acesso_hash: string;
    criado_em: string;
  },
  token: string,
  now = Date.now(),
) {
  if (!Number.isSafeInteger(order.acesso_versao) || order.acesso_versao < 0 || !order.acesso_hash)
    return false;
  if (/^[a-f0-9]{64}$/.test(token)) {
    const created = Date.parse(order.criado_em);
    return (
      order.acesso_versao === 0 &&
      created <= now &&
      now < created + 1000 * linkLifetime &&
      equalSecret(await digest(token), order.acesso_hash)
    );
  }
  const match = /^v1\.([0-9]{10})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  const current = Math.floor(now / 1000);
  if (expires <= current || expires > current + linkLifetime) return false;
  const signature = await signCommerce(
    `order-link:v1:${order.id}:${order.actor_hash}:${order.acesso_versao}:${expires}`,
  );
  return equalSecret(match[2]!, signature);
}
export async function getPolicies(db: SupabaseClient) {
  const settings = await commerceSettings(db);
  const policies = merchantPolicies.safeParse(settings.get("politicas_loja"));
  if (!policies.success || typeof settings.get("termos_versao") !== "string")
    throw new CommerceError(
      503,
      "As compras serão liberadas após a publicação das políticas da loja.",
    );
  return policies.data;
}
export async function reviewCheckout(
  db: SupabaseClient,
  input: CheckoutInput,
  actorHash: string,
): Promise<CheckoutReview> {
  await getPolicies(db);
  const customer = await signCommerce(`cpf:${input.contato.cpf}`);
  const shipping = await quoteShipping(db, input.endereco.cep, input.items);
  const option = shipping.options.find((o) => o.id === input.freteId);
  if (!option) throw new CommerceError(409, "Escolha uma opção de entrega disponível.");
  const price = await commerceRpc<CheckoutPrice>(db, "commerce_price", {
    p_items: input.items,
    p_shipping: option.precoCentavos,
    p_coupon: input.cupom,
    p_customer: customer,
    p_method: input.metodo,
  });
  if (input.parcelas > price.parcelas_maximas)
    throw new CommerceError(422, "Escolha menos parcelas para este valor.");
  const reviewToken = await signCommerce(
    JSON.stringify([
      actorHash,
      customer,
      input.contato.email,
      input.endereco,
      input.metodo,
      input.parcelas,
      option,
      price,
    ]),
  );
  return { ...price, frete: option, reviewToken };
}
export async function placeCheckout(
  db: SupabaseClient,
  input: z.infer<typeof placeOrderSchema>,
  actor: Awaited<ReturnType<typeof orderActor>>,
  risk: { network: string; verified: boolean },
): Promise<PlacedOrder> {
  const prior = await db
    .from("orders")
    .select("id,numero,status")
    .eq("actor_hash", actor.hash)
    .eq("idempotencia", input.idempotencia)
    .maybeSingle();
  if (prior.error) throw new CommerceError(503, "Não foi possível consultar o pedido.");
  if (prior.data)
    return {
      ...prior.data,
      repetido: true,
    };
  const { reviewToken, frete, ...price } = await reviewCheckout(db, input, actor.hash);
  if (!equalSecret(reviewToken, input.reviewToken))
    throw new CommerceError(409, "Os valores mudaram. Revise o pedido novamente.");
  const id = crypto.randomUUID();
  // New links use a signed expiration and a per-order generation. Keep a guest marker for legacy rows.
  const guestMarker = actor.user ? null : await digest(crypto.randomUUID());
  const order = await commerceRpc<
    PlacedOrder | { guard: "challenge" | "wait" | "quantity"; retry_after?: number }
  >(db, "commerce_place_guarded", {
    p_input: {
      actor: actor.hash,
      customer: await signCommerce(`cpf:${input.contato.cpf}`),
      user: actor.user,
      order: id,
      idempotencia: input.idempotencia,
      access: guestMarker,
      network: risk.network,
      human_verified: risk.verified,
      email: input.contato.email,
      cpf_final: input.contato.cpf.slice(-4),
      endereco: input.endereco,
      frete,
      items: input.items,
      cupom: input.cupom,
      metodo: input.metodo,
      parcelas: input.parcelas,
      expected: price,
      salvar: input.salvarEndereco,
    },
  });
  if ("guard" in order) {
    if (order.guard === "challenge")
      throw new CommerceError(403, "Confirme a verificação de segurança.", { challenge: true });
    if (order.guard === "wait")
      throw new CommerceError(429, "Aguarde antes de tentar pagar novamente.", {
        retryAfter: order.retry_after ?? 60,
      });
    throw new CommerceError(
      409,
      "Durante a alta procura, escolha até duas unidades da mesma peça.",
    );
  }
  return order;
}
