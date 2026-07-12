// ========================================
// Cash Drawer Dashboard (موازنة درج النقدية)
// ========================================

import { useState, useEffect } from 'react';
import { cashDrawerService } from '../../lib/services/pharmiq_complete';
import { useAuthStore } from '../security/auth.store';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Scale, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export function CashDrawerDashboard() {
  const [events, setEvents] = useState<any[]>([]);
  const [balanceResult, setBalanceResult] = useState<any | null>(null);
  const [countedAmount, setCountedAmount] = useState('');
  const [notes, setNotes] = useState('');
  const { shiftId, username } = useAuthStore();

  useEffect(() => {
    if (shiftId) loadEvents();
  }, [shiftId]);

  const loadEvents = async () => {
    if (!shiftId) return;
    try { setEvents(await cashDrawerService.getEvents(shiftId)); } catch (e) { console.error(e); }
  };

  const handleBalance = async () => {
    if (!shiftId) { toast.error('لا يوجد شفت مفتوح'); return; }
    const amount = parseFloat(countedAmount);
    if (isNaN(amount)) { toast.error('أدخل مبلغاً صحيحاً'); return; }
    try {
      const result = await cashDrawerService.balance(shiftId, amount, notes, username || 'admin');
      setBalanceResult(result);
      if (result.differenceType === 'balanced') {
        toast.success('الصندوق متوازن ✅');
      } else if (result.differenceType === 'shortage') {
        toast.error(`عجز في الصندوق: ${Math.abs(result.difference).toFixed(2)} د.ع`);
      } else {
        toast.warning(`زيادة في الصندوق: ${result.difference.toFixed(2)} د.ع`);
      }
    } catch (e) { toast.error('فشل الموازنة: ' + e); }
  };

  const systemAmount = events.length > 0 ? events[events.length - 1].balanceAfter : 0;
  const eventIcons: Record<string, typeof ArrowUpCircle> = { sale: ArrowUpCircle, refund: ArrowDownCircle, expense: ArrowDownCircle, cash_in: ArrowUpCircle, cash_out: ArrowDownCircle };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">موازنة الصندوق</h1>
        <p className="section-subtitle">تتبع ومعادلة درج النقدية في الشفت</p>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-6">
        <div className="card-elegant p-5">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Scale className="w-5 h-5 text-brand-600" /> موازنة الصندوق
          </h3>
          <div className="p-4 rounded-xl bg-brand-50 mb-4">
            <p className="text-xs text-slate-500">رصيد النظام (المتوقع)</p>
            <p className="text-2xl font-bold text-brand-700 tabular">{systemAmount.toFixed(2)} <span className="text-sm font-normal text-slate-400">د.ع</span></p>
          </div>
          <div className="mb-3">
            <label className="label">المبلغ المعدود فعلاً</label>
            <input type="number" value={countedAmount} onChange={(e) => setCountedAmount(e.target.value)} className="input-lg text-center text-xl font-bold tabular" placeholder="0.00" />
          </div>
          <div className="mb-4">
            <label className="label">ملاحظات</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-[60px]" placeholder="ملاحظات الموازنة..." />
          </div>
          <button onClick={handleBalance} disabled={!shiftId} className="btn-primary w-full">
            <Scale className="w-4 h-4" /> موازنة الصندوق
          </button>
          {!shiftId && <p className="text-xs text-amber-600 mt-2 text-center">يجب فتح شفت أولاً</p>}
        </div>

        <div className="card-elegant p-5">
          <h3 className="text-base font-bold text-slate-800 mb-4">نتيجة الموازنة</h3>
          {balanceResult ? (
            <div className={`p-4 rounded-xl border-2 ${balanceResult.differenceType === 'balanced' ? 'bg-emerald-50 border-emerald-200' : balanceResult.differenceType === 'shortage' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="text-center mb-3">
                {balanceResult.differenceType === 'balanced' ? <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto" /> : <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto" />}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">المتوقع:</span><span className="font-semibold tabular">{balanceResult.systemAmount.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">المعدود:</span><span className="font-semibold tabular">{balanceResult.countedAmount.toFixed(2)}</span></div>
                <div className="flex justify-between border-t pt-2"><span className="font-bold">الفرق:</span><span className={`font-bold tabular ${balanceResult.differenceType === 'balanced' ? 'text-emerald-600' : balanceResult.differenceType === 'shortage' ? 'text-rose-600' : 'text-amber-600'}`}>{balanceResult.difference.toFixed(2)}</span></div>
                <div className="text-center mt-2"><span className={`badge ${balanceResult.differenceType === 'balanced' ? 'badge-success' : balanceResult.differenceType === 'shortage' ? 'badge-danger' : 'badge-warning'}`}>{balanceResult.differenceType === 'balanced' ? 'متوازن' : balanceResult.differenceType === 'shortage' ? 'عجز' : 'زيادة'}</span></div>
              </div>
            </div>
          ) : (
            <div className="empty-state py-12"><div className="empty-state-icon"><Wallet className="w-8 h-8 text-slate-300" /></div><p className="text-slate-400 text-sm">لم تتم الموازنة بعد</p></div>
          )}
        </div>
      </div>

      {/* سجل الأحداث */}
      <div className="card-elegant overflow-hidden">
        <div className="p-5 border-b border-slate-100"><h3 className="text-base font-bold text-slate-800">سجل حركات الصندوق</h3></div>
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60">
            <tr>
              <th className="table-header text-right p-4">النوع</th>
              <th className="table-header text-right p-4">المبلغ</th>
              <th className="table-header text-right p-4">الرصيد بعد</th>
              <th className="table-header text-right p-4">الوصف</th>
              <th className="table-header text-right p-4">المستخدم</th>
              <th className="table-header text-right p-4">التوقيت</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr><td colSpan={6}><div className="empty-state py-8"><p className="text-slate-400 text-sm">لا توجد حركات</p></div></td></tr>
            ) : events.slice().reverse().map(ev => {
              const Icon = eventIcons[ev.eventType] || Wallet;
              const isPositive = ev.eventType === 'sale' || ev.eventType === 'cash_in';
              return (
                <tr key={ev.id} className="table-row">
                  <td className="p-4"><div className="flex items-center gap-2"><Icon className={`w-4 h-4 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`} /><span className="text-sm text-slate-700">{ev.eventType}</span></div></td>
                  <td className="p-4"><span className={`text-sm font-semibold tabular ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>{isPositive ? '+' : '-'}{ev.amount.toFixed(2)}</span></td>
                  <td className="p-4 text-sm text-slate-600 tabular">{ev.balanceAfter?.toFixed(2) || '-'}</td>
                  <td className="p-4 text-sm text-slate-500">{ev.description || '-'}</td>
                  <td className="p-4 text-sm text-slate-500">{ev.userRole}</td>
                  <td className="p-4 text-xs text-slate-400 tabular">{new Date(ev.createdAt).toLocaleString('en-GB')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
