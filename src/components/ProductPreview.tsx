import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStorefrontCart } from "@/components/StorefrontCart";
import { productSizes, type Product } from "@/lib/hybrid-catalog";
import { CAMPAIGNS } from "@/lib/hybrid-editorial";

export const previewMessage =
  "Prévia da coleção. Pedidos e pagamentos ainda não estão disponíveis.";
import { brl } from "@/lib/commerce";
export { brl };

export function PreviewPurchase({
  product,
  onAdded,
  quickView = false,
}: {
  product: Product;
  onAdded: () => void;
  quickView?: boolean;
}) {
  const { add, commerce, busy } = useStorefrontCart();
  const [size, setSize] = useState("");
  const sizes = productSizes(product);
  const live = commerce.products.find((item) => item.slug === product.slug);
  const price = live?.priceCentavos ?? product.priceCentavos;
  const soldOut = commerce.enabled && !live?.available;
  const available =
    !commerce.enabled || Boolean(live?.variants.find((item) => item.size === size)?.stock);
  const label = product.category === "Calçados" ? "Numeração" : "Tamanho";

  return (
    <>
      <p className={quickView ? "micro" : "font-mono text-lg"}>{brl(price)}</p>
      {sizes.length > 0 && (
        <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
          {label}
          <select
            value={size}
            onChange={(event) => setSize(event.target.value)}
            className="min-h-11 rounded-md border border-input bg-background px-4 py-2"
          >
            <option value="" disabled>
              Selecione
            </option>
            {sizes.map((option) => (
              <option
                key={option}
                value={option}
                disabled={
                  commerce.enabled && !live?.variants.find((item) => item.size === option)?.stock
                }
              >
                {option}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className={quickView ? "product-purchase-bar contents" : "block"}>
        {quickView && <span className="purchase-price micro hidden">{brl(price)}</span>}
        <Button
          type="button"
          className="min-h-11 w-full"
          disabled={busy || soldOut || !available || (sizes.length > 0 && !sizes.includes(size))}
          onClick={() => {
            add(product, size);
            onAdded();
          }}
        >
          {soldOut ? "Esgotado" : "Adicionar à sacola"} <ShoppingBag />
        </Button>
      </div>
      {commerce.enabled ? (
        live?.available ? (
          <p className="micro">
            Restam {live.available} de {live.editionTotal}
          </p>
        ) : null
      ) : (
        <p className="text-xs text-muted-foreground">{previewMessage}</p>
      )}
    </>
  );
}

export function ProductPreview({ product, onAdded }: { product: Product; onAdded: () => void }) {
  const collection = product.cat === "Vestir" ? CAMPAIGNS[0] : CAMPAIGNS[1];
  const technicalTitle =
    product.cat === "Morar"
      ? "Dimensões e materiais"
      : product.category === "Calçados"
        ? "Numeração e materiais"
        : product.category === "Bonés"
          ? "Medidas e materiais"
          : "Medidas, caimento e materiais";
  return (
    <section className="site-width pb-16 pt-6 md:pt-9">
      <nav aria-label="Caminho do produto" className="micro mb-6">
        <Link
          to="/colecoes/$colecao"
          params={{ colecao: collection.slug }}
          search={{}}
          className="inline-flex items-center gap-2"
        >
          <ArrowLeft className="size-3.5" /> {collection.title}
        </Link>
      </nav>
      <div className="preview-product-grid">
        <div className="campaign-frame">
          <div className="window-bar">
            <span className="micro">{collection.code}</span>
            <span className="micro">[ Prévia ]</span>
          </div>
          <img
            src={product.img}
            alt={product.name}
            width={480}
            height={600}
            className="preview-product-image"
            fetchPriority="high"
          />
        </div>
        <div className="min-w-0 space-y-5">
          <div>
            <p className="micro text-muted-foreground">
              {product.cat} / {product.category}
            </p>
            <h1 className="collection-title mt-2">{product.name}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{product.description}</p>
          </div>
          <PreviewPurchase product={product} onAdded={onAdded} />
          <div className="border-t border-border pt-4">
            <h2 className="micro">{technicalTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ficha técnica pendente nesta prévia.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
