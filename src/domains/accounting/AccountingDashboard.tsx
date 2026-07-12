import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAccountingStore } from './accounting.store';
import { useAuthStore } from '../security/auth.store';
import { Wallet, TrendingUp, DollarSign, Plus, RotateCcw, Receipt, Coins, BarChart3, FileDown, ArrowUpCircle, ArrowDownCircle, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { exportToPdf } from '../../lib/utils/pdfExport';

export function AccountingDashboard() {
  const { cashbox, totalSales, totalProfits, totalDiscounts, expenses, addExpense, resetDaily, fetchSummary } = useAccountingStore();
  const { role } = useAuthStore();
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseType, setExpenseType] = useState('operational');
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);

  useEffect(() => {
    fetchSummary();
    fetchRecentInvoices();
  }, [fetchSummary]);

  const fetchRecentInvoices = async () => {
    try {
      const data = await invoke<any[]>('get_invoice_details_report', {
        startDate: new Date(Date.now() - 7 * 86400000).toISOString(),
        endDate: new Date().toISOString(),
        userFilter: 'all',
      });
      setRecentInvoices(data.slice(0, 10));
    } catch (e) { console.error(e); }
  };

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
    if (window.confirm("هل أنت متأكد من الإغلاق اليومي؟ سيتم تصفير العدادات.")) {
      try {
        await resetDaily(role || 'Unknown');
        await fetchSummary();
        toast.success("تم الإغلاق اليومي بنجاح.");
      } catch (e: unknown) { toast.error(typeof e === 'string' ? e : ((e as Error)?.message || (e as { kind?: string })?.kind || 'فشل الإغلاق اليومي')); }
    }
  };

  const handleExportPdf = () => {
    exportToPdf({
      title: 'تقرير المحاسبة',
      subtitle: `الصندوق: ${cashbox.toFixed(0)} د.ع | الأرباح: ${totalProfits.toFixed(0)} د.ع`,
      columns: [
        { key: 'date', label: 'التاريخ' },
        { key: 'description', label: 'البيان' },
        { key: 'amount', label: 'المبلغ' },
      ],
      rows: expenses.map(e => ({ date: e.date, description: e.description, amount: e.amount.toFixed(2) })),
      summary: [
        { label: 'إجمالي المبيعات', value: `${totalSales.toFixed(0)} د.ع` },
        { label: 'إجمالي الخصومات', value: `${totalDiscounts.toFixed(0)} د.ع` },
        { label: 'إجمالي المصاريف', value: `${expenses.reduce((s, e) => s + e.amount, 0).toFixed(0)} د.ع` },
        { label: 'صافي الأرباح', value: `${totalProfits.toFixed(0)} د.ع` },
        { label: 'رصيد الصندوق', value: `${cashbox.toFixed(0)} د.ع` },
      ],
    });
  };

  const statCards = [
    { title: 'الصندوق النقدي', value: cashbox.toFixed(0), icon: Wallet, iconBg: 'bg-emerald-50 text-emerald-600' },
    { title: 'إجمالي المبيعات', value: totalSales.toFixed(0), icon: TrendingUp, iconBg: 'bg-brand-50 text-brand-600' },
    { title: 'إجمالي الخصومات', value: totalDiscounts.toFixed(0), icon: Percent, iconBg: 'bg-purple-50 text-purple-600' },
    { title: 'صافي الأرباح', value: totalProfits.toFixed(0), icon: DollarSign, iconBg: 'bg-amber-50 text-amber-600' },
    { title: 'إجمالي المصاريف', value: expenses.reduce((s, e) => s + e.amount, 0).toFixed(0), icon: Coins, iconBg: 'bg-rose-50 text-rose-600' },
  ];

  const expenseTypes = [
    { value: 'operational', label: 'تشغيلي' },
    { value: 'utility', label: 'كهرباء/ماء' },
    { value: 'rent', label: 'إيجار' },
    { value: 'salary', label: 'رواتب' },
    { value: 'maintenance', label: 'صيانة' },
    { value: 'other', label: 'أخرى' },
  ];

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">النظام المحاسبي</h1>
          <p className="section-subtitle">إدارة المالية والمصاريف اليومية</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportPdf} className="btn-ghost border border-slate-200">
            <FileDown className="w-4 h-4" /> تصدير PDF
          </button>
          <button onClick={handleReset} className="btn-danger">
            <RotateCcw className="w-4 h-4" /> إغلاق يومي
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4 mb-8">
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
        {/* تسجيل مصروف */}
        <div className="card-elegant p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><Plus className="w-4.5 h-4.5" /></div>
            تسجيل مصروف جديد
          </h3>
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div>
              <label className="label-lg">نوع المصروف</label>
              <select value={expenseType} onChange={(e) => setExpenseType(e.target.value)} className="input">
                {expenseTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label-lg">بيان المصروف</label>
              <input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="مثال: فاتورة كهرباء" required />
            </div>
            <div>
              <label className="label-lg">المبلغ (د.ع)</label>
              <input type="number" className="input tabular" value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>
            <button type="submit" className="btn-danger w-full py-3">
              <Coins className="w-4 h-4" /> خصم من الصندوق
            </button>
          </form>
        </div>

        {/* آخر الفواتير */}
        <div className="card-elegant p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Receipt className="w-4.5 h-4.5" /></div>
            آخر الفواتير (7 أيام)
          </h3>
          <div className="max-h-80 overflow-auto space-y-2">
            {recentInvoices.length === 0 ? (
              <div className="empty-state py-8"><p className="text-slate-400 text-sm">لا توجد فواتير</p></div>
            ) : recentInvoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <div className="flex items-center gap-2">
                  {inv.totalAmount > 0 ? <ArrowUpCircle className="w-4 h-4 text-emerald-600" /> : <ArrowDownCircle className="w-4 h-4 text-rose-600" />}
                  <div>
                    <p className="text-sm font-medium text-slate-700">{inv.userRole || 'كاشير'}</p>
                    <p className="text-xs text-slate-400 tabular">{new Date(inv.date).toLocaleDateString('en-GB')}</p>
                  </div>
                </div>
                <span className={`text-sm font-bold tabular ${inv.totalAmount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {inv.totalAmount > 0 ? '+' : ''}{inv.totalAmount.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* آخر المصاريف */}
      <div className="card-elegant p-6 mt-6">
        <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><BarChart3 className="w-4.5 h-4.5" /></div>
          آخر المصاريف
          {expenses.length > 0 && <span className="badge-info mr-auto">{expenses.length}</span>}
        </h3>
        {expenses.length === 0 ? (
          <div className="empty-state py-12">
            <div className="empty-state-icon"><Receipt className="w-7 h-7 text-slate-300" /></div>
            <p className="text-sm text-slate-400">لا توجد مصاريف مسجلة</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-200/60">
                <tr>
                  <th className="table-header text-right p-3">البيان</th>
                  <th className="table-header text-right p-3">المبلغ</th>
                  <th className="table-header text-right p-3">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice(0, 10).map(exp => (
                  <tr key={exp.id} className="table-row">
                    <td className="p-3 text-sm font-medium text-slate-700">{exp.description}</td>
                    <td className="p-3 text-sm font-bold text-rose-600 tabular">{exp.amount.toFixed(2)} <span className="text-xs font-normal text-slate-400">د.ع</span></td>
                    <td className="p-3 text-xs text-slate-400 tabular">{new Date(exp.date).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
