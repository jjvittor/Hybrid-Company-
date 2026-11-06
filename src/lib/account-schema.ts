import { z } from 'zod';

export const emailSchema = z.string().trim().email('Digite um e-mail válido').max(255);
export const passwordSchema = z.string().min(8, 'A senha precisa de 8 caracteres ou mais').max(128, 'Use até 128 caracteres');
export const profileSchema = z.object({
  nome: z.string().trim().min(1, 'Digite seu nome').max(100, 'Use até 100 caracteres'),
  telefone: z.string().trim().max(30, 'Use até 30 caracteres').regex(/^[0-9+() .-]*$/, 'Digite um telefone válido'),
});
export const signupSchema = z.object({
  nome: profileSchema.shape.nome,
  email: emailSchema,
  password: passwordSchema,
  confirmation: z.string(),
  terms: z.boolean().refine(value => value, 'Aceite os termos para continuar'),
}).refine(data => data.password === data.confirmation, { message: 'As senhas não são iguais', path: ['confirmation'] });

export function accountHead(title: string, description: string) {
  return { meta: [
    { title: `${title} — YBRD` }, { name: 'description', content: description },
    { property: 'og:title', content: `${title} — YBRD` }, { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
    { name: 'robots', content: 'noindex, nofollow' },
  ] };
}