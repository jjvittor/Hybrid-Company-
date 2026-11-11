import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { brl } from "./commerce";
import { CommerceError, commerceRpc } from "./commerce-db.server";
import { orderAccess, requireCommerceAccount } from "./checkout.server";
import { mockAllowed, paymentProvider } from "./payment.server";
import { orderStatusLabels, type adminRefund } from "./payment";

export async function requireAdmin(request: Request) {
  const user = await requireCommerceAccount(request);
  const access = await user.client.rpc("has_role", { p_role: "admin" });
  if (access.error || access.data !== true)
    throw new CommerceError(403, "Acesso administrativo restrito.");
  return user;
}
export async function refundOrder(
  db: SupabaseClient,
  request: Request,
  adminId: string,
  input: z.infer<typeof adminRefund>,
) {
  const ticket = await commerceRpc<{
    id: string;
    status: string;
    provider: string;
    referencia: string;
    centavos: number;
  }>(db, "commerce_begin_refund", {
    p_order: input.id,
    p_id: input.idempotencia,
    p_cents: input.valorCentavos,
    p_admin: adminId,
  });
  if (ticket.status === "aprovado") return { concluido: true };
  if ((ticket.provider === "mock") !== mockAllowed(request))
    throw new CommerceError(409, "O modo de pagamento deste pedido é diferente.");
  const result = await paymentProvider(request).reembolsar(
    ticket.referencia,
    ticket.centavos,
    ticket.id,
  );
  if (result.approved)
    await commerceRpc(db, "commerce_finish_refund", { p_id: ticket.id, p_reference: result.id });
  return { concluido: result.approved };
}
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
type EmailJob = { id: string; order_event_id: number; tentativas: number };
async function sendOrderEmail(db: SupabaseClient, job: EmailJob, apiKey: string, from: string) {
  const event = await db
    .from("order_events")
    .select("order_id,status,detalhes")
    .eq("id", job.order_event_id)
    .single();
  if (event.error) throw new Error("email event");
  const orderResult = await db
    .from("orders")
    .select("id,numero,email,status,user_id,actor_hash,total_centavos,rastreio,expira_em")
    .eq("id", event.data.order_id)
    .single();
  if (orderResult.error) throw new Error("email order");
  const order = orderResult.data;
  const detail = event.data.detalhes;
  const pix = detail?.evento === "pix_pendente";
  if (pix && (order.status !== "aguardando_pagamento" || Date.parse(order.expira_em) <= Date.now()))
    return;
  const partial = detail?.evento === "reembolso_parcial";
  const subject = pix
    ? "Pix pendente"
    : partial
      ? "Reembolso parcial confirmado"
      : event.data.status === "aguardando_pagamento"
        ? "Pedido recebido"
        : (orderStatusLabels[event.data.status] ?? "Atualização do pedido");
  const origin = process.env["YBRD_SITE_ORIGIN"];
  if (!origin) throw new Error("email origin");
  const url = new URL(`/pedido/${order.id}/confirmado`, origin);
  if (!order.user_id) url.searchParams.set("acesso", await orderAccess(order.id, order.actor_hash));
  const lines = [`${order.numero} · ${brl(order.total_centavos)}`];
  if (partial) lines.push(`Valor reembolsado: ${brl(detail.valor_centavos)}`);
  let qr: string | undefined;
  if (pix) {
    const payment = await db
      .from("payments")
      .select("instrucoes")
      .eq("order_id", order.id)
      .single();
    if (payment.error) throw new Error("email pix");
    const instructions = payment.data.instrucoes;
    if (instructions?.codigoPix) lines.push(`Pix copia e cola: ${instructions.codigoPix}`);
    if (
      typeof instructions?.qrBase64 === "string" &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(instructions.qrBase64)
    )
      qr = instructions.qrBase64;
    lines.push(
      `Pague até ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(order.expira_em))} (Brasília).`,
    );
  }
  if (event.data.status === "pago") {
    const items = await db
      .from("order_items")
      .select("nome,edicao_total,edition_units(numero_edicao)")
      .eq("order_id", order.id);
    if (items.error) throw new Error("email editions");
    for (const item of items.data)
      for (const unit of item.edition_units)
        lines.push(
          `${item.nome} · ED. ${String(unit.numero_edicao).padStart(3, "0")}${item.edicao_total ? ` / ${String(item.edicao_total).padStart(3, "0")}` : ""}`,
        );
  }
  if (event.data.status === "enviado" && order.rastreio) lines.push(`Rastreio: ${order.rastreio}`);
  lines.push(`Acompanhar pedido: ${url.href}`);
  const text = `YBRD\n${subject}\n\n${lines.join("\n\n")}`;
  const html = `<div lang="pt-BR" style="background:#F3F1EC;color:#0A0A0A;padding:24px;font-family:Arial,sans-serif"><h1>YBRD</h1><h2>${escapeHtml(subject)}</h2>${lines
    .slice(0, -1)
    .map(
      (line) => `<p style="font-family:monospace;overflow-wrap:anywhere">${escapeHtml(line)}</p>`,
    )
    .join(
      "",
    )}${qr ? '<p><img src="cid:pix-ybrd" alt="QR Code Pix" width="180" height="180"></p>' : ""}<p><a href="${escapeHtml(url.href)}" style="color:#0A0A0A">Acompanhar pedido</a></p></div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `ybrd-email-${job.id}`,
    },
    body: JSON.stringify({
      from,
      to: [order.email],
      subject: `${subject} · ${order.numero}`,
      text,
      html,
      ...(qr
        ? { attachments: [{ filename: "pix.png", content: qr, content_id: "pix-ybrd" }] }
        : {}),
    }),
  });
  if (!response.ok) throw new Error("email provider");
}
export async function processCommerceEmails(db: SupabaseClient) {
  const key = process.env["YBRD_EMAIL_API_KEY"];
  const from = process.env["YBRD_EMAIL_FROM"];
  if (!key || !from) return 0;
  const jobs = await commerceRpc<EmailJob[]>(db, "commerce_claim_emails", { p_limit: 5 });
  const outcomes = await Promise.allSettled(
    jobs.map(async (job) => {
      await sendOrderEmail(db, job, key, from);
      const saved = await db
        .from("commerce_email_outbox")
        .update({ enviado_em: new Date().toISOString() })
        .eq("id", job.id);
      if (saved.error) throw new Error("email result");
    }),
  );
  for (const [index, result] of outcomes.entries())
    if (result.status === "rejected") {
      const job = jobs[index]!;
      await db
        .from("commerce_email_outbox")
        .update({
          disponivel_em: new Date(
            Date.now() + Math.min(60, 2 ** job.tentativas) * 60000,
          ).toISOString(),
        })
        .eq("id", job.id)
        .is("enviado_em", null);
    }
  return outcomes.filter((result) => result.status === "fulfilled").length;
}
