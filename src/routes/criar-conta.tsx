import { createFileRoute } from '@tanstack/react-router';
import { AuthForm } from '@/components/AuthForm';
import { accountHead } from '@/lib/account-schema';
export const Route = createFileRoute('/criar-conta')({ head: () => accountHead('Criar conta', 'Crie sua conta YBRD e confirme seu e-mail.'), component: () => <AuthForm signup /> });