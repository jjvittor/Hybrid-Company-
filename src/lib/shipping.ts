import { z } from "zod";
import { cartEntries } from "./commerce";

export const digits = (value: string) => value.replace(/\D/g, "");
export const cepSchema = z.string().regex(/^\d{8}$/, "Informe um CEP com 8 dígitos.");
export const states = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;
const field = (min: number, max: number) => z.string().trim().min(min).max(max);
export const addressSchema = z.object({
  cep: cepSchema,
  destinatario: field(2, 80),
  telefone: z.string().regex(/^\d{10,13}$/),
  rua: field(2, 100),
  numero: field(1, 20),
  complemento: field(0, 60),
  bairro: field(2, 60),
  cidade: field(2, 60),
  uf: z.enum(states),
});
export type Address = z.infer<typeof addressSchema>;
export type AddressDraft = Omit<Address, "uf"> & { uf: string };
export const emptyAddress: AddressDraft = {
  cep: "",
  destinatario: "",
  telefone: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
};
export const shippingInput = z.object({ cep: cepSchema, items: cartEntries });
export type ShippingQuote = { id: string; nome: string; precoCentavos: number; prazoDias: number };
export type ShippingReply = { options: ShippingQuote[]; subtotalCentavos: number };
export const cepMask = (value: string) =>
  digits(value)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");
export function phoneMask(value: string) {
  const normalized = digits(value).slice(0, 11);
  if (normalized.length <= 2) return normalized;
  const prefix = normalized.slice(0, 2);
  const suffix = normalized.slice(2).replace(/^(\d{4,5})(\d{4})$/, "$1-$2");
  return `(${prefix}) ${suffix}`;
}
