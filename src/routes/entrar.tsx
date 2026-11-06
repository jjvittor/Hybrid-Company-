import { createFileRoute } from '@tanstack/react-router';
import { AuthForm } from '@/components/AuthForm';
import { accountHead } from '@/lib/account-schema';
export const Route = createFileRoute('/entrar')({ head: () => accountHead('Entrar', 'Acesse sua conta YBRD com e-mail e senha.'), component: () => <AuthForm /> });