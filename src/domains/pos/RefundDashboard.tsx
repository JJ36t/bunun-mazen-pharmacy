import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Undo2, RotateCcw, Receipt } from 'lucide-react';
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

  const totalRefundAmount = refunds.reduce((sum, r) => sum + Math.abs(r.totalAmount), 0);

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">سجل المرتجعات</h1>
          <p className="section-subtitle">يمكن للمدير التراجع عن عمليات المرتجع التي تمت بالخطأ</p>
        </div>
      </div>

      {/* بطاقة إحصائية */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">عدد المرتجعات</p>
            <p className="text-xl font-bold text-slate-800 tabular">{refunds.length}</p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">إجمالي المبلغ المرتجع</p>
            <p className="text-xl font-bold text-slate-800 tabular">{totalRefundAmount.toFixed(0)} <span className="text-xs font-normal text-slate-400">د.ع</span></p>
          </div>
        </div>
      </div>

      <div className="card-elegant overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60">
            <tr>
              <th className="table-header text-right p-4">رقم الفاتورة</th>
              <th className="table-header text-right p-4">المبلغ المرتجع</th>
              <th className="table-header text-right p-4">التوقيت</th>
              <th className="table-header text-right p-4">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {refunds.length === 0 ? (
              <tr><td colSpan={4}>
                <div className="empty-state py-12">
                  <div className="empty-state-icon">
                    <RotateCcw className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 text-sm">لا توجد مرتجعات حالية</p>
                </div>
              </td></tr>
            ) : refunds.map(ref => (
              <tr key={ref.id} className="table-row">
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                      <Receipt className="w-4 h-4 text-slate-500" />
                    </div>
                    <span className="text-sm font-mono text-slate-600 tabular">{ref.id.substring(0, 8)}</span>
                  </div>
                </td>
                <td className="p-4 text-sm font-bold text-rose-600 tabular">{ref.totalAmount.toFixed(2)} <span className="text-xs font-normal text-slate-400">د.ع</span></td>
                <td className="p-4 text-xs text-slate-400 tabular">{new Date(ref.date).toLocaleString('en-GB')}</td>
                <td className="p-4">
                  <button 
                    onClick={() => handleReverse(ref.id)}
                    className="text-xs font-semibold px-3 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 flex items-center gap-1.5"
                  >
                    <Undo2 className="w-3.5 h-3.5" /> 
                    تراجع عن المرتجع
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
