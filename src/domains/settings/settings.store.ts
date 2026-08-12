import { create } from 'zustand';
import { useAuthStore } from '../security/auth.store';
import { settingsService } from '../../lib/services';

interface SettingsState {
  pharmacyName: string;
  phone: string;
  address: string;
  maxDiscountAmount: number; // حد الخصم اليومي بالدينار (وليس نسبة مئوية)
  fetchSettings: () => Promise<void>;
  saveSettings: (name: string, phone: string, address: string, maxDiscountAmount: number) => Promise<void>;
  setOffsiteBackupPath: (path: string) => Promise<void>;
}

// P1 fix: store now uses the service layer instead of calling invoke() directly.
// Activates caching (MemoryCache, 5-min TTL) + event publishing (SETTINGS_UPDATED).
export const useSettingsStore = create<SettingsState>((set) => ({
  pharmacyName: 'صيدلية بنين مازن',
  phone: '07700000000',
  address: 'بغداد - العراق',
  maxDiscountAmount: 1000,

  fetchSettings: async () => {
    try {
      // Uses cache (5-min TTL) via settingsService.getAll
      const data = await settingsService.getAll();
      set({
        pharmacyName: data.pharmacy_name || 'صيدلية بنين مازن',
        phone: data.phone || '07700000000',
        address: data.address || 'بغداد - العراق',
        maxDiscountAmount: parseFloat(data.max_discount_amount) || 1000,
      });
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    }
  },

  saveSettings: async (name, phone, address, maxDiscountAmount) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      const settings = {
        pharmacy_name: name,
        phone,
        address,
        max_discount_amount: maxDiscountAmount.toString(),
      };
      // Service layer handles cache invalidation + event publishing
      await settingsService.save(settings, sessionToken || '');
      set({ pharmacyName: name, phone, address, maxDiscountAmount });
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  },

  setOffsiteBackupPath: async (path: string) => {
    try {
      const { sessionToken } = useAuthStore.getState();
      await settingsService.setOffsiteBackupPath(path, sessionToken || '');
    } catch (e) {
      console.error('Failed to set offsite backup path:', e);
    }
  },
}));
