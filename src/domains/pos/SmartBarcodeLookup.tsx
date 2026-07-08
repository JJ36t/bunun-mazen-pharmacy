// ========================================
// Smart Barcode Lookup Component
// ========================================
// يظهر تلقائياً عند مسح باركود غير معروف في POS
// يبحث في: local DB → OpenFoodFacts → GS1 prefix analysis
// لو لقى نتيجة، يعرض التفاصيل + يطلب السعر والكمية
// لو ما لقى، يفتح نافذة إضافة يدوية

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Search, Loader, Plus, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../security/auth.store';

interface SmartBarcodeLookupProps {
  barcode: string;
  onClose: () => void;
  onMedicineAdded: (medicineId: string) => void;
}

export function SmartBarcodeLookup({ barcode, onClose, onMedicineAdded }: SmartBarcodeLookupProps) {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Lookup on mount — نفّذ البحث عند فتح النافذة أو تغيير الباركود
  useEffect(() => {
    performLookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode]);

  const performLookup = async () => {
    setLoading(true);
    try {
      const data = await invoke<any>('smart_barcode_lookup', { barcode });
      setResults(data);
      // Auto-select first result
      if (data?.results?.length > 0) {
        const firstReal = data.results.find((r: any) => r.source !== 'gs1_prefix_analysis') || data.results[0];
        setSelected(firstReal);
      }
    } catch (e: any) {
      toast.error('فشل البحث: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (manualData?: any) => {
    // manualData يأتي من ManualAddForm (عند عدم العثور على الباركود)
    // selected يأتي من نتائج البحث (عند العثور)
    const data = manualData || selected;
    if (!data) {
      toast.error('اختر دواءً أولاً أو أدخل بيانات يدوياً');
      return;
    }
    const p = parseFloat(price);
    const cp = parseFloat(costPrice);
    const q = parseInt(quantity);
    if (!p || p <= 0) { toast.error('أدخل سعر بيع صحيح'); return; }
    if (!cp || cp <= 0) { toast.error('أدخل سعر شراء صحيح'); return; }
    if (!q || q <= 0) { toast.error('أدخل كمية صحيحة'); return; }

    setSaving(true);
    try {
      const medId = await invoke<string>('add_medicine_from_global_db', {
        barcode,
        name: data.name || data.brandName || 'Unknown',
        activeIngredient: data.activeIngredient || null,
        dosageForm: data.dosageForm || null,
        strength: data.strength || null,
        price: p,
        costPrice: cp,
        quantity: q,
        batchNumber: batchNumber || null,
        expiryDate: expiryDate || null,
        userRole: useAuthStore.getState().username || 'unknown',
      });
      toast.success('تم إضافة الدواء للمخزون وربطه بالباركود');
      onMedicineAdded(medId);
      onClose();
    } catch (e: any) {
      toast.error('فشل الإضافة: ' + e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-[640px] max-h-[90vh] overflow-auto animate-scale-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Search className="w-5 h-5 text-brand-600" />
              بحث ذكي عن الباركود
            </h3>
            <p className="text-xs text-slate-500 mt-1 font-mono">{barcode}</p>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-12 text-center">
              <Loader className="w-10 h-10 text-brand-600 mx-auto animate-spin" />
              <p className="text-sm text-slate-500 mt-3">جاري البحث في القواعد العالمية...</p>
              <p className="text-xs text-slate-400 mt-1">قاعدة محلية + OpenFoodFacts + GS1</p>
            </div>
          ) : results?.found ? (
            <>
              {/* Results found */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <p className="text-sm text-emerald-700">
                  تم العثور على {results.results.length} نتيجة من {Array.from(new Set(results.results.map((r: any) => r.source))).join('، ')}
                </p>
              </div>

              {/* Results list */}
              <div className="space-y-2 mb-4">
                {results.results.map((r: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => setSelected(r)}
                    className={`w-full text-right p-3 rounded-xl border-2 transition-all ${
                      selected === r
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800 text-sm">{r.name || r.brandName || 'بدون اسم'}</p>
                        {r.activeIngredient && (
                          <p className="text-xs text-slate-500 mt-1">المادة الفعالة: {r.activeIngredient}</p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {r.dosageFormAr && <span className="badge-neutral text-xs">{r.dosageFormAr}</span>}
                          {r.strength && <span className="badge-neutral text-xs">{r.strength}</span>}
                          {r.manufacturer && <span className="badge-neutral text-xs">{r.manufacturer}</span>}
                          <span className="badge-warning text-xs">{r.source === 'local_database' ? 'قاعدة محلية' : r.source === 'openfoodfacts' ? 'OpenFoodFacts' : 'GS1'}</span>
                        </div>
                      </div>
                      {r.imageUrl && (
                        <img src={r.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Price + Quantity Form */}
              {selected && (
                <div className="border-t border-slate-100 pt-4 animate-slide-up">
                  <h4 className="text-sm font-bold text-slate-800 mb-3">أكمل بيانات الإضافة للمخزون:</h4>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="label">سعر البيع (د.ع) *</label>
                      <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="input tabular" placeholder="1000" autoFocus />
                    </div>
                    <div>
                      <label className="label">سعر الشراء (د.ع) *</label>
                      <input type="number" value={costPrice} onChange={e => setCostPrice(e.target.value)} className="input tabular" placeholder="700" />
                    </div>
                    <div>
                      <label className="label">الكمية *</label>
                      <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="input tabular" placeholder="10" />
                    </div>
                    <div>
                      <label className="label">رقم الدفعة</label>
                      <input type="text" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} className="input" placeholder="BATCH-001" />
                    </div>
                    <div className="col-span-2">
                      <label className="label">تاريخ الانتهاء</label>
                      <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="input" />
                    </div>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary w-full py-3 disabled:opacity-50"
                  >
                    {saving ? <Loader className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    إضافة للمخزون + متابعة البيع
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Not found */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <p className="text-sm text-amber-700">
                  لم يتم العثور على الباركود في أي مصدر. أضف الدواء يدوياً.
                </p>
              </div>
              <ManualAddForm barcode={barcode} onSave={handleSave} saving={saving}
                price={price} setPrice={setPrice}
                costPrice={costPrice} setCostPrice={setCostPrice}
                quantity={quantity} setQuantity={setQuantity}
                batchNumber={batchNumber} setBatchNumber={setBatchNumber}
                expiryDate={expiryDate} setExpiryDate={setExpiryDate}
              />
            </>
          )}

          {/* Show errors if any */}
          {results?.errors?.length > 0 && (
            <div className="mt-4 text-xs text-slate-400">
              <p>أخطاء البحث: {results.errors.join('; ')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Manual add form (when barcode not found anywhere)
function ManualAddForm({ barcode, onSave, saving, price, setPrice, costPrice, setCostPrice, quantity, setQuantity, batchNumber, setBatchNumber, expiryDate, setExpiryDate }: any) {
  const [name, setName] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [form, setForm] = useState('tablet');

  return (
    <div>
      <h4 className="text-sm font-bold text-slate-800 mb-2">إضافة دواء جديد يدوياً:</h4>
      <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 mb-3">
        <p className="text-xs text-brand-700">
          <strong>الباركود الممسوح:</strong> <span className="font-mono tabular">{barcode}</span>
          <br />
          سيتم ربط هذا الباركود بالدواء تلقائياً — في المرة القادمة سيتعرف عليه النظام فوراً.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <label className="label">اسم الدواء *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className="input" placeholder="مثلاً: بنادول 500mg" autoFocus />
        </div>
        <div className="col-span-2">
          <label className="label">المادة الفعالة</label>
          <input type="text" value={activeIngredient} onChange={e => setActiveIngredient(e.target.value)} className="input" placeholder="Paracetamol" />
        </div>
        <div>
          <label className="label">الشكل الدوائي</label>
          <select value={form} onChange={e => setForm(e.target.value)} className="input">
            <option value="tablet">قرص</option>
            <option value="capsule">كبسولة</option>
            <option value="syrup">شراب</option>
            <option value="injection">حقنة</option>
            <option value="cream">كريم/مرهم</option>
            <option value="drops">قطرة</option>
            <option value="inhaler">بخاخ</option>
            <option value="other">أخرى</option>
          </select>
        </div>
        <div>
          <label className="label">الكمية *</label>
          <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="input tabular" placeholder="10" />
        </div>
        <div>
          <label className="label">سعر البيع (د.ع) *</label>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="input tabular" placeholder="1000" />
        </div>
        <div>
          <label className="label">سعر الشراء (د.ع) *</label>
          <input type="number" value={costPrice} onChange={e => setCostPrice(e.target.value)} className="input tabular" placeholder="700" />
        </div>
        <div>
          <label className="label">رقم الدفعة</label>
          <input type="text" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} className="input" placeholder="BATCH-001" />
        </div>
        <div>
          <label className="label">تاريخ الانتهاء</label>
          <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="input" />
        </div>
      </div>
      <button onClick={() => onSave({ name, activeIngredient, dosageForm: form, source: 'manual' })} disabled={saving || !name} className="btn-primary w-full py-3 disabled:opacity-50">
        {saving ? <Loader className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
        إضافة للمخزون + متابعة البيع
      </button>
    </div>
  );
}
