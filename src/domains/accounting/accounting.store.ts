import { create } from 'zustand';
import type { Expense, AccountingSummary } from '../../types';
import { useAuthStore } from '../security/auth.store';
import { accountingService } from '../../lib/services';

export type { Expense };

interface AccountingState {
  cashbox: number;
  totalSales: number;
  totalProfits: number;
  totalExpenses: number;
  totalDiscounts: number;
  expenses: Expense[];
  fetchSummary: () => Promise<void>;
  addExpense: (description: string, amount: number, userRole: string) => Promise<void>;
  resetDaily: (userRole: string) => Promise<void>;
}

// P1 fix: store now uses the service layer instead of calling invoke() directly.
// Activates caching (MemoryCache) + event publishing (eventBus).
export const useAccountingStore = create<AccountingState>((set) => ({
  cashbox: 0,
  totalSales: 0,
  totalProfits: 0,
  totalExpenses: 0,
  totalDiscounts: 0,
  expenses: [],

  fetchSummary: async () => {
    try {
      // Uses cache (30s TTL) via accountingService.getSummary
      const data = await accountingService.getSummary() as Partial<AccountingSummary> & {
        cashbox?: number;
        totalSales?: number;
        totalProfits?: number;
        totalExpenses?: number;
        totalDiscounts?: number;
        expenses?: Expense[];
      };
      set({
        cashbox: data.cashbox ?? 0,
        totalSales: data.totalSales ?? 0,
        totalProfits: data.totalProfits ?? 0,
        totalExpenses: data.totalExpenses ?? 0,
        totalDiscounts: data.totalDiscounts ?? 0,
        expenses: data.expenses ?? [],
      });
    } catch (e) {
      console.error('Failed to fetch accounting summary:', e);
    }
  },

  addExpense: async (description, amount, userRole) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      // Service layer handles cache invalidation + event publishing
      await accountingService.addExpense(description, amount, userRole, sessionToken || '');
      set((state) => ({
        cashbox: state.cashbox - amount,
        totalExpenses: state.totalExpenses + amount,
        expenses: [
          { id: Date.now().toString(), description, amount, date: new Date().toISOString() },
          ...state.expenses,
        ],
      }));
    } catch (e) {
      console.error('Failed to add expense:', e);
    }
  },

  resetDaily: async (userRole) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      // Service layer handles full cache invalidation + DAILY_CLOSING event
      await accountingService.dailyClose(userRole, sessionToken || '');
      set({
        cashbox: 0,
        totalSales: 0,
        totalProfits: 0,
        totalExpenses: 0,
        totalDiscounts: 0,
        expenses: [],
      });
    } catch (e) {
      console.error('Failed to reset daily:', e);
    }
  },
}));
