import { create } from 'zustand';
import type { Medicine } from '../../types';
import { useAuthStore } from '../security/auth.store';
import { inventoryService } from '../../lib/services';

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

// P1 fix: store now uses the service layer instead of calling invoke() directly.
// This activates caching (MemoryCache), fraud detection (fraudDetector),
// crash recovery (crashRecovery journal), and event publishing (eventBus).
// Other stores should follow the same pattern.
export const useInventoryStore = create<InventoryState>((set, get) => ({
  medicines: [],
  isLoading: false,

  fetchMedicines: async () => {
    set({ isLoading: true });
    try {
      // Uses cache (30s TTL) + perf monitor
      const data = await inventoryService.getAll();
      set({ medicines: data, isLoading: false });
    } catch (e) {
      console.error("Failed to fetch medicines:", e);
      set({ isLoading: false });
    }
  },

  addMedicine: async (med) => {
    try {
      const { sessionToken, username } = useAuthStore.getState();
      const newId = await inventoryService.add(med, username ?? 'unknown', sessionToken ?? '');

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
      const { sessionToken, username } = useAuthStore.getState();
      await inventoryService.update(id, med, username ?? "unknown", sessionToken ?? '');
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
      // Service layer runs fraud detector (checkDeletion) before invoke
      await inventoryService.delete(id, userRole, medName, sessionToken ?? '');
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
      const { sessionToken, username } = useAuthStore.getState();
      const current = get().medicines.find(m => m.id === id);
      const currentQty = current?.quantity ?? 0;
      // Service layer runs fraud detector (checkInventoryAdjustment) before invoke
      await inventoryService.adjustStock(id, amount, username ?? 'unknown', currentQty, sessionToken ?? '');
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
