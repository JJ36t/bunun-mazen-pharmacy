import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAccountingStore } from './domains/accounting/accounting.store';
import { useInventoryStore } from './domains/inventory/inventory.store';
import { useDebtsStore } from './domains/accounting/debts.store';
import { TrendingUp, Wallet, Users, Package, AlertTriangle, Clock, DollarSign, ArrowUpRight, Activity, ShoppingCart, RotateCcw, Pill, Zap, Trophy, RefreshCw } from 'lucide-react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';

export function MainDashboard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [stats, setStats] = useState({ todaySales: 0, todayInvoices: 0, lowStockCount: 0 });
  const [chartData, setChartData] = useState<any[]>([]);
  const [topMeds, setTopMeds] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { totalProfits, cashbox, fetchSummary } = useAccountingStore();
  const { medicines, fetchMedicines } = useInventoryStore();
  const { debts, fetchDebts } = useDebtsStore();

  const fetchAll = async () => {
    setRefreshing(true);
    try {
      setStats(await invoke<any>('get_dashboard_stats'));
      const weeklyStats = await invoke<any[]>('get_weekly_sales_stats');
      setChartData(weeklyStats.reverse().map(d => ({ ...d, date: d.date.substring(5) })));
      setTopMeds(await invoke<any[]>('get_top_medicines_db'));
      await fetchSummary(); await fetchMedicines(); await fetchDebts();
    } catch (e) { console.error(e); }
    setRefreshing(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const unpaidDebts = debts.filter(d => !d.isPaid).reduce((s, d) => s + d.amount, 0);
  const expiringSoon = medicines.filter((m:any) => !m.isDeleted && m.expiryDate && new Date(m.expiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const lowStockMeds = medicines.filter((m:any) => !m.isDeleted && m.quantity < 50);
  const totalMedicines = medicines.filter((m:any) => !m.isDeleted);
  const totalInventoryValue = totalMedicines.reduce((s, m) => s + (m.price * m.quantity), 0);

  const statCards = [
    { title: 'مبيعات اليوم', value: stats.todaySales.toFixed(0), unit: 'د.ع', subtitle: `${stats.todayInvoices} فاتورة`, icon: TrendingUp, iconBg: 'bg-brand-50 text-brand-600' },
    { title: 'صافي الأرباح', value: totalProfits.toFixed(0), unit: 'د.ع', subtitle: 'أرباح تراكمية', icon: Wallet, iconBg: 'bg-emerald-50 text-emerald-600' },
    { title: 'النقدية المتوفرة', value: cashbox.toFixed(0), unit: 'د.ع', subtitle: 'صافي السيولة', icon: DollarSign, iconBg: 'bg-amber-50 text-amber-600' },
    { title: 'ديون غير مسددة', value: unpaidDebts.toFixed(0), unit: 'د.ع', subtitle: `${debts.filter(d => !d.isPaid).length} زبون`, icon: Clock, iconBg: 'bg-rose-50 text-rose-600' },
    { title: 'قيمة المخزون', value: totalInventoryValue.toFixed(0), unit: 'د.ع', subtitle: `${totalMedicines.length} صنف`, icon: Package, iconBg: 'bg-purple-50 text-purple-600' },
  ];

  const quickActions = [
    { label: 'بيع سريع', icon: ShoppingCart, color: 'brand', action: 'pos' },
    { label: 'مرتجع', icon: RotateCcw, color: 'rose', action: 'refund' },
    { label: 'إضافة دواء', icon: Pill, color: 'emerald', action: 'inventory' },
    { label: 'تقرير', icon: Activity, color: 'amber', action: 'reporting' },
  ];

  const colorMap: any = {
    brand: 'bg-brand-50 text-brand-600 hover:bg-brand-100',
    rose: 'bg-rose-50 text-rose-600 hover:bg-rose-100',
    emerald: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100',
    amber: 'bg-amber-50 text-amber-600 hover:bg-amber-100',
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      {/* رأس الصفحة */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">لوحة التحكم</h1>
          <p className="text-sm text-slate-500 mt-1.5">نظرة شاملة على أداء الصيدلية اليوم</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} disabled={refreshing} className="btn-ghost bg-white border border-slate-200">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            تحديث
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
            <Activity className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-semibold text-slate-600">{new Date().toLocaleDateString('en-GB')}</span>
          </div>
        </div>
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="card-elegant p-6 hover:shadow-card-hover transition-all duration-200 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex justify-between items-start mb-4">
                <div className={`w-12 h-12 rounded-2xl ${stat.iconBg} flex items-center justify-center`}>
                  <Icon className="w-6 h-6" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-300" />
              </div>
              <p className="text-3xl font-bold text-slate-800 mb-1 tabular">{stat.value}</p>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{stat.title} ({stat.unit})</p>
              </div>
              <p className="text-xs text-slate-400 mt-1">{stat.subtitle}</p>
            </div>
          );
        })}
      </div>

      {/* إجراءات سريعة — مرتبطة بـ onNavigate (إن وُجد) */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {quickActions.map((action, i) => {
          const Icon = action.icon;
          const handleAction = onNavigate ? () => onNavigate(action.action) : undefined;
          return (
            <button
              key={i}
              onClick={handleAction}
              disabled={!handleAction}
              className={`p-4 rounded-2xl ${colorMap[action.color]} flex items-center gap-3 transition-all ${handleAction ? 'hover:shadow-md cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-semibold">{action.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-5 mb-6">
        {/* الرسم البياني */}
        <div className="col-span-2 card-elegant p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold text-slate-800">مبيعات آخر 7 أيام</h3>
              <p className="text-xs text-slate-500 mt-0.5">تحليل اتجاه المبيعات الأسبوعي</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg text-xs font-semibold border border-brand-100">
              <TrendingUp className="w-3.5 h-3.5" />
              اتجاه تصاعدي
            </div>
          </div>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9333ea" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#9333ea" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', boxShadow: '0 4px 20px -2px rgb(0 0 0 / 0.08)' }} />
                <Area type="monotone" dataKey="sales" stroke="#9333ea" strokeWidth={3} fill="url(#salesGradient)" dot={{ fill: '#9333ea', r: 4 }} activeDot={{ r: 7, fill: '#7e22ce' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* أهم الأدوية مبيعاً */}
        <div className="card-elegant p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Trophy className="w-4.5 h-4.5" /></div>
            الأكثر مبيعاً
          </h3>
          <div className="space-y-2">
            {topMeds.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">لا توجد بيانات بعد</p>
            ) : topMeds.map((med, i) => (
              <div key={i} className="flex items-center gap-2 py-2">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400'}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{med.name}</p>
                  <p className="text-[10px] text-slate-400">{med.totalQty} قطعة</p>
                </div>
                <span className="text-xs font-bold text-emerald-600 tabular">{med.totalRevenue?.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* تنبيهات + إحصائيات سريعة */}
      <div className="grid grid-cols-3 gap-5">
        {/* نقص المخزون */}
        <div className="card-elegant overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><AlertTriangle className="w-4.5 h-4.5" /></div>
              <h3 className="text-sm font-bold text-slate-700">نقص المخزون</h3>
            </div>
            {lowStockMeds.length > 0 && <span className="badge-danger">{lowStockMeds.length}</span>}
          </div>
          <div className="p-4 max-h-48 overflow-auto space-y-1.5">
            {lowStockMeds.slice(0, 5).map((med:any) => (
              <div key={med.id} className="flex items-center justify-between text-sm py-1">
                <div className="flex items-center gap-2"><Package className="w-3.5 h-3.5 text-slate-300" /><span className="text-slate-600 text-xs">{med.nameAr}</span></div>
                <span className="badge-danger text-[10px]">{med.quantity} ق</span>
              </div>
            ))}
            {lowStockMeds.length === 0 && <p className="text-xs text-slate-400 text-center py-4">لا يوجد نقص</p>}
          </div>
        </div>

        {/* قرب الانتهاء */}
        <div className="card-elegant overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Clock className="w-4.5 h-4.5" /></div>
              <h3 className="text-sm font-bold text-slate-700">قرب الانتهاء (90 يوم)</h3>
            </div>
            {expiringSoon.length > 0 && <span className="badge-warning">{expiringSoon.length}</span>}
          </div>
          <div className="p-4 max-h-48 overflow-auto space-y-1.5">
            {expiringSoon.slice(0, 5).map((med:any) => (
              <div key={med.id} className="flex items-center justify-between text-sm py-1">
                <div className="flex items-center gap-2"><Package className="w-3.5 h-3.5 text-slate-300" /><span className="text-slate-600 text-xs">{med.nameAr}</span></div>
                <span className="badge-warning text-[10px] tabular">{med.expiryDate?.substring(0, 10)}</span>
              </div>
            ))}
            {expiringSoon.length === 0 && <p className="text-xs text-slate-400 text-center py-4">لا يوجد</p>}
          </div>
        </div>

        {/* إحصائيات سريعة */}
        <div className="card-elegant p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Zap className="w-4.5 h-4.5" /></div>
            إحصائيات سريعة
          </h3>
          <div className="space-y-1">
            <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-500 text-xs"><Package className="w-3.5 h-3.5 text-slate-400" /> إجمالي الأصناف</div>
              <span className="text-sm font-bold text-slate-800 tabular">{totalMedicines.length}</span>
            </div>
            <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-500 text-xs"><Wallet className="w-3.5 h-3.5 text-slate-400" /> قيمة المخزون</div>
              <span className="text-sm font-bold text-slate-800 tabular">{totalInventoryValue.toFixed(0)}</span>
            </div>
            <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-500 text-xs"><Users className="w-3.5 h-3.5 text-slate-400" /> إجمالي الديون</div>
              <span className="text-sm font-bold text-slate-800 tabular">{debts.length}</span>
            </div>
            <div className="flex justify-between items-center py-2.5">
              <div className="flex items-center gap-2 text-slate-500 text-xs"><DollarSign className="w-3.5 h-3.5 text-slate-400" /> ديون مسددة</div>
              <span className="text-sm font-bold text-emerald-600 tabular">{debts.filter(d => d.isPaid).length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
