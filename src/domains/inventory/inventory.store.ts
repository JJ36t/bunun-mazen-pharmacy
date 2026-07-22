import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Medicine } from '../../types';
import { useAuthStore } from '../security/auth.store';

export type { Medicine };

interface InventoryState {
  medicines: Medicine[];
  isLoading: boolean;
  fetchMedicines: () => Promise<void>;
  addMedicine: (med: Omit<Medicine, 'id' | 'isDeleted'>) => Promise<void>;
  updateMedicine: (id: string, med: Omit<Medicine, 'id' | 'isDeleted'>) => Promise<void>;
  softDeleteMedicine: (id: string, userRole: string, medName: string) => Promise<void>;
  adjustStock: (id: string, amount: number) => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set) => ({
  medicines: [],
  isLoading: false,
  
  fetchMedicines: async () => {
    set({ isLoading: true });
    try {
      const data = await invoke<Medicine[]>('get_medicines_db');
      set({ medicines: data, isLoading: false });
    } catch (e) {
      console.error("Failed to fetch medicines:", e);
      set({ isLoading: false });
    }
  },
  
  addMedicine: async (med) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      const newId = await invoke<string>('add_medicine_db', {
        nameAr: med.nameAr,
        nameEn: med.nameEn,
        scientificName: med.scientificName || null,
        barcode: med.barcode,
        price: med.price,
        wholesalePrice: 0,
        costPrice: med.costPrice,
        quantity: med.quantity,
        batchNumber: med.batchNumber,
        expiryDate: med.expiryDate,
        sessionToken: sessionToken || ''
      });
      
      set((state) => ({
        medicines: [...state.medicines, { ...med, id: newId, isDeleted: false }]
      }));
    } catch (e) {
      console.error("Failed to add medicine:", e);
      alert("فشل إضافة الدواء لقاعدة البيانات: " + (typeof e === "string" ? e : ((e as Error)?.message || (e as { kind?: string })?.kind || "خطأ")));
    }
  },
  
  updateMedicine: async (id, med) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      await invoke('update_medicine_db', { medicineId: id, ...med, scientificName: med.scientificName || null, wholesalePrice: 0, sessionToken: sessionToken || '' });
      set((state) => ({
        medicines: state.medicines.map(m => m.id === id ? { ...m, ...med } : m)
      }));
    } catch (e) {
      console.error("Failed to update medicine:", e);
      alert("فشل تحديث الدواء: " + (typeof e === "string" ? e : ((e as Error)?.message || (e as { kind?: string })?.kind || "خطأ")));
    }
  },
  
  softDeleteMedicine: async (id, userRole, medName) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      await invoke('soft_delete_medicine_db', { medicineId: id, userRole, medName, sessionToken: sessionToken || '' });
      set((state) => ({
        medicines: state.medicines.map(m => 
          m.id === id ? { ...m, isDeleted: true } : m
        )
      }));
    } catch (e) {
      console.error("Failed to delete medicine:", e);
      alert("فشل حذف الدواء من قاعدة البيانات");
    }
  },
  
  adjustStock: async (id, amount) => {
    try {
      // Phase 2 Auth Fix: send sessionToken (now required by backend)
      const { sessionToken } = useAuthStore.getState();
      await invoke('adjust_stock_db', { medicineId: id, amount, sessionToken: sessionToken || '' });
      set((state) => ({
        medicines: state.medicines.map(m => 
          m.id === id ? { ...m, quantity: m.quantity + amount } : m
        )
      }));
    } catch (e) {
      console.error("Failed to adjust stock:", e);
      alert("فشل تحديث المخزون: " + (typeof e === "string" ? e : ((e as Error)?.message || "خطأ")));
    }
  },
}));
