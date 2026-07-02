// ========================================
// Barcode Intelligence Dashboard
// ========================================
// إدارة الباركود + البحث + الربط + التحليلات

import { useState, useEffect } from 'react';
import { barcodeService } from '../../lib/services/pharmiq';
import { useInventoryStore } from '../inventory/inventory.store';
import { Search, Barcode, Link2, Zap, BarChart3, Plus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function BarcodeIntelligenceDashboard() {
  const [searchBarcode, setSearchBarcode] = useState('');
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [showBindForm, setShowBindForm] = useState(false);
  const [bindBarcode, setBindBarcode] = useState('');
  const [bindMedicine, setBindMedicine] = useState('');
  const { medicines, fetchMedicines } = useInventoryStore();

  useEffect(() => {
    fetchMedicines();
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try { setAnalytics(await barcodeService.getAnalytics()); } catch (e) { console.error(e); }
  };

  const handleLookup = async () => {
    if (!searchBarcode.trim()) return;
    try {
      const result = await barcodeService.lookup(searchBarcode.trim());
      if (result) {
        setScanResult(result);
        toast.success(`تم العثور: ${result.medicineName}`);
      } else {
        setScanResult(null);
        toast.warning('الباركود غير معروف - يمكنك ربطه بدواء');
        setBindBarcode(searchBarcode.trim());
        setShowBindForm(true);
      }
      // تسجيل المحاولة
      await barcodeService.logScan(searchBarcode.trim(), 'inventory', result ? 'success' : 'unknown', result?.medicineId, undefined, 'admin');
    } catch (e) { toast.error('فشل البحث: ' + e); }
  };

  const handleBind = async () => {
    if (!bindBarcode || !bindMedicine) { toast.error('أدخل الباركود والدواء'); return; }
    try {
      await barcodeService.bind(bindBarcode, bindMedicine);
      toast.success('تم ربط الباركود بالدواء بنجاح');
      setShowBindForm(false);
      setBindBarcode('');
      setBindMedicine('');
      loadAnalytics();
    } catch (e) { toast.error('فشل الربط: ' + e); }
  };

  const handleGenerateInternal = async (medicineId: string) => {
    try {
      const barcode = await barcodeService.generateInternal(medicineId);
      toast.success(`تم توليد باركود داخلي: ${barcode}`);
    } catch (e) { toast.error('فشل التوليد: ' + e); }
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">ذكاء الباركود</h1>
        <p className="section-subtitle">إدارة الباركود + البحث + الربط + التحليلات</p>
      </div>

      {/* إحصائيات */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Barcode className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">إجمالي المسحات</p><p className="text-xl font-bold text-slate-800 tabular">{analytics?.totalScans || 0}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Zap className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">نسبة النجاح</p><p className="text-xl font-bold text-slate-800 tabular">{(analytics?.successRate || 0).toFixed(1)}%</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><AlertCircle className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">باركود غير معروف</p><p className="text-xl font-bold text-slate-800 tabular">{analytics?.unknownScans || 0}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><BarChart3 className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">متوسط وقت المسح</p><p className="text-xl font-bold text-slate-800 tabular">{(analytics?.avgScanTimeMs || 0).toFixed(0)}ms</p></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* البحث عن باركود */}
        <div className="card-elegant p-6">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center"><Search className="w-4.5 h-4.5 text-brand-700" /></div>
            البحث عن باركود
          </h3>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchBarcode}
              onChange={(e) => setSearchBarcode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              placeholder="امسح أو أدخل الباركود..."
              className="input tabular"
              autoFocus
            />
            <button onClick={handleLookup} className="btn-primary">بحث</button>
          </div>

          {scanResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-sm font-bold text-emerald-700">{scanResult.medicineName}</p>
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <p>النوع: {scanResult.barcodeType}</p>
                <p>السعر: {scanResult.price.toFixed(2)} د.ع</p>
                <p>المخزون: {scanResult.quantity}</p>
                {scanResult.batchNumber && <p>الدفعة: {scanResult.batchNumber}</p>}
              </div>
            </div>
          )}

          {showBindForm && (
            <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <h4 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
                <Link2 className="w-4 h-4" /> ربط الباركود بدواء
              </h4>
              <input type="text" value={bindBarcode} onChange={(e) => setBindBarcode(e.target.value)} placeholder="الباركود" className="input mb-2 tabular" />
              <select value={bindMedicine} onChange={(e) => setBindMedicine(e.target.value)} className="input mb-3">
                <option value="">اختر الدواء</option>
                {medicines.filter((m: any) => !m.isDeleted).map((m: any) => (
                  <option key={m.id} value={m.id}>{m.nameAr}</option>
                ))}
              </select>
              <button onClick={handleBind} className="btn-success w-full">ربط</button>
            </div>
          )}
        </div>

        {/* توليد باركود داخلي */}
        <div className="card-elegant p-6">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center"><Plus className="w-4.5 h-4.5 text-emerald-700" /></div>
            توليد باركود داخلي
          </h3>
          <p className="text-xs text-slate-500 mb-4">يولّد باركود داخلي بصيغة BNN-0000001 للأدوية بدون باركود</p>
          
          <div className="max-h-80 overflow-auto space-y-2">
            {medicines.filter((m: any) => !m.isDeleted).slice(0, 20).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{m.nameAr}</p>
                  <p className="text-[10px] text-slate-400">{m.barcode || 'بدون باركود'}</p>
                </div>
                <button onClick={() => handleGenerateInternal(m.id)} className="btn-ghost text-xs py-1.5 px-3">
                  توليد
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* أكثر الأدوية مسحاً */}
      {analytics?.topScannedMedicines?.length > 0 && (
        <div className="card-elegant p-6 mt-5">
          <h3 className="text-base font-bold text-slate-800 mb-4">الأكثر مسحاً</h3>
          <div className="space-y-2">
            {analytics.topScannedMedicines.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-500'
                }`}>{i + 1}</span>
                <span className="text-sm font-medium text-slate-700 flex-1">{item.name}</span>
                <span className="badge-info tabular">{item.count} مرة</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
