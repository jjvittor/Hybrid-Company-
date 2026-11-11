import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { cartInput, defaultCommerce, type CartEntry, type CommerceStatus } from "./commerce";
import { commerceAccount } from "./account-http.server";

export class CommerceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function commerceBackend() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["YBRD_SUPABASE_SECRET_KEY"];
  if (!url || !key?.startsWith("sb_secret_"))
    throw new CommerceError(503, "Loja temporariamente indisponível.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
  });
}
export async function readCommerceBody(request: Request, max = 16384): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new CommerceError(415, "Formato inválido.");
  if (Number(request.headers.get("content-length")) > max)
    throw new CommerceError(413, "Solicitação muito grande.");
  const reader = request.body?.getReader();
  if (!reader) throw new CommerceError(400, "Preencha os dados solicitados.");
  const bytes = new Uint8Array(max);
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (length + next.value.length > max) {
        void reader.cancel();
        throw new CommerceError(413, "Solicitação muito grande.");
      }
      bytes.set(next.value, length);
      length += next.value.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
  } catch (error) {
    if (error instanceof CommerceError) throw error;
    throw new CommerceError(400, "Preencha os dados solicitados.");
  } finally {
    reader.releaseLock();
  }
}
export async function commerceRpc<T>(
  db: SupabaseClient,
  name: string,
  params: Record<string, unknown>,
): Promise<T> {
  const result = await db.rpc(name, params);
  if (result.error) throw new CommerceError(409, "Confira os dados e tente novamente.");
  return result.data as T;
}
export async function commerceSettings(db: SupabaseClient) {
  const result = await db.from("settings").select("chave,valor");
  if (result.error) throw new CommerceError(503, "Loja temporariamente indisponível.");
  return new Map<string, unknown>(result.data.map((row) => [row.chave, row.valor]));
}
function integer(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}
export async function commerceCatalog(db: SupabaseClient): Promise<CommerceStatus> {
  const [{ data, error }, settings] = await Promise.all([
    db
      .from("products")
      .select("slug,preco_centavos,edicao_total,product_variants(tamanho,estoque)")
      .eq("ativo", true),
    commerceSettings(db),
  ]);
  if (error) throw new CommerceError(503, "Não foi possível consultar o estoque.");
  return {
    enabled: true,
    products: data.map((row) => ({
      slug: row.slug,
      priceCentavos: row.preco_centavos,
      editionTotal: row.edicao_total,
      available: Math.min(
        row.edicao_total,
        row.product_variants.reduce((n, variant) => n + variant.estoque, 0),
      ),
      variants: row.product_variants.map((v) => ({ size: v.tamanho, stock: v.estoque })),
    })),
    pixPercent: integer(settings.get("pix_percentual"), 0, 0, 100),
    maxInstallments: integer(settings.get("parcelas_maximas"), 1, 1, 6),
    minInstallmentCentavos: integer(settings.get("parcela_minima_centavos"), 3000, 1, 100000000),
    freeShippingCentavos:
      integer(settings.get("frete_gratis_acima_centavos"), -1, 0, 100000000) < 0
        ? null
        : Number(settings.get("frete_gratis_acima_centavos")),
  };
}
export function revalidateCart(
  items: CartEntry[],
  catalog: CommerceStatus,
  notices: string[] = [],
) {
  const unique = new Map<string, CartEntry>();
  for (const item of items) {
    const key = `${item.slug}:${item.size}`;
    const previous = unique.get(key)?.quantity ?? 0;
    unique.set(key, { ...item, quantity: Math.min(99, item.quantity + previous) });
  }
  let subtotalCentavos = 0;
  const validated = [...unique.values()].flatMap((item) => {
    const product = catalog.products.find((p) => p.slug === item.slug);
    const variant = product?.variants.find((v) => v.size === item.size);
    if (!product || !variant?.stock) {
      notices.push("Esgotado, removemos da sacola.");
      return [];
    }
    const quantity = Math.min(item.quantity, variant.stock);
    if (quantity !== item.quantity)
      notices.push(
        variant.stock === 1
          ? "Último item disponível."
          : "Quantidade ajustada ao estoque disponível.",
      );
    subtotalCentavos += product.priceCentavos * quantity;
    return [{ ...item, quantity }];
  });
  return { items: validated, subtotalCentavos, notices: [...new Set(notices)] };
}
export async function commerceRate(
  db: SupabaseClient,
  request: Request,
  operation: string,
  limit: number,
) {
  const ip = request.headers.get(process.env["YBRD_TRUSTED_IP_HEADER"] ?? "cf-connecting-ip");
  const parsed = z.union([z.ipv4(), z.ipv6()]).safeParse(ip);
  const dev =
    process.env["NODE_ENV"] !== "production" && new URL(request.url).hostname === "localhost";
  const pepper = process.env["YBRD_SECURITY_PEPPER"];
  if ((!parsed.success && !dev) || !pepper || pepper.length < 32)
    throw new CommerceError(503, "Loja temporariamente indisponível.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`loja:${operation}:${parsed.data ?? "local"}`),
  );
  const hash = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const result = await commerceRpc<{ allowed: boolean }>(db, "ybrd_attempt", {
    p_ip: hash,
    p_subject: hash,
    p_ip_limit: limit,
    p_subject_limit: limit,
    p_login: false,
  });
  if (!result.allowed) throw new CommerceError(429, "Aguarde um instante e tente novamente.");
  return hash;
}
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export async function handleCommerce(request: Request, operation: string) {
  try {
    if (request.method !== "POST")
      return Response.json(
        { message: "Método não disponível." },
        { status: 405, headers: { ...headers, Allow: "POST" } },
      );
    const origin = new URL(request.url).origin;
    if (
      request.headers.get("origin") !== origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new CommerceError(403, "Solicitação não autorizada.");
    const enabled = process.env["YBRD_CHECKOUT_ENABLED"] === "true";
    if (operation === "catalogo" && !enabled) return Response.json(defaultCommerce, { headers });
    if (!enabled || process.env["YBRD_SITE_ORIGIN"] !== origin)
      throw new CommerceError(503, "Compras ainda indisponíveis.");
    const db = commerceBackend();
    await commerceRate(db, request, operation, 90);
    if (operation === "catalogo") return Response.json(await commerceCatalog(db), { headers });
    if (operation !== "sacola") throw new CommerceError(404, "Página não encontrada.");
    const input = cartInput.parse(await readCommerceBody(request));
    const identity = input.account ? await commerceAccount(request) : null;
    if (input.account && !identity) throw new CommerceError(401, "Entre novamente na sua conta.");
    await commerceRpc(db, "commerce_expire_orders", { p_limit: 20 });
    const catalog = await commerceCatalog(db);
    const stored = identity
      ? await commerceRpc<{ items: CartEntry[]; notices: string[] }>(db, "commerce_cart", {
          p_user: identity.id,
          p_merge: input.mergeId ?? null,
          p_items: revalidateCart(input.items, catalog).items,
          p_change: input.change ?? null,
        })
      : { items: input.items, notices: [] };
    return Response.json(
      { ...revalidateCart(stored.items, catalog, stored.notices), catalog },
      { headers },
    );
  } catch (error) {
    if (error instanceof CommerceError)
      return Response.json({ message: error.message }, { status: error.status, headers });
    if (error instanceof z.ZodError)
      return Response.json({ message: "Confira os dados informados." }, { status: 400, headers });
    return Response.json(
      { message: "Não foi possível concluir. Tente novamente." },
      { status: 503, headers },
    );
  }
}
