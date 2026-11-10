import { createFileRoute } from '@tanstack/react-router';
import { Storefront } from '@/components/Storefront';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'YBRD — Concreto Dourado & YBRD HOME' },
    { name: 'description', content: 'Streetwear, mobiliário e objetos em um mesmo universo criativo. Explore os drops, campanhas e colaborações da YBRD' },
    { property: 'og:title', content: 'YBRD — Vestir e morar, em conexão' },
    { property: 'og:description', content: 'Concreto Dourado e YBRD HOME: roupas e objetos em um futuro em comum.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: Storefront,
});
