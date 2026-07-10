// ========================================
// Plugins Index - تهيئة جميع الإضافات
// ========================================

import { pluginRegistry } from '../lib/core/pluginRegistry';
import { cloudSyncPlugin } from './cloudSync';
import { whatsappPlugin } from './whatsapp';
import { aiInsightsPlugin } from './aiInsights';

// تسجيل وتفعيل جميع الـ plugins
export async function registerAllPlugins(): Promise<void> {
  pluginRegistry.register(cloudSyncPlugin);
  pluginRegistry.register(whatsappPlugin);
  pluginRegistry.register(aiInsightsPlugin);
  // فعّل plugins بأمان — الأخطاء تُسجَّل لكن لا تُوقف التطبيق
  await pluginRegistry.enableAll();
}

export { pluginRegistry } from '../lib/core/pluginRegistry';
export type { PharmacyPlugin } from '../lib/core/pluginRegistry';
