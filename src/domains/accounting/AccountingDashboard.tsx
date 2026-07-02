import { useState } from 'react';
import { useAccountingStore } from './accounting.store';
import { useAuthStore } from '../security/auth.store';
import { Wallet, TrendingUp, DollarSign, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export function AccountingDashboard() {
  const { cashbox, totalSales, totalProfits, expenses, addExpense, resetDaily, fetchSummary } = useAccountingStore();
  const { role } = useAuthStore();
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!desc || isNaN(numAmount) || numAmount <= 0) {
      toast.error("يرجى إدخال بيانات صحيحة للمصروف.");
      return;
    }
    await addExpense(desc, numAmount, role || 'Unknown');
    await fetchSummary();
    toast.success("تم تسجيل المصروف بنجاح.");
    setDesc(''); setAmount('');
  };

  const handleReset = async () => {
    if(window.confirm("هل أنت متأكد من إجراء الإغلاق اليومي؟ سيتم تصفير العدادات.")) {
      try {
        await resetDaily(role || 'Unknown');
        await fetchSummary();
        toast.success("تم الإغلاق اليومي بنجاح وتصفير العدادات.");
      } catch (e: any) {
        toast.error(e.toString());
      }
    }
  };

  return (
    <div className="p-8 overflow-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800">النظام المحاسبي</h1><p className="text-sm text-slate-500 mt-1">إدارة المالية والمصاريف</p></div>
        <button onClick={handleReset} className="btn-danger"><RotateCcw className="w-4 h-4" />إغلاق يومي</button>
      </div>

      <div className="grid grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-2.5 rounded-lg bg-emerald-50"><Wallet className="w-5 h-5 text-emerald-600" /></div></div><p className="text-2xl font-bold text-slate-800 mb-1">{cashbox.toFixed(0)}</p><p className="text-sm text-slate-500">الصندوق النقدي (د.ع)</p></div>
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-2.5 rounded-lg bg-blue-50"><TrendingUp className="w-5 h-5 text-blue-600" /></div></div><p className="text-2xl font-bold text-slate-800 mb-1">{totalSales.toFixed(0)}</p><p className="text-sm text-slate-500">إجمالي المبيعات (د.ع)</p></div>
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-2.5 rounded-lg bg-purple-50"><DollarSign className="w-5 h-5 text-purple-600" /></div></div><p className="text-2xl font-bold text-slate-800 mb-1">{totalProfits.toFixed(0)}</p><p className="text-sm text-slate-500">صافي الأرباح (د.ع)</p></div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-card border border-slate-200/60">
          <h3 className="text-base font-bold text-slate-800 mb-4">تسجيل مصروف جديد</h3>
          <form onSubmit={handleAddExpense} className="space-y-3">
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">بيان المصروف</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={desc} onChange={e => setDesc(e.target.value)} placeholder="مثال: فاتورة كهرباء" required /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">المبلغ (د.ع)</label><input type="number" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
            <button type="submit" className="w-full bg-red-500 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-red-600 flex items-center justify-center gap-2"><Plus className="w-4 h-4" />خصم من الصندوق</button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-card border border-slate-200/60">
          <h3 className="text-base font-bold text-slate-800 mb-4">آخر المصاريف</h3>
          {expenses.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">لا توجد مصاريف مسجلة</p>
          ) : (
            <div className="space-y-2">
              {expenses.slice(0, 8).map(exp => (
                <div key={exp.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50/50">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{exp.description}</p>
                    <p className="text-xs text-slate-400">{exp.date}</p>
                  </div>
                  <span className="text-sm font-bold text-red-500">-{exp.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}