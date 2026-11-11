import { z } from "zod";

// Keep validation compatible with the production policy against dynamic code evaluation.
z.config({ jitless: true });

const control = /[\u0000-\u001f\u007f-\u009f]/u;
const clean = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !control.test(value), "Remova os caracteres inválidos.");
export const emailSchema = clean(254)
  .pipe(z.string().trim().email("Digite um e-mail válido."))
  .transform((value) => value.toLowerCase());
export const currentPasswordSchema = clean(128).pipe(z.string().min(1, "Digite sua senha."));
export const passwordSchema = clean(128)
  .pipe(z.string().min(12, "Use pelo menos 12 caracteres."))
  .refine((value) => new TextEncoder().encode(value).length <= 72, "Use até 72 bytes na senha.");

const common =
  /^(?:(?:password|senha|qwerty|admin|letmein|iloveyou|welcome|changeme|abcdef|1234567890)[\d!@#$%._-]*|\d+|(.)\1+)$/i;
const normalized = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function passwordIssue(password: string, email: string, name: string) {
  const key = normalized(password);
  if (
    !key ||
    common.test(password.trim()) ||
    key === normalized(email) ||
    key === normalized(email.split("@")[0] ?? "") ||
    key === normalized(name)
  ) {
    return "Escolha uma senha diferente dos seus dados e de senhas comuns.";
  }
  return undefined;
}

export const profileSchema = z
  .object({
    nome: clean(80).pipe(z.string().trim().min(1, "Digite seu nome.")),
    telefone: clean(20).pipe(
      z
        .string()
        .trim()
        .regex(/^[0-9+() .-]*$/, "Digite um telefone válido."),
    ),
  })
  .strict();

const trap = { website: z.string().max(256).default(""), captcha: z.string().max(2048).optional() };
const empty = z.object({}).strict();
const code = z.string().regex(/^\d{6}$/, "Digite os seis dígitos do aplicativo.");
const token = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/i);
const passwordChange = { password: passwordSchema, confirmation: clean(128) };
export const actions = {
  login: z
    .object({
      ...trap,
      email: emailSchema,
      password: currentPasswordSchema,
      next: z.enum(["/", "/minha-conta"]).default("/minha-conta"),
    })
    .strict(),
  signup: z
    .object({ ...trap, email: emailSchema, nome: profileSchema.shape.nome, ...passwordChange })
    .strict()
    .superRefine((data, ctx) => {
      const issue = passwordIssue(data.password, data.email, data.nome);
      if (issue) ctx.addIssue({ code: "custom", path: ["password"], message: issue });
      if (data.password !== data.confirmation)
        ctx.addIssue({
          code: "custom",
          path: ["confirmation"],
          message: "As senhas não são iguais.",
        });
    }),
  resend: z.object({ ...trap, email: emailSchema }).strict(),
  recover: z.object({ ...trap, email: emailSchema }).strict(),
  verify: z.object({ token, type: z.enum(["signup", "recovery", "email_change"]) }).strict(),
  status: empty,
  "recovery-status": empty,
  profile: empty,
  "save-profile": profileSchema,
  "change-password": z.object({ current: currentPasswordSchema, ...passwordChange }).strict(),
  "change-email": z.object({ current: currentPasswordSchema, email: emailSchema }).strict(),
  reset: z.object(passwordChange).strict(),
  logout: z.object({ all: z.boolean() }).strict(),
  delete: z.object({ current: currentPasswordSchema, confirm: z.literal(true) }).strict(),
  "mfa-enroll": z.object({ current: currentPasswordSchema }).strict(),
  "mfa-verify": z
    .object({ id: z.string().uuid(), code, recovery: z.boolean().default(false) })
    .strict(),
  "mfa-codes": z.object({ current: currentPasswordSchema }).strict(),
  "mfa-remove": z.object({ current: currentPasswordSchema, id: z.string().uuid() }).strict(),
  "mfa-recover": z.object({ code: z.string().regex(/^[a-f0-9]{32}$/i) }).strict(),
};

export type AccountAction = keyof typeof actions;
export const genericEmailMessage = "Se o e-mail estiver cadastrado, você receberá as instruções.";
export const invalidLoginMessage = "E-mail ou senha incorretos.";
export const retryMessage = "Muitas tentativas. Aguarde e tente novamente.";

export function accountHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} — YBRD` },
      { name: "description", content: description },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  };
}
