// ========================================
// Stock Count Dashboard (الجرد المتقدم)
// ========================================

import { useState, useEffect } from 'react';
import { stockCountService } from '../../lib/services/pharmiq';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAuthStore } from '../security/auth.store';
import { ClipboardCheck, Check, Package, AlertTriangle, Play, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export function StockCountDashboard() {
  const [countId, setCountId] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { medicines, fetchMedicines } = useInventoryStore();
  const { username } = useAuthStore();

  useEffect(() => { fetchMedicines(); }, []);

  const handleStart = async () => {
    try {
      const id = await stockCountService.create('full', username || 'admin');
      setCountId(id);
      toast.success('بدأ الجرد - تم تحميل جميع الأدوية');
      // تحميل العناصر (سنستخدم medicines مؤقتاً)
      setItems(medicines.filter((m: any) => !m.isDeleted && m.quantity > 0).map((m: any) => ({
        id: m.id, name: m.nameAr, systemQty: m.quantity, countedQty: m.quantity,
      })));
    } catch (e) { toast.error('فشل بدء الجرد: ' + e); }
  };

  const handleCount = async (itemId: string, qty: number) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, countedQty: qty, difference: qty - it.systemQty } : it));
  };

  const handleComplete = async () => {
    if (!countId) return;
    try {
      setLoading(true);
      // تحديث كل عنصر
      for (const item of items) {
        if (item.countedQty !== item.systemQty) {
          await stockCountService.updateItem(item.id, item.countedQty);
        }
      }
      const result = await stockCountService.complete(countId);
      toast.success(`تم إكمال الجرد - تم تعديل ${result.adjusted} صنف`);
      setCountId(null);
      setItems([]);
      fetchMedicines();
    } catch (e) { toast.error('فشل الإكمال: ' + e); }
    setLoading(false);
  };

  const differences = items.filter(i => i.countedQty !== i.systemQty);
  const totalLoss = differences.reduce((sum, i) => sum + Math.max(0, i.systemQty - i.countedQty), 0);
  const totalGain = differences.reduce((sum, i) => sum + Math.max(0, i.countedQty - i.systemQty), 0);

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">الجرد المتقدم</h1>
          <p className="section-subtitle">جرد دوري شامل مع مقارنة الفعلي بالنظري</p>
        </div>
        {countId ? (
          <button onClick={handleComplete} disabled={loading} className="btn-success">
            <CheckCircle className="w-4 h-4" /> إكمال الجرد
          </button>
        ) : (
          <button onClick={handleStart} className="btn-primary">
            <Play className="w-4 h-4" /> بدء جرد جديد
          </button>
        )}
      </div>

      {countId && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="card-elegant p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Package className="w-5 h-5" /></div>
              <div><p className="text-xs text-slate-500">إجمالي الأصناف</p><p className="text-xl font-bold text-slate-800 tabular">{items.length}</p></div>
            </div>
            <div className="card-elegant p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></div>
              <div><p className="text-xs text-slate-500">عجز (خسارة)</p><p className="text-xl font-bold text-rose-600 tabular">{totalLoss}</p></div>
            </div>
            <div className="card-elegant p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Check className="w-5 h-5" /></div>
              <div><p className="text-xs text-slate-500">زيادة</p><p className="text-xl font-bold text-emerald-600 tabular">{totalGain}</p></div>
            </div>
            <div className="card-elegant p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><ClipboardCheck className="w-5 h-5" /></div>
              <div><p className="text-xs text-slate-500">فروقات</p><p className="text-xl font-bold text-slate-800 tabular">{differences.length}</p></div>
            </div>
          </div>

          <div className="card-elegant overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-200/60">
                <tr>
                  <th className="table-header text-right p-4">الدواء</th>
                  <th className="table-header text-right p-4">كمية النظام</th>
                  <th className="table-header text-right p-4">الكمية الفعلية</th>
                  <th className="table-header text-right p-4">الفرق</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const diff = item.countedQty - item.systemQty;
                  return (
                    <tr key={item.id} className="table-row">
                      <td className="p-4 text-sm font-semibold text-slate-800">{item.name}</td>
                      <td className="p-4 text-sm text-slate-600 tabular">{item.systemQty}</td>
                      <td className="p-4">
                        <input
                          type="number"
                          value={item.countedQty}
                          onChange={(e) => handleCount(item.id, parseInt(e.target.value) || 0)}
                          className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg text-sm tabular focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        />
                      </td>
                      <td className="p-4">
                        {diff === 0 ? (
                          <span className="badge-success">مطابق</span>
                        ) : diff > 0 ? (
                          <span className="badge-success tabular">+{diff}</span>
                        ) : (
                          <span className="badge-danger tabular">{diff}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!countId && (
        <div className="card-elegant p-12">
          <div className="empty-state">
            <div className="empty-state-icon"><ClipboardCheck className="w-12 h-12 text-slate-300" /></div>
            <p className="text-slate-500 text-base font-semibold">ابدأ جرداً جديداً</p>
            <p className="text-slate-400 text-sm mt-1">سيتم تحميل جميع الأدوية مع كمياتها للجرد</p>
          </div>
        </div>
      )}
    </div>
  );
}
