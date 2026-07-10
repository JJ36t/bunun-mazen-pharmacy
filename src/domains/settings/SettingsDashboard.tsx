import { useState, useEffect } from 'react';
import { useSettingsStore } from './settings.store';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAuthStore } from '../security/auth.store';
import { invoke } from '@tauri-apps/api/core';
import { Store, Phone, MapPin, Save, Check, TrendingUp, Percent, AlertTriangle, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { PrinterSetupSection } from './PrinterSetup';

export function SettingsDashboard() {
  const { pharmacyName, phone, address, maxDiscountAmount, fetchSettings, saveSettings } = useSettingsStore();
  const { fetchMedicines } = useInventoryStore();
  const { role } = useAuthStore();
  
  const [name, setName] = useState('');
  const [ph, setPh] = useState('');
  const [addr, setAddr] = useState('');
  const [mDiscountAmount, setMDiscountAmount] = useState(1000);
  const [saved, setSaved] = useState(false);

  const [bulkType, setBulkType] = useState<'percentage' | 'amount'>('percentage');
  const [bulkValue, setBulkValue] = useState('');

  useEffect(() => { fetchSettings(); }, [fetchSettings]);
  useEffect(() => { setName(pharmacyName); setPh(phone); setAddr(address); setMDiscountAmount(maxDiscountAmount); }, [pharmacyName, phone, address, maxDiscountAmount]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings(name, ph, addr, mDiscountAmount);
    setSaved(true); setTimeout(() => setSaved(false), 3000);
    toast.success('تم حفظ الإعدادات بنجاح.');
  };

  const handleBulkUpdate = async () => {
    const val = parseFloat(bulkValue);
    if (isNaN(val)) { toast.error("أدخل قيمة صحيحة"); return; }
    if (!confirm(`سيتم تحديث أسعار كامل المخزون (${bulkType === 'percentage' ? val + '%' : val + ' د.ع'}). هل أنت متأكد؟`)) return;
    try {
      await invoke('bulk_update_prices_db', { updateType: bulkType, value: val, userRole: role });
      await fetchMedicines();
      toast.success("تم تحديث الأسعار بنجاح!");
      setBulkValue('');
    } catch (e) { toast.error("فشل التحديث: " + e); }
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">الإعدادات</h1>
        <p className="section-subtitle">إعدادات النظام والعلامة التجارية</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* بيانات الصيدلية */}
        <form onSubmit={handleSave} className="card-elegant p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
              <Store className="w-4.5 h-4.5 text-brand-700" />
            </div>
            بيانات الصيدلية
          </h3>
          <div className="space-y-4">
            <div>
              <label className="label"><Store className="w-3 h-3 inline ml-1" />اسم الصيدلية</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label"><Phone className="w-3 h-3 inline ml-1" />رقم الهاتف</label>
              <input className="input tabular" value={ph} onChange={e => setPh(e.target.value)} required />
            </div>
            <div>
              <label className="label"><MapPin className="w-3 h-3 inline ml-1" />العنوان</label>
              <input className="input" value={addr} onChange={e => setAddr(e.target.value)} required />
            </div>
            <div>
              <label className="label"><Percent className="w-3 h-3 inline ml-1" />حد الخصم اليومي للكاشير (د.ع)</label>
              <input type="number" min="0" className="input tabular" value={mDiscountAmount} onChange={e => setMDiscountAmount(parseFloat(e.target.value) || 0)} required />
              <p className="text-xs text-slate-400 mt-1">الحد الأقصى للخصم المسموح به للكاشير في اليوم الواحد (بالدينار العراقي)</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-6">
            <button type="submit" className="btn-primary">
              <Save className="w-4 h-4" />
              حفظ الإعدادات
            </button>
            {saved && <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 animate-fade-in"><Check className="w-3.5 h-3.5" />تم الحفظ بنجاح</span>}
          </div>
        </form>

        {/* تحديث الأسعار بالجملة */}
        <div className="card-elegant p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-amber-700" />
            </div>
            تحديث الأسعار بالجملة
          </h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">قم بزيادة أسعار كامل المخزون دفعة واحدة بنسبة مئوية أو مبلغ ثابت.</p>
          <div className="space-y-4">
            <div className="flex gap-2">
              <button 
                onClick={() => setBulkType('percentage')} 
                className={`flex-1 py-2.5 text-sm rounded-xl font-medium transition-all ${bulkType === 'percentage' ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                نسبة مئوية (%)
              </button>
              <button 
                onClick={() => setBulkType('amount')} 
                className={`flex-1 py-2.5 text-sm rounded-xl font-medium transition-all ${bulkType === 'amount' ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                مبلغ ثابت (د.ع)
              </button>
            </div>
            <input 
              type="number" 
              placeholder={bulkType === 'percentage' ? 'مثال: 10 (لزيادة 10%)' : 'مثال: 500 (لزيادة 500 د.ع)'} 
              value={bulkValue} 
              onChange={e => setBulkValue(e.target.value)} 
              className="input tabular" 
            />
            <button onClick={handleBulkUpdate} className="btn-warning w-full py-3">
              <TrendingUp className="w-4 h-4" />
              تطبيق التحديث على المخزون
            </button>
          </div>
        </div>

        {/* إعدادات الطابعات */}
        <PrinterSetupSection />

        {/* إعدادات التنبيهات */}
        <AlertThresholdSettings />
      </div>
    </div>
  );
}

// مكون إعدادات حدود التنبيهات
function AlertThresholdSettings() {
  const [lowStock, setLowStock] = useState('20');
  const [expiryDays, setExpiryDays] = useState('30');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // get_settings_db returns all settings as a key-value object map
      const allSettings = await invoke<any>('get_settings_db');
      if (allSettings.low_stock_threshold) setLowStock(allSettings.low_stock_threshold);
      if (allSettings.expiry_warning_days) setExpiryDays(allSettings.expiry_warning_days);
    } catch (e) { console.error(e); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // save_settings_db expects a settings_json object
      const settingsObj: Record<string, string> = {
        'low_stock_threshold': lowStock,
        'expiry_warning_days': expiryDays,
      };
      await invoke('save_settings_db', { settingsJson: JSON.stringify(settingsObj) });
      toast.success('تم حفظ حدود التنبيهات');
    } catch (e: any) {
      toast.error('فشل الحفظ: ' + e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-elegant p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800">حدود التنبيهات</h3>
          <p className="text-xs text-slate-500">متى ينبّهك النظام للمخزون والانتهاء</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="label">حد المخزون المنخفض (وحدة)</label>
          <input
            type="number"
            value={lowStock}
            onChange={(e) => setLowStock(e.target.value)}
            className="input tabular"
            min="1"
            max="500"
          />
          <p className="text-xs text-slate-400 mt-1">ينبّهك عند وصول الكمية لهذا الرقم</p>
        </div>

        <div>
          <label className="label">تنبيه قبل الانتهاء (أيام)</label>
          <input
            type="number"
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            className="input tabular"
            min="7"
            max="365"
          />
          <p className="text-xs text-slate-400 mt-1">ينبّهك قبل تاريخ الانتهاء بهذا العدد من الأيام</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full py-3 disabled:opacity-50"
        >
          {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ حدود التنبيهات
        </button>
      </div>
    </div>
  );
}
