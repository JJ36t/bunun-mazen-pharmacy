// ========================================
// Prescriptions Dashboard (الوصفات الطبية)
// ========================================

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { prescriptionService } from '../../lib/services/pharmiq';
import { FileText, Plus, Pill, AlertTriangle, X, Trash2, User } from 'lucide-react';
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
                <td className="p-4 text-sm font-semibold text-slate-800">{p.patientName || 'غير محدد'}</td>
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
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [diagnosis, setDiagnosis] = useState('');
  const [isAntibiotic, setIsAntibiotic] = useState(false);
  const [items, setItems] = useState<any[]>([{ medicineName: '', dosage: '', duration: '', instructions: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchPatients(); }, []);

  const fetchPatients = async () => {
    try {
      const data = await invoke<any[]>('get_patients_db');
      setPatients(data);
    } catch (e) { console.error(e); }
  };

  const handleCreatePatient = async () => {
    if (!newPatientName.trim()) { toast.error('أدخل اسم المريض'); return; }
    try {
      const newId = await invoke<string>('add_patient_db', {
        name: newPatientName.trim(),
        nationalId: '-',
        phone: newPatientPhone.trim() || '-',
        notes: null,
      });
      toast.success('تم إضافة المريض');
      await fetchPatients();
      setSelectedPatientId(newId);
      setShowNewPatient(false);
      setNewPatientName('');
      setNewPatientPhone('');
    } catch (e: any) { toast.error('فشل إضافة المريض: ' + e); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) { toast.error('اختر مريضاً أو أنشئ مريضاً جديداً'); return; }
    if (!doctorName.trim()) { toast.error('أدخل اسم الطبيب'); return; }
    if (items.length === 0 || !items[0].medicineName) { toast.error('أضف دواءً واحداً على الأقل'); return; }

    setSaving(true);
    try {
      // ربط أسماء الحقول بما يتوقعه الـ backend
      const backendItems = items.map(it => ({
        medicineName: it.medicineName,
        dosage: it.dosage || '',
        duration: it.duration || '',
        instructions: it.instructions || '',
      }));
      await prescriptionService.add(
        selectedPatientId,
        doctorName,
        undefined,
        date,
        diagnosis || undefined,
        undefined,
        isAntibiotic,
        backendItems
      );
      toast.success('تم تسجيل الوصفة بنجاح');
      onSaved();
    } catch (e: any) { toast.error('فشل التسجيل: ' + e); }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="card-elegant p-6 mb-6 animate-slide-up">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold text-slate-800">وصفة طبية جديدة</h3>
        <button type="button" onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
      </div>

      {/* اختيار المريض */}
      <div className="mb-4">
        <label className="label">المريض *</label>
        {!showNewPatient ? (
          <div className="flex gap-2">
            <select className="input flex-1" value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)} required>
              <option value="">اختر مريضاً...</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name} {p.phone && p.phone !== '-' ? `(${p.phone})` : ''}</option>)}
            </select>
            <button type="button" onClick={() => setShowNewPatient(true)} className="btn-ghost border border-slate-200 whitespace-nowrap">
              <User className="w-4 h-4" /> مريض جديد
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="اسم المريض" value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)} autoFocus />
            <input className="input flex-1" placeholder="الهاتف (اختياري)" value={newPatientPhone} onChange={(e) => setNewPatientPhone(e.target.value)} />
            <button type="button" onClick={handleCreatePatient} className="btn-success whitespace-nowrap">إضافة</button>
            <button type="button" onClick={() => setShowNewPatient(false)} className="btn-ghost border border-slate-200">إلغاء</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div><label className="label">اسم الطبيب *</label><input className="input" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} required /></div>
        <div><label className="label">التاريخ</label><input type="date" className="input tabular" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2.5">
            <input type="checkbox" checked={isAntibiotic} onChange={(e) => setIsAntibiotic(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm font-semibold text-slate-700">مضاد حيوي</span>
          </label>
        </div>
      </div>
      <div className="mb-4">
        <label className="label">التشخيص</label><input className="input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
      </div>
      
      <p className="label-lg mb-3">الأدوية الموصوفة</p>
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-center">
          <input className="input col-span-4" placeholder="اسم الدواء" value={item.medicineName} onChange={(e) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, medicineName: e.target.value } : it))} />
          <input className="input col-span-2" placeholder="الجرعة" value={item.dosage} onChange={(e) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, dosage: e.target.value } : it))} />
          <input className="input col-span-2" placeholder="المدة" value={item.duration} onChange={(e) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, duration: e.target.value } : it))} />
          <input className="input col-span-3" placeholder="تعليمات" value={item.instructions} onChange={(e) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, instructions: e.target.value } : it))} />
          <button type="button" onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))} className="col-span-1 p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setItems([...items, { medicineName: '', dosage: '', duration: '', instructions: '' }])} className="btn-ghost mt-2">
        <Plus className="w-4 h-4" /> إضافة دواء
      </button>

      <div className="flex gap-2 mt-5">
        <button type="submit" disabled={saving} className="btn-success disabled:opacity-50">
          {saving ? 'جاري الحفظ...' : 'حفظ الوصفة'}
        </button>
        <button type="button" onClick={onClose} className="btn-ghost">إلغاء</button>
      </div>
    </form>
  );
}
