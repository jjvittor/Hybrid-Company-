import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Eye, EyeOff, CircleAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AccountLayout({ title, children }: { title: string; children: ReactNode }) {
  return <main className="account-page"><header className="account-header site-width"><Link to="/" className="wordmark">YBRD</Link><Button asChild variant="ghost" size="icon"><Link to="/" aria-label="Voltar ao início"><ArrowLeft /></Link></Button></header><div className="account-column"><p className="micro mb-3">YBRD / CONTA</p><h1 className="account-title">{title}</h1>{children}</div></main>;
}
export function FieldError({ error, id }: { error?: string; id?: string }) {
  return error ? <p id={id} className="account-error" role="alert"><CircleAlert className="size-3 shrink-0" />{error}</p> : null;
}
export function AccountField({ label, name, value, onChange, error, type = 'text', autoComplete, readOnly = false, maxLength = 255 }: { label: string; name: string; value: string; onChange?: (value: string) => void; error?: string; type?: string; autoComplete?: string; readOnly?: boolean; maxLength?: number }) {
  const [shown, setShown] = useState(false);
  const password = type === 'password';
  return <div className="account-field"><label htmlFor={name}>{label}</label><div className="relative"><input id={name} name={name} value={value} onChange={e => onChange?.(e.target.value)} type={password && shown ? 'text' : type} autoComplete={autoComplete} readOnly={readOnly} maxLength={maxLength} aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined} className={`account-input ${password ? 'pr-12' : ''}`} />{password && <Button variant="ghost" type="button" size="icon" className="account-password-toggle" aria-label={shown ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShown(!shown)}>{shown ? <EyeOff /> : <Eye />}</Button>}</div><FieldError id={`${name}-error`} error={error} /></div>;
}