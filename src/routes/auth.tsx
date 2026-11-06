import { createFileRoute, redirect } from '@tanstack/react-router';
import { accountHead } from '@/lib/account-schema';
export const Route = createFileRoute('/auth')({ head: () => accountHead('Acesso à conta', 'Entre na sua conta YBRD.'), beforeLoad: () => { throw redirect({ to: '/entrar', replace: true }); } });