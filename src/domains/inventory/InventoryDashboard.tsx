import { useState } from 'react';
import { useInventoryStore, Medicine } from './inventory.store';
import { useAuthStore } from '../security/auth.store';
import { Plus, Pencil, Trash2, X, Package, AlertTriangle, Search, Barcode } from 'lucide-react';
import { toast } from 'sonner';

export function InventoryDashboard() {
  const { medicines, addMedicine, updateMedicine, softDeleteMedicine } = useInventoryStore();
  const { role } = useAuthStore();
  const [showForm, setShowForm] = useState(false); 
  const [editId, setEditId] = useState<string | null>(null); 
  const [search, setSearch] = useState('');
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
    const nextId = medicines.filter((m:any) => !m.isDeleted).length + 1;
    const random = Math.floor(Math.random() * 900) + 100;
    setForm({ ...form, barcode: `600${nextId.toString().padStart(5, '0')}${random}` });
    toast.success('تم توليد باركود جديد.');
  };

  const handleSubmit = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (!form.nameAr || !form.barcode) { toast.error("الاسم والباركود مطلوبان."); return; }
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

  const filteredMeds = medicines.filter((m: any) => !m.isDeleted && (m.nameAr.includes(search) || m.barcode.includes(search) || m.nameEn.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="p-8 overflow-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800">إدارة المخزون</h1><p className="text-sm text-slate-500 mt-1">{filteredMeds.length} صنف نشط</p></div>
        <button onClick={handleAddNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"><Plus className="w-4 h-4" />إضافة دواء جديد</button>
      </div>
      <div className="relative mb-4"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في المخزون..." className="w-full pr-10 pl-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" /></div>
      
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-card border border-slate-200/60 mb-6">
          <div className="flex items-center justify-between mb-4"><h3 className="text-base font-bold text-slate-800">{editId ? 'تعديل بيانات الدواء' : 'إضافة دواء جديد'}</h3><button type="button" onClick={() => setShowForm(false)} className="btn-icon"><X className="w-4 h-4" /></button></div>
          <div className="grid grid-cols-4 gap-4">
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">الاسم بالعربي *</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={form.nameAr} onChange={e => setForm({...form, nameAr: e.target.value})} required /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">الاسم بالإنجليزي</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={form.nameEn} onChange={e => setForm({...form, nameEn: e.target.value})} /></div>
            <div className="col-span-2"><label className="block text-xs font-semibold text-slate-600 mb-1.5">الاسم العلمي (لربط البدائل)</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={form.scientificName} onChange={e => setForm({...form, scientificName: e.target.value})} placeholder="مثال: Paracetamol" /></div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">الباركود *</label>
              <div className="flex gap-2">
                <input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})} required />
                <button type="button" onClick={handleGenerateBarcode} className="bg-slate-100 text-slate-600 px-3 rounded-lg hover:bg-slate-200" title="توليد باركود"><Barcode className="w-4 h-4" /></button>
              </div>
            </div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">رقم الدفعة</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={form.batchNumber} onChange={e => setForm({...form, batchNumber: e.target.value})} /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">سعر البيع (مفرد) *</label><input type="number" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={form.price} onChange={e => setForm({...form, price: parseFloat(e.target.value)})} required /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">سعر الجملة *</label><input type="number" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={form.wholesalePrice} onChange={e => setForm({...form, wholesalePrice: parseFloat(e.target.value)})} required /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">سعر التكلفة *</label><input type="number" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={form.costPrice} onChange={e => setForm({...form, costPrice: parseFloat(e.target.value)})} required /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">الكمية *</label><input type="number" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={form.quantity} onChange={e => setForm({...form, quantity: parseInt(e.target.value)})} required /></div>
            <div className="col-span-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">تاريخ الانتهاء *</label>
              <input type="date" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={form.expiryDate} onChange={handleExpiryChange} required />
            </div>
          </div>
          <div className="flex gap-2 mt-5"><button type="submit" className="btn-success">حفظ</button><button type="button" onClick={() => setShowForm(false)} className="btn-ghost">إلغاء</button></div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-card border border-slate-200/60 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/50 border-b border-slate-200/60">
            <tr>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الدواء</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الباركود</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الكمية</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الانتهاء</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">سعر المفرد</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">سعر الجملة</th>
              <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredMeds.map((med: any) => {
              const isLowStock = med.quantity < 50; 
              const isExpiringSoon = new Date(med.expiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
              const isExpired = new Date(med.expiryDate) < new Date();
              return (
                <tr key={med.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center"><Package className="w-4 h-4 text-slate-400" /></div><div><p className="text-sm font-semibold text-slate-800">{med.nameAr}</p>{med.scientificName && <p className="text-xs text-slate-400">{med.scientificName}</p>}</div></div></td>
                  <td className="p-4 text-sm text-slate-500 font-mono">{med.barcode}</td>
                  <td className="p-4">{isLowStock ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-700 text-xs font-semibold">{med.quantity}</span> : <span className="text-sm font-semibold text-slate-700">{med.quantity}</span>}</td>
                  <td className="p-4">{isExpired ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-xs font-bold"><AlertTriangle className="w-3 h-3" />{med.expiryDate} (منتهي)</span> : isExpiringSoon ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-semibold"><AlertTriangle className="w-3 h-3" />{med.expiryDate}</span> : <span className="text-sm text-slate-500">{med.expiryDate}</span>}</td>
                  <td className="p-4 text-sm font-bold text-blue-600">{med.price.toFixed(2)} د.ع</td>
                  <td className="p-4 text-sm font-bold text-purple-600">{med.wholesalePrice.toFixed(2)} د.ع</td>
                  <td className="p-4"><div className="flex items-center gap-1">
                    <button onClick={() => handleEdit(med)} className="btn-icon"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(med.id, med.nameAr)} className="btn-icon text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}