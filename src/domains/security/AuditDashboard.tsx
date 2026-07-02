import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ScrollText, ShoppingCart, RotateCcw, Trash2, DollarSign, Calendar, History } from 'lucide-react';

export function AuditDashboard() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try { setLogs(await invoke<any[]>('get_audit_logs_db')); } catch (e) { console.error(e); }
    };
    fetchLogs();
  }, []);

  const getIcon = (type: string) => {
    switch(type) {
      case 'SALE_INVOICE': return <ShoppingCart className="w-4 h-4 text-brand-600" />;
      case 'SALES_REFUND': return <RotateCcw className="w-4 h-4 text-red-600" />;
      case 'DELETE_MEDICINE': return <Trash2 className="w-4 h-4 text-red-600" />;
      case 'ADD_EXPENSE': return <DollarSign className="w-4 h-4 text-amber-600" />;
      case 'DAILY_CLOSING': return <Calendar className="w-4 h-4 text-amber-600" />;
      default: return <ScrollText className="w-4 h-4 text-slate-400" />;
    }
  };

  const getIconBg = (type: string) => {
    switch(type) {
      case 'SALE_INVOICE': return 'bg-brand-50';
      case 'SALES_REFUND': return 'bg-red-50';
      case 'DELETE_MEDICINE': return 'bg-red-50';
      case 'ADD_EXPENSE': return 'bg-amber-50';
      case 'DAILY_CLOSING': return 'bg-amber-50';
      default: return 'bg-slate-100';
    }
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">سجل التدقيق</h1>
        <p className="section-subtitle">آخر 50 عملية حساسة في النظام</p>
      </div>

      {/* بطاقة إحصائية */}
      <div className="card-elegant p-4 mb-6 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
          <History className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-slate-500">عدد السجلات</p>
          <p className="text-xl font-bold text-slate-800 tabular">{logs.length}</p>
        </div>
      </div>

      <div className="card-elegant overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60">
            <tr>
              <th className="table-header text-right p-4">العملية</th>
              <th className="table-header text-right p-4">الوصف</th>
              <th className="table-header text-right p-4">المستخدم</th>
              <th className="table-header text-right p-4">التوقيت</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={4}>
                <div className="empty-state py-12">
                  <div className="empty-state-icon">
                    <ScrollText className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 text-sm">لا توجد سجلات بعد</p>
                </div>
              </td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="table-row">
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-xl ${getIconBg(log.actionType)} flex items-center justify-center`}>
                      {getIcon(log.actionType)}
                    </div>
                    <span className="text-xs font-mono text-slate-600 font-semibold">{log.actionType}</span>
                  </div>
                </td>
                <td className="p-4 text-sm text-slate-600">{log.description}</td>
                <td className="p-4"><span className="badge-info">{log.userRole}</span></td>
                <td className="p-4 text-xs text-slate-400 tabular">{log.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
