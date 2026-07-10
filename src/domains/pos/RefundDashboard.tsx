// ========================================
// Refund Dashboard (المرتجع المتقدم)
// ========================================
// إنشاء مرتجع جديد + عرض المرتجعات السابقة + التراجع

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '../security/auth.store';
import { useInventoryStore } from '../inventory/inventory.store';
import { Undo2, RotateCcw, Receipt, Plus, Search, X, Package } from 'lucide-react';
import { toast } from 'sonner';

export function RefundDashboard() {
  const [refunds, setRefunds] = useState<any[]>([]);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const { role } = useAuthStore();
  const { medicines, fetchMedicines } = useInventoryStore();

  useEffect(() => {
    fetchRefunds();
    fetchMedicines();
  }, []);

  const fetchRefunds = async () => {
    try {
      // استخدام endpoint مخصص للمرتجعات بدل جلب كل الفواتير
      const data = await invoke<any[]>('get_refunds_db', { limit: 100 });
      setRefunds(data);
    } catch (e) { 
      console.error(e); 
      // fallback للطريقة القديمة إذا فشل endpoint الجديد
      try {
        const fallback = await invoke<any[]>('get_invoice_details_report', { 
          startDate: '2000-01-01 00:00:00', 
          endDate: '2100-01-01 00:00:00', 
          userFilter: 'all' 
        });
        setRefunds(fallback.filter(inv => inv.totalAmount < 0 && !inv.isReversed));
      } catch (e2) { console.error('fallback failed:', e2); }
    }
  };

  const handleReverse = async (invoiceId: string) => {
    if (!window.confirm("هل أنت متأكد من التراجع عن هذا المرتجع؟")) return;
    setReversing(invoiceId);
    try {
      await invoke('reverse_refund_db', { invoiceId, userRole: role || 'Unknown' });
      toast.success("تم التراجع عن المرتجع بنجاح.");
      fetchRefunds();
      fetchMedicines();
    } catch (e: any) {
      toast.error(e.toString());
    } finally {
      setReversing(null);
    }
  };

  const totalRefundAmount = refunds.reduce((sum, r) => sum + Math.abs(r.totalAmount), 0);

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">مرتجع المبيعات</h1>
          <p className="section-subtitle">إنشاء مرتجع جديد + عرض المرتجعات السابقة</p>
        </div>
        <button onClick={() => setShowRefundForm(!showRefundForm)} className="btn-primary">
          <Plus className="w-4 h-4" /> مرتجع جديد
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><RotateCcw className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">عدد المرتجعات</p><p className="text-xl font-bold text-slate-800 tabular">{refunds.length}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Receipt className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">إجمالي المرتجع</p><p className="text-xl font-bold text-slate-800 tabular">{totalRefundAmount.toFixed(0)} <span className="text-xs font-normal text-slate-400">د.ع</span></p></div>
        </div>
      </div>

      {showRefundForm && (
        <NewRefundForm 
          medicines={medicines.filter((m: any) => !m.isDeleted)}
          onClose={() => setShowRefundForm(false)}
          onSuccess={() => { setShowRefundForm(false); fetchRefunds(); fetchMedicines(); }}
          userRole={role || 'Unknown'}
        />
      )}

      <div className="card-elegant overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">سجل المرتجعات</h3>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60">
            <tr>
              <th className="table-header text-right p-4">رقم الفاتورة</th>
              <th className="table-header text-right p-4">المبلغ المرتجع</th>
              <th className="table-header text-right p-4">الكاشير</th>
              <th className="table-header text-right p-4">التوقيت</th>
              <th className="table-header text-right p-4">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {refunds.length === 0 ? (
              <tr><td colSpan={5}>
                <div className="empty-state py-12">
                  <div className="empty-state-icon"><RotateCcw className="w-8 h-8 text-slate-300" /></div>
                  <p className="text-slate-400 text-sm">لا توجد مرتجعات حالية</p>
                </div>
              </td></tr>
            ) : refunds.map(ref => (
              <tr key={ref.id} className="table-row">
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center"><Receipt className="w-4 h-4 text-slate-500" /></div>
                    <span className="text-sm font-mono text-slate-600 tabular">{ref.id.substring(0, 8)}</span>
                  </div>
                </td>
                <td className="p-4 text-sm font-bold text-rose-600 tabular">{ref.totalAmount.toFixed(2)} <span className="text-xs font-normal text-slate-400">د.ع</span></td>
                <td className="p-4 text-sm text-slate-600">{ref.userRole || '-'}</td>
                <td className="p-4 text-xs text-slate-400 tabular">{new Date(ref.date).toLocaleString('en-GB')}</td>
                <td className="p-4">
                  <button 
                    onClick={() => handleReverse(ref.id)} 
                    disabled={reversing === ref.id}
                    className="text-xs font-semibold px-3 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {reversing === ref.id ? (
                      <><span className="inline-block w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /> جاري...</>
                    ) : (
                      <><Undo2 className="w-3.5 h-3.5" /> تراجع</>
                    )}
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

// ===== نموذج مرتجع جديد =====
function NewRefundForm({ medicines, onClose, onSuccess, userRole }: { 
  medicines: any[]; 
  onClose: () => void; 
  onSuccess: () => void;
  userRole: string;
}) {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundNotes, setRefundNotes] = useState('');

  const filteredMeds = search.trim() 
    ? medicines.filter(m => m.nameAr?.includes(search) || m.barcode?.includes(search))
    : [];

  const handleAdd = (med: any) => {
    const existing = cart.find(i => i.id === med.id);
    if (existing) {
      setCart(prev => prev.map(i => i.id === med.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, { id: med.id, nameAr: med.nameAr, quantity: 1, price: med.price }]);
    }
  };

  const handleQtyChange = (id: string, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter(i => i.id !== id)); return; }
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  };

  const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  const handleSubmit = async () => {
    if (cart.length === 0) { toast.error('أضف صنفاً واحداً على الأقل'); return; }
    setLoading(true);
    try {
      // محاولة استخدام record_refund_with_reason_db أولاً، إذا فشل استخدم record_refund_db
      try {
        await invoke('record_refund_with_reason_db', {
          totalAmount: total,
          itemsJson: JSON.stringify(cart),
          userRole,
          refundReasonCode: refundReason || 'other',
          refundNotes: refundNotes || 'مرتجع مبيعات',
          approvedBy: null,
        });
      } catch {
        // fallback إلى record_refund_db
        await invoke('record_refund_db', {
          totalAmount: total,
          itemsJson: JSON.stringify(cart),
          userRole,
        });
      }
      toast.success('تم تسجيل المرتجع بنجاح');
      onSuccess();
    } catch (e: any) {
      toast.error('فشل تسجيل المرتجع: ' + e);
    }
    setLoading(false);
  };

  const reasons = [
    { code: 'defective', label: 'منتج معيب' },
    { code: 'expired', label: 'منتهي الصلاحية' },
    { code: 'customer_change', label: 'تغيّر رأي الزبون' },
    { code: 'wrong_item', label: 'صنف خاطئ' },
    { code: 'other', label: 'أخرى' },
  ];

  return (
    <div className="card-elegant p-6 mb-5 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center"><RotateCcw className="w-4.5 h-4.5 text-rose-700" /></div>
          مرتجع مبيعات جديد
        </h3>
        <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* البحث وإضافة الأصناف */}
        <div>
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن دواء لمرتجعه..." className="input pr-10" autoFocus />
          </div>
          <div className="max-h-64 overflow-auto space-y-1">
            {filteredMeds.map(med => (
              <div key={med.id} onClick={() => handleAdd(med)} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-brand-50 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{med.nameAr}</p>
                    <p className="text-xs text-slate-400">{med.price?.toFixed(0)} د.ع • متوفر: {med.quantity}</p>
                  </div>
                </div>
                <Plus className="w-4 h-4 text-brand-600" />
              </div>
            ))}
            {search && filteredMeds.length === 0 && <p className="text-center text-slate-400 text-sm py-4">لا توجد نتائج</p>}
          </div>
        </div>

        {/* سلة المرتجع */}
        <div>
          <p className="text-sm font-bold text-slate-700 mb-2">الأصناف المرتجعة ({cart.length})</p>
          <div className="max-h-48 overflow-auto space-y-2 mb-3">
            {cart.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">لم تتم إضافة أصناف</p>
            ) : cart.map(item => (
              <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-700">{item.nameAr}</p>
                  <p className="text-xs text-slate-400">{item.price?.toFixed(0)} د.ع</p>
                </div>
                <input type="number" min="1" value={item.quantity} onChange={(e) => handleQtyChange(item.id, parseInt(e.target.value) || 0)} className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-sm tabular text-center" />
                <button onClick={() => handleQtyChange(item.id, 0)} className="text-red-500 hover:bg-red-50 p-1 rounded"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>

          <div className="mb-3">
            <label className="label">سبب المرتجع</label>
            <select value={refundReason} onChange={(e) => setRefundReason(e.target.value)} className="input">
              <option value="">اختر السبب</option>
              {reasons.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="label">ملاحظات</label>
            <input type="text" value={refundNotes} onChange={(e) => setRefundNotes(e.target.value)} className="input" placeholder="ملاحظات إضافية" />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 mb-3">
            <span className="text-sm font-semibold text-rose-700">إجمالي المرتجع:</span>
            <span className="text-xl font-bold text-rose-700 tabular">{total.toFixed(2)} <span className="text-xs font-normal">د.ع</span></span>
          </div>

          <button onClick={handleSubmit} disabled={loading || cart.length === 0} className="btn-danger w-full">
            <RotateCcw className="w-4 h-4" /> {loading ? 'جاري المعالجة...' : 'تأكيد المرتجع'}
          </button>
        </div>
      </div>
    </div>
  );
}
