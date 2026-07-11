import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Debt {
  id: string;
  customerName: string;
  amount: number;
  isPaid: boolean;
  note?: string;
  date: string;
  paidDate?: string; 
}

interface DebtsState {
  debts: Debt[];
  fetchDebts: () => Promise<void>;
  addDebt: (customerName: string, amount: number, note: string, userRole: string) => Promise<void>;
  payDebt: (debtId: string, amount: number, userRole: string) => Promise<void>;
}

export const useDebtsStore = create<DebtsState>((set) => ({
  debts: [],
  fetchDebts: async () => {
    try {
      const data = await invoke<Debt[]>('get_customer_debts_db');
      set({ debts: data });
    } catch (e) {
      console.error("Failed to fetch debts:", e);
    }
  },
  addDebt: async (customerName, amount, note, userRole) => {
    try {
      const newId = await invoke<string>('add_customer_debt_db', { customerName, amount, note, userRole });
      set((state) => ({ 
        debts: [{ id: newId, customerName, amount, isPaid: false, note, date: new Date().toISOString(), paidDate: undefined }, ...state.debts] 
      }));
    } catch (e) {
      alert("فشل إضافة الدين: " + (typeof e === "string" ? e : (e?.message || e?.kind || "خطأ")));
    }
  },
  payDebt: async (debtId, amount, userRole) => {
    try {
      await invoke('pay_customer_debt_db', { debtId, amount, userRole });
      set((state) => ({
        debts: state.debts.map(d => {
          if (d.id === debtId) {
            const newAmount = d.amount - amount;
            return { ...d, amount: newAmount, isPaid: newAmount <= 0, paidDate: newAmount <= 0 ? new Date().toISOString() : d.paidDate };
          }
          return d;
        })
      }));
    } catch (e) {
      alert("فشل تسديد الدفعة: " + (typeof e === "string" ? e : (e?.message || e?.kind || "خطأ")));
    }
  }
}));