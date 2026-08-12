import { create } from 'zustand';
import type { Debt } from '../../types';
import { useAuthStore } from '../security/auth.store';
import { debtsService } from '../../lib/services';

export type { Debt };

interface DebtsState {
  debts: Debt[];
  fetchDebts: () => Promise<void>;
  addDebt: (customerName: string, amount: number, note: string, userRole: string) => Promise<void>;
  payDebt: (debtId: string, amount: number, userRole: string) => Promise<void>;
  deleteDebt: (debtId: string) => Promise<void>;
}

// P1 fix: store now uses the service layer instead of calling invoke() directly.
// Activates caching (MemoryCache) + event publishing (eventBus).
export const useDebtsStore = create<DebtsState>((set) => ({
  debts: [],

  fetchDebts: async () => {
    try {
      // Uses cache (30s TTL) via debtsService.getAll
      const data = await debtsService.getAll();
      set({ debts: data });
    } catch (e) {
      console.error('Failed to fetch debts:', e);
    }
  },

  addDebt: async (customerName, amount, note, userRole) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      // Service layer handles cache invalidation + event publishing
      const newId = await debtsService.add(customerName, amount, note || undefined, userRole, sessionToken || '');
      set((state) => ({
        debts: [
          {
            id: newId,
            customerName,
            amount,
            isPaid: false,
            note,
            date: new Date().toISOString(),
            paidDate: undefined,
          },
          ...state.debts,
        ],
      }));
    } catch (e) {
      alert('فشل إضافة الدين: ' + (typeof e === 'string' ? e : ((e as Error)?.message || 'خطأ')));
    }
  },

  payDebt: async (debtId, amount, userRole) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      // Service layer handles cache invalidation + DASHBOARD_REFRESH event
      await debtsService.pay(debtId, amount, userRole, sessionToken || '');
      set((state) => ({
        debts: state.debts.map((d) => {
          if (d.id === debtId) {
            const newAmount = d.amount - amount;
            return {
              ...d,
              amount: newAmount,
              isPaid: newAmount <= 0,
              paidDate: newAmount <= 0 ? new Date().toISOString() : d.paidDate,
            };
          }
          return d;
        }),
      }));
    } catch (e) {
      alert('فشل تسديد الدفعة: ' + (typeof e === 'string' ? e : ((e as Error)?.message || 'خطأ')));
    }
  },

  deleteDebt: async (debtId: string) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      await debtsService.delete(debtId, sessionToken || '');
      set((state) => ({ debts: state.debts.filter((d) => d.id !== debtId) }));
    } catch (e) {
      alert('فشل حذف الدين: ' + (typeof e === 'string' ? e : ((e as Error)?.message || 'خطأ')));
    }
  },
}));
