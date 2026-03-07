import React, { createContext, useContext, useState, ReactNode } from 'react';
import { CartItem, Product, ShippingOption } from './types';

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  total: number;
  isFloatingCartOpen: boolean;
  setIsFloatingCartOpen: (isOpen: boolean) => void;
  shippingOptions: ShippingOption[];
  setShippingOptions: (options: ShippingOption[]) => void;
  selectedShipping: ShippingOption | null;
  setSelectedShipping: (option: ShippingOption | null) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isFloatingCartOpen, setIsFloatingCartOpen] = useState(false);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setIsFloatingCartOpen(true);
    setTimeout(() => setIsFloatingCartOpen(false), 4000);
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId: number, quantity: number) => {
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
  };

  const itemsTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = itemsTotal + (selectedShipping?.price || 0);

  return (
    <CartContext.Provider
      value={{ 
        cart, addToCart, removeFromCart, updateQuantity, clearCart, total,
        isFloatingCartOpen, setIsFloatingCartOpen,
        shippingOptions, setShippingOptions,
        selectedShipping, setSelectedShipping
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
