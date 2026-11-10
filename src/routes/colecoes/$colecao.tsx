import { createFileRoute, notFound } from '@tanstack/react-router';
import { Storefront } from '@/components/Storefront';
import { SHOP_CATEGORIES } from '@/lib/hybrid-catalog';
import { CAMPAIGNS } from '@/lib/hybrid-editorial';

export const Route = createFileRoute('/colecoes/$colecao')({
  validateSearch: (search: Record<string, unknown>): { categoria?: string } =>
    typeof search['categoria'] === 'string' ? { categoria: search['categoria'] } : {},
  loaderDeps: ({ search }) => ({ categoria: search.categoria }),
  loader: ({ params, deps }) => {
    const collection = CAMPAIGNS.find(c => c.slug === params.colecao);
    if (!collection) throw notFound();
    const category = SHOP_CATEGORIES.find(item =>
      item.department === collection.department && item.n === deps.categoria,
    );
    return { collection, category: category?.n ?? null };
  },
  head: ({ loaderData }) => loaderData ? { meta: [
    { title: `${loaderData.collection.title} — Ybrd` },
    { name: 'description', content: loaderData.collection.description },
    { property: 'og:title', content: `${loaderData.collection.title} — Ybrd` },
    { property: 'og:description', content: loaderData.collection.description },
  ] } : {},
  component: CollectionPage,
});

function CollectionPage() {
  const { collection, category } = Route.useLoaderData();
  return <Storefront key={`${collection.slug}:${category ?? ''}`} collection={collection} collectionCategory={category} />;
}
