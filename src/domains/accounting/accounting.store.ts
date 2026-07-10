import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Expense { id: string; description: string; amount: number; date: string; category?: string; }

interface AccountingState {
  cashbox: number; totalSales: number; totalProfits: number; totalExpenses: number; totalDiscounts: number; expenses: Expense[];
  fetchSummary: () => Promise<void>;
  addExpense: (description: string, amount: number, userRole: string) => Promise<void>;
  resetDaily: (userRole: string) => Promise<void>;
}

export const useAccountingStore = create<AccountingState>((set) => ({
  cashbox: 0, totalSales: 0, totalProfits: 0, totalExpenses: 0, totalDiscounts: 0, expenses: [],
  fetchSummary: async () => {
    try {
      const data = await invoke<any>('get_accounting_summary_db');
      set({
        cashbox: data.cashbox ?? 0,
        totalSales: data.totalSales ?? 0,
        totalProfits: data.totalProfits ?? 0,
        totalExpenses: data.totalExpenses ?? 0,
        totalDiscounts: data.totalDiscounts ?? 0,
        expenses: data.expenses,
      });
    } catch (e) { console.error("Failed to fetch accounting summary:", e); }
  },
  // recordSale و recordRefund محذوفتان — App.tsx يستدعي invoke مباشرة بالتوقيع الصحيح
  // لا تحدّث state محلياً بعد البيع/المرتجع — استدعِ fetchSummary() بدلاً منه للحصول على القيم الدقيقة من DB
  addExpense: async (description, amount, userRole) => {
    try {
      await invoke('add_expense_db', { description, amount, userRole });
      set((state) => ({
        cashbox: state.cashbox - amount,
        totalExpenses: state.totalExpenses + amount,
        expenses: [{ id: Date.now().toString(), description, amount, date: new Date().toISOString() }, ...state.expenses]
      }));
    } catch (e) { console.error("Failed to add expense:", e); }
  },
  resetDaily: async (userRole) => {
    try {
      await invoke('reset_daily_db', { userRole });
      set({ cashbox: 0, totalSales: 0, totalProfits: 0, totalExpenses: 0, totalDiscounts: 0, expenses: [] });
    } catch (e) { console.error("Failed to reset daily:", e); }
  }
}));
