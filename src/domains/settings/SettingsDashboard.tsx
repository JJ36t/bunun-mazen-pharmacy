import { useState, useEffect } from 'react';
import { useSettingsStore } from './settings.store';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAuthStore } from '../security/auth.store';
import { invoke } from '@tauri-apps/api/core';
import { Store, Phone, MapPin, Save, Check, TrendingUp, Percent } from 'lucide-react';

export function SettingsDashboard() {
  const { pharmacyName, phone, address, maxDiscount, fetchSettings, saveSettings } = useSettingsStore();
  const { fetchMedicines } = useInventoryStore();
  const { role } = useAuthStore();
  
  const [name, setName] = useState('');
  const [ph, setPh] = useState('');
  const [addr, setAddr] = useState('');
  const [mDiscount, setMDiscount] = useState(10);
  const [saved, setSaved] = useState(false);

  const [bulkType, setBulkType] = useState<'percentage' | 'amount'>('percentage');
  const [bulkValue, setBulkValue] = useState('');

  useEffect(() => { fetchSettings(); }, [fetchSettings]);
  useEffect(() => { setName(pharmacyName); setPh(phone); setAddr(address); setMDiscount(maxDiscount); }, [pharmacyName, phone, address, maxDiscount]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings(name, ph, addr, mDiscount);
    setSaved(true); setTimeout(() => setSaved(false), 3000);
  };

  const handleBulkUpdate = async () => {
    const val = parseFloat(bulkValue);
    if (isNaN(val)) { alert("أدخل قيمة صحيحة"); return; }
    if (!confirm(`سيتم تحديث أسعار كامل المخزون (${bulkType === 'percentage' ? val + '%' : val + ' د.ع'}). هل أنت متأكد؟`)) return;
    try {
      await invoke('bulk_update_prices_db', { updateType: bulkType, value: val, userRole: role });
      await fetchMedicines();
      alert("تم تحديث الأسعار بنجاح!");
      setBulkValue('');
    } catch (e) { alert("فشل التحديث: " + e); }
  };

  return (
    <div className="p-8 overflow-auto h-full">
      <div className="mb-6"><h1 className="text-2xl font-bold text-slate-800">الإعدادات</h1><p className="text-sm text-slate-500 mt-1">إعدادات النظام والعلامة التجارية</p></div>

      <div className="grid grid-cols-2 gap-6">
        <form onSubmit={handleSave} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-base font-bold text-slate-800 mb-4">بيانات الصيدلية</h3>
          <div className="space-y-4">
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5"><Store className="w-3 h-3 inline ml-1" />اسم الصيدلية</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={name} onChange={e => setName(e.target.value)} required /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5"><Phone className="w-3 h-3 inline ml-1" />رقم الهاتف</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={ph} onChange={e => setPh(e.target.value)} required /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5"><MapPin className="w-3 h-3 inline ml-1" />العنوان</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={addr} onChange={e => setAddr(e.target.value)} required /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5"><Percent className="w-3 h-3 inline ml-1" />حد الخصم الأقصى للكاشير (%)</label><input type="number" min="0" max="100" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={mDiscount} onChange={e => setMDiscount(parseFloat(e.target.value))} required /></div>
          </div>
          <div className="flex items-center gap-3 mt-6"><button type="submit" className="btn-primary"><Save className="w-4 h-4" />حفظ الإعدادات</button>{saved && <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><Check className="w-3 h-3" />تم الحفظ</span>}</div>
        </form>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-amber-600" />تحديث الأسعار بالجملة</h3>
          <p className="text-xs text-slate-500 mb-4">قم بزيادة أسعار كامل المخزون دفعة واحدة بنسبة مئوية أو مبلغ ثابت.</p>
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={() => setBulkType('percentage')} className={`flex-1 py-2 text-sm rounded-lg font-medium ${bulkType === 'percentage' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>نسبة مئوية (%)</button>
              <button onClick={() => setBulkType('amount')} className={`flex-1 py-2 text-sm rounded-lg font-medium ${bulkType === 'amount' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>مبلغ ثابت (د.ع)</button>
            </div>
            <input type="number" placeholder={bulkType === 'percentage' ? 'مثال: 10 (لزيادة 10%)' : 'مثال: 500 (لزيادة 500 د.ع)'} value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" />
            <button onClick={handleBulkUpdate} className="w-full bg-amber-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-amber-700">تطبيق التحديث على المخزون</button>
          </div>
        </div>
      </div>
    </div>
  );
}