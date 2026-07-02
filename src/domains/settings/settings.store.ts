import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface SettingsState {
  pharmacyName: string;
  phone: string;
  address: string;
  maxDiscount: number;
  fetchSettings: () => Promise<void>;
  saveSettings: (name: string, phone: string, address: string, maxDiscount: number) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  pharmacyName: 'صيدلية بنين مازن',
  phone: '07700000000',
  address: 'بغداد - العراق',
  maxDiscount: 10,
  
  fetchSettings: async () => {
    try {
      const data = await invoke<any>('get_settings_db');
      set({
        pharmacyName: data.pharmacy_name || 'صيدلية بنين مازن',
        phone: data.phone || '07700000000',
        address: data.address || 'بغداد - العراق',
        maxDiscount: parseFloat(data.max_discount) || 10,
      });
    } catch (e) { console.error("Failed to fetch settings:", e); }
  },
  
  saveSettings: async (name, phone, address, maxDiscount) => {
    try {
      const settingsJson = JSON.stringify({ pharmacy_name: name, phone, address, max_discount: maxDiscount.toString() });
      await invoke('save_settings_db', { settingsJson });
      set({ pharmacyName: name, phone, address, maxDiscount });
    } catch (e) { console.error("Failed to save settings:", e); }
  }
}));