import { useState } from 'react';
import { useInventoryStore, Medicine } from './inventory.store';
import { useAuthStore } from '../security/auth.store';
import { Plus, Pencil, Trash2, X, Package, AlertTriangle, Search, Barcode, TrendingUp, Boxes, Clock, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { generateInternalEan13, isValidEan13 } from '../../lib/utils/search';
import { BulkBarcodeEntry } from './BulkBarcodeEntry';

export function InventoryDashboard() {
  const { medicines, addMedicine, updateMedicine, softDeleteMedicine, fetchMedicines } = useInventoryStore();
  const { role } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showBulkBarcode, setShowBulkBarcode] = useState(false);
  const [form, setForm] = useState<any>({ nameAr: '', nameEn: '', scientificName: '', barcode: '', price: 0, wholesalePrice: 0, costPrice: 0, quantity: 0, batchNumber: '', expiryDate: '' });

  const handleAddNew = () => { 
    setEditId(null); 
    setForm({ nameAr: '', nameEn: '', scientificName: '', barcode: '', price: 0, wholesalePrice: 0, costPrice: 0, quantity: 0, batchNumber: '', expiryDate: '' }); 
    setShowForm(true); 
  };

  const handleEdit = (med: Medicine) => { 
    setEditId(med.id); 
    setForm({ nameAr: med.nameAr, nameEn: med.nameEn, scientificName: med.scientificName || '', barcode: med.barcode, price: med.price, wholesalePrice: med.wholesalePrice, costPrice: med.costPrice, quantity: med.quantity, batchNumber: med.batchNumber, expiryDate: med.expiryDate }); 
    setShowForm(true); 
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm({ ...form, expiryDate: val });
    if (val) {
      const diffDays = Math.ceil((new Date(val).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) toast.error('تحذير: هذا الدواء منتهي الصلاحية بالفعل!');
      else if (diffDays < 90) toast.warning(`تنبيه: الدواء ينتهي بعد ${diffDays} يوماً.`);
    }
  };

  const handleGenerateBarcode = () => {
    // توليد باركود EAN-13 صحيح (13 رقم مع checksum) — نفس صيغة الكاشيرات العالمية
    // بادئة 200 = مخصصة للاستخدام الداخلي وفق GS1
    const existingMax = medicines
      .filter((m: any) => !m.isDeleted && m.barcode && String(m.barcode).startsWith('200') && String(m.barcode).length === 13)
      .reduce((max: number, m: any) => {
        const seq = parseInt(String(m.barcode).substring(3, 12), 10);
        return isNaN(seq) ? max : Math.max(max, seq);
      }, 0);
    const nextSeq = existingMax + 1;
    const barcode = generateInternalEan13(nextSeq);
    setForm({ ...form, barcode });
    toast.success(`تم توليد باركود EAN-13 صحيح: ${barcode}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameAr) { toast.error("الاسم العربي مطلوب."); return; }
    // الباركود لم يعد إلزامياً — يُولّد تلقائياً في الـ backend إذا تُرك فارغاً
    if (form.barcode) {
      // التحقق من صحة EAN-13 إذا أُدخل يدوياً
      const trimmedBarcode = String(form.barcode).trim();
      if (/^\d{13}$/.test(trimmedBarcode) && !isValidEan13(trimmedBarcode)) {
        toast.error(`باركود EAN-13 غير صالح (رقم التحقق خاطئ). اضغط "توليد" لإنشاء باركود صحيح.`);
        return;
      }
    }
    if (editId) { await updateMedicine(editId, form); toast.success("تم تحديث الدواء بنجاح."); }
    else { await addMedicine(form); toast.success("تمت إضافة الدواء بنجاح."); }
    setShowForm(false);
  };
  
  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`هل أنت متأكد من حذف (أرشفة) الدواء: ${name}؟`)) {
      await softDeleteMedicine(id, role || 'Unknown', name);
      toast.success("تمت أرشفة الدواء.");
    }
  };

  const filteredMeds = medicines.filter((m: any) => !m.isDeleted && (
    m.nameAr.includes(search) ||
    (m.barcode && String(m.barcode).includes(search)) ||
    (m.nameEn && m.nameEn.toLowerCase().includes(search.toLowerCase()))
  ));

  // إحصائيات سريعة
  const totalItems = filteredMeds.length;
  const lowStockCount = filteredMeds.filter(m => m.quantity < 50).length;
  const expiringCount = filteredMeds.filter(m => new Date(m.expiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)).length;
  const totalValue = filteredMeds.reduce((sum, m) => sum + (m.price * m.quantity), 0);

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      {/* رأس الصفحة */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">إدارة المخزون</h1>
          <p className="section-subtitle">{filteredMeds.length} صنف نشط في المخزون</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulkBarcode(true)}
            className="btn-ghost border-2 border-brand-500 text-brand-700 hover:bg-brand-50"
            title="اربط الباركودات الأصلية للأدوية الموجودة (مسح USB أو لصق من Excel)"
          >
            <ScanLine className="w-4 h-4" />
            إدخال الباركودات الأصلية
          </button>
          <button onClick={handleAddNew} className="btn-primary">
            <Plus className="w-4 h-4" />
            إضافة دواء جديد
          </button>
        </div>
      </div>

      {/* بطاقات إحصائية */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">إجمالي الأصناف</p>
            <p className="text-xl font-bold text-slate-800 tabular">{totalItems}</p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">مخزون منخفض</p>
            <p className="text-xl font-bold text-slate-800 tabular">{lowStockCount}</p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">قرب الانتهاء</p>
            <p className="text-xl font-bold text-slate-800 tabular">{expiringCount}</p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">قيمة المخزون</p>
            <p className="text-xl font-bold text-slate-800 tabular">{totalValue.toFixed(0)} <span className="text-xs font-normal text-slate-400">د.ع</span></p>
          </div>
        </div>
      </div>
      
      {/* البحث */}
      <div className="relative mb-5">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input 
          type="text" 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          placeholder="ابحث بالاسم العربي أو الإنجليزي أو الباركود..." 
          className="input-lg pr-12 pl-4 shadow-sm" 
        />
      </div>
      
      {/* نموذج الإضافة/التعديل */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card-elegant p-6 mb-6 animate-slide-up">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center">
                <Package className="w-4 h-4 text-brand-700" />
              </div>
              {editId ? 'تعديل بيانات الدواء' : 'إضافة دواء جديد'}
            </h3>
            <button type="button" onClick={() => setShowForm(false)} className="btn-icon"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div><label className="label">الاسم بالعربي *</label><input className="input" value={form.nameAr} onChange={e => setForm({...form, nameAr: e.target.value})} required /></div>
            <div><label className="label">الاسم بالإنجليزي</label><input className="input" value={form.nameEn} onChange={e => setForm({...form, nameEn: e.target.value})} /></div>
            <div className="col-span-2"><label className="label">الاسم العلمي (لربط البدائل)</label><input className="input" value={form.scientificName} onChange={e => setForm({...form, scientificName: e.target.value})} placeholder="مثال: Paracetamol" /></div>
            <div>
              <label className="label">الباركود (EAN-13) — يُولّد تلقائياً إذا تُرك فارغاً</label>
              <div className="flex gap-2">
                <input className="input tabular font-mono" value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})} placeholder="2000000000017" maxLength={13} />
                <button type="button" onClick={handleGenerateBarcode} className="btn-ghost border border-slate-200" title="توليد باركود EAN-13"><Barcode className="w-4 h-4" /></button>
              </div>
            </div>
            <div><label className="label">رقم الدفعة</label><input className="input" value={form.batchNumber} onChange={e => setForm({...form, batchNumber: e.target.value})} /></div>
            <div><label className="label">سعر البيع (مفرد) *</label><input type="number" className="input tabular" value={form.price} onChange={e => setForm({...form, price: parseFloat(e.target.value)})} required /></div>
            <div><label className="label">سعر الجملة *</label><input type="number" className="input tabular" value={form.wholesalePrice} onChange={e => setForm({...form, wholesalePrice: parseFloat(e.target.value)})} required /></div>
            <div><label className="label">سعر التكلفة *</label><input type="number" className="input tabular" value={form.costPrice} onChange={e => setForm({...form, costPrice: parseFloat(e.target.value)})} required /></div>
            <div><label className="label">الكمية *</label><input type="number" className="input tabular" value={form.quantity} onChange={e => setForm({...form, quantity: parseInt(e.target.value)})} required /></div>
            <div className="col-span-4">
              <label className="label">تاريخ الانتهاء *</label>
              <input type="date" className="input" value={form.expiryDate} onChange={handleExpiryChange} required />
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button type="submit" className="btn-success">
              <Plus className="w-4 h-4" />
              حفظ
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">إلغاء</button>
          </div>
        </form>
      )}

      {/* جدول الأدوية */}
      <div className="card-elegant overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60">
            <tr>
              <th className="table-header text-right p-4">الدواء</th>
              <th className="table-header text-right p-4">الباركود</th>
              <th className="table-header text-right p-4">الكمية</th>
              <th className="table-header text-right p-4">الانتهاء</th>
              <th className="table-header text-right p-4">سعر المفرد</th>
              <th className="table-header text-right p-4">سعر الجملة</th>
              <th className="table-header text-right p-4">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredMeds.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state py-12">
                    <div className="empty-state-icon">
                      <Package className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-slate-400 text-sm">لا توجد أدوية مطابقة</p>
                  </div>
                </td>
              </tr>
            ) : filteredMeds.map((med: any) => {
              const isLowStock = med.quantity < 50;
              const isExpiringSoon = med.expiryDate && new Date(med.expiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
              const isExpired = med.expiryDate && new Date(med.expiryDate) < new Date();
              // تلوين الصفوف: أحمر للمنتهي، أمبر للمخزون المنخفض
              const rowClass = isExpired
                ? 'bg-rose-50 border-r-4 border-rose-400'
                : isExpiringSoon
                ? 'bg-amber-50 border-r-4 border-amber-400'
                : isLowStock
                ? 'bg-yellow-50 border-r-4 border-yellow-400'
                : '';
              return (
                <tr key={med.id} className={`table-row ${rowClass}`}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center ring-1 ring-brand-200/50">
                        <Package className="w-4 h-4 text-brand-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{med.nameAr}</p>
                        {med.scientificName && <p className="text-xs text-slate-400">{med.scientificName}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-500 font-mono tabular">{med.barcode}</td>
                  <td className="p-4">
                    {isLowStock ? <span className="badge-danger tabular">{med.quantity} قطعة</span> : <span className="text-sm font-semibold text-slate-700 tabular">{med.quantity}</span>}
                  </td>
                  <td className="p-4">
                    {isExpired ? <span className="badge-danger"><AlertTriangle className="w-3 h-3" />منتهي</span> 
                    : isExpiringSoon ? <span className="badge-warning tabular"><AlertTriangle className="w-3 h-3" />{med.expiryDate}</span> 
                    : <span className="text-sm text-slate-500 tabular">{med.expiryDate}</span>}
                  </td>
                  <td className="p-4 text-sm font-bold text-brand-700 tabular">{med.price.toFixed(2)} <span className="text-xs font-normal text-slate-400">د.ع</span></td>
                  <td className="p-4 text-sm font-bold text-emerald-700 tabular">{med.wholesalePrice.toFixed(2)} <span className="text-xs font-normal text-slate-400">د.ع</span></td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(med)} className="btn-icon" title="تعديل"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(med.id, med.nameAr)} className="btn-icon text-red-500 hover:bg-red-50" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* نافذة إدخال الباركودات الأصلية */}
      {showBulkBarcode && (
        <BulkBarcodeEntry
          onClose={() => setShowBulkBarcode(false)}
          onSaved={() => fetchMedicines()}
        />
      )}
    </div>
  );
}
