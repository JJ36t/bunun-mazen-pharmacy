// ========================================
// Plugin Architecture - بنية الإضافات
// ========================================
// يسمح بإضافة ميزات جديدة دون تعديل الكود الأساسي

import { LucideIcon } from 'lucide-react';
import { eventBus } from './eventBus';

export interface PharmacyPlugin {
  // معلومات أساسية
  name: string;                    // معرف فريد: "whatsapp-integration"
  version: string;                 // "1.0.0"
  displayName: string;             // "تكامل WhatsApp"
  description?: string;
  icon?: LucideIcon;
  author?: string;
  
  // صفحة في الواجهة (اختياري)
  dashboard?: React.ComponentType;
  navLabel?: string;
  navOrder?: number;               // ترتيب في القائمة
  
  // hooks تُنفّذ تلقائياً (اختياري)
  onInvoiceCreated?: (invoice: any) => void | Promise<void>;
  onInvoiceRefunded?: (refund: any) => void | Promise<void>;
  onStockAdjusted?: (medicine: any) => void | Promise<void>;
  onMedicineAdded?: (medicine: any) => void | Promise<void>;
  onUserLoggedIn?: (user: any) => void | Promise<void>;
  onShiftStarted?: (shift: any) => void | Promise<void>;
  onSettingsUpdated?: (settings: any) => void | Promise<void>;
  onFraudDetected?: (alert: any) => void | Promise<void>;
  
  // تهيئة (تُستدعى مرة واحدة عند التحميل)
  onLoad?: () => Promise<void>;
  onUnload?: () => Promise<void>;
  
  // إعدادات الـ plugin
  configSchema?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'select';
    label: string;
    default: any;
    options?: { value: string; label: string }[];
  }>;
}

class PluginRegistry {
  private plugins: Map<string, PharmacyPlugin> = new Map();
  private enabledPlugins: Set<string> = new Set();
  private unsubs: Map<string, (() => void)[]> = new Map();

  /** تسجيل plugin */
  register(plugin: PharmacyPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[Plugins] Plugin "${plugin.name}" is already registered.`);
      return;
    }
    
    this.plugins.set(plugin.name, plugin);
    console.log(`[Plugins] Registered: ${plugin.name} v${plugin.version}`);
  }

  /** تفعيل plugin */
  async enable(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" not found.`);
    }
    
    if (this.enabledPlugins.has(pluginName)) return;
    
    // تنفيذ onLoad
    if (plugin.onLoad) {
      try {
        await plugin.onLoad();
      } catch (e) {
        console.error(`[Plugins] Error in onLoad for "${pluginName}":`, e);
        throw e;
      }
    }
    
    // ربط hooks بالأحداث
    const unsubs: (() => void)[] = [];
    if (plugin.onInvoiceCreated) {
      unsubs.push(eventBus.on('InvoiceCreated', plugin.onInvoiceCreated));
    }
    if (plugin.onInvoiceRefunded) {
      unsubs.push(eventBus.on('InvoiceRefunded', plugin.onInvoiceRefunded));
    }
    if (plugin.onStockAdjusted) {
      unsubs.push(eventBus.on('StockAdjusted', plugin.onStockAdjusted));
    }
    if (plugin.onMedicineAdded) {
      unsubs.push(eventBus.on('MedicineAdded', plugin.onMedicineAdded));
    }
    if (plugin.onUserLoggedIn) {
      unsubs.push(eventBus.on('UserLoggedIn', plugin.onUserLoggedIn));
    }
    if (plugin.onShiftStarted) {
      unsubs.push(eventBus.on('ShiftStarted', plugin.onShiftStarted));
    }
    if (plugin.onSettingsUpdated) {
      unsubs.push(eventBus.on('SettingsUpdated', plugin.onSettingsUpdated));
    }
    if (plugin.onFraudDetected) {
      unsubs.push(eventBus.on('FraudDetected', plugin.onFraudDetected));
    }
    
    this.unsubs.set(pluginName, unsubs);
    this.enabledPlugins.add(pluginName);
    
    console.log(`[Plugins] Enabled: ${pluginName}`);
  }

  /** تعطيل plugin */
  async disable(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin || !this.enabledPlugins.has(pluginName)) return;
    
    // إلغاء ربط hooks
    const unsubs = this.unsubs.get(pluginName);
    if (unsubs) {
      unsubs.forEach(unsub => unsub());
      this.unsubs.delete(pluginName);
    }
    
    // تنفيذ onUnload
    if (plugin.onUnload) {
      try {
        await plugin.onUnload();
      } catch (e) {
        console.error(`[Plugins] Error in onUnload for "${pluginName}":`, e);
      }
    }
    
    this.enabledPlugins.delete(pluginName);
    console.log(`[Plugins] Disabled: ${pluginName}`);
  }

  /** إلغاء تسجيل plugin */
  async unregister(pluginName: string): Promise<void> {
    await this.disable(pluginName);
    this.plugins.delete(pluginName);
  }

  /** الحصول على plugin */
  get(pluginName: string): PharmacyPlugin | undefined {
    return this.plugins.get(pluginName);
  }

  /** جميع الـ plugins المسجّلة */
  getAll(): PharmacyPlugin[] {
    return Array.from(this.plugins.values());
  }

  /** الـ plugins المفعّلة فقط */
  getEnabled(): PharmacyPlugin[] {
    return this.getAll().filter(p => this.isEnabled(p.name));
  }

  /** الـ plugins التي لها صفحات UI */
  getWithDashboard(): PharmacyPlugin[] {
    return this.getEnabled()
      .filter(p => p.dashboard && p.navLabel)
      .sort((a, b) => (a.navOrder || 100) - (b.navOrder || 100));
  }

  /** هل الـ plugin مفعّل؟ */
  isEnabled(pluginName: string): boolean {
    return this.enabledPlugins.has(pluginName);
  }

  /** تفعيل جميع الـ plugins المسجّلة */
  async enableAll(): Promise<void> {
    const promises = this.getAll().map(p => this.enable(p.name).catch(e => 
      console.error(`[Plugins] Failed to enable "${p.name}":`, e)
    ));
    await Promise.all(promises);
  }

  /** إحصائيات */
  stats() {
    return {
      total: this.plugins.size,
      enabled: this.enabledPlugins.size,
      disabled: this.plugins.size - this.enabledPlugins.size,
      plugins: this.getAll().map(p => ({
        name: p.name,
        version: p.version,
        enabled: this.isEnabled(p.name),
      })),
    };
  }
}

// Singleton
export const pluginRegistry = new PluginRegistry();
