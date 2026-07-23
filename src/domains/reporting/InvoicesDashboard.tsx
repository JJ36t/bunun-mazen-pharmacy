import type { Medicine, Invoice, InvoiceItem, Debt, Supplier } from "../../types";
// ========================================
// Invoices Dashboard (الفواتير الشاملة)
// ========================================
// جميع الفواتير + ترقيم يومي + حذف + طباعة + بحث

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '../security/auth.store';
import { useSettingsStore } from '../settings/settings.store';
import { Receipt, Search, Trash2, Printer, Calendar, Users, Hash, TrendingUp, FileDown, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { exportToPdf } from '../../lib/utils/pdfExport';

export function InvoicesDashboard() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [cashierFilter, setCashierFilter] = useState('all');
  const [users, setUsers] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyStats, setDailyStats] = useState<any>(null);
  const { role, username } = useAuthStore();
  const { pharmacyName } = useSettingsStore();
  const isAdmin = role === 'Super Admin';

  useEffect(() => {
    fetchUsers();
    fetchInvoices();
    fetchDailyStats();
  }, []);

  const fetchUsers = async () => {
    try { setUsers(await invoke<any[]>('get_users_db')); } catch (e) { console.error(e); }
  };

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const data = await invoke<any[]>('get_all_invoices_with_details_db', {
        startDate: startDate + ' 00:00:00',
        endDate: endDate + ' 23:59:59',
        userFilter: cashierFilter,
      });
      setInvoices(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const fetchDailyStats = async () => {
    try { setDailyStats(await invoke<any>('get_daily_receipt_stats_db')); } catch (e) { console.error(e); }
  };

  const handleDelete = async (invoiceId: string) => {
    if (!isAdmin) { toast.error('فقط المدير يمكنه حذف الفواتير'); return; }
    if (window.confirm('هل أنت متأكد من حذف هذه الفاتورة؟ سيتم إرجاع الكميات للمخزون.')) {
      try {
        await invoke('delete_invoice_db', { invoiceId, userRole: username || 'admin' });
        toast.success('تم حذف الفاتورة بنجاح');
        fetchInvoices();
        fetchDailyStats();
      } catch (e: unknown) { toast.error('فشل الحذف: ' + e); }
    }
  };

  const handlePrint = async (invoice: any) => {
    try {
      const printers = await invoke<string[]>('get_available_printers');
      if (printers.length === 0) { toast.error('لا توجد طابعة'); return; }
      await invoke('print_receipt_direct', {
        printerName: printers[0],
        pharmacyName,
        invoiceNum: `#${invoice.dailyReceiptNumber}`,
        itemsJson: JSON.stringify(invoice.items.map((it: any) => ({ nameAr: it.name, quantity: it.qty, price: it.price }))),
        total: invoice.totalAmount.toFixed(2),
      });
      await invoke('mark_invoice_printed_db', { invoiceId: invoice.id, printedBy: username || 'Unknown' });
      toast.success('تمت الطباعة بنجاح');
      fetchInvoices();
    } catch (e: unknown) { toast.error('فشلت الطباعة: ' + e); }
  };

  const handleExportPdf = () => {
    exportToPdf({
      title: 'تقرير الفواتير',
      subtitle: `من ${startDate} إلى ${endDate}`,
      pharmacyName,
      columns: [
        { key: 'dailyReceiptNumber', label: 'رقم الوصل', align: 'center' },
        { key: 'items_text', label: 'الأصناف' },
        { key: 'totalAmount', label: 'المبلغ', align: 'left' },
        { key: 'discountAmount', label: 'الخصم', align: 'left' },
        { key: 'userRole', label: 'الكاشير' },
        { key: 'createdAt', label: 'التوقيت' },
      ],
      rows: filteredInvoices.map(inv => ({
        dailyReceiptNumber: `#${inv.dailyReceiptNumber}`,
        items_text: inv.items.map((it: any) => `${it.name} (${it.qty})`).join('، '),
        totalAmount: `${inv.totalAmount.toFixed(0)} د.ع`,
        discountAmount: inv.discountAmount && inv.discountAmount > 0 ? `${inv.discountAmount.toFixed(0)} د.ع` : '-',
        userRole: inv.userRole,
        createdAt: new Date(inv.createdAt).toLocaleString('en-GB'),
      })),
      summary: [
        { label: 'عدد الفواتير', value: `${filteredInvoices.length}` },
        { label: 'إجمالي المبيعات', value: `${filteredInvoices.reduce((s, i) => s + i.totalAmount, 0).toFixed(0)} د.ع` },
        { label: 'إجمالي الخصومات', value: `${filteredInvoices.reduce((s, i) => s + (i.discountAmount || 0), 0).toFixed(0)} د.ع` },
        { label: 'إجمالي الأرباح', value: `${filteredInvoices.reduce((s, i) => s + i.profitAmount, 0).toFixed(0)} د.ع` },
      ],
    });
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = !search || 
      inv.dailyReceiptNumber?.toString().includes(search) || 
      inv.userRole?.includes(search) ||
      inv.items?.some((it: any) => it.name?.includes(search));
    return matchesSearch;
  });

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">الفواتير الشاملة</h1>
          <p className="section-subtitle">جميع الوصولات مع الترقيم اليومي + حذف + طباعة</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportPdf} className="btn-ghost border border-slate-200"><FileDown className="w-4 h-4" /> تصدير PDF</button>
          <button onClick={() => { fetchInvoices(); fetchDailyStats(); }} disabled={loading} className="btn-ghost border border-slate-200"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث</button>
        </div>
      </div>

      {/* بطاقات إحصائية */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Hash className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">فواتير اليوم</p><p className="text-xl font-bold text-slate-800 tabular">{dailyStats?.todayCount || 0}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><TrendingUp className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">مبيعات اليوم</p><p className="text-xl font-bold text-slate-800 tabular">{dailyStats?.todayTotal?.toFixed(0) || 0} <span className="text-xs text-slate-400">د.ع</span></p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Receipt className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">آخر رقم وصل</p><p className="text-xl font-bold text-slate-800 tabular">#{dailyStats?.lastReceiptNumber || 0}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><Hash className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">الوصل التالي</p><p className="text-xl font-bold text-slate-800 tabular">#{dailyStats?.nextReceiptNumber || 1}</p></div>
        </div>
      </div>

      {/* أدوات التصفية */}
      <div className="card-elegant p-4 mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-600" />
          <span className="text-sm font-semibold text-slate-600">من:</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
          <span className="text-sm font-semibold text-slate-600">إلى:</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-600" />
          <select value={cashierFilter} onChange={e => setCashierFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20">
            <option value="all">جميع الكاشير</option>
            {users.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
          </select>
        </div>
        <button onClick={fetchInvoices} className="btn-primary py-2"><Search className="w-4 h-4" /> بحث</button>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث برقم الوصل أو الكاشير أو الدواء..." className="input pr-10 text-sm" />
        </div>
      </div>

      {/* جدول الفواتير */}
      <div className="card-elegant overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">الفواتير ({filteredInvoices.length})</h3>
        </div>
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full">
            <thead className="bg-slate-50/80 border-b border-slate-200/60 sticky top-0">
              <tr>
                <th className="table-header text-right p-3">رقم الوصل</th>
                <th className="table-header text-right p-3">الأصناف</th>
                <th className="table-header text-right p-3">المبلغ</th>
                <th className="table-header text-right p-3">الخصم</th>
                <th className="table-header text-right p-3">الربح</th>
                <th className="table-header text-right p-3">الكاشير</th>
                <th className="table-header text-right p-3">طبع بواسطة</th>
                <th className="table-header text-right p-3">التوقيت</th>
                <th className="table-header text-right p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr><td colSpan={9}>
                  <div className="empty-state py-12"><div className="empty-state-icon"><Receipt className="w-8 h-8 text-slate-300" /></div><p className="text-slate-400 text-sm">لا توجد فواتير</p></div>
                </td></tr>
              ) : filteredInvoices.map(inv => (
                <tr key={inv.id} className={`table-row ${inv.isReversed ? 'opacity-50' : ''}`}>
                  <td className="p-3">
                    <span className="text-lg font-bold text-brand-700 tabular">#{inv.dailyReceiptNumber}</span>
                    {inv.isReversed && <span className="badge-danger text-[10px] block mt-1">ملغي</span>}
                  </td>
                  <td className="p-3">
                    <div className="space-y-0.5">
                      {inv.items.map((it: unknown, i: number) => (
                        <div key={i} className="text-xs text-slate-600">
                          {it.name} <span className="text-slate-400">×{it.qty}</span> <span className="text-slate-500 tabular">{it.price.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-sm font-bold text-brand-700 tabular">{inv.totalAmount.toFixed(0)} <span className="text-xs text-slate-400">د.ع</span></td>
                  <td className="p-3 text-sm font-semibold text-purple-600 tabular">
                    {inv.discountAmount && inv.discountAmount > 0 ? (
                      <span>{inv.discountAmount.toFixed(0)} <span className="text-xs text-slate-400">د.ع</span></span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="p-3 text-sm font-semibold text-emerald-600 tabular">{inv.profitAmount.toFixed(0)}</td>
                  <td className="p-3 text-sm text-slate-600">{inv.userRole}</td>
                  <td className="p-3 text-xs text-slate-400">
                    {inv.printedBy ? <div><span>{inv.printedBy}</span>{inv.printedAt && <span className="block text-[10px]">{new Date(inv.printedAt).toLocaleTimeString('en-GB')}</span>}</div> : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="p-3 text-xs text-slate-400 tabular">{new Date(inv.createdAt).toLocaleString('en-GB')}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => handlePrint(inv)} className="p-2 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100" title="طباعة"><Printer className="w-3.5 h-3.5" /></button>
                      {isAdmin && !inv.isReversed && (
                        <button onClick={() => handleDelete(inv.id)} className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
