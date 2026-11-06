import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AccountField, AccountLayout, FieldError } from '@/components/AccountFields';
import { emailSchema, passwordSchema, signupSchema } from '@/lib/account-schema';

export function AuthForm({ signup = false }: { signup?: boolean }) {
  const navigate = useNavigate();
  const [values, setValues] = useState({ nome: '', email: '', password: '', confirmation: '', terms: false });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);
  const errors: Record<string, string> = {};
  if (signup) {
    const result = signupSchema.safeParse(values);
    if (!result.success) result.error.issues.forEach(issue => { errors[String(issue.path[0])] ??= issue.message; });
  } else {
    const email = emailSchema.safeParse(values.email);
    if (!email.success) errors.email = email.error.issues[0]?.message ?? '';
    if (!forgot && !values.password) errors.password = 'Digite sua senha';
  }
  const update = (field: 'nome' | 'email' | 'password' | 'confirmation', value: string) => { setValues(v => ({ ...v, [field]: value })); setTouched(t => ({ ...t, [field]: true })); setError(''); };
  const resetEmail = async () => {
    const result = await supabase.auth.resetPasswordForEmail(values.email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    if (result.error) throw new Error('Não foi possível enviar o e-mail. Tente novamente.');
    setSent(true); toast.success('E-mail de redefinição enviado');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setTouched({ nome: true, email: true, password: true, confirmation: true, terms: true });
    if (Object.keys(errors).length || busy) return;
    setBusy(true); setError('');
    try {
      if (forgot) { await resetEmail(); return; }
      if (signup) {
        const data = signupSchema.parse(values);
        const result = await supabase.auth.signUp({ email: data.email, password: data.password, options: { data: { nome: data.nome, terms_accepted: true }, emailRedirectTo: window.location.origin } });
        if (result.error) throw new Error('Não foi possível criar a conta. Tente novamente.');
        setConfirmEmail(data.email); setValues(v => ({ ...v, password: '', confirmation: '' })); toast.success('Conta criada');
      } else {
        const result = await supabase.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
        if (result.error) throw new Error('E-mail ou senha incorretos.');
        await navigate({ to: '/minha-conta' });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setError('');
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: confirmEmail, options: { emailRedirectTo: window.location.origin } });
      if (error) throw new Error('Aguarde um momento e tente reenviar.');
      toast.success('E-mail de confirmação reenviado');
    } catch (e) { setError(e instanceof Error ? e.message : 'Tente novamente.'); } finally { setBusy(false); }
  };
  if (confirmEmail) return <AccountLayout title="CONFIRME SEU E-MAIL"><p className="mt-5 text-sm">Enviamos um link de confirmação para <strong className="break-all">{confirmEmail}</strong>.</p><FieldError error={error} /><Button className="account-submit" disabled={busy} onClick={resend}>{busy && <LoaderCircle className="animate-spin" />}Reenviar e-mail</Button><Button asChild variant="link" className="mt-3"><Link to="/entrar">Voltar para entrar</Link></Button></AccountLayout>;
  return <AccountLayout title={forgot ? 'RECUPERAR SENHA' : signup ? 'CRIAR CONTA' : 'ENTRAR'}><form className="account-form" noValidate onSubmit={submit}>
    {signup && <AccountField label="Nome" name="nome" value={values.nome} onChange={v => update('nome', v)} error={touched.nome ? errors.nome : undefined} autoComplete="name" maxLength={100} />}
    <AccountField label="E-mail" name="email" type="email" value={values.email} onChange={v => update('email', v)} error={touched.email ? errors.email : undefined} autoComplete="email" />
    {!forgot && <AccountField label="Senha" name="password" type="password" value={values.password} onChange={v => update('password', v)} error={touched.password ? errors.password : undefined} autoComplete={signup ? 'new-password' : 'current-password'} maxLength={128} />}
    {signup && <><AccountField label="Confirmação de senha" name="confirmation" type="password" value={values.confirmation} onChange={v => update('confirmation', v)} error={touched.confirmation ? errors.confirmation : undefined} autoComplete="new-password" maxLength={128} /><label className="account-consent"><input type="checkbox" checked={values.terms} onChange={e => { setValues(v => ({ ...v, terms: e.target.checked })); setTouched(t => ({ ...t, terms: true })); }} /> <span>Li e aceito os <a href="#">Termos de uso</a> e a <a href="#">Política de privacidade</a></span></label><FieldError error={touched.terms ? errors.terms : undefined} /></>}
    {!signup && !forgot && <Button variant="link" type="button" className="justify-start px-0 text-xs" onClick={() => { setForgot(true); setError(''); }}>Esqueci minha senha</Button>}
    <FieldError error={error} />{sent && <p className="text-sm" role="status">Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.</p>}
    <Button type="submit" className="account-submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{busy ? 'Enviando…' : forgot ? 'Enviar link' : signup ? 'Criar conta' : 'Entrar'}</Button>
  </form><div className="mt-5 text-center text-sm">{forgot ? <Button variant="link" onClick={() => { setForgot(false); setSent(false); }}>Voltar para entrar</Button> : <Button asChild variant="link"><Link to={signup ? '/entrar' : '/criar-conta'}>{signup ? 'Já tenho conta. Entrar' : 'Criar uma conta'}</Link></Button>}</div></AccountLayout>;
}