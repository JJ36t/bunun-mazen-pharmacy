import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../security/auth.store';

export function RefundDashboard() {
  const [refunds, setRefunds] = useState<any[]>([]);
  const { role } = useAuthStore();

  const fetchRefunds = async () => {
    try {
      const data = await invoke<any[]>('get_invoice_details_report', { 
        startDate: '2000-01-01 00:00:00', 
        endDate: '2100-01-01 00:00:00', 
        userFilter: 'all' 
      });
      setRefunds(data.filter(inv => inv.totalAmount < 0 && !inv.isReversed));
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchRefunds(); }, []);

  const handleReverse = async (invoiceId: string) => {
    if (window.confirm("هل أنت متأكد من التراجع عن هذا المرتجع؟ سيتم خصم الأصناف من المخزون مرة أخرى وإضافة المبلغ للصندوق.")) {
      try {
        await invoke('reverse_refund_db', { invoiceId, userRole: role || 'Unknown' });
        toast.success("تم التراجع عن المرتجع بنجاح.");
        fetchRefunds();
      } catch (e: any) {
        toast.error(e.toString());
      }
    }
  };

  return (
    <div className="p-8 overflow-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800">سجل المرتجعات والتراجع</h1><p className="text-sm text-slate-500 mt-1">يمكن للمدير التراجع عن عمليات المرتجع التي تمت بالخطأ</p></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/50 border-b border-slate-200">
            <tr>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">رقم الفاتورة</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">المبلغ المرتجع</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">التوقيت</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {refunds.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-slate-400 text-sm">لا توجد مرتجعات حالية</td></tr>
            ) : refunds.map(ref => (
              <tr key={ref.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="p-4 text-sm font-mono text-slate-500">{ref.id.substring(0, 8)}</td>
                <td className="p-4 text-sm font-bold text-red-600">{ref.totalAmount.toFixed(2)} د.ع</td>
                <td className="p-4 text-xs text-slate-400">{new Date(ref.date).toLocaleString('en-GB')}</td>
                <td className="p-4">
                  <button 
                    onClick={() => handleReverse(ref.id)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 flex items-center gap-1"
                  >
                    <Undo2 className="w-3 h-3" /> تراجع عن المرتجع
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}