import { useState, useEffect } from 'react';
import { useInventoryStore } from '../inventory/inventory.store';
import { exportToCSV } from '../../lib/utils/export';
import { invoke } from '@tauri-apps/api/core';
import { TrendingUp, FileDown, Trophy, Calendar, Users, Receipt, Warehouse, AlertTriangle } from 'lucide-react';

export function ReportingDashboard() {
  const { medicines } = useInventoryStore();
  const [topMeds, setTopMeds] = useState<any[]>([]);
  const [reportData, setReportData] = useState({ totalSales: 0, totalProfits: 0, invoiceCount: 0 });
  const [invoiceDetails, setInvoiceDetails] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState('today');
  const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
  const [cashierFilter, setCashierFilter] = useState('all');
  const [users, setUsers] = useState<any[]>([]);
  const [reportType, setReportType] = useState<'sales' | 'profits' | 'inventory'>('sales');

  useEffect(() => {
    const fetchInit = async () => {
      try { 
        setTopMeds(await invoke<any[]>('get_top_medicines_db'));
        setUsers(await invoke<any[]>('get_users_db'));
      } catch (e) { console.error(e); }
    };
    fetchInit();
  }, []);

  useEffect(() => { fetchReport(); }, [timeRange, cashierFilter, reportType, customStart, customEnd]);

  const fetchReport = async () => {
    try {
      const now = new Date();
      let start = new Date(); let end = new Date();
      if (timeRange === 'custom') {
        start = new Date(customStart + 'T00:00:00');
        end = new Date(customEnd + 'T23:59:59');
      } else if (timeRange === 'today') { start.setHours(0,0,0,0); end.setHours(23,59,59,999); }
      else if (timeRange === 'yesterday') { start.setDate(now.getDate() - 1); start.setHours(0,0,0,0); end.setDate(now.getDate() - 1); end.setHours(23,59,59,999); }
      else if (timeRange === 'week') { start.setDate(now.getDate() - 7); start.setHours(0,0,0,0); }
      else if (timeRange === 'month') { start.setDate(1); start.setHours(0,0,0,0); }
      else if (timeRange === 'last_month') { start.setMonth(now.getMonth() - 1, 1); start.setHours(0,0,0,0); end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999); }

      const pad = (num: number) => num.toString().padStart(2, '0');
      const startDateStr = `${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())} ${pad(start.getHours())}:${pad(start.getMinutes())}:${pad(start.getSeconds())}`;
      const endDateStr = `${end.getFullYear()}-${pad(end.getMonth()+1)}-${pad(end.getDate())} ${pad(end.getHours())}:${pad(end.getMinutes())}:${pad(end.getSeconds())}`;

      if (reportType === 'sales' || reportType === 'profits') {
        const data = await invoke<any>('get_filtered_sales_report', { startDate: startDateStr, endDate: endDateStr, userFilter: cashierFilter });
        setReportData(data);
        const details = await invoke<any[]>('get_invoice_details_report', { startDate: startDateStr, endDate: endDateStr, userFilter: cashierFilter });
        setInvoiceDetails(details);
      }
    } catch (e) { console.error(e); }
  };

  const handleExportSales = () => { exportToCSV("تقرير_المبيعات", ["رقم الفاتورة", "المبلغ", "الربح", "الكاشير", "التاريخ"], invoiceDetails.map(inv => [inv.id, inv.totalAmount, inv.profitAmount, inv.userRole, inv.date])); };
  const handleExportInventory = () => { exportToCSV("تقرير_المخزون", ["الدواء", "الكمية", "السعر"], medicines.filter((m:any) => !m.isDeleted).map((m:any) => [m.nameAr, m.quantity, m.price])); };

  const lowStockMeds = medicines.filter((m:any) => !m.isDeleted && m.quantity < 50);
  const expiringMeds = medicines.filter((m:any) => !m.isDeleted && new Date(m.expiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">التقارير والتحليلات</h1>
        <p className="section-subtitle">تحليل الأداء حسب التاريخ والموظفين</p>
      </div>

      {/* شريط الأدوات */}
      <div className="card-elegant p-4 mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-slate-600 text-sm font-semibold">
          <FileDown className="w-4 h-4 text-brand-600" /> 
          نوع التقرير:
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setReportType('sales')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${reportType === 'sales' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>المبيعات</button>
          <button onClick={() => setReportType('profits')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${reportType === 'profits' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>الأرباح</button>
          <button onClick={() => setReportType('inventory')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${reportType === 'inventory' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>المخزون</button>
        </div>
        <div className="h-6 w-px bg-slate-200 mx-2"></div>
        <div className="flex items-center gap-2 text-slate-600 text-sm font-semibold">
          <Calendar className="w-4 h-4 text-brand-600" /> 
          الفترة:
        </div>
        <select value={timeRange} onChange={e => setTimeRange(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
          <option value="today">اليوم</option><option value="yesterday">أمس</option><option value="week">آخر أسبوع</option><option value="month">هذا الشهر</option><option value="last_month">الشهر السابق</option><option value="custom">نطاق مخصص</option>
        </select>
        {timeRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
            <span className="text-slate-400 text-xs">إلى</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
          </div>
        )}
        <div className="h-6 w-px bg-slate-200 mx-2"></div>
        <div className="flex items-center gap-2 text-slate-600 text-sm font-semibold">
          <Users className="w-4 h-4 text-brand-600" /> 
          الموظف:
        </div>
        <select value={cashierFilter} onChange={e => setCashierFilter(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
          <option value="all">الكل</option>{users.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
        </select>
      </div>

      {reportType === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <div className="card-elegant p-6 animate-slide-up">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-800 mb-1 tabular">{reportData.totalSales.toFixed(0)}</p>
              <p className="text-sm text-slate-500">إجمالي المبيعات {cashierFilter !== 'all' ? `لـ ${cashierFilter}` : ''} (د.ع)</p>
            </div>
            <div className="card-elegant p-6 animate-slide-up" style={{ animationDelay: '50ms' }}>
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Receipt className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-800 mb-1 tabular">{reportData.invoiceCount}</p>
              <p className="text-sm text-slate-500">عدد الفواتير</p>
            </div>
          </div>
          <div className="card-elegant overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">تفاصيل الفواتير</h3>
              <button onClick={handleExportSales} className="text-xs text-emerald-700 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200">
                <FileDown className="w-3.5 h-3.5" /> 
                تصدير Excel
              </button>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-200/60">
                <tr>
                  <th className="table-header text-right p-4">الدواء</th>
                  <th className="table-header text-right p-4">العدد</th>
                  <th className="table-header text-right p-4">السعر</th>
                  <th className="table-header text-right p-4">الإجمالي</th>
                  <th className="table-header text-right p-4">الكاشير</th>
                  <th className="table-header text-right p-4">رقم الفاتورة</th>
                  <th className="table-header text-right p-4">التوقيت</th>
                </tr>
              </thead>
              <tbody>
                {invoiceDetails.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state py-12">
                      <div className="empty-state-icon"><Receipt className="w-8 h-8 text-slate-300" /></div>
                      <p className="text-slate-400 text-sm">لا توجد فواتير في هذه الفترة</p>
                    </div>
                  </td></tr>
                ) : invoiceDetails.map(inv => 
                  inv.items.map((it: any, i: number) => (
                    <tr key={`${inv.id}-${i}`} className="table-row">
                      <td className="p-4 text-sm font-semibold text-slate-700">{it.name}</td>
                      <td className="p-4 text-sm text-slate-600 text-center tabular">{it.qty}</td>
                      <td className="p-4 text-sm text-slate-600 tabular">{it.price.toFixed(0)} <span className="text-xs text-slate-400">د.ع</span></td>
                      <td className="p-4 text-sm font-bold text-brand-700 tabular">{(it.price * it.qty).toFixed(0)} <span className="text-xs text-slate-400">د.ع</span></td>
                      <td className="p-4 text-sm text-slate-600">{inv.userRole}</td>
                      <td className="p-4 text-sm font-mono text-slate-500 tabular">{inv.id.substring(0, 8)}</td>
                      <td className="p-4 text-xs text-slate-400 tabular">{new Date(inv.date).toLocaleString('en-GB')}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {invoiceDetails.length > 0 && (
                <tfoot className="bg-brand-50/50 border-t-2 border-brand-200">
                  <tr>
                    <td colSpan={3} className="p-4 text-sm font-bold text-slate-800">الإجمالي الكلي للمبيعات</td>
                    <td className="p-4 text-sm font-extrabold text-brand-700 tabular">{reportData.totalSales.toFixed(0)} د.ع</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {reportType === 'profits' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <div className="card-elegant p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-800 mb-1 tabular">{reportData.totalProfits.toFixed(0)}</p>
              <p className="text-sm text-slate-500">صافي الأرباح (د.ع)</p>
            </div>
            <div className="card-elegant p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Receipt className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-800 mb-1 tabular">{reportData.invoiceCount}</p>
              <p className="text-sm text-slate-500">عدد الفواتير المسجلة</p>
            </div>
          </div>
          <div className="card-elegant overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">تفاصيل أرباح الفواتير</h3>
              <button onClick={handleExportSales} className="text-xs text-emerald-700 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200">
                <FileDown className="w-3.5 h-3.5" /> 
                تصدير Excel
              </button>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-200/60">
                <tr>
                  <th className="table-header text-right p-4">الدواء</th>
                  <th className="table-header text-right p-4">العدد</th>
                  <th className="table-header text-right p-4">السعر</th>
                  <th className="table-header text-right p-4">الإجمالي</th>
                  <th className="table-header text-right p-4">الكاشير</th>
                  <th className="table-header text-right p-4">رقم الفاتورة</th>
                  <th className="table-header text-right p-4">التوقيت</th>
                </tr>
              </thead>
              <tbody>
                {invoiceDetails.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state py-12">
                      <div className="empty-state-icon"><TrendingUp className="w-8 h-8 text-slate-300" /></div>
                      <p className="text-slate-400 text-sm">لا توجد فواتير في هذه الفترة</p>
                    </div>
                  </td></tr>
                ) : invoiceDetails.map(inv => 
                  inv.items.map((it: any, i: number) => (
                    <tr key={`${inv.id}-${i}`} className="table-row">
                      <td className="p-4 text-sm font-semibold text-slate-700">{it.name}</td>
                      <td className="p-4 text-sm text-slate-600 text-center tabular">{it.qty}</td>
                      <td className="p-4 text-sm text-slate-600 tabular">{it.price.toFixed(0)} <span className="text-xs text-slate-400">د.ع</span></td>
                      <td className="p-4 text-sm font-bold text-emerald-700 tabular">{(it.price * it.qty).toFixed(0)} <span className="text-xs text-slate-400">د.ع</span></td>
                      <td className="p-4 text-sm text-slate-600">{inv.userRole}</td>
                      <td className="p-4 text-sm font-mono text-slate-500 tabular">{inv.id.substring(0, 8)}</td>
                      <td className="p-4 text-xs text-slate-400 tabular">{new Date(inv.date).toLocaleString('en-GB')}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {invoiceDetails.length > 0 && (
                <tfoot className="bg-emerald-50/50 border-t-2 border-emerald-200">
                  <tr>
                    <td colSpan={3} className="p-4 text-sm font-bold text-slate-800">الإجمالي الكلي للأرباح</td>
                    <td className="p-4 text-sm font-extrabold text-emerald-700 tabular">{reportData.totalProfits.toFixed(0)} د.ع</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {reportType === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-5">
            <div className="card-elegant p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Warehouse className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-800 mb-1 tabular">{medicines.filter((m:any) => !m.isDeleted).length}</p>
              <p className="text-sm text-slate-500">إجمالي الأصناف</p>
            </div>
            <div className="card-elegant p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-800 mb-1 tabular">{lowStockMeds.length}</p>
              <p className="text-sm text-slate-500">أصناف قاربت على النفاد</p>
            </div>
            <div className="card-elegant p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-800 mb-1 tabular">{expiringMeds.length}</p>
              <p className="text-sm text-slate-500">قاربت على الانتهاء (90 يوم)</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="card-elegant overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800">تنبيهات النقص</h3>
                <button onClick={handleExportInventory} className="text-xs text-emerald-700 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200">
                  <FileDown className="w-3.5 h-3.5" /> 
                  تصدير
                </button>
              </div>
              <table className="w-full">
                <thead className="bg-slate-50/80 border-b border-slate-200/60">
                  <tr>
                    <th className="table-header text-right p-4">الدواء</th>
                    <th className="table-header text-right p-4">الكمية المتبقية</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockMeds.length === 0 ? (
                    <tr><td colSpan={2}><div className="empty-state py-8"><p className="text-slate-400 text-sm">لا يوجد نقص</p></div></td></tr>
                  ) : lowStockMeds.map(med => (
                    <tr key={med.id} className="table-row">
                      <td className="p-4 text-sm font-medium text-slate-800">{med.nameAr}</td>
                      <td className="p-4"><span className="badge-warning tabular">{med.quantity} قطعة</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-elegant overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800">تنبيهات الانتهاء</h3>
                <button onClick={() => window.print()} className="text-xs text-brand-700 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 border border-brand-200">
                  <FileDown className="w-3.5 h-3.5" /> 
                  طباعة
                </button>
              </div>
              <table className="w-full">
                <thead className="bg-slate-50/80 border-b border-slate-200/60">
                  <tr>
                    <th className="table-header text-right p-4">الدواء</th>
                    <th className="table-header text-right p-4">تاريخ الانتهاء</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringMeds.length === 0 ? (
                    <tr><td colSpan={2}><div className="empty-state py-8"><p className="text-slate-400 text-sm">لا يوجد أصناف قاربت على الانتهاء</p></div></td></tr>
                  ) : expiringMeds.map(med => (
                    <tr key={med.id} className="table-row">
                      <td className="p-4 text-sm font-medium text-slate-800">{med.nameAr}</td>
                      <td className="p-4"><span className="badge-danger tabular">{med.expiryDate}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* الأدوية الأكثر مبيعاً */}
      <div className="card-elegant p-6 mt-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">الأدوية الأكثر مبيعاً</h3>
            <p className="text-xs text-slate-400">ترتيب شامل لكل الفترات</p>
          </div>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60">
            <tr>
              <th className="table-header text-right p-3">الدواء</th>
              <th className="table-header text-right p-3">الكمية المباعة</th>
              <th className="table-header text-right p-3">الإيراد</th>
            </tr>
          </thead>
          <tbody>
            {topMeds.length === 0 ? (
              <tr><td colSpan={3}>
                <div className="empty-state py-8">
                  <div className="empty-state-icon">
                    <Trophy className="w-7 h-7 text-slate-300" />
                  </div>
                  <p className="text-slate-400 text-sm">لا توجد بيانات مبيعات بعد</p>
                </div>
              </td></tr>
            ) : topMeds.map((med, i) => (
              <tr key={i} className="table-row">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-amber-100 text-amber-700' :
                      i === 1 ? 'bg-slate-200 text-slate-700' :
                      i === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-slate-50 text-slate-500'
                    }`}>{i + 1}</span>
                    <span className="text-sm font-medium text-slate-800">{med.name}</span>
                  </div>
                </td>
                <td className="p-3"><span className="badge-info tabular">{med.totalQty} قطعة</span></td>
                <td className="p-3 text-sm font-bold text-emerald-700 tabular">{med.totalRevenue.toFixed(2)} <span className="text-xs font-normal text-slate-400">د.ع</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
