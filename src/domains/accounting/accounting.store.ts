import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Expense { id: string; description: string; amount: number; date: string; }

interface AccountingState {
  cashbox: number; totalSales: number; totalProfits: number; expenses: Expense[];
  fetchSummary: () => Promise<void>;
  recordSale: (saleAmount: number, profitAmount: number, items: any[], userRole: string) => Promise<void>;
  recordRefund: (refundAmount: number, items: any[], userRole: string) => Promise<void>;
  addExpense: (description: string, amount: number, userRole: string) => Promise<void>;
  resetDaily: (userRole: string) => Promise<void>;
}

export const useAccountingStore = create<AccountingState>((set) => ({
  cashbox: 0, totalSales: 0, totalProfits: 0, expenses: [],
  fetchSummary: async () => {
    try {
      const data = await invoke<any>('get_accounting_summary_db');
      set({ cashbox: data.cashbox, totalSales: data.totalSales, totalProfits: data.totalProfits, expenses: data.expenses });
    } catch (e) { console.error("Failed to fetch accounting summary:", e); }
  },
  recordSale: async (saleAmount, profitAmount, items, userRole) => {
    try {
      const itemsJson = JSON.stringify(items);
      await invoke('record_sale_db', { totalAmount: saleAmount, profitAmount, itemsJson, userRole });
      set((state) => ({ cashbox: state.cashbox + saleAmount, totalSales: state.totalSales + saleAmount, totalProfits: state.totalProfits + profitAmount }));
    } catch (e) { console.error("Failed to record sale:", e); alert("فشل تسجيل الفاتورة!"); }
  },
  recordRefund: async (refundAmount, items, userRole) => {
    try {
      const itemsJson = JSON.stringify(items);
      await invoke('record_refund_db', { totalAmount: refundAmount, itemsJson, userRole });
      // خصم قيمة المرتجع من الصندوق والمبيعات
      set((state) => ({ 
        cashbox: state.cashbox - refundAmount, 
        totalSales: state.totalSales - refundAmount 
      }));
    } catch (e) { console.error("Failed to record refund:", e); alert("فشل تسجيل المرتجع!"); }
  },
  addExpense: async (description, amount, userRole) => {
    try {
      await invoke('add_expense_db', { description, amount, userRole });
      set((state) => ({ cashbox: state.cashbox - amount, expenses: [{ id: Date.now().toString(), description, amount, date: new Date().toLocaleString('en-GB') }, ...state.expenses] }));
    } catch (e) { console.error("Failed to add expense:", e); }
  },
  resetDaily: async (userRole) => {
    try {
      await invoke('reset_daily_db', { userRole });
      set({ cashbox: 0, totalSales: 0, totalProfits: 0, expenses: [] });
    } catch (e) { console.error("Failed to reset daily:", e); }
  }
}));