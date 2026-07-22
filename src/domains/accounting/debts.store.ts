import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Debt } from '../../types';
import { useAuthStore } from '../security/auth.store';

export type { Debt };

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
      const { sessionToken } = useAuthStore.getState();
      const newId = await invoke<string>('add_customer_debt_db', { customerName, amount, note, userRole, sessionToken: sessionToken || '' });
      set((state) => ({ 
        debts: [{ id: newId, customerName, amount, isPaid: false, note, date: new Date().toISOString(), paidDate: undefined }, ...state.debts] 
      }));
    } catch (e) {
      alert("فشل إضافة الدين: " + (typeof e === "string" ? e : ((e as Error)?.message || (e as { kind?: string })?.kind || "خطأ")));
    }
  },
  payDebt: async (debtId, amount, userRole) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      await invoke('pay_customer_debt_db', { debtId, amount, userRole, sessionToken: sessionToken || '' });
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
      alert("فشل تسديد الدفعة: " + (typeof e === "string" ? e : ((e as Error)?.message || (e as { kind?: string })?.kind || "خطأ")));
    }
  },
  deleteDebt: async (debtId: string) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      await invoke('delete_customer_debt_db', { debtId, sessionToken: sessionToken || '' });
      set((state) => ({ debts: state.debts.filter(d => d.id !== debtId) }));
    } catch (e) {
      alert("فشل حذف الدين: " + (typeof e === "string" ? e : ((e as Error)?.message || "خطأ")));
    }
  }
}));