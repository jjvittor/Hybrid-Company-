import { z } from "zod";
import { cartInput, defaultCommerce, type CartEntry } from "./commerce";
import { commerceAccount } from "./account-http.server";
import {
  CommerceError,
  commerceBackend,
  commerceCatalog,
  commerceRate,
  commerceRpc,
  readCommerceBody,
  revalidateCart,
} from "./commerce-db.server";
import { lookupCep, quoteShipping } from "./shipping.server";
import { cepSchema, shippingInput } from "./shipping";
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
    await commerceRate(
      db,
      request,
      operation,
      operation === "frete" || operation === "cep" ? 30 : 90,
    );
    if (operation === "cep") {
      const input = z.object({ cep: cepSchema }).parse(await readCommerceBody(request));
      return Response.json(await lookupCep(input.cep), { headers });
    }
    if (operation === "frete") {
      const input = shippingInput.parse(await readCommerceBody(request));
      return Response.json(await quoteShipping(db, input.cep, input.items), { headers });
    }
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
