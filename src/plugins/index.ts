// ========================================
// Plugins Index - تهيئة جميع الإضافات
// ========================================

import { pluginRegistry } from '../lib/core/pluginRegistry';
import { cloudSyncPlugin } from './cloudSync';
import { whatsappPlugin } from './whatsapp';
import { aiInsightsPlugin } from './aiInsights';

// تسجيل جميع الـ plugins (ولكن لا تفعّلها افتراضياً)
export function registerAllPlugins(): void {
  pluginRegistry.register(cloudSyncPlugin);
  pluginRegistry.register(whatsappPlugin);
  pluginRegistry.register(aiInsightsPlugin);
  console.log('[Plugins] All plugins registered:', pluginRegistry.stats());
}

export { pluginRegistry } from '../lib/core/pluginRegistry';
export type { PharmacyPlugin } from '../lib/core/pluginRegistry';
