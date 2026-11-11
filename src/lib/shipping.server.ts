import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type CartEntry } from "./commerce";
import {
  CommerceError,
  commerceCatalog,
  commerceRpc,
  commerceSettings,
  revalidateCart,
} from "./commerce-db.server";
import { cepSchema, states, type ShippingQuote, type ShippingReply } from "./shipping";

class ShortCache<T> {
  private values = new Map<string, { value: T; until: number }>();
  get(key: string) {
    const cached = this.values.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    this.values.delete(key);
    return undefined;
  }
  set(key: string, value: T) {
    if (this.values.size >= 512) this.values.delete(this.values.keys().next().value!);
    this.values.set(key, { value, until: Date.now() + 600_000 });
  }
}
const cepCache = new ShortCache<{ rua: string; bairro: string; cidade: string; uf: string }>();
const quoteCache = new ShortCache<ShippingQuote[]>();
const viaCep = z.object({
  logradouro: z.string().max(100),
  bairro: z.string().max(60),
  localidade: z.string().max(60),
  uf: z.enum(states),
});
export async function lookupCep(cep: string) {
  cepSchema.parse(cep);
  const cached = cepCache.get(cep);
  if (cached) return cached;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("CEP");
    const data = viaCep.parse(await response.json());
    const address = {
      rua: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      uf: data.uf,
    };
    cepCache.set(cep, address);
    return address;
  } catch {
    throw new CommerceError(422, "Não localizamos o CEP. Preencha o endereço à mão.");
  }
}
type Package = {
  id: string;
  peso: number;
  altura: number;
  largura: number;
  comprimento: number;
  quantidade: number;
  preco: number;
};
export interface ShippingProvider {
  quote(input: { cep: string; items: Package[] }): Promise<ShippingQuote[]>;
}
export function decimalCentavos(value: unknown) {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(String(value));
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : null;
}
const service = z.object({
  id: z.union([z.number().int(), z.string().max(20)]),
  name: z.string().max(80),
  price: z.union([z.number(), z.string()]),
  delivery_time: z.number().int().min(0).max(180),
  error: z.unknown().optional(),
});
class MelhorEnvio implements ShippingProvider {
  async quote({ cep, items }: { cep: string; items: Package[] }) {
    const token = process.env["YBRD_MELHOR_ENVIO_TOKEN"];
    const agent = process.env["YBRD_MELHOR_ENVIO_USER_AGENT"];
    const origin = cepSchema.safeParse(process.env["YBRD_ORIGIN_CEP"]);
    if (!token || !agent || !origin.success) return [];
    const url =
      process.env["YBRD_MELHOR_ENVIO_SANDBOX"] === "false"
        ? "https://melhorenvio.com.br"
        : "https://sandbox.melhorenvio.com.br";
    const response = await fetch(`${url}/api/v2/me/shipment/calculate`, {
      method: "POST",
      signal: AbortSignal.timeout(6000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": agent,
      },
      body: JSON.stringify({
        from: { postal_code: origin.data },
        to: { postal_code: cep },
        products: items.map((i) => ({
          id: i.id,
          width: i.largura,
          height: i.altura,
          length: i.comprimento,
          weight: i.peso / 1000,
          insurance_value: i.preco / 100,
          quantity: i.quantidade,
        })),
      }),
    });
    if (!response.ok) return [];
    const result: unknown = await response.json();
    if (!Array.isArray(result)) return [];
    return result.slice(0, 30).flatMap((value) => {
      const parsed = service.safeParse(value);
      if (!parsed.success || parsed.data.error) return [];
      const price = decimalCentavos(parsed.data.price);
      return price === null
        ? []
        : [
            {
              id: `me-${parsed.data.id}`,
              nome: parsed.data.name,
              precoCentavos: price,
              prazoDias: parsed.data.delivery_time,
            },
          ];
    });
  }
}
const fixedRates = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]{1,30}$/),
      nome: z.string().max(80),
      inicio: cepSchema,
      fim: cepSchema,
      precoCentavos: z.number().int().min(0).max(100000000),
      prazoDias: z.number().int().min(1).max(180),
      pesoMaximoG: z.number().int().positive(),
    }),
  )
  .max(100);
