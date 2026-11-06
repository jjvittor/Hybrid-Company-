import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { LoaderCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { accountHead, passwordSchema } from '@/lib/account-schema';
import { useAccount } from '@/components/AccountProvider';
import { AccountLayout, AccountField, FieldError } from '@/components/AccountFields';
import { Button } from '@/components/ui/button';
export const Route = createFileRoute('/reset-password')({ head: () => accountHead('Redefinir senha', 'Defina uma nova senha para sua conta YBRD.'), component: ResetPassword });
function ResetPassword() {
  const { user, ready, recovery } = useAccount();
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [error, setError] = useState('');
  const result = passwordSchema.safeParse(password);
  return <AccountLayout title="REDEFINIR SENHA">{!ready ? <p className="mt-5 micro" role="status">Validando link…</p> : done ? <><p className="mt-5">Senha alterada.</p><Button asChild className="account-submit"><Link to="/minha-conta">Minha conta</Link></Button></> : !user || !recovery ? <><p className="mt-5 text-sm">Este link é inválido ou expirou. Solicite um novo link para redefinir sua senha.</p><Button asChild className="account-submit"><Link to="/entrar">Voltar para entrar</Link></Button></> : <form className="account-form" noValidate onSubmit={async e => {
    e.preventDefault(); setTouched(true); if (!result.success || password !== confirmation || busy) return;
    setBusy(true); setError('');
    try { const { error } = await supabase.auth.updateUser({ password: result.data }); if (error) throw new Error('Não foi possível alterar sua senha. Solicite um novo link.'); sessionStorage.removeItem('ybrd-recovery'); setDone(true); toast.success('Senha alterada'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Tente novamente.'); } finally { setBusy(false); }
  }}><AccountField label="Nova senha" name="new-password" type="password" value={password} onChange={v => { setPassword(v); setTouched(true); }} error={touched && !result.success ? result.error.issues[0]?.message : undefined} autoComplete="new-password" maxLength={128} /><AccountField label="Confirmação de senha" name="confirmation" type="password" value={confirmation} onChange={setConfirmation} error={touched && confirmation && password !== confirmation ? 'As senhas não são iguais' : undefined} autoComplete="new-password" maxLength={128} /><FieldError error={error} /><Button type="submit" className="account-submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}Salvar nova senha</Button></form>}</AccountLayout>;
}