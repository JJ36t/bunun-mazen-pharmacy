// ========================================
// Advanced Settings Dashboard
// ========================================
// إعدادات متقدمة: themes, taxes, invoice layout, performance

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Palette, Percent, FileText, Activity, Shield, Save, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export function AdvancedSettingsDashboard() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'appearance' | 'taxes' | 'invoice' | 'performance' | 'security'>('appearance');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    invoke<Record<string, string>>('get_settings_db').then(setSettings).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await invoke('save_settings_db', { settingsJson: JSON.stringify(settings) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast.success('تم حفظ الإعدادات بنجاح');
    } catch (e) {
      toast.error('فشل حفظ الإعدادات: ' + e);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { key: 'appearance' as const, label: 'المظهر', icon: Palette },
    { key: 'taxes' as const, label: 'الضرائب', icon: Percent },
    { key: 'invoice' as const, label: 'الفاتورة', icon: FileText },
    { key: 'performance' as const, label: 'الأداء', icon: Activity },
    { key: 'security' as const, label: 'الأمان', icon: Shield },
  ];

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">الإعدادات المتقدمة</h1>
          <p className="section-subtitle">تخصيص المظهر والضرائب والفواتير والأداء</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="btn-primary">
            <Save className="w-4 h-4" />
            حفظ الإعدادات
          </button>
          {saved && (
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 animate-fade-in">
              <CheckCircle className="w-3.5 h-3.5" />
              تم الحفظ
            </span>
          )}
        </div>
      </div>

      {/* تبويبات */}
      <div className="flex gap-1 bg-white p-1 rounded-xl mb-6 border border-slate-200 w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* محتوى التبويبات */}
      {activeTab === 'appearance' && (
        <div className="card-elegant p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
              <Palette className="w-4.5 h-4.5 text-brand-700" />
            </div>
            المظهر والثيمات
          </h3>
          <div className="space-y-4">
            <div>
              <label className="label-lg">الثيم الرئيسي</label>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { value: 'purple', label: 'بنفسجي', color: '#7e22ce' },
                  { value: 'blue', label: 'أزرق', color: '#2563eb' },
                  { value: 'emerald', label: 'أخضر', color: '#059669' },
                  { value: 'rose', label: 'وردي', color: '#e11d48' },
                ].map(theme => (
                  <button
                    key={theme.value}
                    onClick={() => updateSetting('theme', theme.value)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      settings.theme === theme.value
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full mx-auto mb-2" style={{ backgroundColor: theme.color }} />
                    <p className="text-xs font-semibold text-slate-700">{theme.label}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'taxes' && (
        <div className="card-elegant p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <Percent className="w-4.5 h-4.5 text-amber-700" />
            </div>
            إعدادات الضرائب
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-700">تفعيل الضريبة</p>
                <p className="text-xs text-slate-400 mt-0.5">إضافة ضريبة تلقائية على الفواتير</p>
              </div>
              <button
                onClick={() => updateSetting('tax_enabled', settings.tax_enabled === 'true' ? 'false' : 'true')}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.tax_enabled === 'true' ? 'bg-brand-600' : 'bg-slate-300'
                }`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.tax_enabled === 'true' ? 'left-0.5' : 'right-0.5'
                }`} />
              </button>
            </div>
            
            {settings.tax_enabled === 'true' && (
              <div>
                <label className="label-lg">نسبة الضريبة (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={settings.tax_rate || '0'}
                  onChange={(e) => updateSetting('tax_rate', e.target.value)}
                  className="input tabular"
                  placeholder="مثال: 5"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'invoice' && (
        <div className="card-elegant p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-emerald-700" />
            </div>
            تخصيص الفاتورة
          </h3>
          <div className="space-y-4">
            <div>
              <label className="label-lg">شعار الفاتورة</label>
              <input
                type="text"
                value={settings.invoice_logo || '/logo.png'}
                onChange={(e) => updateSetting('invoice_logo', e.target.value)}
                className="input"
                placeholder="/logo.png"
              />
            </div>
            <div>
              <label className="label-lg">نص تذييل الفاتورة</label>
              <input
                type="text"
                value={settings.invoice_footer || ''}
                onChange={(e) => updateSetting('invoice_footer', e.target.value)}
                className="input"
                placeholder="شكراً لزيارتكم"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="card-elegant p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
              <Activity className="w-4.5 h-4.5 text-brand-700" />
            </div>
            إعدادات الأداء
          </h3>
          <div className="space-y-4">
            <div>
              <label className="label-lg">حد تنبيه نقص المخزون</label>
              <input
                type="number"
                min="1"
                value={settings.low_stock_threshold || '50'}
                onChange={(e) => updateSetting('low_stock_threshold', e.target.value)}
                className="input tabular"
              />
              <p className="text-xs text-slate-400 mt-1">سيتم تنبيهك عندما يقل المخزون عن هذا الحد</p>
            </div>
            <div>
              <label className="label-lg">تنبيه قرب انتهاء الصلاحية (يوم)</label>
              <input
                type="number"
                min="1"
                value={settings.expiry_alert_days || '90'}
                onChange={(e) => updateSetting('expiry_alert_days', e.target.value)}
                className="input tabular"
              />
            </div>
            <div>
              <label className="label-lg">أقصى عدد محاولات إعادة الطباعة</label>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.max_print_retries || '3'}
                onChange={(e) => updateSetting('max_print_retries', e.target.value)}
                className="input tabular"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="card-elegant p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
              <Shield className="w-4.5 h-4.5 text-rose-700" />
            </div>
            إعدادات الأمان
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-700">كشف الاحتيال</p>
                <p className="text-xs text-slate-400 mt-0.5">رصد العمليات المشبوهة تلقائياً</p>
              </div>
              <button
                onClick={() => updateSetting('fraud_detection_enabled', settings.fraud_detection_enabled === 'false' ? 'true' : 'false')}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.fraud_detection_enabled !== 'false' ? 'bg-brand-600' : 'bg-slate-300'
                }`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.fraud_detection_enabled !== 'false' ? 'left-0.5' : 'right-0.5'
                }`} />
              </button>
            </div>
            
            <div>
              <label className="label-lg">انتهاء الجلسة (دقيقة)</label>
              <input
                type="number"
                min="5"
                value={settings.session_timeout || '60'}
                onChange={(e) => updateSetting('session_timeout', e.target.value)}
                className="input tabular"
              />
              <p className="text-xs text-slate-400 mt-1">سيتم تسجيل الخروج بعد عدم النشاط لهذه المدة</p>
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-700">النسخ الاحتياطي التلقائي</p>
                <p className="text-xs text-slate-400 mt-0.5">نسخ احتياطي يومي تلقائي</p>
              </div>
              <button
                onClick={() => updateSetting('auto_backup_enabled', settings.auto_backup_enabled === 'true' ? 'false' : 'true')}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.auto_backup_enabled === 'true' ? 'bg-brand-600' : 'bg-slate-300'
                }`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.auto_backup_enabled === 'true' ? 'left-0.5' : 'right-0.5'
                }`} />
              </button>
            </div>
            
            {settings.auto_backup_enabled === 'true' && (
              <div>
                <label className="label-lg">فاصل النسخ التلقائي (ساعة)</label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={settings.auto_backup_interval || '24'}
                  onChange={(e) => updateSetting('auto_backup_interval', e.target.value)}
                  className="input tabular"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
