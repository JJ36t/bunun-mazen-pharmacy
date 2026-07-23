// ========================================
// Plugins Index - تهيئة الإضافات
// ========================================
// Part 4 S14: Removed mock plugins (cloudSync, whatsapp, aiInsights)
// They were stubs with console.log only — no real implementation.
// Plugin system remains for future use, but no fake plugins loaded.

import { pluginRegistry } from '../lib/core/pluginRegistry';

// No plugins registered — system is ready for real plugins when available
export async function registerAllPlugins(): Promise<void> {
  // Future: register real plugins here
  // pluginRegistry.register(cloudSyncPlugin);
  // pluginRegistry.register(whatsappPlugin);
  // pluginRegistry.register(aiInsightsPlugin);
}

export { pluginRegistry } from '../lib/core/pluginRegistry';
export type { PharmacyPlugin } from '../lib/core/pluginRegistry';
