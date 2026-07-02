import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ScrollText, ShoppingCart, RotateCcw, Trash2, DollarSign, Calendar } from 'lucide-react';

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
      case 'DAILY_CLOSING': return <Calendar className="w-4 h-4 text-purple-600" />;
      default: return <ScrollText className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="p-8 overflow-auto h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">سجل التدقيق</h1>
        <p className="text-sm text-slate-500 mt-1">آخر 50 عملية حساسة في النظام</p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/50 border-b border-slate-200/60">
            <tr>
              <th className="table-header text-right p-4">العملية</th>
              <th className="table-header text-right p-4">الوصف</th>
              <th className="table-header text-right p-4">المستخدم</th>
              <th className="table-header text-right p-4">التوقيت</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={4} className="p-12 text-center text-slate-400 text-sm">لا توجد سجلات بعد</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="table-row">
                <td className="p-4"><div className="flex items-center gap-2">{getIcon(log.actionType)}<span className="text-xs font-mono text-slate-500">{log.actionType}</span></div></td>
                <td className="p-4 text-sm text-slate-600">{log.description}</td>
                <td className="p-4"><span className="badge-info">{log.userRole}</span></td>
                <td className="p-4 text-xs text-slate-400">{log.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}