import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { Product } from '@/lib/hybrid-catalog';

type CartItem = { product: Product; size: string };
const CartContext = createContext<{ cart: CartItem[]; setCart: Dispatch<SetStateAction<CartItem[]>> } | null>(null);

export function StorefrontCartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  return <CartContext.Provider value={{ cart, setCart }}>{children}</CartContext.Provider>;
}

export function useStorefrontCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('StorefrontCartProvider is required');
  return context;
}
