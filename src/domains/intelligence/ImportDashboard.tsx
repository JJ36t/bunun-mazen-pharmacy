// ========================================
// Medicine Import Dashboard
// ========================================
// استيراد الأدوية من CSV/Excel

import { useState } from 'react';
import { importService } from '../../lib/services/pharmiq_complete';
import { useAuthStore } from '../security/auth.store';
import { Upload, FileText, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export function ImportDashboard() {
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const { username } = useAuthStore();

  const sampleCsv = `name_ar,barcode,price,cost_price,quantity,name_en,scientific_name,expiry_date
باراسيتامول,6000000001,500,300,100,Paracetamol,Paracetamol,2026-12-31
اموكسيسيلين,6000000002,1500,1000,50,Amoxicillin,Amoxicillin,2026-06-30
اوميبرازول,6000000003,2000,1500,80,Omeprazole,Omeprazole,2027-01-15`;

  const handleImport = async () => {
    if (!csvText.trim()) { toast.error('الرجاء إدخال بيانات CSV'); return; }
    setLoading(true);
    try {
      const res = await importService.importCsv(csvText, username || 'admin');
      setResult(res);
      if (res.success > 0) toast.success(`تم استيراد ${res.success} دواء بنجاح`);
      if (res.failed > 0) toast.error(`فشل استيراد ${res.failed} دواء`);
    } catch (e) { toast.error('فشل الاستيراد: ' + e); }
    setLoading(false);
  };

  const handleLoadSample = () => setCsvText(sampleCsv);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setCsvText(event.target?.result as string);
    reader.readAsText(file);
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">استيراد الأدوية</h1>
        <p className="section-subtitle">استيراد الأدوية من ملفات CSV أو إدخال يدوي</p>
      </div>

      {/* تنسيق CSV */}
      <div className="card-elegant p-5 mb-6">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-brand-600" /> تنسيق CSV المطلوب
        </h3>
        <div className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs font-mono overflow-auto" dir="ltr">
          name_ar, barcode, price, cost_price, quantity, name_en, scientific_name, expiry_date
        </div>
        <p className="text-xs text-slate-500 mt-2">
          الأعمدة المطلوبة: name_ar, barcode, price, cost_price, quantity (الأخرى اختيارية)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* منطقة الإدخال */}
        <div className="card-elegant p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800">بيانات CSV</h3>
            <div className="flex gap-2">
              <label className="btn-ghost text-xs cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> رفع ملف
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
              <button onClick={handleLoadSample} className="btn-ghost text-xs">
                <Download className="w-3.5 h-3.5" /> مثال
              </button>
            </div>
          </div>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="الصق بيانات CSV هنا..."
            className="input min-h-[300px] font-mono text-xs"
            dir="ltr"
          />
          <button onClick={handleImport} disabled={loading || !csvText.trim()} className="btn-primary w-full mt-3">
            <Upload className="w-4 h-4" /> {loading ? 'جاري الاستيراد...' : 'استيراد الأدوية'}
          </button>
        </div>

        {/* النتائج */}
        <div className="card-elegant p-5">
          <h3 className="text-sm font-bold text-slate-800 mb-3">نتائج الاستيراد</h3>
          {result ? (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-lg bg-brand-50 text-center">
                  <p className="text-2xl font-bold text-brand-700 tabular">{result.total}</p>
                  <p className="text-xs text-slate-500">إجمالي</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 text-center">
                  <p className="text-2xl font-bold text-emerald-700 tabular">{result.success}</p>
                  <p className="text-xs text-slate-500">ناجح</p>
                </div>
                <div className="p-3 rounded-lg bg-rose-50 text-center">
                  <p className="text-2xl font-bold text-rose-700 tabular">{result.failed}</p>
                  <p className="text-xs text-slate-500">فاشل</p>
                </div>
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="space-y-1 max-h-60 overflow-auto">
                  <p className="text-xs font-bold text-rose-600 mb-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> الأخطاء:
                  </p>
                  {result.errors.map((err: string, i: number) => (
                    <div key={i} className="text-xs text-rose-600 p-2 rounded-lg bg-rose-50">{err}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state py-12">
              <div className="empty-state-icon"><CheckCircle className="w-8 h-8 text-slate-300" /></div>
              <p className="text-slate-400 text-sm">لا توجد نتائج بعد</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
