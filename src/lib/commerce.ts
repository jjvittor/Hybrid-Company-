import { z } from "zod";

z.config({ jitless: true });
export const cartEntry = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  size: z.string().max(8),
  quantity: z.number().int().min(1).max(99),
});
export const cartEntries = z.array(cartEntry).max(40);
export type CartEntry = z.infer<typeof cartEntry>;
export type CartChange = { slug: string; size: string; delta: -1 | 0 | 1 };
export const cartInput = z.object({
  items: cartEntries.default([]),
  account: z.boolean().default(false),
  mergeId: z.uuid().optional(),
  change: cartEntry
    .pick({ slug: true, size: true })
    .extend({ delta: z.union([z.literal(-1), z.literal(0), z.literal(1)]) })
    .optional(),
});
export type LiveProduct = {
  slug: string;
  priceCentavos: number;
  editionTotal: number;
  available: number;
  variants: { size: string; stock: number }[];
};
export type CommerceStatus = {
  enabled: boolean;
  products: LiveProduct[];
  pixPercent: number;
  maxInstallments: number;
  minInstallmentCentavos: number;
  freeShippingCentavos: number | null;
};
export type CartReply = { items: CartEntry[]; subtotalCentavos: number; notices: string[] };
export const defaultCommerce: CommerceStatus = {
  enabled: false,
  products: [],
  pixPercent: 0,
  maxInstallments: 1,
  minInstallmentCentavos: 3000,
  freeShippingCentavos: null,
};
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (centavos: number) => money.format(centavos / 100);
export function installments(total: number, minimum: number, maximum: number) {
  return Math.max(1, Math.min(maximum, Math.floor(total / Math.max(1, minimum))));
}
export async function commerceRequest<T>(
  operation: string,
  input: object = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/loja/${operation}`, {
    method: "POST",
    credentials: "same-origin",
    mode: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result)
    throw new Error(result?.message || "Não foi possível concluir. Tente novamente.");
  return result as T;
}
