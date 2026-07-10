import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Medicine {
  id: string;
  nameAr: string;
  nameEn: string;
  scientificName?: string;  // اختياري — يُستخدم لفحص تفاعلات الأدوية (بالإنجليزية)
  barcode: string;
  price: number;          // سعر البيع
  costPrice: number;      // سعر التكلفة
  quantity: number;
  batchNumber: string;
  expiryDate: string;
  isDeleted: boolean;
}

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
      const newId = await invoke<string>('add_medicine_db', {
        nameAr: med.nameAr,
        nameEn: med.nameEn,
        scientificName: med.scientificName || null,
        barcode: med.barcode,
        price: med.price,
        wholesalePrice: 0,           // لم يعد مستخدماً (نمرّر 0 للتوافق مع Rust)
        costPrice: med.costPrice,
        quantity: med.quantity,
        batchNumber: med.batchNumber,
        expiryDate: med.expiryDate
      });
      
      set((state) => ({
        medicines: [...state.medicines, { ...med, id: newId, isDeleted: false }]
      }));
    } catch (e) {
      console.error("Failed to add medicine:", e);
      alert("فشل إضافة الدواء لقاعدة البيانات: " + e);
    }
  },
  
  updateMedicine: async (id, med) => {
    try {
      await invoke('update_medicine_db', { medicineId: id, ...med, scientificName: med.scientificName || null, wholesalePrice: 0 });
      set((state) => ({
        medicines: state.medicines.map(m => m.id === id ? { ...m, ...med } : m)
      }));
    } catch (e) {
      console.error("Failed to update medicine:", e);
      alert("فشل تحديث الدواء: " + e);
    }
  },
  
  softDeleteMedicine: async (id, userRole, medName) => {
    try {
      await invoke('soft_delete_medicine_db', { medicineId: id, userRole, medName });
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
      await invoke('adjust_stock_db', { medicineId: id, amount });
      set((state) => ({
        medicines: state.medicines.map(m => 
          m.id === id ? { ...m, quantity: m.quantity + amount } : m
        )
      }));
    } catch (e) {
      console.error("Failed to adjust stock:", e);
      alert("فشل تحديث المخزون في قاعدة البيانات");
    }
  },
}));
