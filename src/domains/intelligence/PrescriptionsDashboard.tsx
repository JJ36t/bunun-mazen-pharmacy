// ========================================
// Prescriptions Dashboard (الوصفات الطبية)
// ========================================

import { useState, useEffect } from 'react';
import { prescriptionService } from '../../lib/services/pharmiq';
import { FileText, Plus, Pill, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';

export function PrescriptionsDashboard() {
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchPrescriptions(); }, []);

  const fetchPrescriptions = async () => {
    setLoading(true);
    try { setPrescriptions(await prescriptionService.get()); } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">الوصفات الطبية</h1>
          <p className="section-subtitle">تسجيل وأرشفة الوصفات الطبية</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="w-4 h-4" /> وصفة جديدة
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><FileText className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">إجمالي الوصفات</p><p className="text-xl font-bold text-slate-800 tabular">{prescriptions.length}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">مضادات حيوية</p><p className="text-xl font-bold text-slate-800 tabular">{prescriptions.filter(p => p.isAntibiotic).length}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Pill className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">نشطة</p><p className="text-xl font-bold text-slate-800 tabular">{prescriptions.filter(p => p.status === 'active').length}</p></div>
        </div>
      </div>

      {showForm && <PrescriptionForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); fetchPrescriptions(); }} />}

      <div className="card-elegant overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60">
            <tr>
              <th className="table-header text-right p-4">المريض</th>
              <th className="table-header text-right p-4">الطبيب</th>
              <th className="table-header text-right p-4">التاريخ</th>
              <th className="table-header text-right p-4">التشخيص</th>
              <th className="table-header text-right p-4">النوع</th>
              <th className="table-header text-right p-4">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400 text-sm">جاري التحميل...</td></tr>
            ) : prescriptions.length === 0 ? (
              <tr><td colSpan={6}><div className="empty-state py-12"><div className="empty-state-icon"><FileText className="w-8 h-8 text-slate-300" /></div><p className="text-slate-400 text-sm">لا توجد وصفات مسجّلة</p></div></td></tr>
            ) : prescriptions.map(p => (
              <tr key={p.id} className="table-row">
                <td className="p-4 text-sm font-semibold text-slate-800">{p.patientName}</td>
                <td className="p-4 text-sm text-slate-600">{p.doctorName}</td>
                <td className="p-4 text-sm text-slate-500 tabular">{p.prescriptionDate}</td>
                <td className="p-4 text-sm text-slate-600">{p.diagnosis || '-'}</td>
                <td className="p-4">{p.isAntibiotic ? <span className="badge-danger">مضاد حيوي</span> : <span className="badge-neutral">عادي</span>}</td>
                <td className="p-4"><span className={p.status === 'active' ? 'badge-success' : 'badge-neutral'}>{p.status === 'active' ? 'نشطة' : p.status === 'completed' ? 'مكتملة' : p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PrescriptionForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [patientName, setPatientName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [diagnosis, setDiagnosis] = useState('');
  const [isAntibiotic, setIsAntibiotic] = useState(false);
  const [items, setItems] = useState<any[]>([{ drugName: '', dosage: '', frequency: '', duration: '', quantity: 0 }]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ملاحظة: يحتاج patient_id - نستخدم قيمة مؤقتة
    try {
      await prescriptionService.add('00000000-0000-0000-0000-000000000000', doctorName, undefined, date, diagnosis, undefined, isAntibiotic, items);
      toast.success('تم تسجيل الوصفة بنجاح');
      onSaved();
    } catch (e) { toast.error('فشل التسجيل: ' + e); }
  };

  return (
    <form onSubmit={handleSubmit} className="card-elegant p-6 mb-6 animate-slide-up">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold text-slate-800">وصفة طبية جديدة</h3>
        <button type="button" onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div><label className="label">اسم المريض</label><input className="input" value={patientName} onChange={(e) => setPatientName(e.target.value)} required /></div>
        <div><label className="label">اسم الطبيب</label><input className="input" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} required /></div>
        <div><label className="label">التاريخ</label><input type="date" className="input tabular" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><label className="label">التشخيص</label><input className="input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2.5">
            <input type="checkbox" checked={isAntibiotic} onChange={(e) => setIsAntibiotic(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm font-semibold text-slate-700">مضاد حيوي</span>
          </label>
        </div>
      </div>
      
      <p className="label-lg mb-3">الأدوية الموصوفة</p>
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-5 gap-2 mb-2">
          <input className="input" placeholder="اسم الدواء" value={item.drugName} onChange={(e) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, drugName: e.target.value } : it))} />
          <input className="input" placeholder="الجرعة" value={item.dosage} onChange={(e) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, dosage: e.target.value } : it))} />
          <input className="input" placeholder="التكرار" value={item.frequency} onChange={(e) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, frequency: e.target.value } : it))} />
          <input className="input" placeholder="المدة" value={item.duration} onChange={(e) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, duration: e.target.value } : it))} />
          <input type="number" className="input tabular" placeholder="الكمية" value={item.quantity || ''} onChange={(e) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: parseInt(e.target.value) || 0 } : it))} />
        </div>
      ))}
      <button type="button" onClick={() => setItems([...items, { drugName: '', dosage: '', frequency: '', duration: '', quantity: 0 }])} className="btn-ghost mt-2">
        <Plus className="w-4 h-4" /> إضافة دواء
      </button>

      <div className="flex gap-2 mt-5">
        <button type="submit" className="btn-success"><FileText className="w-4 h-4" /> حفظ الوصفة</button>
        <button type="button" onClick={onClose} className="btn-ghost">إلغاء</button>
      </div>
    </form>
  );
}
