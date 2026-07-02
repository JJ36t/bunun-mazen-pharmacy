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

  useEffect(() => { fetchReport(); }, [timeRange, cashierFilter, reportType]);

  const fetchReport = async () => {
    try {
      const now = new Date();
      let start = new Date(); let end = new Date();
      if (timeRange === 'today') { start.setHours(0,0,0,0); end.setHours(23,59,59,999); }
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
    <div className="p-8 overflow-auto h-full">
      <div className="mb-6"><h1 className="text-2xl font-bold text-slate-800">التقارير والتحليلات</h1><p className="text-sm text-slate-500 mt-1">تحليل الأداء حسب التاريخ والموظفين</p></div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-slate-600"><FileDown className="w-4 h-4" /> نوع التقرير:</div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          <button onClick={() => setReportType('sales')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${reportType === 'sales' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>المبيعات</button>
          <button onClick={() => setReportType('profits')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${reportType === 'profits' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>الأرباح</button>
          <button onClick={() => setReportType('inventory')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${reportType === 'inventory' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'}`}>المخزون</button>
        </div>
        <div className="h-6 w-px bg-slate-200 mx-2"></div>
        <div className="flex items-center gap-2 text-slate-600"><Calendar className="w-4 h-4" /> الفترة:</div>
        <select value={timeRange} onChange={e => setTimeRange(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
          <option value="today">اليوم</option><option value="yesterday">أمس</option><option value="week">آخر أسبوع</option><option value="month">هذا الشهر</option><option value="last_month">الشهر السابق</option>
        </select>
        <div className="h-6 w-px bg-slate-200 mx-2"></div>
        <div className="flex items-center gap-2 text-slate-600"><Users className="w-4 h-4" /> الموظف:</div>
        <select value={cashierFilter} onChange={e => setCashierFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
          <option value="all">الكل</option>{users.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
        </select>
      </div>

      {reportType === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-2.5 rounded-lg bg-blue-50"><TrendingUp className="w-5 h-5 text-blue-600" /></div></div><p className="text-2xl font-bold text-slate-800 mb-1">{reportData.totalSales.toFixed(0)}</p><p className="text-sm text-slate-500">إجمالي المبيعات {cashierFilter !== 'all' ? `لـ ${cashierFilter}` : ''} (د.ع)</p></div>
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-2.5 rounded-lg bg-slate-100"><Receipt className="w-5 h-5 text-slate-600" /></div></div><p className="text-2xl font-bold text-slate-800 mb-1">{reportData.invoiceCount}</p><p className="text-sm text-slate-500">عدد الفواتير</p></div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between"><h3 className="text-base font-bold text-slate-800">تفاصيل الفواتير</h3><button onClick={handleExportSales} className="text-xs text-emerald-600 font-medium flex items-center gap-1"><FileDown className="w-3 h-3" /> تصدير Excel</button></div>
            <table className="w-full">
              <thead className="bg-slate-50/50 border-b border-slate-200"><tr><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">رقم الفاتورة</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">المبلغ</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الكاشير</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الأصناف</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">التوقيت</th></tr></thead>
              <tbody>
                {invoiceDetails.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-400 text-sm">لا توجد فواتير في هذه الفترة</td></tr> : invoiceDetails.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50/50 align-top">
                    <td className="p-4 text-sm font-mono text-slate-500">{inv.id.substring(0, 8)}</td>
                    <td className="p-4 text-sm font-bold text-blue-600">{inv.totalAmount.toFixed(2)} د.ع</td>
                    <td className="p-4 text-sm text-slate-600">{inv.userRole}</td>
                    <td className="p-4 text-xs text-slate-500 space-y-1">{inv.items.map((it: any, i: number) => (<div key={i}>{it.name} (x{it.qty}) - {it.price.toFixed(2)}</div>))}</td>
                    <td className="p-4 text-xs text-slate-400">{new Date(inv.date).toLocaleString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td className="p-4 text-sm font-bold text-slate-800" colSpan={1}>الإجمالي الكلي للمبيعات</td>
                  <td className="p-4 text-sm font-extrabold text-blue-700">{reportData.totalSales.toFixed(2)} د.ع</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {reportType === 'profits' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-2.5 rounded-lg bg-emerald-50"><TrendingUp className="w-5 h-5 text-emerald-600" /></div></div><p className="text-2xl font-bold text-slate-800 mb-1">{reportData.totalProfits.toFixed(0)}</p><p className="text-sm text-slate-500">صافي الأرباح (د.ع)</p></div>
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-2.5 rounded-lg bg-slate-100"><Receipt className="w-5 h-5 text-slate-600" /></div></div><p className="text-2xl font-bold text-slate-800 mb-1">{reportData.invoiceCount}</p><p className="text-sm text-slate-500">عدد الفواتير المسجلة</p></div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between"><h3 className="text-base font-bold text-slate-800">تفاصيل أرباح الفواتير</h3><button onClick={handleExportSales} className="text-xs text-emerald-600 font-medium flex items-center gap-1"><FileDown className="w-3 h-3" /> تصدير Excel</button></div>
            <table className="w-full">
              <thead className="bg-slate-50/50 border-b border-slate-200"><tr><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">رقم الفاتورة</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">صافي الربح</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الكاشير</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الأصناف</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">التوقيت</th></tr></thead>
              <tbody>
                {invoiceDetails.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-400 text-sm">لا توجد فواتير في هذه الفترة</td></tr> : invoiceDetails.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50/50 align-top">
                    <td className="p-4 text-sm font-mono text-slate-500">{inv.id.substring(0, 8)}</td>
                    <td className="p-4 text-sm font-bold text-emerald-600">{inv.profitAmount.toFixed(2)} د.ع</td>
                    <td className="p-4 text-sm text-slate-600">{inv.userRole}</td>
                    <td className="p-4 text-xs text-slate-500 space-y-1">{inv.items.map((it: any, i: number) => (<div key={i}>{it.name} (x{it.qty})</div>))}</td>
                    <td className="p-4 text-xs text-slate-400">{new Date(inv.date).toLocaleString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td className="p-4 text-sm font-bold text-slate-800" colSpan={1}>الإجمالي الكلي للأرباح</td>
                  <td className="p-4 text-sm font-extrabold text-emerald-700">{reportData.totalProfits.toFixed(2)} د.ع</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {reportType === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-5">
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-2.5 rounded-lg bg-purple-50"><Warehouse className="w-5 h-5 text-purple-600" /></div></div><p className="text-2xl font-bold text-slate-800 mb-1">{medicines.filter((m:any) => !m.isDeleted).length}</p><p className="text-sm text-slate-500">إجمالي الأصناف</p></div>
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-2.5 rounded-lg bg-amber-50"><AlertTriangle className="w-5 h-5 text-amber-600" /></div></div><p className="text-2xl font-bold text-slate-800 mb-1">{lowStockMeds.length}</p><p className="text-sm text-slate-500">أصناف قاربت على النفاد</p></div>
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm"><div className="flex justify-between items-start mb-4"><div className="p-2.5 rounded-lg bg-red-50"><Calendar className="w-5 h-5 text-red-600" /></div></div><p className="text-2xl font-bold text-slate-800 mb-1">{expiringMeds.length}</p><p className="text-sm text-slate-500">قاربت على الانتهاء (90 يوم)</p></div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between"><h3 className="text-base font-bold text-slate-800">تنبيهات النقص</h3><button onClick={handleExportInventory} className="text-xs text-emerald-600 font-medium flex items-center gap-1"><FileDown className="w-3 h-3" /> تصدير Excel</button></div>
              <table className="w-full"><thead className="bg-slate-50/50 border-b border-slate-200"><tr><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الدواء</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الكمية المتبقية</th></tr></thead><tbody>{lowStockMeds.length === 0 ? <tr><td colSpan={2} className="p-8 text-center text-slate-400 text-sm">لا يوجد نقص</td></tr> : lowStockMeds.map(med => (<tr key={med.id} className="border-b border-slate-100 hover:bg-slate-50/50"><td className="p-4 text-sm font-medium text-slate-800">{med.nameAr}</td><td className="p-4"><span className="px-2 py-1 rounded-md bg-amber-50 text-amber-600 text-xs font-bold">{med.quantity} قطعة</span></td></tr>))}</tbody></table>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between"><h3 className="text-base font-bold text-slate-800">تنبيهات الانتهاء</h3><button onClick={() => window.print()} className="text-xs text-blue-600 font-medium flex items-center gap-1"><FileDown className="w-3 h-3" /> طباعة</button></div>
              <table className="w-full"><thead className="bg-slate-50/50 border-b border-slate-200"><tr><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الدواء</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">تاريخ الانتهاء</th></tr></thead><tbody>{expiringMeds.length === 0 ? <tr><td colSpan={2} className="p-8 text-center text-slate-400 text-sm">لا يوجد أصناف قاربت على الانتهاء</td></tr> : expiringMeds.map(med => (<tr key={med.id} className="border-b border-slate-100 hover:bg-slate-50/50"><td className="p-4 text-sm font-medium text-slate-800">{med.nameAr}</td><td className="p-4"><span className="px-2 py-1 rounded-md bg-red-50 text-red-600 text-xs font-bold">{med.expiryDate}</span></td></tr>))}</tbody></table>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm mt-6">
        <div className="flex items-center gap-3 mb-4"><div className="p-2 rounded-lg bg-amber-50"><Trophy className="w-4 h-4 text-amber-600" /></div><h3 className="text-base font-bold text-slate-800">الأدوية الأكثر مبيعاً (إجمالي)</h3></div>
        <table className="w-full"><thead className="bg-slate-50/50 border-b border-slate-200"><tr><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-3">الدواء</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-3">الكمية المباعة</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-3">الإيراد</th></tr></thead><tbody>{topMeds.length === 0 ? <tr><td colSpan={3} className="p-8 text-center text-slate-400 text-sm">لا توجد بيانات مبيعات بعد</td></tr> : topMeds.map((med, i) => (<tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50"><td className="p-3 text-sm font-medium text-slate-800">{med.name}</td><td className="p-3"><span className="px-2 py-1 rounded-md bg-blue-50 text-blue-600 text-xs font-bold">{med.totalQty}</span></td><td className="p-3 text-sm font-bold text-emerald-600">{med.totalRevenue.toFixed(2)} د.ع</td></tr>))}</tbody></table>
      </div>
    </div>
  );
}