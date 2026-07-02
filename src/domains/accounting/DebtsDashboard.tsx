import { useState } from 'react';
import { useDebtsStore } from './debts.store';
import { useAuthStore } from '../security/auth.store';
import { useAccountingStore } from './accounting.store';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Users, Check, Trash2 } from 'lucide-react';
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

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!customerName || isNaN(numAmount) || numAmount <= 0) return;
    await addDebt(customerName, numAmount, note, role || 'Unknown');
    setCustomerName(''); setAmount(''); setNote(''); setShowForm(false);
  };

  const handlePay = async (debtId: string) => {
    const amt = parseFloat(payAmount[debtId] || '0');
    if (isNaN(amt) || amt <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    await payDebt(debtId, amt, role || 'Unknown');
    await fetchDebts();
    await fetchSummary();
    setPayAmount({ ...payAmount, [debtId]: '' });
  };

  const handleDelete = async (debtId: string) => {
    if (window.confirm("هل أنت متأكد من حذف هذا الدين نهائياً؟")) {
      await invoke('delete_customer_debt_db', { debtId });
      fetchDebts();
      toast.success("تم حذف الدين.");
    }
  };

  const calculateDays = (startDate: string, paidDate?: string) => {
    const start = new Date(startDate).getTime();
    const end = paidDate ? new Date(paidDate).getTime() : new Date().getTime();
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="p-8 overflow-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800">ديون الزبائن</h1><p className="text-sm text-slate-500 mt-1">{debts.filter(d => !d.isPaid).length} دين غير مسدد</p></div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary"><Plus className="w-4 h-4" />تسجيل دين جديد</button>
      </div>

      {showForm && (
        <form onSubmit={handleAddDebt} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-6 grid grid-cols-3 gap-4">
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم الزبون *</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={customerName} onChange={e => setCustomerName(e.target.value)} required /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">مبلغ الدين *</label><input type="number" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">ملاحظة</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={note} onChange={e => setNote(e.target.value)} /></div>
          <button type="submit" className="btn-success col-span-3">حفظ الدين</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/50 border-b border-slate-200">
            <tr>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الزبون</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">المبلغ المتبقي</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الحالة</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">تاريخ الدين</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">المدة</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {debts.length === 0 ? (
              <tr><td colSpan={6} className="p-12 text-center"><div className="flex flex-col items-center"><Users className="w-10 h-10 text-slate-200 mb-2" /><p className="text-sm text-slate-400">لا توجد ديون مسجلة</p></div></td></tr>
            ) : debts.map(debt => (
              <tr key={debt.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center"><span className="text-amber-600 font-bold text-sm">{debt.customerName.charAt(0)}</span></div>
                    <div><p className="text-sm font-semibold text-slate-800">{debt.customerName}</p>{debt.note && <p className="text-xs text-slate-400">{debt.note}</p>}</div>
                  </div>
                </td>
                <td className="p-4 text-sm font-bold text-red-600">{debt.amount.toFixed(2)} د.ع</td>
                <td className="p-4">{debt.isPaid ? <span className="badge-success"><Check className="w-3 h-3" />مسدد</span> : <span className="badge-danger">غير مسدد</span>}</td>
                <td className="p-4 text-sm text-slate-500">{new Date(debt.date).toLocaleDateString('en-GB')}</td>
                <td className="p-4 text-sm text-slate-500">
                  {calculateDays(debt.date, debt.paidDate)} يوم
                  {debt.paidDate && <span className="block text-xs text-emerald-500">سدد في: {new Date(debt.paidDate).toLocaleDateString('en-GB')}</span>}
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    {!debt.isPaid && (
                      <>
                        <input type="number" placeholder="مبلغ" value={payAmount[debt.id] || ''} onChange={e => setPayAmount({...payAmount, [debt.id]: e.target.value})} className="w-28 px-2 py-1 border border-slate-200 rounded-md text-sm" />
                        <button onClick={() => handlePay(debt.id)} className="btn-success py-1.5 text-xs px-3">تسديد</button>
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