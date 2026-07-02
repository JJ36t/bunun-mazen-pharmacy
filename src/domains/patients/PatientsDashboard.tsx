import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Users, User } from 'lucide-react';
import { toast } from 'sonner';

export function PatientsDashboard() {
  const [patients, setPatients] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const fetchPatients = async () => {
    try { setPatients(await invoke<any[]>('get_patients_db')); } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchPatients(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !nationalId) return;
    try {
      await invoke('add_patient_db', { name, nationalId, phone, notes });
      toast.success('تمت إضافة المريض بنجاح.');
      setName(''); setNationalId(''); setPhone(''); setNotes('');
      setShowForm(false);
      fetchPatients();
    } catch (e: any) { toast.error("فشل إضافة المريض (قد يكون رقم الهوية مستخدماً): " + e); }
  };

  return (
    <div className="p-8 overflow-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800">إدارة المرضى</h1><p className="text-sm text-slate-500 mt-1">سجل الزبائن المزمنين والوصفات الطبية</p></div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary"><Plus className="w-4 h-4" />مريض جديد</button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-6 grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم المريض *</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={name} onChange={e => setName(e.target.value)} required /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">رقم الهوية (البطاقة الوطنية) *</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={nationalId} onChange={e => setNationalId(e.target.value)} required /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">رقم الهاتف</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">ملاحظات (أمراض مزمنة)</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <button type="submit" className="btn-success col-span-2">حفظ المريض</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/50 border-b border-slate-200">
            <tr>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">اسم المريض</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">رقم الهوية</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الهاتف</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 ? (
              <tr><td colSpan={4} className="p-12 text-center"><div className="flex flex-col items-center"><Users className="w-10 h-10 text-slate-200 mb-2" /><p className="text-sm text-slate-400">لا يوجد مرضى مسجلون</p></div></td></tr>
            ) : patients.map(p => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="p-4"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center"><User className="w-4 h-4 text-blue-600" /></div><span className="text-sm font-semibold text-slate-800">{p.name}</span></div></td>
                <td className="p-4 text-sm text-slate-500 font-mono">{p.nationalId}</td>
                <td className="p-4 text-sm text-slate-500">{p.phone || '-'}</td>
                <td className="p-4 text-sm text-slate-500">{p.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}