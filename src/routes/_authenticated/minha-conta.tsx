import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { toast } from 'sonner';
import { LoaderCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { accountHead, profileSchema } from '@/lib/account-schema';
import { profileQuery } from '@/lib/account-queries';
import { saveProfile } from '@/lib/account.functions';
import { AccountField, AccountLayout, FieldError } from '@/components/AccountFields';
import { useAccount } from '@/components/AccountProvider';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_authenticated/minha-conta')({ head: () => accountHead('Minha conta', 'Gerencie seus dados e sua senha na YBRD.'), loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery), component: MyAccount, errorComponent: ({ reset }) => <AccountLayout title="MINHA CONTA"><p className="mt-5">Não foi possível carregar seus dados.</p><Button className="account-submit" onClick={reset}>Tentar novamente</Button></AccountLayout> });

function MyAccount() {
  const { data } = useSuspenseQuery(profileQuery);
  const { user } = useAccount();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const save = useServerFn(saveProfile);
  const [values, setValues] = useState({ nome: data.nome, telefone: data.telefone ?? '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const result = profileSchema.safeParse(values);
  const errors: Record<string, string> = {};
  if (touched && !result.success) result.error.issues.forEach(issue => { errors[String(issue.path[0])] = issue.message; });
  const resetPassword = async () => {
    if (!user?.email || busy) return;
    setBusy('reset'); setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw new Error('Não foi possível enviar o e-mail. Tente novamente.');
      toast.success('E-mail de redefinição enviado');
    } catch (e) { setError(e instanceof Error ? e.message : 'Tente novamente.'); } finally { setBusy(null); }
  };
  return <AccountLayout title="MINHA CONTA"><section className="account-block"><h2 className="micro">DADOS</h2><form className="account-form" noValidate onSubmit={async e => {
    e.preventDefault(); setTouched(true); if (!result.success || busy) return;
    setBusy('save'); setError('');
    try { const updated = await save({ data: result.data }); queryClient.setQueryData(profileQuery.queryKey, updated); toast.success('Alterações salvas'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); } finally { setBusy(null); }
  }}><AccountField label="Nome" name="nome" value={values.nome} onChange={nome => { setTouched(true); setValues(v => ({ ...v, nome })); }} error={errors.nome} autoComplete="name" maxLength={100} /><AccountField label="E-mail" name="email" value={user?.email ?? ''} type="email" readOnly autoComplete="email" /><AccountField label="Telefone (opcional)" name="telefone" value={values.telefone} onChange={telefone => { setTouched(true); setValues(v => ({ ...v, telefone })); }} error={errors.telefone} type="tel" autoComplete="tel" maxLength={30} /><Button type="submit" className="account-submit" disabled={!!busy}>{busy === 'save' && <LoaderCircle className="animate-spin" />}Salvar alterações</Button></form></section><section className="account-block"><h2 className="micro mb-4">SENHA</h2><Button disabled={!!busy || !user?.email} className="rounded-full" onClick={resetPassword}>{busy === 'reset' && <LoaderCircle className="animate-spin" />}Alterar senha</Button></section><section className="account-block"><h2 className="micro">PEDIDOS</h2><p className="my-5 text-sm">Você ainda não tem pedidos.</p><Button asChild className="rounded-full"><Link to="/" hash="comprar">Ver peças</Link></Button></section><FieldError error={error} /><Button variant="link" className="mt-6 px-0" disabled={!!busy} onClick={async () => {
    setBusy('logout'); await queryClient.cancelQueries(); queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) { setError('Não foi possível sair. Tente novamente.'); setBusy(null); return; }
    await navigate({ to: '/', replace: true });
  }}>{busy === 'logout' && <LoaderCircle className="animate-spin" />}Sair</Button></AccountLayout>;
}