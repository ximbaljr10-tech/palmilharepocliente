import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { CartItem, Product, ShippingOption, ColorPreference } from './types';

const CART_STORAGE_KEY = 'ddt_cart';
const SHIPPING_OPTIONS_KEY = 'ddt_shipping_options';
const SELECTED_SHIPPING_KEY = 'ddt_selected_shipping';
const CART_CEP_KEY = 'ddt_cart_cep';
// 2026-04-25 FIX CAIXA IDEAL: guardamos o payload EXATO enviado a Superfrete
// para persistir junto do pedido (audit + etiqueta).
const SHIPPING_QUOTE_PRODUCTS_KEY = 'ddt_shipping_quote_products';

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored);
  } catch {}
  return fallback;
}

function saveToStorage(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * Build a stable fingerprint of the cart contents so we can detect
 * when items/quantities change and the cached shipping quote becomes stale.
 */
function cartFingerprint(items: CartItem[]): string {
  return items
    .map((i) => `${i.id}:${i.quantity}`)
    .sort()
    .join('|');
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product, colorPreference?: ColorPreference, openCart?: boolean) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  isFloatingCartOpen: boolean;
  setIsFloatingCartOpen: (isOpen: boolean) => void;
  shippingOptions: ShippingOption[];
  setShippingOptions: (options: ShippingOption[]) => void;
  selectedShipping: ShippingOption | null;
  setSelectedShipping: (option: ShippingOption | null) => void;
  cartCep: string;
  setCartCep: (cep: string) => void;
  /** Fingerprint of the cart at the moment shipping was last calculated */
  shippingCartFingerprint: string;
  setShippingCartFingerprint: (fp: string) => void;
  /** True when the cached shipping quote no longer matches the current cart */
  isShippingStale: boolean;
  /**
   * 2026-04-25 FIX CAIXA IDEAL
   * Payload `products[]` EXATO que foi enviado a Superfrete na cotacao.
   * Eh o que persistimos em order_shipping_box.products_sent_json para
   * auditoria e para garantir que a etiqueta saia com as MESMAS dimensoes.
   */
  shippingQuoteProducts: any[] | null;
  setShippingQuoteProducts: (products: any[] | null) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const SHIPPING_FINGERPRINT_KEY = 'ddt_shipping_fp';

export const CartProvider = ({ children }: { children: ReactNode }) => {
  // ALL cart-related state is persisted in localStorage for consistency
  const [cart, setCart] = useState<CartItem[]>(() => loadFromStorage(CART_STORAGE_KEY, []));
  const [isFloatingCartOpen, setIsFloatingCartOpen] = useState(false);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>(() => loadFromStorage(SHIPPING_OPTIONS_KEY, []));
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(() => loadFromStorage(SELECTED_SHIPPING_KEY, null));
  const [cartCep, setCartCep] = useState<string>(() => loadFromStorage(CART_CEP_KEY, ''));
  const [shippingCartFingerprint, setShippingCartFingerprint] = useState<string>(() => loadFromStorage(SHIPPING_FINGERPRINT_KEY, ''));
  const [shippingQuoteProducts, setShippingQuoteProducts] = useState<any[] | null>(() => loadFromStorage(SHIPPING_QUOTE_PRODUCTS_KEY, null));

  // Compute once – is the cached shipping quote stale relative to the current cart?
  const currentFingerprint = cartFingerprint(cart);
  const isShippingStale =
    shippingOptions.length > 0 && currentFingerprint !== shippingCartFingerprint;

  // Consistency guard: if cart is empty on load, clear shipping data too
  // If shipping exists but CEP is empty, clear shipping (inconsistent state)
  useEffect(() => {
    const hasCart = cart.length > 0;
    const hasCep = cartCep.length > 0;
    const hasShipping = shippingOptions.length > 0;
    const hasSelected = selectedShipping !== null;

    if (!hasCart) {
      // Empty cart = clear everything
      if (hasShipping || hasSelected || hasCep) {
        setShippingOptions([]);
        setSelectedShipping(null);
        setCartCep('');
      }
    } else if ((hasShipping || hasSelected) && !hasCep) {
      // Has shipping but no CEP = inconsistent, clear shipping
      setShippingOptions([]);
      setSelectedShipping(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Persist each state slice to localStorage when it changes
  useEffect(() => { saveToStorage(CART_STORAGE_KEY, cart); }, [cart]);
  useEffect(() => { saveToStorage(SHIPPING_OPTIONS_KEY, shippingOptions); }, [shippingOptions]);
  useEffect(() => { saveToStorage(SELECTED_SHIPPING_KEY, selectedShipping); }, [selectedShipping]);
  useEffect(() => { saveToStorage(CART_CEP_KEY, cartCep); }, [cartCep]);
  useEffect(() => { saveToStorage(SHIPPING_FINGERPRINT_KEY, shippingCartFingerprint); }, [shippingCartFingerprint]);
  useEffect(() => { saveToStorage(SHIPPING_QUOTE_PRODUCTS_KEY, shippingQuoteProducts); }, [shippingQuoteProducts]);

  // ─── Invalidate shipping when cart items/quantities change ───
  const prevFingerprintRef = useRef(currentFingerprint);
  useEffect(() => {
    if (prevFingerprintRef.current !== currentFingerprint) {
      prevFingerprintRef.current = currentFingerprint;
      // Cart changed → old quote is stale.  Clear the selected option so the
      // user cannot proceed with an outdated price, and mark options as stale.
      // We keep shippingOptions visible (greyed out) so the user sees what was
      // selected before; the Cart component will auto-recalculate if CEP exists.
      setSelectedShipping(null);
    }
  }, [currentFingerprint]);

  const addToCart = (product: Product, colorPreference?: ColorPreference, openCart: boolean = true) => {
    setCart((prev) => {
      const existing = prev.find((item) => {
        if (item.id !== product.id) return false;
        // If both have color preferences, they must match to stack
        const a = item.color_preference;
        const b = colorPreference;
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.mode === b.mode && a.color_1 === b.color_1 && a.color_2 === b.color_2 && a.color_3 === b.color_3;
      });
      if (existing) {
        return prev.map((item) =>
          item === existing ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1, color_preference: colorPreference }];
    });
    if (openCart) {
      setIsFloatingCartOpen(true);
      setTimeout(() => setIsFloatingCartOpen(false), 4000);
    }
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.id === productId ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setCart([]);
    setShippingOptions([]);
    setSelectedShipping(null);
    setCartCep('');
    setShippingCartFingerprint('');
    setShippingQuoteProducts(null);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.removeItem(SHIPPING_OPTIONS_KEY);
      localStorage.removeItem(SELECTED_SHIPPING_KEY);
      localStorage.removeItem(CART_CEP_KEY);
      localStorage.removeItem(SHIPPING_FINGERPRINT_KEY);
      localStorage.removeItem(SHIPPING_QUOTE_PRODUCTS_KEY);
    } catch {}
  };

  const itemsTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = itemsTotal + (selectedShipping?.price || 0);

  return (
    <CartContext.Provider
      value={{ 
        cart, addToCart, removeFromCart, updateQuantity, clearCart, total,
        isFloatingCartOpen, setIsFloatingCartOpen,
        shippingOptions, setShippingOptions,
        selectedShipping, setSelectedShipping,
        cartCep, setCartCep,
        shippingCartFingerprint, setShippingCartFingerprint,
        isShippingStale,
        shippingQuoteProducts, setShippingQuoteProducts
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
