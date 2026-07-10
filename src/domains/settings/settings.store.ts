import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface SettingsState {
  pharmacyName: string;
  phone: string;
  address: string;
  maxDiscountAmount: number; // حد الخصم اليومي بالدينار (وليس نسبة مئوية)
  fetchSettings: () => Promise<void>;
  saveSettings: (name: string, phone: string, address: string, maxDiscountAmount: number) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  pharmacyName: 'صيدلية بنين مازن',
  phone: '07700000000',
  address: 'بغداد - العراق',
  maxDiscountAmount: 1000,
  
  fetchSettings: async () => {
    try {
      const data = await invoke<any>('get_settings_db');
      set({
        pharmacyName: data.pharmacy_name || 'صيدلية بنين مازن',
        phone: data.phone || '07700000000',
        address: data.address || 'بغداد - العراق',
        maxDiscountAmount: parseFloat(data.max_discount_amount) || 1000,
      });
    } catch (e) { console.error("Failed to fetch settings:", e); }
  },
  
  saveSettings: async (name, phone, address, maxDiscountAmount) => {
    try {
      const settingsJson = JSON.stringify({
        pharmacy_name: name,
        phone,
        address,
        max_discount_amount: maxDiscountAmount.toString(),
      });
      await invoke('save_settings_db', { settingsJson });
      set({ pharmacyName: name, phone, address, maxDiscountAmount });
    } catch (e) { console.error("Failed to save settings:", e); }
  }
}));
