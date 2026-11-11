import { z } from "zod";
import { cartEntries, type CartEntry } from "./commerce";
import { addressSchema, type ShippingQuote } from "./shipping";

export function validCpf(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const numbers = [...cpf].map(Number);
  const digit = (length: number) => {
    const sum = numbers.slice(0, length).reduce((n, value, i) => n + value * (length + 1 - i), 0);
    return ((sum * 10) % 11) % 10;
  };
  return digit(9) === numbers[9] && digit(10) === numbers[10];
}
export const contactSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  cpf: z.string().refine(validCpf),
});
export const couponCode = z
  .string()
  .trim()
  .max(32)
  .transform((code) => code.toUpperCase())
  .refine((code) => code === "" || /^[A-Z0-9-]{3,32}$/.test(code));
export const checkoutSchema = z.object({
  account: z.boolean().default(false),
  items: cartEntries.min(1),
  contato: contactSchema,
  endereco: addressSchema,
  freteId: z.string().regex(/^[a-z0-9-]{1,60}$/i),
  cupom: couponCode.default(""),
  metodo: z.enum(["pix", "cartao", "boleto"]),
  parcelas: z.number().int().min(1).max(6),
  salvarEndereco: z.boolean().default(false),
});
export const placeOrderSchema = checkoutSchema.extend({
  reviewToken: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencia: z.uuid(),
  aceitouTermos: z.literal(true),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type PriceLine = {
  variant_id: string;
  product_id: string;
  slug: string;
  nome: string;
  imagem: string;
  tamanho: string;
  quantidade: number;
  preco_centavos: number;
};
export type CheckoutPrice = {
  itens: PriceLine[];
  subtotal_centavos: number;
  frete_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  parcelas_maximas: number;
  cupom_id: string | null;
  termos_versao: string;
};
export type CheckoutReview = CheckoutPrice & { frete: ShippingQuote; reviewToken: string };
export type PlacedOrder = {
  id: string;
  numero: string;
  status: string;
  acesso?: string;
  repetido: boolean;
};
export const couponStorageKey = "ybrd-cupom-v1";
export const merchantPolicies = z.object({
  razaoSocial: z.string().trim().min(3).max(160),
  documento: z.string().trim().min(11).max(24),
  endereco: z.string().trim().min(10).max(300),
  email: z.email().max(254),
  termos: z.string().trim().min(80).max(25000),
  troca: z.string().trim().min(80).max(25000),
  privacidade: z.string().trim().min(80).max(25000),
});
export type MerchantPolicies = z.infer<typeof merchantPolicies>;
export const cartPayload = (items: CartEntry[]) =>
  items.map(({ slug, size, quantity }) => ({ slug, size, quantity }));
