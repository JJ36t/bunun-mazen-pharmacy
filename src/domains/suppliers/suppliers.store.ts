import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  balance: number;
}

interface SuppliersState {
  suppliers: Supplier[];
  fetchSuppliers: () => Promise<void>;
  addSupplier: (name: string, phone: string) => Promise<void>;
  recordPurchase: (supplierId: string, medicineId: string, quantity: number, costPrice: number, sellingPrice: number, wholesalePrice: number, userRole: string) => Promise<void>;
  paySupplier: (supplierId: string, amount: number, userRole: string) => Promise<void>;
}

export const useSuppliersStore = create<SuppliersState>((set) => ({
  suppliers: [],
  fetchSuppliers: async () => {
    try { set({ suppliers: await invoke<Supplier[]>('get_suppliers_db') }); } 
    catch (e) { console.error("Failed to fetch suppliers:", e); }
  },
  addSupplier: async (name, phone) => {
    try {
      await invoke('add_supplier_db', { name, phone });
      const { fetchSuppliers } = useSuppliersStore.getState();
      await fetchSuppliers();
    } catch (e) { alert("فشل إضافة المورد: " + (typeof e === "string" ? e : (e?.message || e?.kind || "خطأ"))); }
  },
  recordPurchase: async (supplierId, medicineId, quantity, costPrice, sellingPrice, wholesalePrice, userRole) => {
    try {
      // التأكد من أن جميع القيم الرقمية يتم إرسالها كـ Numbers
      await invoke('record_purchase_db', { 
        supplierId, 
        medicineId, 
        quantity: Number(quantity), 
        costPrice: Number(costPrice), 
        sellingPrice: Number(sellingPrice), 
        wholesalePrice: Number(wholesalePrice), 
        userRole 
      });
      const { fetchSuppliers } = useSuppliersStore.getState();
      await fetchSuppliers();
    } catch (e: any) { 
      console.error(e);
      alert("فشل تسجيل الشراء: " + (typeof e === "string" ? e : (e?.message || e?.kind || "خطأ"))); 
    }
  },
  paySupplier: async (supplierId, amount, userRole) => {
    try {
      await invoke('pay_supplier_db', { supplierId, amount, userRole });
      const { fetchSuppliers } = useSuppliersStore.getState();
      await fetchSuppliers();
    } catch (e) { alert("فشل سداد المورد: " + (typeof e === "string" ? e : (e?.message || e?.kind || "خطأ"))); }
  }
}));