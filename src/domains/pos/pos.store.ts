import { create } from 'zustand';

// CartItem يدعم batch + expiry لإتاحة FEFO
interface CartItem {
  id: string;
  nameAr: string;
  quantity: number;
  price: number;
  // حقول اختيارية لدعم الدفعات (FEFO)
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
}

interface PosState {
  cart: CartItem[];
  discountPercentage: number;
  // discountAmount مطلق (IQD) — يُستخدم فعلياً في App.tsx
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
    const safeItem: CartItem = {
      id: String(item.id || ''),
      nameAr: String(item.nameAr || 'دواء'),
      quantity: Number(item.quantity) || 1,
      price: Number(item.price) || 0,
      batchId: item.batchId,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
    };
    // FEFO: لا تدمج أصنافاً من دفعات مختلفة
    const existing = state.cart.find(i => i.id === safeItem.id && i.batchId === safeItem.batchId);
    if (existing) {
      return { cart: state.cart.map(i => i.id === safeItem.id ? { ...i, quantity: i.quantity + safeItem.quantity } : i) };
    }
    return { cart: [...state.cart, safeItem] };
  }),
  
  removeFromCart: (id) => set((state) => ({ cart: state.cart.filter(i => i.id !== id) })),
  
  updateItemQuantity: (id, quantity) => set((state) => ({
    cart: state.cart.map(i => i.id === id ? { ...i, quantity: Math.max(1, Number(quantity) || 1) } : i)
  })),
  
  setDiscountPercentage: (amount) => set({ discountPercentage: Math.max(0, Number(amount) || 0) }),
  
  clearCart: () => set({ cart: [], discountPercentage: 0 }),
  
  calculateSubtotal: () => {
    try {
      return get().cart.reduce((total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
    } catch { return 0; }
  },
  
  // إصلاح bug أسبقية العوامل: (Number(...) || 0) / 100 — وليس Number(...) || (0/100)
  calculateDiscountAmount: () => {
    try {
      const subtotal = get().calculateSubtotal();
      const pct = Number(get().discountPercentage) || 0;
      return subtotal * (pct / 100);
    } catch { return 0; }
  },
  
  calculateTotal: () => {
    try {
      const subtotal = get().calculateSubtotal();
      const discountAmount = get().calculateDiscountAmount();
      return Math.max(0, subtotal - discountAmount);
    } catch { return 0; }
  }
}));
