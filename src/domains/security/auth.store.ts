import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface AuthState {
  isAuthenticated: boolean;
  role: string | null;
  username: string | null;
  userId: string | null;        // معرّف المستخدم من DB (لإدارة الجلسات)
  sessionToken: string | null;  // token الجلسة (للتحقق من الأوامر الحساسة)
  isLicensed: boolean;
  deviceId: string;
  activationError: string | null;
  error: string | null;
  shiftId: string | null;
  shiftOpeningAmount: number;
  checkLicense: () => Promise<void>;
  getDeviceId: () => Promise<void>;
  activate: (key: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  startShift: (openingAmount: number) => Promise<void>;
  closeShift: (closingAmount: number) => Promise<void>;
  checkShift: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false, role: null, username: null, userId: null, sessionToken: null,
  isLicensed: false, deviceId: '', activationError: null, error: null,
  shiftId: null, shiftOpeningAmount: 0,

  checkLicense: async () => {
    try {
      const licensed = await invoke<boolean>('check_license');
      set({ isLicensed: licensed });
      if (!licensed) { get().getDeviceId(); }
    } catch (e) { set({ isLicensed: false, activationError: 'فشل التحقق من الترخيص' }); }
  },

  getDeviceId: async () => {
    try { set({ deviceId: await invoke<string>('get_device_id') }); } catch (e) { console.error(e); }
  },

  activate: async (key: string) => {
    try {
      const success = await invoke<boolean>('activate_license', { activationKey: key });
      if (success) { set({ isLicensed: true, activationError: null }); return true; }
      return false;
    } catch (e: any) { set({ activationError: typeof e === 'string' ? e : (e?.message || e?.kind || 'فشل تفعيل الترخيص') }); return false; }
  },

  login: async (username: string, password: string) => {
    try {
      const userData = await invoke<any>('login', { username, password });
      set({
        isAuthenticated: true,
        role: userData.role,
        username: userData.username,
        userId: userData.userId || null,
        sessionToken: userData.sessionToken || null,
        error: null,
      });
      return true;
    } catch (e: any) { set({ error: typeof e === 'string' ? e : (e?.message || e?.kind || 'فشل تسجيل الدخول') }); return false; }
  },

  startShift: async (openingAmount: number) => {
    try {
      const username = get().username || 'Unknown';
      const id = await invoke<string>('start_shift_db', { username, openingAmount });
      set({ shiftId: id, shiftOpeningAmount: openingAmount });
    } catch (e) { console.error("Failed to start shift:", e); }
  },

  closeShift: async (closingAmount: number) => {
    try {
      const id = get().shiftId;
      if (!id) return;
      await invoke('close_shift_db', { shiftId: id, closingAmount });
      set({ shiftId: null, shiftOpeningAmount: 0 });
    } catch (e) { console.error("Failed to close shift:", e); }
  },

  checkShift: async () => {
    try {
      const username = get().username || 'Unknown';
      const activeShift = await invoke<any>('get_active_shift_db', { username });
      if (activeShift) {
        set({ shiftId: activeShift.id, shiftOpeningAmount: activeShift.openingAmount });
      } else {
        set({ shiftId: null, shiftOpeningAmount: 0 });
      }
    } catch (e) { console.error(e); }
  },

  logout: async () => {
    // إغلاق الشفت قبل تسجيل الخروج (بمبلغ 0 — المستخدم يجب أن يُغلق الشفت يدوياً قبل الخروج)
    const shiftId = get().shiftId;
    if (shiftId) {
      try {
        await invoke('close_shift_db', { shiftId, closingAmount: 0 });
      } catch (e) { console.error(e); }
    }
    set({
      isAuthenticated: false, role: null, username: null, userId: null, sessionToken: null,
      shiftId: null, shiftOpeningAmount: 0,
    });
  },
}));
