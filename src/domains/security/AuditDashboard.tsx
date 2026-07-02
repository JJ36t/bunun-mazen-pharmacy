import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ScrollText, ShoppingCart, RotateCcw, Trash2, DollarSign, Calendar, History, Search, FileDown, RefreshCw, Filter, Package, UserPlus, Settings, Database, Shield, AlertTriangle } from 'lucide-react';
import { exportToPdf } from '../../lib/utils/pdfExport';

export function AuditDashboard() {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try { setLogs(await invoke<any[]>('get_audit_logs_db')); } catch (e) { console.error(e); }
    setLoading(false);
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'SALE_INVOICE': return <ShoppingCart className="w-4 h-4 text-brand-600" />;
      case 'SALES_REFUND': return <RotateCcw className="w-4 h-4 text-red-600" />;
      case 'DELETE_MEDICINE': return <Trash2 className="w-4 h-4 text-red-600" />;
      case 'ADD_EXPENSE': return <DollarSign className="w-4 h-4 text-amber-600" />;
      case 'DAILY_CLOSING': return <Calendar className="w-4 h-4 text-amber-600" />;
      case 'PURCHASE_INVOICE': return <Package className="w-4 h-4 text-emerald-600" />;
      case 'ADD_DEBT': return <DollarSign className="w-4 h-4 text-rose-600" />;
      case 'SUPPLIER_PAYMENT': return <DollarSign className="w-4 h-4 text-brand-600" />;
      case 'BULK_PRICE_UPDATE': return <Settings className="w-4 h-4 text-amber-600" />;
      case 'DELETE_USER': return <Trash2 className="w-4 h-4 text-red-600" />;
      case 'QUARANTINE_STOCK': return <Shield className="w-4 h-4 text-amber-600" />;
      case 'IMPORT_MEDICINES': return <Database className="w-4 h-4 text-brand-600" />;
      case 'EXPIRY_LOSS': return <AlertTriangle className="w-4 h-4 text-rose-600" />;
      default: return <ScrollText className="w-4 h-4 text-slate-400" />;
    }
  };

  const getIconBg = (type: string) => {
    switch(type) {
      case 'SALE_INVOICE': return 'bg-brand-50';
      case 'SALES_REFUND': case 'DELETE_MEDICINE': case 'DELETE_USER': case 'EXPIRY_LOSS': return 'bg-red-50';
      case 'ADD_EXPENSE': case 'DAILY_CLOSING': case 'BULK_PRICE_UPDATE': case 'QUARANTINE_STOCK': return 'bg-amber-50';
      case 'PURCHASE_INVOICE': return 'bg-emerald-50';
      default: return 'bg-slate-100';
    }
  };

  const actionTypes = ['all', 'SALE_INVOICE', 'SALES_REFUND', 'DELETE_MEDICINE', 'ADD_EXPENSE', 'DAILY_CLOSING', 'PURCHASE_INVOICE', 'BULK_PRICE_UPDATE', 'QUARANTINE_STOCK'];
  const actionLabels: any = {
    all: 'الكل', SALE_INVOICE: 'بيع', SALES_REFUND: 'مرتجع', DELETE_MEDICINE: 'حذف دواء',
    ADD_EXPENSE: 'مصروف', DAILY_CLOSING: 'إغلاق يومي', PURCHASE_INVOICE: 'شراء',
    BULK_PRICE_UPDATE: 'تحديث أسعار', QUARANTINE_STOCK: 'عزل مخزون',
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = !search || log.description?.includes(search) || log.actionType?.includes(search) || log.userRole?.includes(search);
    const matchesFilter = filterType === 'all' || log.actionType === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleExport = () => {
    exportToPdf({
      title: 'سجل التدقيق',
      subtitle: `${filteredLogs.length} سجل`,
      columns: [
        { key: 'actionType', label: 'العملية' },
        { key: 'description', label: 'الوصف' },
        { key: 'userRole', label: 'المستخدم' },
        { key: 'date', label: 'التوقيت' },
      ],
      rows: filteredLogs.map(l => ({
        actionType: l.actionType,
        description: l.description,
        userRole: l.userRole,
        date: new Date(l.date).toLocaleString('en-GB'),
      })),
    });
  };

  // إحصائيات حسب النوع
  const stats = actionTypes.slice(1).map(type => ({
    type,
    label: actionLabels[type],
    count: logs.filter(l => l.actionType === type).length,
  }));

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">سجل التدقيق</h1>
          <p className="section-subtitle">سجل دائم لجميع العمليات الحساسة في النظام</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-ghost border border-slate-200">
            <FileDown className="w-4 h-4" /> تصدير PDF
          </button>
          <button onClick={fetchLogs} disabled={loading} className="btn-ghost border border-slate-200">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </div>
      </div>

      {/* إحصائيات حسب النوع */}
      <div className="grid grid-cols-8 gap-3 mb-6">
        {stats.map(s => (
          <div key={s.type} onClick={() => setFilterType(s.type)} className={`card-elegant p-3 cursor-pointer text-center transition-all ${filterType === s.type ? 'ring-2 ring-brand-500' : ''}`}>
            <p className="text-2xl font-bold text-slate-800 tabular">{s.count}</p>
            <p className="text-[10px] text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* بحث + فلترة */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث في السجلات..." className="input-lg pr-12 pl-4 shadow-sm" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input w-48">
          {actionTypes.map(t => <option key={t} value={t}>{actionLabels[t]}</option>)}
        </select>
      </div>

      {/* جدول السجلات */}
      <div className="card-elegant overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">السجلات ({filteredLogs.length})</h3>
          <span className="text-xs text-slate-400">آخر 100 سجل</span>
        </div>
        <div className="max-h-[500px] overflow-auto">
          <table className="w-full">
            <thead className="bg-slate-50/80 border-b border-slate-200/60 sticky top-0">
              <tr>
                <th className="table-header text-right p-3">العملية</th>
                <th className="table-header text-right p-3">الوصف</th>
                <th className="table-header text-right p-3">المستخدم</th>
                <th className="table-header text-right p-3">التوقيت</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr><td colSpan={4}>
                  <div className="empty-state py-12">
                    <div className="empty-state-icon"><ScrollText className="w-8 h-8 text-slate-300" /></div>
                    <p className="text-slate-400 text-sm">لا توجد سجلات مطابقة</p>
                  </div>
                </td></tr>
              ) : filteredLogs.map(log => (
                <tr key={log.id} className="table-row">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 rounded-xl ${getIconBg(log.actionType)} flex items-center justify-center`}>
                        {getIcon(log.actionType)}
                      </div>
                      <span className="text-xs font-mono text-slate-600 font-semibold">{log.actionType}</span>
                    </div>
                  </td>
                  <td className="p-3 text-sm text-slate-600">{log.description}</td>
                  <td className="p-3"><span className="badge-info">{log.userRole}</span></td>
                  <td className="p-3 text-xs text-slate-400 tabular">{new Date(log.date).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
