import { create } from 'zustand';
import type { Supplier } from '../../types';
import { useAuthStore } from '../security/auth.store';
import { suppliersService } from '../../lib/services';

export type { Supplier };

interface SuppliersState {
  suppliers: Supplier[];
  fetchSuppliers: () => Promise<void>;
  addSupplier: (name: string, phone: string) => Promise<void>;
  recordPurchase: (
    supplierId: string,
    medicineId: string,
    quantity: number,
    costPrice: number,
    sellingPrice: number,
    wholesalePrice: number,
    userRole: string,
  ) => Promise<void>;
  paySupplier: (supplierId: string, amount: number, userRole: string) => Promise<void>;
}

// P1 fix: store now uses the service layer instead of calling invoke() directly.
// Activates caching (MemoryCache) + crash recovery (journal) + event publishing.
export const useSuppliersStore = create<SuppliersState>((set, get) => ({
  suppliers: [],

  fetchSuppliers: async () => {
    try {
      // Uses cache (60s TTL) via suppliersService.getAll
      const data = await suppliersService.getAll();
      set({ suppliers: data });
    } catch (e) {
      console.error('Failed to fetch suppliers:', e);
    }
  },

  addSupplier: async (name, phone) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      // Service layer handles cache invalidation + event publishing
      await suppliersService.add(name, phone || undefined, sessionToken || '');
      await get().fetchSuppliers();
    } catch (e) {
      alert('فشل إضافة المورد: ' + (typeof e === 'string' ? e : ((e as Error)?.message || 'خطأ')));
    }
  },

  recordPurchase: async (supplierId, medicineId, quantity, costPrice, sellingPrice, wholesalePrice, userRole) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      // Service layer runs crashRecovery.startOperation + cache invalidation + event publishing
      await suppliersService.recordPurchase(
        supplierId,
        medicineId,
        Number(quantity),
        Number(costPrice),
        Number(sellingPrice),
        Number(wholesalePrice),
        userRole,
        sessionToken || '',
      );
      await get().fetchSuppliers();
    } catch (e: unknown) {
      console.error(e);
      alert('فشل تسجيل الشراء: ' + (typeof e === 'string' ? e : ((e as Error)?.message || 'خطأ')));
    }
  },

  paySupplier: async (supplierId, amount, userRole) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      await suppliersService.pay(supplierId, amount, userRole, sessionToken || '');
      await get().fetchSuppliers();
    } catch (e) {
      alert('فشل سداد المورد: ' + (typeof e === 'string' ? e : ((e as Error)?.message || 'خطأ')));
    }
  },
}));
