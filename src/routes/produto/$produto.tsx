import { createFileRoute, notFound } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";
import { PRODUCTS } from "@/lib/hybrid-catalog";

export const Route = createFileRoute("/produto/$produto")({
  loader: ({ params }) => {
    const product = PRODUCTS.find((item) => item.slug === params.produto);
    if (!product) throw notFound();
    return product;
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            { title: `${loaderData.name} — Ybrd` },
            { name: "description", content: loaderData.description },
            { property: "og:title", content: loaderData.name },
            { property: "og:description", content: loaderData.description },
            { property: "og:image", content: loaderData.img },
          ],
        }
      : {},
  component: ProductPage,
});

function ProductPage() {
  const product = Route.useLoaderData();
  return <Storefront key={product.slug} product={product} />;
}
