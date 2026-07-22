import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Users, User, Phone, FileText, Search, Heart, ShoppingBag, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../security/auth.store';

export function PatientsDashboard() {
  const [patients, setPatients] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
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
      const { sessionToken } = useAuthStore.getState();
      await invoke('add_patient_db', { name, nationalId, phone, notes, sessionToken: sessionToken || '' });
      toast.success('تمت إضافة المريض بنجاح.');
      setName(''); setNationalId(''); setPhone(''); setNotes('');
      setShowForm(false);
      fetchPatients();
    } catch (e: unknown) { toast.error("فشل إضافة المريض: " + e); }
  };

  const filteredPatients = patients.filter(p => 
    !search || p.name?.includes(search) || p.nationalId?.includes(search) || (p.phone && p.phone.includes(search))
  );

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">إدارة المرضى</h1>
          <p className="section-subtitle">سجل الزبائن + المرضى المزمنين + تاريخ الوصفات</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); }} className="btn-primary">
          <Plus className="w-4 h-4" /> مريض جديد
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Users className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">إجمالي المرضى</p><p className="text-xl font-bold text-slate-800 tabular">{patients.length}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><Heart className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">مرضى مزمنون</p><p className="text-xl font-bold text-slate-800 tabular">{patients.filter(p => p.isChronic).length}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Phone className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">بأرقام هواتف</p><p className="text-xl font-bold text-slate-800 tabular">{patients.filter(p => p.phone).length}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><FileText className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">بملاحظات</p><p className="text-xl font-bold text-slate-800 tabular">{patients.filter(p => p.notes).length}</p></div>
        </div>
      </div>

      <div className="relative mb-5">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث بالاسم أو رقم الهوية أو الهاتف..." className="input-lg pr-12 pl-4 shadow-sm" />
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="card-elegant p-6 mb-6 animate-slide-up">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center"><User className="w-4.5 h-4.5 text-brand-700" /></div>
            إضافة مريض جديد
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">اسم المريض *</label><input className="input" value={name} onChange={e => setName(e.target.value)} required /></div>
            <div><label className="label">رقم الهوية (البطاقة الوطنية) *</label><input className="input tabular" value={nationalId} onChange={e => setNationalId(e.target.value)} required /></div>
            <div><label className="label">رقم الهاتف</label><input className="input tabular" value={phone} onChange={e => setPhone(e.target.value)} /></div>
            <div><label className="label">ملاحظات (أمراض مزمنة)</label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          </div>
          <div className="flex gap-2 mt-5">
            <button type="submit" className="btn-success"><Plus className="w-4 h-4" /> حفظ المريض</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">إلغاء</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 card-elegant overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50/80 border-b border-slate-200/60">
              <tr>
                <th className="table-header text-right p-4">اسم المريض</th>
                <th className="table-header text-right p-4">رقم الهوية</th>
                <th className="table-header text-right p-4">الهاتف</th>
                <th className="table-header text-right p-4">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.length === 0 ? (
                <tr><td colSpan={4}>
                  <div className="empty-state py-12"><div className="empty-state-icon"><Users className="w-8 h-8 text-slate-300" /></div><p className="text-slate-400 text-sm">لا يوجد مرضى مسجلون</p></div>
                </td></tr>
              ) : filteredPatients.map(p => (
                <tr key={p.id} onClick={() => setSelectedPatient(p)} className={`table-row cursor-pointer ${selectedPatient?.id === p.id ? 'bg-brand-50' : ''}`}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center ring-1 ring-brand-200/50">
                        <User className="w-4 h-4 text-brand-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                        {p.isChronic && <span className="badge-danger text-[10px] mt-0.5">مزمن</span>}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-500 font-mono tabular">{p.nationalId}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      {p.phone ? <><Phone className="w-3.5 h-3.5 text-slate-400" /><span className="tabular">{p.phone}</span></> : '-'}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-500">
                    {p.notes ? <span className="badge-warning"><FileText className="w-3 h-3" />{p.notes}</span> : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* تفاصيل المريض */}
        <div className="card-elegant p-5">
          {selectedPatient ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-800">تفاصيل المريض</h3>
                <button onClick={() => setSelectedPatient(null)} className="btn-icon"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-50">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-200 to-brand-100 flex items-center justify-center">
                    <User className="w-6 h-6 text-brand-700" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{selectedPatient.name}</p>
                    <p className="text-xs text-slate-400">{selectedPatient.nationalId}</p>
                  </div>
                </div>
                {selectedPatient.phone && (
                  <div><p className="text-xs text-slate-400">الهاتف</p><p className="text-sm text-slate-700 tabular">{selectedPatient.phone}</p></div>
                )}
                {selectedPatient.notes && (
                  <div><p className="text-xs text-slate-400">ملاحظات</p><p className="text-sm text-slate-700">{selectedPatient.notes}</p></div>
                )}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-50 text-center">
                    <ShoppingBag className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                    <p className="text-xs text-slate-500">المشتريات</p>
                    <p className="text-lg font-bold text-slate-800 tabular">{selectedPatient.totalPurchases?.toFixed(0) || 0}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 text-center">
                    <Heart className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                    <p className="text-xs text-slate-500">نقاط الولاء</p>
                    <p className="text-lg font-bold text-amber-700 tabular">{selectedPatient.loyaltyPoints || 0}</p>
                  </div>
                </div>
                <div className="pt-2">
                  <p className="text-xs text-slate-400">تاريخ التسجيل</p>
                  <p className="text-sm text-slate-700 tabular">{selectedPatient.date ? new Date(selectedPatient.date).toLocaleDateString('en-GB') : '-'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state py-12"><div className="empty-state-icon"><User className="w-8 h-8 text-slate-300" /></div><p className="text-slate-400 text-sm">اختر مريضاً لعرض التفاصيل</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
