import { useState, useEffect } from 'react';
import { useDebtsStore } from './debts.store';
import { useAuthStore } from '../security/auth.store';
import { useAccountingStore } from './accounting.store';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Users, Check, Trash2, Clock, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

export function DebtsDashboard() {
  const { debts, fetchDebts, addDebt, payDebt } = useDebtsStore();
  const { role } = useAuthStore();
  const { fetchSummary } = useAccountingStore();
  
  const [showForm, setShowForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [payAmount, setPayAmount] = useState<{ [key: string]: string }>({});
  

  useEffect(() => { fetchDebts(); }, [fetchDebts]);

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!customerName || isNaN(numAmount) || numAmount <= 0) return;
    try {
      await addDebt(customerName, numAmount, note, role || 'Unknown');
      setCustomerName(''); setAmount(''); setNote(''); setShowForm(false);
      toast.success('تم تسجيل الدين');
    } catch (e: unknown) { toast.error('فشل: ' + e); }
  };

  const handlePay = async (debtId: string) => {
    const amt = parseFloat(payAmount[debtId] || '0');
    if (isNaN(amt) || amt <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    try {
      await payDebt(debtId, amt, role || 'Unknown');
      await fetchDebts();
      await fetchSummary();
      setPayAmount({ ...payAmount, [debtId]: '' });
      toast.success('تم تسجيل الدفعة');
    } catch (e: unknown) { toast.error('فشل: ' + e); }
  };

  const handleDelete = async (debtId: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الدين نهائياً؟")) return;
    try {
      const { sessionToken } = useAuthStore.getState();
      await invoke('delete_customer_debt_db', { debtId, sessionToken: sessionToken || '' });
      await fetchDebts();
      toast.success("تم حذف الدين.");
    } catch (e: unknown) {
      toast.error('فشل الحذف: ' + e);
    }
  };

  const calculateDays = (startDate: string, paidDate?: string) => {
    const start = new Date(startDate).getTime();
    const end = paidDate ? new Date(paidDate).getTime() : new Date().getTime();
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const unpaidDebts = debts.filter(d => !d.isPaid);
  const totalUnpaid = unpaidDebts.reduce((sum, d) => sum + d.amount, 0);
  const paidDebts = debts.filter(d => d.isPaid);

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">ديون الزبائن</h1>
          <p className="section-subtitle">{unpaidDebts.length} دين غير مسدد • {paidDebts.length} دين مسدد</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="w-4 h-4" />
          تسجيل دين جديد
        </button>
      </div>

      {/* بطاقات إحصائية */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">إجمالي الديون غير المسددة</p>
            <p className="text-xl font-bold text-slate-800 tabular">{totalUnpaid.toFixed(0)} <span className="text-xs font-normal text-slate-400">د.ع</span></p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">زبائن مدينون</p>
            <p className="text-xl font-bold text-slate-800 tabular">{unpaidDebts.length}</p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">ديون مسددة</p>
            <p className="text-xl font-bold text-slate-800 tabular">{paidDebts.length}</p>
          </div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleAddDebt} className="card-elegant p-6 mb-6 animate-slide-up">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
              <Plus className="w-4.5 h-4.5 text-brand-700" />
            </div>
            تسجيل دين جديد
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="label">اسم الزبون *</label><input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} required /></div>
            <div><label className="label">مبلغ الدين *</label><input type="number" className="input tabular" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
            <div><label className="label">ملاحظة</label><input className="input" value={note} onChange={e => setNote(e.target.value)} /></div>
          </div>
          <div className="flex gap-2 mt-5">
            <button type="submit" className="btn-success">
              <Check className="w-4 h-4" />
              حفظ الدين
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">إلغاء</button>
          </div>
        </form>
      )}

      <div className="card-elegant overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60">
            <tr>
              <th className="table-header text-right p-4">الزبون</th>
              <th className="table-header text-right p-4">المبلغ المتبقي</th>
              <th className="table-header text-right p-4">الحالة</th>
              <th className="table-header text-right p-4">تاريخ الدين</th>
              <th className="table-header text-right p-4">المدة</th>
              <th className="table-header text-right p-4">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {debts.length === 0 ? (
              <tr><td colSpan={6}>
                <div className="empty-state py-12">
                  <div className="empty-state-icon">
                    <Users className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 text-sm">لا توجد ديون مسجلة</p>
                </div>
              </td></tr>
            ) : debts.map(debt => (
              <tr key={debt.id} className="table-row">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center ring-1 ring-amber-200/50">
                      <span className="text-amber-700 font-bold text-sm">{debt.customerName.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{debt.customerName}</p>
                      {debt.note && <p className="text-xs text-slate-400">{debt.note}</p>}
                    </div>
                  </div>
                </td>
                <td className="p-4 text-sm font-bold text-rose-600 tabular">{debt.amount.toFixed(2)} <span className="text-xs font-normal text-slate-400">د.ع</span></td>
                <td className="p-4">
                  {debt.isPaid 
                    ? <span className="badge-success"><Check className="w-3 h-3" />مسدد</span> 
                    : <span className="badge-danger">غير مسدد</span>}
                </td>
                <td className="p-4 text-sm text-slate-500 tabular">{new Date(debt.date).toLocaleDateString('en-GB')}</td>
                <td className="p-4 text-sm text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="tabular">{calculateDays(debt.date, debt.paidDate)} يوم</span>
                  </div>
                  {debt.paidDate && <span className="block text-xs text-emerald-500 mt-0.5 tabular">سدد في: {new Date(debt.paidDate).toLocaleDateString('en-GB')}</span>}
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    {!debt.isPaid && (
                      <>
                        <input 
                          type="number" 
                          placeholder="مبلغ" 
                          value={payAmount[debt.id] || ''} 
                          onChange={e => setPayAmount({...payAmount, [debt.id]: e.target.value})} 
                          className="w-28 px-3 py-1.5 border border-slate-200 rounded-lg text-sm tabular focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" 
                        />
                        <button onClick={() => handlePay(debt.id)} className="btn-success py-1.5 text-xs px-3">
                          <Check className="w-3 h-3" />
                          تسديد
                        </button>
                      </>
                    )}
                    <button onClick={() => handleDelete(debt.id)} className="btn-icon text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
