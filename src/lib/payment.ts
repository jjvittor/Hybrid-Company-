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
