import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { profileSchema } from '@/lib/account-schema';

export const getProfile = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from('profiles').select('id, nome, telefone, criado_em').eq('id', context.userId).single();
  if (error) throw new Error('Não foi possível carregar seus dados.');
  return data;
});
export const saveProfile = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => profileSchema.parse(input)).handler(async ({ context, data }) => {
  const { data: profile, error } = await context.supabase.from('profiles').update({ nome: data.nome, telefone: data.telefone || null }).eq('id', context.userId).select('id, nome, telefone, criado_em').single();
  if (error) throw new Error('Não foi possível salvar seus dados.');
  return profile;
});