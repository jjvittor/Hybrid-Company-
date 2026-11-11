import { z } from "zod";
import { placeOrderSchema } from "./checkout";

export const cardPayment = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{8,256}$/),
  paymentMethodId: z.string().regex(/^[a-z0-9_]{1,40}$/i),
  issuerId: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
});
export const paySchema = placeOrderSchema.extend({ card: cardPayment.optional() });
export type CardPayment = z.infer<typeof cardPayment>;
export type PaymentConfig = {
  pix: boolean;
  cartao: boolean;
  boleto: boolean;
  publicKey: string | null;
  mock: boolean;
};
export type PaymentInstructions = {
  codigoPix?: string;
  qrBase64?: string;
  urlBoleto?: string;
  expiraEm?: string;
};
export const orderLocator = z.object({
  id: z.uuid(),
  acesso: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const mockPaymentSchema = orderLocator.extend({
  resultado: z.enum(["aprovar", "recusar", "expirar"]),
});
export type OrderPaymentView = {
  numero: string;
  status: string;
  totalCentavos: number;
  expiraEm: string;
  revisao: boolean;
  instrucoes: PaymentInstructions | null;
};
export const orderStatusLabels: Record<string, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pagamento confirmado",
  em_separacao: "Em separação",
  enviado: "Enviado",
  entregue: "Entregue",
  expirado: "Pedido expirado",
  cancelado: "Pedido cancelado",
  falha_pagamento: "Pagamento não aprovado. Confira os dados ou tente outro cartão.",
  reembolsado: "Reembolsado",
  revisao: "Pagamento em revisão",
};
export type OrderListItem = {
  id: string;
  numero: string;
  status: string;
  total_centavos: number;
  criado_em: string;
  rastreio: string | null;
  revisao_manual?: boolean | undefined;
  refund?: { id: string; valor_centavos: number } | undefined;
};
export type OrderDetail = OrderListItem & {
  endereco: import("./shipping").Address;
  frete: import("./shipping").ShippingQuote;
  subtotal_centavos: number;
  frete_centavos: number;
  desconto_centavos: number;
  parcelas: number;
  convidado: boolean;
  mock: boolean;
  itens: {
    id: string;
    slug: string;
    nome: string;
    imagem: string;
    tamanho: string;
    quantidade: number;
    preco_centavos: number;
    edicao_total: number | null;
    edition_units: { numero_edicao: number }[];
  }[];
};
export const returnInput = orderLocator.extend({ motivo: z.string().trim().min(3).max(1000) });
export const adminTransition = z.object({
  id: z.uuid(),
  status: z.enum(["em_separacao", "enviado", "entregue", "cancelado"]),
  rastreio: z
    .string()
    .trim()
    .regex(/^[a-z0-9 -]{3,80}$/i)
    .optional(),
});
export const adminRefund = z.object({
  id: z.uuid(),
  idempotencia: z.uuid(),
  valorCentavos: z.number().int().positive().max(1000000000),
});