class FixedShipping implements ShippingProvider {
  constructor(private rates: unknown) {}
  async quote({ cep, items }: { cep: string; items: Package[] }) {
    const rates = fixedRates.safeParse(this.rates);
    if (!rates.success) return [];
    const weight = items.reduce((total, item) => total + item.peso * item.quantidade, 0);
    return rates.data
      .filter((r) => cep >= r.inicio && cep <= r.fim && weight <= r.pesoMaximoG)
      .map((r) => ({
        id: `fixo-${r.id}`,
        nome: r.nome,
        precoCentavos: r.precoCentavos,
        prazoDias: r.prazoDias,
      }));
  }
}
class MockShipping implements ShippingProvider {
  async quote() {
    return [{ id: "teste", nome: "Entrega de teste", precoCentavos: 2500, prazoDias: 5 }];
  }
}
export async function quoteShipping(
  db: SupabaseClient,
  cep: string,
  items: CartEntry[],
): Promise<ShippingReply> {
  await commerceRpc(db, "commerce_expire_orders", { p_limit: 20 });
  const [catalog, settings] = await Promise.all([commerceCatalog(db), commerceSettings(db)]);
  const validated = revalidateCart(items, catalog);
  if (validated.notices.length || !validated.items.length)
    throw new CommerceError(409, "Atualize sua sacola antes de calcular o frete.");
  const result = await db
    .from("products")
    .select(
      "slug,preco_centavos,peso_g,comprimento_cm,largura_cm,altura_cm,product_variants(id,tamanho,peso_g,comprimento_cm,largura_cm,altura_cm)",
    )
    .eq("ativo", true)
    .in("slug", [...new Set(validated.items.map((i) => i.slug))]);
  if (result.error) throw new CommerceError(503, "Não foi possível calcular o frete.");
  const packages = validated.items
    .map((i) => {
      const p = result.data.find((row) => row.slug === i.slug);
      const v = p?.product_variants.find((row) => row.tamanho === i.size);
      const peso = v?.peso_g ?? p?.peso_g;
      const altura = v?.altura_cm ?? p?.altura_cm;
      const largura = v?.largura_cm ?? p?.largura_cm;
      const comprimento = v?.comprimento_cm ?? p?.comprimento_cm;
      if (!p || !v || !peso || !altura || !largura || !comprimento)
        throw new CommerceError(422, "O frete de uma das peças ainda não está disponível.");
      return {
        id: v.id,
        peso,
        altura,
        largura,
        comprimento,
        quantidade: i.quantity,
        preco: p.preco_centavos,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const mock = process.env["YBRD_SHIPPING_MOCK"] === "true";
  if (mock && process.env["NODE_ENV"] === "production")
    throw new CommerceError(503, "Frete temporariamente indisponível.");
  const key = JSON.stringify([
    cep,
    packages,
    mock,
    settings.get("frete_fixo"),
    process.env["YBRD_ORIGIN_CEP"],
    process.env["YBRD_MELHOR_ENVIO_SANDBOX"],
  ]);
  let options = quoteCache.get(key);
  if (!options) {
    options = await (mock ? new MockShipping() : new MelhorEnvio())
      .quote({ cep, items: packages })
      .catch(() => []);
    if (!options.length)
      options = await new FixedShipping(settings.get("frete_fixo")).quote({ cep, items: packages });
    if (options.length) quoteCache.set(key, options);
  }
  const sorted = [...options].sort(
    (a, b) => a.precoCentavos - b.precoCentavos || a.prazoDias - b.prazoDias,
  );
  const free = catalog.freeShippingCentavos;
  if (sorted[0] && free !== null && validated.subtotalCentavos >= free)
    sorted[0] = { ...sorted[0], precoCentavos: 0 };
  return { options: sorted, subtotalCentavos: validated.subtotalCentavos };
}
