import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAccountingStore } from './domains/accounting/accounting.store';
import { useInventoryStore } from './domains/inventory/inventory.store';
import { useDebtsStore } from './domains/accounting/debts.store';
import { TrendingUp, Wallet, Users, Package, AlertTriangle, Clock, DollarSign } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function MainDashboard() {
  const [stats, setStats] = useState({ todaySales: 0, todayInvoices: 0, lowStockCount: 0 });
  const [chartData, setChartData] = useState<any[]>([]);
  const { totalProfits, cashbox, fetchSummary } = useAccountingStore();
  const { medicines, fetchMedicines } = useInventoryStore();
  const { debts, fetchDebts } = useDebtsStore();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setStats(await invoke<any>('get_dashboard_stats'));
        const weeklyStats = await invoke<any[]>('get_weekly_sales_stats');
        setChartData(weeklyStats.reverse().map(d => ({ ...d, date: d.date.substring(5) })));
        await fetchSummary(); await fetchMedicines(); await fetchDebts();
      } catch (e) { console.error(e); }
    };
    fetchAll();
  }, []);

  const unpaidDebts = debts.filter(d => !d.isPaid).reduce((s, d) => s + d.amount, 0);
  const expiringSoon = medicines.filter((m:any) => !m.isDeleted && new Date(m.expiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const lowStockMeds = medicines.filter((m:any) => !m.isDeleted && m.quantity < 50);

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50">
      <div className="mb-8"><h1 className="text-2xl font-bold text-slate-800">لوحة التحكم</h1><p className="text-sm text-slate-500 mt-1">نظرة عامة على أداء الصيدلية اليوم</p></div>
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-3 rounded-xl bg-blue-50"><TrendingUp className="w-6 h-6 text-blue-600" /></div><span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">اليوم</span></div><p className="text-3xl font-bold text-slate-800 mb-1">{stats.todaySales.toFixed(0)}</p><p className="text-sm text-slate-500">مبيعات اليوم (د.ع)</p><div className="mt-3 text-xs text-blue-600 font-medium">{stats.todayInvoices} فاتورة مسجلة</div></div>
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-3 rounded-xl bg-emerald-50"><Wallet className="w-6 h-6 text-emerald-600" /></div><span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">الإجمالي</span></div><p className="text-3xl font-bold text-slate-800 mb-1">{totalProfits.toFixed(0)}</p><p className="text-sm text-slate-500">صافي الأرباح (د.ع)</p><div className="mt-3 text-xs text-emerald-600 font-medium">أرباح تراكمية</div></div>
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-3 rounded-xl bg-purple-50"><DollarSign className="w-6 h-6 text-purple-600" /></div><span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">الصندوق</span></div><p className="text-3xl font-bold text-slate-800 mb-1">{cashbox.toFixed(0)}</p><p className="text-sm text-slate-500">النقدية المتوفرة (د.ع)</p><div className="mt-3 text-xs text-purple-600 font-medium">صافي السيولة</div></div>
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-3 rounded-xl bg-amber-50"><Clock className="w-6 h-6 text-amber-600" /></div><span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">ديون</span></div><p className="text-3xl font-bold text-slate-800 mb-1">{unpaidDebts.toFixed(0)}</p><p className="text-sm text-slate-500">ديون غير مسددة (د.ع)</p><div className="mt-3 text-xs text-amber-600 font-medium">{debts.filter(d => !d.isPaid).length} زبون مدين</div></div>
      </div>
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mb-8">
        <h3 className="text-base font-bold text-slate-800 mb-4">مبيعات آخر 7 أيام</h3>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={3} dot={{ fill: '#2563eb', r: 4 }} activeDot={{ r: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 grid grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"><div className="p-5 border-b border-slate-100 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /><h3 className="text-sm font-bold text-slate-700">تنبيهات نقص المخزون</h3></div><div className="p-5 space-y-3">{lowStockMeds.slice(0, 5).map((med:any) => (<div key={med.id} className="flex items-center justify-between text-sm"><div className="flex items-center gap-2"><Package className="w-4 h-4 text-slate-300" /><span className="text-slate-600">{med.nameAr}</span></div><span className="px-2 py-1 rounded-md bg-red-50 text-red-600 text-xs font-bold">{med.quantity} قطعة</span></div>))}{lowStockMeds.length === 0 && <p className="text-sm text-slate-400 text-center py-4">لا توجد أصناف ناقصة</p>}</div></div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"><div className="p-5 border-b border-slate-100 flex items-center gap-2"><Clock className="w-5 h-5 text-amber-500" /><h3 className="text-sm font-bold text-slate-700">قرب انتهاء الصلاحية (90 يوم)</h3></div><div className="p-5 space-y-3">{expiringSoon.slice(0, 5).map((med:any) => (<div key={med.id} className="flex items-center justify-between text-sm"><div className="flex items-center gap-2"><Package className="w-4 h-4 text-slate-300" /><span className="text-slate-600">{med.nameAr}</span></div><span className="px-2 py-1 rounded-md bg-amber-50 text-amber-600 text-xs font-bold">{med.expiryDate}</span></div>))}{expiringSoon.length === 0 && <p className="text-sm text-slate-400 text-center py-4">لا توجد أصناف قاربت الانتهاء</p>}</div></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6"><h3 className="text-sm font-bold text-slate-700 mb-5">إحصائيات سريعة</h3><div className="space-y-4"><div className="flex justify-between items-center pb-3 border-b border-slate-100"><div className="flex items-center gap-2 text-slate-500 text-sm"><Package className="w-4 h-4" /> إجمالي الأصناف</div><span className="text-sm font-bold text-slate-800">{medicines.filter((m:any) => !m.isDeleted).length}</span></div><div className="flex justify-between items-center pb-3 border-b border-slate-100"><div className="flex items-center gap-2 text-slate-500 text-sm"><Users className="w-4 h-4" /> إجمالي الديون</div><span className="text-sm font-bold text-slate-800">{debts.length}</span></div><div className="flex justify-between items-center"><div className="flex items-center gap-2 text-slate-500 text-sm"><Clock className="w-4 h-4" /> ديون مسددة</div><span className="text-sm font-bold text-emerald-600">{debts.filter(d => d.isPaid).length}</span></div></div></div>
      </div>
    </div>
  );
}