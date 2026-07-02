import { useState } from 'react';
import { useAccountingStore } from './accounting.store';
import { useAuthStore } from '../security/auth.store';
import { Wallet, TrendingUp, DollarSign, Plus, RotateCcw, Receipt, Coins } from 'lucide-react';
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

  const statCards = [
    { title: 'الصندوق النقدي', value: cashbox.toFixed(0), icon: Wallet, color: 'emerald', iconBg: 'bg-emerald-50 text-emerald-600' },
    { title: 'إجمالي المبيعات', value: totalSales.toFixed(0), icon: TrendingUp, color: 'brand', iconBg: 'bg-brand-50 text-brand-600' },
    { title: 'صافي الأرباح', value: totalProfits.toFixed(0), icon: DollarSign, color: 'gold', iconBg: 'bg-amber-50 text-amber-600' },
  ];

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">النظام المحاسبي</h1>
          <p className="section-subtitle">إدارة المالية والمصاريف اليومية</p>
        </div>
        <button onClick={handleReset} className="btn-danger">
          <RotateCcw className="w-4 h-4" />
          إغلاق يومي
        </button>
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-3 gap-5 mb-8">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="card-elegant p-6 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex justify-between items-start mb-4">
                <div className={`w-12 h-12 rounded-2xl ${stat.iconBg} flex items-center justify-center`}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">د.ع</span>
              </div>
              <p className="text-3xl font-bold text-slate-800 mb-1 tabular">{stat.value}</p>
              <p className="text-sm text-slate-500">{stat.title}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* نموذج إضافة مصروف */}
        <div className="card-elegant p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center">
              <Plus className="w-4.5 h-4.5 text-rose-600" />
            </div>
            تسجيل مصروف جديد
          </h3>
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div>
              <label className="label">بيان المصروف</label>
              <input 
                className="input" 
                value={desc} 
                onChange={e => setDesc(e.target.value)} 
                placeholder="مثال: فاتورة كهرباء" 
                required 
              />
            </div>
            <div>
              <label className="label">المبلغ (د.ع)</label>
              <input 
                type="number" 
                className="input tabular" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                required 
              />
            </div>
            <button type="submit" className="btn-danger w-full py-3">
              <Coins className="w-4 h-4" />
              خصم من الصندوق
            </button>
          </form>
        </div>

        {/* آخر المصاريف */}
        <div className="card-elegant p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <Receipt className="w-4.5 h-4.5 text-brand-600" />
            </div>
            آخر المصاريف
            {expenses.length > 0 && <span className="badge-info mr-auto">{expenses.length}</span>}
          </h3>
          {expenses.length === 0 ? (
            <div className="empty-state py-12">
              <div className="empty-state-icon">
                <Receipt className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-sm text-slate-400">لا توجد مصاريف مسجلة</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expenses.slice(0, 8).map(exp => (
                <div key={exp.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/70 border border-slate-100 hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{exp.description}</p>
                    <p className="text-xs text-slate-400 mt-0.5 tabular">{exp.date}</p>
                  </div>
                  <span className="text-sm font-bold text-rose-600 tabular">-{exp.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
