// ========================================
// Sample Plugin: Cloud Sync (مثال)
// ========================================
// plugin جاهز للمستقبل - غير مفعّل افتراضياً

import { PharmacyPlugin } from '../lib/core/pluginRegistry';
import { Cloud, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

// صفحة الـ plugin
function CloudSyncDashboard() {
  const [status, setStatus] = useState<'disconnected' | 'syncing' | 'synced' | 'error'>('disconnected');
  const [lastSync, setLastSync] = useState<string>('');

  useEffect(() => {
    // قراءة آخر مزامنة من الإعدادات
    invoke<string>('get_settings_db').then((settings: any) => {
      if (settings.cloud_last_sync) {
        setLastSync(settings.cloud_last_sync);
        setStatus('synced');
      }
    }).catch(() => {});
  }, []);

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50">
      <div className="mb-6">
        <h1 className="section-title">المزامنة السحابية</h1>
        <p className="section-subtitle">مزامنة البيانات مع السحابة (قيد التطوير)</p>
      </div>
      
      <div className="card-elegant p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">حالة المزامنة</h3>
            <p className="text-xs text-slate-400">
              {lastSync ? `آخر مزامنة: ${lastSync}` : 'لم تتم أي مزامنة بعد'}
            </p>
          </div>
        </div>
        
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2">
            {status === 'synced' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            ) : (
              <Cloud className="w-5 h-5 text-slate-400" />
            )}
            <span className="text-sm font-medium text-slate-700">
              {status === 'synced' ? 'المزامنة مكتملة' : 'غير متصل'}
            </span>
          </div>
        </div>
        
        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-800">
            <strong>ملاحظة:</strong> هذه الميزة قيد التطوير وستكون متاحة في الإصدار القادم.
            ستسمح بمزامنة البيانات بين الفروع المتعددة.
          </p>
        </div>
      </div>
    </div>
  );
}

export const cloudSyncPlugin: PharmacyPlugin = {
  name: 'cloud-sync',
  version: '0.1.0',
  displayName: 'المزامنة السحابية',
  description: 'مزامنة البيانات بين الفروع (قيد التطوير)',
  icon: Cloud,
  author: 'Bunun Mazen Pharmacy',
  
  dashboard: CloudSyncDashboard,
  navLabel: 'المزامنة',
  navOrder: 100,
  
  async onLoad() {
    console.log('[Plugin:CloudSync] Loaded');
  },
  
  async onUnload() {
    console.log('[Plugin:CloudSync] Unloaded');
  },
  
  async onInvoiceCreated(invoice) {
    // في المستقبل: رفع الفاتورة للسحابة
    console.log('[Plugin:CloudSync] Invoice created, will sync later:', invoice);
  },
  
  async onSettingsUpdated(settings) {
    console.log('[Plugin:CloudSync] Settings updated:', settings);
  },
  
  configSchema: {
    autoSync: {
      type: 'boolean',
      label: 'المزامنة التلقائية',
      default: false,
    },
    syncInterval: {
      type: 'select',
      label: 'فاصل المزامنة',
      default: '60',
      options: [
        { value: '15', label: '15 دقيقة' },
        { value: '30', label: '30 دقيقة' },
        { value: '60', label: 'ساعة' },
        { value: '180', label: '3 ساعات' },
      ],
    },
  },
};
