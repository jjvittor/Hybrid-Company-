import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount } from "@/components/AccountProvider";
import { PRODUCTS, productSizes, type Product } from "@/lib/hybrid-catalog";
import {
  cartEntry,
  commerceRequest,
  defaultCommerce,
  type CartEntry,
  type CartChange,
  type CommerceStatus,
  type CartReply,
} from "@/lib/commerce";

export const PREVIEW_CART_KEY = "ybrd-preview-cart-v1";
export const MAX_PREVIEW_QUANTITY = 99;
const mergeKey = "ybrd-cart-merge-v1";
const catalog = new Map(PRODUCTS.map((product) => [product.slug, product]));
function validSize(product: Product, size: string) {
  const options = productSizes(product);
  return options.length ? options.includes(size) : size === "";
}
function readEntries(): CartEntry[] | undefined {
  try {
    const raw = localStorage.getItem(PREVIEW_CART_KEY);
    if (!raw || raw.length > 8192) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, CartEntry>();
    for (const value of parsed.slice(0, 40)) {
      const result = cartEntry.safeParse(value);
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
function writeEntries(entries: CartEntry[]) {
  try {
    localStorage.setItem(PREVIEW_CART_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}
type CartItem = CartEntry & { product: Product; stock: number };
const CartContext = createContext<{
  cart: CartItem[];
  commerce: CommerceStatus;
  notices: string[];
  busy: boolean;
  subtotalCentavos: number;
  refresh: () => Promise<void>;
  add: (product: Product, size: string) => void;
  changeQuantity: (item: CartEntry, delta: number) => void;
  remove: (item: CartEntry) => void;
  clear: () => void;
} | null>(null);

export function StorefrontCartProvider({ children }: { children: ReactNode }) {
  const { user } = useAccount();
  const email = user?.email ?? null;
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [commerce, setCommerce] = useState(defaultCommerce);
  const [notices, setNotices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const latest = useRef<CartEntry[]>([]);
  const guestItems = useRef<CartEntry[]>([]);
  const storageWritable = useRef(true);
  const guestRevision = useRef(0);
  const active = useRef(defaultCommerce);
  const account = useRef(email);
  const requests = useRef(Promise.resolve());
  const mergeId = useRef<string | undefined>(undefined);
  account.current = email;
  const sync = useCallback((value: CartEntry[]) => {
    latest.current = value;
    setEntries(value);
  }, []);
  const updateCommerce = useCallback((status: CommerceStatus) => {
    active.current = status;
    setCommerce(status);
  }, []);

  const saveGuest = useCallback((items: CartEntry[]) => {
    guestItems.current = items;
    guestRevision.current += 1;
    if (storageWritable.current) storageWritable.current = writeEntries(items);
  }, []);
  const loadGuest = useCallback(
    () => (storageWritable.current ? readEntries() : undefined) ?? guestItems.current,
    [],
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!account.current && (event.key === PREVIEW_CART_KEY || event.key === null)) {
        const stored = readEntries();
        if (stored && storageWritable.current) {
          guestItems.current = stored;
          guestRevision.current += 1;
          sync(stored);
        }
      }
    };
    const stored = readEntries();
    if (stored && storageWritable.current) {
      guestItems.current = stored;
      guestRevision.current += 1;
      sync(stored);
    }
    const controller = new AbortController();
    void commerceRequest<CommerceStatus>("catalogo", {}, controller.signal)
      .then(updateCommerce)
      .catch(() => {});
    window.addEventListener("storage", onStorage);
    return () => {
      controller.abort();
      window.removeEventListener("storage", onStorage);
    };
  }, [sync, updateCommerce]);

  const requestCart = useCallback(
    (change?: CartChange, importGuest = false) => {
      const owner = account.current;
      if (!active.current.enabled) return Promise.resolve();
      const task = requests.current.then(async () => {
        if (account.current !== owner) return;
        setBusy(true);
        try {
          const guest = importGuest ? loadGuest() : [];
          const revision = guestRevision.current;
          let key: string | undefined;
          if (owner && guest.length) {
            try {
              key = localStorage.getItem(mergeKey) ?? crypto.randomUUID();
              localStorage.setItem(mergeKey, key);
            } catch {
              key = mergeId.current ?? crypto.randomUUID();
            }
            mergeId.current = key;
          }
          const previous = active.current;
          const data = await commerceRequest<CartReply & { catalog: CommerceStatus }>("sacola", {
            items: owner ? guest : latest.current,
            account: Boolean(owner),
            mergeId: key,
            change,
          });
          if (account.current !== owner || (!owner && guestRevision.current !== revision)) return;
          const changes = data.items.some((item) => {
            const a = previous.products.find((p) => p.slug === item.slug);
            const b = data.catalog.products.find((p) => p.slug === item.slug);
            return a && b && a.priceCentavos !== b.priceCentavos;
          });
          setNotices([...new Set([...data.notices, ...(changes ? ["Preço atualizado."] : [])])]);
          updateCommerce(data.catalog);
          sync(data.items);
          if (!owner) saveGuest(data.items);
          if (key) {
            saveGuest([]);
            try {
              localStorage.removeItem(mergeKey);
            } catch {
              /* Storage can be unavailable. */
            }
            mergeId.current = undefined;
          }
        } catch {
          if (account.current === owner)
            setNotices(["Não foi possível atualizar a sacola. Tente novamente."]);
        } finally {
          setBusy(false);
        }
      });
      requests.current = task;
      return task;
    },
    [sync, updateCommerce, loadGuest, saveGuest],
  );

  useEffect(() => {
    if (!commerce.enabled) return;
    sync(email ? [] : loadGuest());
    void requestCart(undefined, Boolean(email));
  }, [commerce.enabled, email, requestCart, sync, loadGuest]);

  const update = (change: CartChange) => {
    if (commerce.enabled && email) {
      void requestCart(change);
      return;
    }
    const items = loadGuest();
    const item = items.find((x) => x.slug === change.slug && x.size === change.size);
    const product = commerce.products.find((p) => p.slug === change.slug);
    const maximum = commerce.enabled
      ? (product?.variants.find((v) => v.size === change.size)?.stock ?? 0)
      : MAX_PREVIEW_QUANTITY;
    const quantity =
      change.delta === 0
        ? 0
        : Math.min(maximum, 99, Math.max(1, (item?.quantity ?? 0) + change.delta));
    const next = items.filter((x) => x !== item);
    if (quantity > 0 && next.length < 40)
      next.push({ slug: change.slug, size: change.size, quantity });
    saveGuest(next);
    sync(next);
    if (commerce.enabled) void requestCart();
  };
  const cart = entries.flatMap((entry) => {
    const product = catalog.get(entry.slug);
    const live = commerce.products.find((p) => p.slug === entry.slug);
    return product
      ? [
          {
            ...entry,
            product: { ...product, priceCentavos: live?.priceCentavos ?? product.priceCentavos },
            stock: commerce.enabled
              ? (live?.variants.find((v) => v.size === entry.size)?.stock ?? 0)
              : 99,
          },
        ]
      : [];
  });
  return (
    <CartContext.Provider
      value={{
        cart,
        commerce,
        notices,
        busy,
        subtotalCentavos: cart.reduce(
          (sum, item) => sum + item.quantity * item.product.priceCentavos,
          0,
        ),
        refresh: requestCart,
        add: (product, size) => {
          if (validSize(product, size)) update({ slug: product.slug, size, delta: 1 });
        },
        changeQuantity: (item, delta) =>
          update({ slug: item.slug, size: item.size, delta: delta > 0 ? 1 : -1 }),
        remove: (item) => update({ slug: item.slug, size: item.size, delta: 0 }),
        clear: () => {
          if (!email) saveGuest([]);
          sync([]);
        },
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
export function useStorefrontCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("StorefrontCartProvider is required");
  return context;
}
