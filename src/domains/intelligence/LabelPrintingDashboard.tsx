// ========================================
// Label Printing Dashboard
// ========================================
// طباعة ملصقات الباركود + ملصقات الرفوف + ملصقات الأدوية

import { useState, useEffect } from 'react';
import { labelPrintService } from '../../lib/services/pharmiq_complete';
import { useInventoryStore } from '../inventory/inventory.store';
import { invoke } from '@tauri-apps/api/core';
import { Printer, Tag, Package, Barcode, History, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export function LabelPrintingDashboard() {
  const [selectedMedicines, setSelectedMedicines] = useState<string[]>([]);
  const [labelType, setLabelType] = useState<'barcode' | 'shelf' | 'medicine' | 'batch'>('barcode');
  const [labelSize, setLabelSize] = useState('30x20');
  const [labelCount, setLabelCount] = useState(1);
  const [printerName, setPrinterName] = useState('');
  const [printers, setPrinters] = useState<string[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { medicines, fetchMedicines } = useInventoryStore();

  useEffect(() => {
    fetchMedicines();
    loadPrinters();
    loadJobs();
  }, []);

  const filteredMedicines = medicines.filter((m: any) => !m.isDeleted && (
    !searchQuery.trim() || 
    m.nameAr?.includes(searchQuery) || 
    m.barcode?.includes(searchQuery) ||
    m.nameEn?.toLowerCase().includes(searchQuery.toLowerCase())
  ));

  const loadPrinters = async () => {
    try { setPrinters(await invoke<string[]>('get_available_printers')); } catch (e) { console.error(e); }
  };

  const loadJobs = async () => {
    try { setJobs(await labelPrintService.getJobs()); } catch (e) { console.error(e); }
  };

  const handleToggleMedicine = (id: string) => {
    setSelectedMedicines(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handlePrint = async () => {
    if (selectedMedicines.length === 0) { toast.error('اختر دواءً واحداً على الأقل'); return; }
    if (!printerName) { toast.error('اختر طابعة'); return; }
    
    try {
      for (const medId of selectedMedicines) {
        const med = medicines.find((m: any) => m.id === medId);
        if (!med) continue;
        const barcode = med.barcode || `PHM-${medId.substring(0, 8)}`;
        const printData = {
          name: med.nameAr,
          price: med.price,
          barcode,
          expiry: med.expiryDate,
        };
        await labelPrintService.createJob(labelType, medId, barcode, labelCount, labelSize, printData, printerName);
      }
      toast.success(`تم إنشاء ${selectedMedicines.length} مهمة طباعة`);
      setSelectedMedicines([]);
      loadJobs();
    } catch (e) { toast.error('فشل الطباعة: ' + e); }
  };

  const labelTypes = [
    { value: 'barcode', label: 'باركود', icon: Barcode },
    { value: 'shelf', label: 'ملصق رف', icon: Tag },
    { value: 'medicine', label: 'ملصق دواء', icon: Package },
    { value: 'batch', label: 'ملصق دفعة', icon: Package },
  ];

  const labelSizes = ['30x20', '50x30', '70x50', '100x50'];

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">طباعة الملصقات</h1>
          <p className="section-subtitle">طباعة باركود + ملصقات الرفوف + ملصقات الأدوية</p>
        </div>
        <button onClick={() => setShowHistory(!showHistory)} className="btn-ghost">
          <History className="w-4 h-4" /> سجل الطباعة
        </button>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* إعدادات الطباعة */}
        <div className="card-elegant p-5">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center"><Printer className="w-4.5 h-4.5 text-brand-700" /></div>
            إعدادات الطباعة
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="label">نوع الملصق</label>
              <div className="grid grid-cols-2 gap-2">
                {labelTypes.map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.value} onClick={() => setLabelType(t.value as any)} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-xs font-medium transition-all ${labelType === t.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>
                      <Icon className="w-3.5 h-3.5" /> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label">حجم الملصق</label>
              <select value={labelSize} onChange={(e) => setLabelSize(e.target.value)} className="input">
                {labelSizes.map(s => <option key={s} value={s}>{s} مم</option>)}
              </select>
            </div>

            <div>
              <label className="label">عدد النسخ لكل دواء</label>
              <input type="number" min="1" max="100" value={labelCount} onChange={(e) => setLabelCount(parseInt(e.target.value) || 1)} className="input tabular" />
            </div>

            <div>
              <label className="label">الطابعة</label>
              <select value={printerName} onChange={(e) => setPrinterName(e.target.value)} className="input">
                <option value="">اختر طابعة</option>
                {printers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="pt-2">
              <button onClick={handlePrint} disabled={selectedMedicines.length === 0} className="btn-primary w-full">
                <Printer className="w-4 h-4" /> طباعة ({selectedMedicines.length} دواء)
              </button>
            </div>
          </div>
        </div>

        {/* قائمة الأدوية */}
        <div className="col-span-2 card-elegant overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-800">اختر الأدوية</h3>
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث..." className="input text-sm" />
              <button onClick={() => setSelectedMedicines(filteredMedicines.map((m: any) => m.id))} className="btn-ghost text-xs whitespace-nowrap">
                تحديد الكل
              </button>
              <button onClick={() => setSelectedMedicines([])} className="btn-ghost text-xs whitespace-nowrap">
                إلغاء التحديد
              </button>
            </div>
            <span className="text-xs text-slate-500 whitespace-nowrap">{selectedMedicines.length} محدد</span>
          </div>
          <div className="max-h-[500px] overflow-auto">
            {filteredMedicines.map((med: any) => (
              <div key={med.id} onClick={() => handleToggleMedicine(med.id)} className={`flex items-center gap-3 p-3 border-b border-slate-100 cursor-pointer transition-colors ${selectedMedicines.includes(med.id) ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedMedicines.includes(med.id) ? 'border-brand-600 bg-brand-600' : 'border-slate-300'}`}>
                  {selectedMedicines.includes(med.id) && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Package className="w-4 h-4 text-slate-400" /></div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{med.nameAr}</p>
                  <p className="text-xs text-slate-400 tabular">{med.barcode || 'بدون باركود'} • {med.price.toFixed(0)} د.ع</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* سجل الطباعة */}
      {showHistory && (
        <div className="card-elegant mt-5 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800">سجل مهام الطباعة</h3>
            <button onClick={() => setShowHistory(false)} className="btn-icon"><X className="w-4 h-4" /></button>
          </div>
          <table className="w-full">
            <thead className="bg-slate-50/80 border-b border-slate-200/60">
              <tr>
                <th className="table-header text-right p-3">الدواء</th>
                <th className="table-header text-right p-3">النوع</th>
                <th className="table-header text-right p-3">الباركود</th>
                <th className="table-header text-right p-3">العدد</th>
                <th className="table-header text-right p-3">الحالة</th>
                <th className="table-header text-right p-3">التوقيت</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state py-8"><p className="text-slate-400 text-sm">لا توجد مهام</p></div></td></tr>
              ) : jobs.map(job => (
                <tr key={job.id} className="table-row">
                  <td className="p-3 text-sm font-semibold text-slate-800">{job.medicineName || '-'}</td>
                  <td className="p-3"><span className="badge-info">{job.labelType}</span></td>
                  <td className="p-3 text-xs font-mono text-slate-500 tabular">{job.barcode}</td>
                  <td className="p-3 text-sm tabular">{job.labelCount}</td>
                  <td className="p-3"><span className={`badge ${job.status === 'completed' ? 'badge-success' : job.status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>{job.status}</span></td>
                  <td className="p-3 text-xs text-slate-400 tabular">{new Date(job.createdAt).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
