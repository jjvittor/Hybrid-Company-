import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { PRODUCTS, productSizes, type Product } from "@/lib/hybrid-catalog";

// Keep storage validation compatible with the storefront CSP.
z.config({ jitless: true });

export const PREVIEW_CART_KEY = "ybrd-preview-cart-v1";
export const MAX_PREVIEW_QUANTITY = 99;
const entrySchema = z.object({
  slug: z.string().max(80),
  size: z.string().max(8),
  quantity: z.number().int().min(1).max(MAX_PREVIEW_QUANTITY),
});
type Entry = z.infer<typeof entrySchema>;
type CartItem = Entry & { product: Product };
const catalog = new Map(PRODUCTS.map((product) => [product.slug, product]));

function validSize(product: Product, size: string) {
  const options = productSizes(product);
  return options.length ? options.includes(size) : size === "";
}

function readEntries(): Entry[] | undefined {
  try {
    const raw = window.localStorage.getItem(PREVIEW_CART_KEY);
    if (!raw || raw.length > 8192) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, Entry>();
    for (const value of parsed) {
      const result = entrySchema.safeParse(value);
      if (!result.success) continue;
      const entry = result.data;
      const product = catalog.get(entry.slug);
      if (product && validSize(product, entry.size))
        unique.set(`${entry.slug}:${entry.size}`, entry);
    }
    return [...unique.values()];
  } catch {
    return undefined;
  }
}

const CartContext = createContext<{
  cart: CartItem[];
  add: (product: Product, size: string) => void;
  changeQuantity: (item: Entry, delta: number) => void;
  remove: (item: Entry) => void;
} | null>(null);

export function StorefrontCartProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const latest = useRef<Entry[]>([]);
  const writable = useRef(true);
  const sync = (value: Entry[]) => {
    latest.current = value;
    setEntries(value);
  };
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!writable.current || (event.key !== PREVIEW_CART_KEY && event.key !== null)) return;
      const stored = readEntries();
      if (stored) sync(stored);
    };
    const stored = readEntries();
    if (stored) sync(stored);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = (apply: (items: Entry[]) => Entry[]) => {
    const next = apply((writable.current ? readEntries() : undefined) ?? latest.current);
    if (writable.current) {
      try {
        window.localStorage.setItem(PREVIEW_CART_KEY, JSON.stringify(next));
      } catch {
        writable.current = false;
      }
    }
    sync(next);
  };
  const matches = (left: Entry, right: Pick<Entry, "slug" | "size">) =>
    left.slug === right.slug && left.size === right.size;
  const add = (product: Product, size: string) => {
    if (!validSize(product, size)) return;
    const entry = { slug: product.slug, size, quantity: 1 };
    update((items) =>
      items.some((item) => matches(item, entry))
        ? items.map((item) =>
            matches(item, entry)
              ? { ...item, quantity: Math.min(MAX_PREVIEW_QUANTITY, item.quantity + 1) }
              : item,
          )
        : [...items, entry],
    );
  };
  const changeQuantity = (entry: Entry, delta: number) =>
    update((items) =>
      items.map((item) =>
        matches(item, entry)
          ? {
              ...item,
              quantity: Math.max(1, Math.min(MAX_PREVIEW_QUANTITY, item.quantity + delta)),
            }
          : item,
      ),
    );
  const remove = (entry: Entry) => update((items) => items.filter((item) => !matches(item, entry)));
  const cart = entries.flatMap((entry) => {
    const product = catalog.get(entry.slug);
    return product ? [{ ...entry, product }] : [];
  });
  return (
    <CartContext.Provider value={{ cart, add, changeQuantity, remove }}>
      {children}
    </CartContext.Provider>
  );
}

export function useStorefrontCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("StorefrontCartProvider is required");
  return context;
}
