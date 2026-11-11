import { couponStorageKey } from "@/lib/checkout";
import { CartShipping } from "@/components/ShippingFields";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStorefrontCart } from "@/components/StorefrontCart";
import { previewMessage } from "@/components/ProductPreview";
import { brl, installments } from "@/lib/commerce";
import { PRODUCTS } from "@/lib/hybrid-catalog";

export function CartContents({ onNavigate }: { onNavigate?: () => void }) {
  const { cart, commerce, notices, busy, refresh, subtotalCentavos, changeQuantity, remove } =
    useStorefrontCart();
  const [coupon, setCoupon] = useState("");
  useEffect(() => {
    try {
      setCoupon(sessionStorage.getItem(couponStorageKey) ?? "");
    } catch {
      /* Optional. */
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const departments = new Set(cart.map((item) => item.product.cat));
  const suggestions = PRODUCTS.filter(
    (product) =>
      !departments.has(product.cat) &&
      !cart.some((i) => i.slug === product.slug) &&
      (!commerce.enabled ||
        commerce.products.some((p) => p.slug === product.slug && p.available > 0)),
  ).slice(0, 3);
  const parts = installments(
    subtotalCentavos,
    commerce.minInstallmentCentavos,
    commerce.maxInstallments,
  );
  return (
    <div className="space-y-5" aria-busy={busy}>
      {notices.length > 0 && (
        <div role="status" className="border border-border p-3 text-sm">
          {notices.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      )}
      {cart.length === 0 ? (
        <div className="space-y-4 py-6">
          <p>Sua sacola está vazia.</p>
          <Button asChild className="rounded-full">
            <Link to="/" hash="comprar" onClick={onNavigate}>
              Ver peças
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {cart.map((item) => (
              <li
                key={`${item.slug}:${item.size}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-b border-border pb-4"
              >
                <img
                  src={item.product.img}
                  alt=""
                  width={64}
                  height={80}
                  loading="lazy"
                  className="w-14 object-contain"
                />
                <div className="min-w-0">
                  <Link
                    to="/produto/$produto"
                    params={{ produto: item.slug }}
                    onClick={onNavigate}
                    className="text-sm hover:underline"
                  >
                    {item.product.name}
                  </Link>
                  <p className="micro text-muted-foreground">
                    {item.size &&
                      `${item.product.category === "Calçados" ? "Numeração" : "Tamanho"} ${item.size} · `}
                    {brl(item.product.priceCentavos)}
                  </p>
                  <div
                    className="mt-2 inline-flex items-center rounded-md border border-border"
                    role="group"
                    aria-label={`Quantidade de ${item.product.name}${item.size ? `, ${item.size}` : ""}`}
                  >
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-11"
                      aria-label="Diminuir quantidade"
                      disabled={busy || item.quantity <= 1}
                      onClick={() => changeQuantity(item, -1)}
                    >
                      <Minus />
                    </Button>
                    <span className="micro min-w-7 text-center" aria-live="polite">
                      {item.quantity}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-11"
                      aria-label="Aumentar quantidade"
                      disabled={busy || item.quantity >= Math.min(99, item.stock)}
                      onClick={() => changeQuantity(item, 1)}
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remover ${item.product.name}`}
                  disabled={busy}
                  onClick={() => remove(item)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <div className="space-y-3 border border-border p-4">
            <p className="micro flex justify-between gap-3">
              <span>Subtotal</span>
              <span>{brl(subtotalCentavos)}</span>
            </p>
            {commerce.enabled ? (
              <>
                <CartShipping
                  key={cart.map((item) => `${item.slug}:${item.size}:${item.quantity}`).join("|")}
                  items={cart.map(({ slug, size, quantity }) => ({ slug, size, quantity }))}
                />
                <label className="grid gap-1 text-sm">
                  Cupom
                  <input
                    className="min-h-11 rounded-md border border-border bg-background px-3"
                    maxLength={32}
                    autoComplete="off"
                    value={coupon}
                    onChange={(event) => {
                      const value = event.target.value.toUpperCase();
                      setCoupon(value);
                      try {
                        sessionStorage.setItem(couponStorageKey, value);
                      } catch {
                        /* Optional. */
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    Validado na revisão do pedido.
                  </span>
                </label>
                {commerce.pixPercent > 0 && (
                  <p className="micro">Pague com Pix e ganhe {commerce.pixPercent}%</p>
                )}
                {parts > 1 && (
                  <p className="micro">
                    Até {parts}x de {brl(Math.ceil(subtotalCentavos / parts))}
                  </p>
                )}
                {commerce.freeShippingCentavos !== null && commerce.freeShippingCentavos > 0 && (
                  <div className="space-y-1">
                    <p className="micro">
                      {subtotalCentavos >= commerce.freeShippingCentavos
                        ? "Frete grátis disponível"
                        : `Faltam ${brl(commerce.freeShippingCentavos - subtotalCentavos)} para o frete grátis`}
                    </p>
                    <progress
                      className="w-full accent-signal"
                      max={commerce.freeShippingCentavos}
                      value={Math.min(subtotalCentavos, commerce.freeShippingCentavos)}
                      aria-label="Progresso para o frete grátis"
                    />
                  </div>
                )}
                <Button asChild className="min-h-11 w-full rounded-full">
                  <a href="/checkout">Finalizar compra</a>
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{previewMessage}</p>
            )}
            <Link to="/" hash="comprar" onClick={onNavigate} className="micro underline">
              Continuar comprando
            </Link>
          </div>
          {suggestions.length > 0 && (
            <section>
              <h3 className="micro mb-3">Complete o look</h3>
              <div className="grid grid-cols-3 gap-2">
                {suggestions.map((product) => (
                  <Link
                    key={product.slug}
                    to="/produto/$produto"
                    params={{ produto: product.slug }}
                    onClick={onNavigate}
                    className="border border-border p-2 text-xs hover:underline"
                  >
                    <img
                      src={product.img}
                      alt=""
                      width={80}
                      height={100}
                      loading="lazy"
                      className="mb-2 w-full"
                    />
                    {product.name}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
