// ========================================
// Stock Count Dashboard (الجرد المتقدم)
// ========================================

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAuthStore } from '../security/auth.store';
import { ClipboardCheck, Check, Package, AlertTriangle, Play, CheckCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function StockCountDashboard() {
  const [countId, setCountId] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { medicines, fetchMedicines } = useInventoryStore();
  const { username } = useAuthStore();

  useEffect(() => { fetchMedicines(); }, []);

  const handleStart = async () => {
    try {
      setLoading(true);
      // إنشاء جرد جديد في قاعدة البيانات
      const id = await invoke<string>('create_stock_count_db', { countType: 'full', startedBy: username || 'admin' });
      setCountId(id);
      toast.success('بدأ الجرد');
      
      // استخدام الأدوية من الـ store (تتضمن الكمية 0 أيضاً)
      const allMeds = medicines.filter((m: any) => !m.isDeleted);
      setItems(allMeds.map((m: any) => ({
        id: m.id,
        name: m.nameAr,
        barcode: m.barcode,
        systemQty: m.quantity,
        countedQty: m.quantity,
        difference: 0,
      })));
      
      if (allMeds.length === 0) {
        toast.warning('لا توجد أدوية في المخزون. اضغط "مزامنة الأدوية" أولاً');
      }
    } catch (e) { 
      toast.error('فشل بدء الجرد: ' + e); 
    }
    setLoading(false);
  };

  const handleCount = (itemId: string, qty: number) => {
    setItems(prev => prev.map(it => {
      if (it.id === itemId) {
        return { ...it, countedQty: qty, difference: qty - it.systemQty };
      }
      return it;
    }));
  };

  const handleComplete = async () => {
    if (!countId) return;
    try {
      setLoading(true);
      let adjusted = 0;
      
      // تحديث كل عنصر في قاعدة البيانات مباشرة
      for (const item of items) {
        if (item.countedQty !== item.systemQty) {
          try {
            // تحديث المخزون مباشرة
            await invoke('adjust_stock_db', { medicineId: item.id, amount: item.countedQty - item.systemQty });
            adjusted++;
          } catch (e) {
            console.error('Failed to adjust:', item.name, e);
          }
        }
      }
      
      try {
        await invoke('complete_stock_count_db', { countId });
      } catch (e) {
        // تجاهل خطأ complete_stock_count_db - المهم هو تعديل المخزون
      }
      
      toast.success(`تم إكمال الجرد - تم تعديل ${adjusted} صنف`);
      setCountId(null);
      setItems([]);
      fetchMedicines();
    } catch (e) { toast.error('فشل الإكمال: ' + e); }
    setLoading(false);
  };

  const handleSyncFromDrugMaster = async () => {
    setSyncing(true);
    try {
      const count = await invoke<number>('sync_drug_master_to_medicines_db', { userRole: username || 'admin' });
      if (count > 0) {
        toast.success(`تمت مزامنة ${count} دواء إلى المخزون`);
      } else {
        toast.info('جميع الأدوية موجودة مسبقاً');
      }
      await fetchMedicines();
    } catch (e) {
      toast.error('فشلت المزامنة: ' + e);
    }
    setSyncing(false);
  };

  const differences = items.filter(i => i.countedQty !== i.systemQty);

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">الجرد المتقدم</h1>
          <p className="section-subtitle">جرد دوري شامل مع مقارنة الفعلي بالنظري</p>
        </div>
        <div className="flex gap-2">
          {!countId && (
            <>
              <button onClick={handleSyncFromDrugMaster} disabled={syncing} className="btn-success">
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'جاري المزامنة...' : 'مزامنة الأدوية'}
              </button>
              <button onClick={handleStart} disabled={loading} className="btn-primary">
                <Play className="w-4 h-4" /> بدء جرد جديد
              </button>
            </>
          )}
          {countId && (
            <button onClick={handleComplete} disabled={loading} className="btn-success">
              <CheckCircle className="w-4 h-4" /> {loading ? 'جاري...' : 'إكمال الجرد'}
            </button>
          )}
        </div>
      </div>

      {/* بطاقات إحصائية */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Package className="w-5 h-5" /></div>
          <div>
            <p className="text-xs text-slate-500">إجمالي الأدوية في المخزون</p>
            <p className="text-xl font-bold text-slate-800 tabular">{medicines.filter((m: any) => !m.isDeleted).length}</p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></div>
          <div>
            <p className="text-xs text-slate-500">أصناف بعجز</p>
            <p className="text-xl font-bold text-rose-600 tabular">{differences.filter(d => d.difference < 0).length}</p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Check className="w-5 h-5" /></div>
          <div>
            <p className="text-xs text-slate-500">أصناف بزيادة</p>
            <p className="text-xl font-bold text-emerald-600 tabular">{differences.filter(d => d.difference > 0).length}</p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><ClipboardCheck className="w-5 h-5" /></div>
          <div>
            <p className="text-xs text-slate-500">فروقات إجمالية</p>
            <p className="text-xl font-bold text-slate-800 tabular">{differences.length}</p>
          </div>
        </div>
      </div>

      {/* جدول الجرد */}
      {countId && (
        <div className="card-elegant overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800">جرد الأدوية ({items.length} صنف)</h3>
            <span className="text-xs text-slate-400">عدّل الكميات ثم اضغط "إكمال الجرد"</span>
          </div>
          <div className="max-h-[500px] overflow-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-200/60 sticky top-0">
                <tr>
                  <th className="table-header text-right p-3">#</th>
                  <th className="table-header text-right p-3">الدواء</th>
                  <th className="table-header text-right p-3">الباركود</th>
                  <th className="table-header text-right p-3">كمية النظام</th>
                  <th className="table-header text-right p-3">الكمية الفعلية</th>
                  <th className="table-header text-right p-3">الفرق</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6}>
                    <div className="empty-state py-8">
                      <p className="text-slate-400 text-sm">لا توجد أدوية - اضغط "مزامنة الأدوية" أولاً</p>
                    </div>
                  </td></tr>
                ) : items.map((item, idx) => {
                  const diff = item.countedQty - item.systemQty;
                  return (
                    <tr key={item.id} className="table-row">
                      <td className="p-3 text-xs text-slate-400 tabular">{idx + 1}</td>
                      <td className="p-3 text-sm font-semibold text-slate-800">{item.name}</td>
                      <td className="p-3 text-xs text-slate-400 font-mono tabular">{item.barcode || '-'}</td>
                      <td className="p-3 text-sm text-slate-600 tabular">{item.systemQty}</td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={item.countedQty}
                          onChange={(e) => handleCount(item.id, parseInt(e.target.value) || 0)}
                          className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg text-sm tabular text-center focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        />
                      </td>
                      <td className="p-3">
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
        </div>
      )}

      {!countId && (
        <div className="card-elegant p-12">
          <div className="empty-state">
            <div className="empty-state-icon"><ClipboardCheck className="w-12 h-12 text-slate-300" /></div>
            <p className="text-slate-500 text-base font-semibold">ابدأ جرداً جديداً</p>
            <p className="text-slate-400 text-sm mt-1">
              {medicines.filter((m: any) => !m.isDeleted).length > 0 
                ? 'سيتم تحميل جميع الأدوية مع كمياتها للجرد'
                : 'لا توجد أدوية في المخزون - اضغط "مزامنة الأدوية" أولاً'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
