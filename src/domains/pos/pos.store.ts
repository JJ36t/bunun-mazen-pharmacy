import { create } from 'zustand';

interface CartItem { id: string; nameAr: string; quantity: number; price: number; }
interface PosState {
  cart: CartItem[];
  discountPercentage: number;
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string) => void;
  updateItemQuantity: (id: string, quantity: number) => void;
  setDiscountPercentage: (amount: number) => void;
  clearCart: () => void;
  calculateSubtotal: () => number;
  calculateDiscountAmount: () => number;
  calculateTotal: () => number;
}

export const usePosStore = create<PosState>((set, get) => ({
  cart: [], discountPercentage: 0,
  
  addToCart: (item) => set((state) => {
    const existing = state.cart.find(i => i.id === item.id);
    if (existing) {
      return { cart: state.cart.map(i => i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i) };
    }
    return { cart: [...state.cart, item] };
  }),
  
  removeFromCart: (id) => set((state) => ({ cart: state.cart.filter(i => i.id !== id) })),
  
  updateItemQuantity: (id, quantity) => set((state) => ({
    cart: state.cart.map(i => i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i)
  })),
  
  setDiscountPercentage: (amount) => set({ discountPercentage: Math.max(0, amount) }),
  
  clearCart: () => set({ cart: [], discountPercentage: 0 }),
  
  calculateSubtotal: () => get().cart.reduce((total, item) => total + (item.price * item.quantity), 0),
  
  calculateDiscountAmount: () => {
    const subtotal = get().calculateSubtotal();
    return subtotal * (get().discountPercentage / 100);
  },
  
  calculateTotal: () => {
    const subtotal = get().calculateSubtotal();
    const discountAmount = get().calculateDiscountAmount();
    return Math.max(0, subtotal - discountAmount);
  }
}));