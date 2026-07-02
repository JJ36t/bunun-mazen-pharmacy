import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAccountingStore } from './domains/accounting/accounting.store';
import { useInventoryStore } from './domains/inventory/inventory.store';
import { useDebtsStore } from './domains/accounting/debts.store';
import { TrendingUp, Wallet, Users, Package, AlertTriangle, Clock, DollarSign, ArrowUpRight, Activity } from 'lucide-react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';

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

  const statCards = [
    { 
      title: 'مبيعات اليوم', 
      value: stats.todaySales.toFixed(0), 
      unit: 'د.ع', 
      subtitle: `${stats.todayInvoices} فاتورة مسجلة`,
      icon: TrendingUp, 
      color: 'brand', 
      bgGradient: 'from-brand-500 to-brand-700',
      iconBg: 'bg-brand-50 text-brand-600'
    },
    { 
      title: 'صافي الأرباح', 
      value: totalProfits.toFixed(0), 
      unit: 'د.ع', 
      subtitle: 'أرباح تراكمية',
      icon: Wallet, 
      color: 'emerald', 
      bgGradient: 'from-emerald-500 to-emerald-700',
      iconBg: 'bg-emerald-50 text-emerald-600'
    },
    { 
      title: 'النقدية المتوفرة', 
      value: cashbox.toFixed(0), 
      unit: 'د.ع', 
      subtitle: 'صافي السيولة',
      icon: DollarSign, 
      color: 'gold',
      bgGradient: 'from-amber-500 to-amber-600',
      iconBg: 'bg-amber-50 text-amber-600'
    },
    { 
      title: 'ديون غير مسددة', 
      value: unpaidDebts.toFixed(0), 
      unit: 'د.ع', 
      subtitle: `${debts.filter(d => !d.isPaid).length} زبون مدين`,
      icon: Clock, 
      color: 'rose', 
      bgGradient: 'from-rose-500 to-rose-700',
      iconBg: 'bg-rose-50 text-rose-600'
    },
  ];

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      {/* رأس الصفحة */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">لوحة التحكم</h1>
          <p className="text-sm text-slate-500 mt-1.5">نظرة عامة شاملة على أداء الصيدلية اليوم</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
          <Activity className="w-4 h-4 text-emerald-500" />
          <span className="text-xs font-semibold text-slate-600">آخر تحديث: {new Date().toLocaleTimeString('en-GB')}</span>
        </div>
      </div>
      
      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="card-elegant p-6 hover:shadow-card-hover transition-all duration-200 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex justify-between items-start mb-4">
                <div className={`w-12 h-12 rounded-2xl ${stat.iconBg} flex items-center justify-center`}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">{stat.subtitle}</span>
              </div>
              <p className="text-3xl font-bold text-slate-800 mb-1 tabular">{stat.value}</p>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{stat.title} ({stat.unit})</p>
                <ArrowUpRight className="w-4 h-4 text-slate-300" />
              </div>
            </div>
          );
        })}
      </div>
      
      {/* الرسم البياني */}
      <div className="card-elegant p-6 mb-8">
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
        <div style={{ width: '100%', height: 320 }}>
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
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '12px', 
                  border: '1px solid #e2e8f0', 
                  fontSize: '13px',
                  boxShadow: '0 4px 20px -2px rgb(0 0 0 / 0.08)'
                }} 
              />
              <Area 
                type="monotone" 
                dataKey="sales" 
                stroke="#9333ea" 
                strokeWidth={3}
                fill="url(#salesGradient)"
                dot={{ fill: '#9333ea', r: 4 }} 
                activeDot={{ r: 7, fill: '#7e22ce' }} 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* القسم السفلي - التنبيهات والإحصائيات */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 grid grid-cols-2 gap-5">
          {/* تنبيهات نقص المخزون */}
          <div className="card-elegant overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center">
                  <AlertTriangle className="w-4.5 h-4.5 text-rose-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-700">تنبيهات نقص المخزون</h3>
              </div>
              {lowStockMeds.length > 0 && <span className="badge-danger">{lowStockMeds.length}</span>}
            </div>
            <div className="p-5 space-y-2.5">
              {lowStockMeds.slice(0, 5).map((med:any) => (
                <div key={med.id} className="flex items-center justify-between text-sm py-1.5">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-slate-300" />
                    <span className="text-slate-600">{med.nameAr}</span>
                  </div>
                  <span className="badge-danger">{med.quantity} قطعة</span>
                </div>
              ))}
              {lowStockMeds.length === 0 && (
                <div className="empty-state py-8">
                  <div className="empty-state-icon">
                    <Package className="w-7 h-7 text-slate-300" />
                  </div>
                  <p className="text-sm text-slate-400">لا توجد أصناف ناقصة</p>
                </div>
              )}
            </div>
          </div>
          
          {/* قرب انتهاء الصلاحية */}
          <div className="card-elegant overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Clock className="w-4.5 h-4.5 text-amber-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-700">قرب انتهاء الصلاحية</h3>
              </div>
              {expiringSoon.length > 0 && <span className="badge-warning">90 يوم</span>}
            </div>
            <div className="p-5 space-y-2.5">
              {expiringSoon.slice(0, 5).map((med:any) => (
                <div key={med.id} className="flex items-center justify-between text-sm py-1.5">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-slate-300" />
                    <span className="text-slate-600">{med.nameAr}</span>
                  </div>
                  <span className="badge-warning tabular">{med.expiryDate}</span>
                </div>
              ))}
              {expiringSoon.length === 0 && (
                <div className="empty-state py-8">
                  <div className="empty-state-icon">
                    <Clock className="w-7 h-7 text-slate-300" />
                  </div>
                  <p className="text-sm text-slate-400">لا توجد أصناف قاربت الانتهاء</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* إحصائيات سريعة */}
        <div className="card-elegant p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <Activity className="w-4.5 h-4.5 text-brand-600" />
            </div>
            إحصائيات سريعة
          </h3>
          <div className="space-y-1">
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Package className="w-4 h-4 text-slate-400" /> 
                إجمالي الأصناف
              </div>
              <span className="text-base font-bold text-slate-800 tabular">{medicines.filter((m:any) => !m.isDeleted).length}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Users className="w-4 h-4 text-slate-400" /> 
                إجمالي الديون
              </div>
              <span className="text-base font-bold text-slate-800 tabular">{debts.length}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Wallet className="w-4 h-4 text-slate-400" /> 
                ديون مسددة
              </div>
              <span className="text-base font-bold text-emerald-600 tabular">{debts.filter(d => d.isPaid).length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
