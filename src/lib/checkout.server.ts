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
export const orderAccess = (id: string, actorHash: string) =>
  signCommerce(`order:${id}:${actorHash}`);
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
      ...(actor.user ? {} : { acesso: await orderAccess(prior.data.id, actor.hash) }),
    };
  const { reviewToken, frete, ...price } = await reviewCheckout(db, input, actor.hash);
  if (!equalSecret(reviewToken, input.reviewToken))
    throw new CommerceError(409, "Os valores mudaram. Revise o pedido novamente.");
  const id = crypto.randomUUID();
  const access = actor.user ? null : await orderAccess(id, actor.hash);
  const order = await commerceRpc<PlacedOrder>(db, "commerce_place", {
    p_input: {
      actor: actor.hash,
      customer: await signCommerce(`cpf:${input.contato.cpf}`),
      user: actor.user,
      order: id,
      idempotencia: input.idempotencia,
      access: access ? await digest(access) : null,
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
  return { ...order, ...(actor.user ? {} : { acesso: await orderAccess(order.id, actor.hash) }) };
}
