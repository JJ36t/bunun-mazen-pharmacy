import { useState, useEffect } from 'react';
import { useSuppliersStore } from './suppliers.store';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAuthStore } from '../security/auth.store';
import { useAccountingStore } from '../accounting/accounting.store';
import { Truck, Plus, PackagePlus } from 'lucide-react';

export function SuppliersDashboard() {
  const { suppliers, fetchSuppliers, addSupplier, recordPurchase, paySupplier } = useSuppliersStore();
  const { medicines, fetchMedicines } = useInventoryStore();
  const { role } = useAuthStore();
  const { fetchSummary } = useAccountingStore();
  
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [sName, setSName] = useState('');
  const [sPhone, setSPhone] = useState('');
  
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [pSupplier, setPSupplier] = useState('');
  const [pMedicine, setPMedicine] = useState('');
  const [pQty, setPQty] = useState('');
  const [pCost, setPCost] = useState('');
  const [pSell, setPSell] = useState('');
  const [pWholesale, setPWholesale] = useState('');
  
  const [payAmount, setPayAmount] = useState<{ [key: string]: string }>({});

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName) return;
    await addSupplier(sName, sPhone);
    setSName(''); setSPhone(''); setShowSupplierForm(false);
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(pQty); const cost = parseFloat(pCost); const sell = parseFloat(pSell); const wholesale = parseFloat(pWholesale);
    if (!pSupplier || !pMedicine || isNaN(qty) || isNaN(cost) || isNaN(sell) || isNaN(wholesale)) {
      alert("يرجى ملء جميع الحقول بشكل صحيح");
      return;
    }
    await recordPurchase(pSupplier, pMedicine, qty, cost, sell, wholesale, role || 'Unknown');
    await fetchMedicines();
    setPSupplier(''); setPMedicine(''); setPQty(''); setPCost(''); setPSell(''); setPWholesale(''); setShowPurchaseForm(false);
  };

  const handlePay = async (supId: string) => {
    const amt = parseFloat(payAmount[supId] || '0');
    if (isNaN(amt) || amt <= 0) return;
    await paySupplier(supId, amt, role || 'Unknown');
    await fetchSummary();
    setPayAmount({ ...payAmount, [supId]: '' });
  };

  return (
    <div className="p-8 overflow-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800">الموردون والمشتريات</h1><p className="text-sm text-slate-500 mt-1">إدارة الموردين وتسجيل فواتير الشراء</p></div>
        <div className="flex gap-2">
          <button onClick={() => setShowPurchaseForm(!showPurchaseForm)} className="btn-ghost border border-slate-200"><PackagePlus className="w-4 h-4" />تسجيل فاتورة شراء</button>
          <button onClick={() => setShowSupplierForm(!showSupplierForm)} className="btn-primary"><Plus className="w-4 h-4" />مورد جديد</button>
        </div>
      </div>

      {showSupplierForm && (
        <form onSubmit={handleAddSupplier} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-6 grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم المورد *</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={sName} onChange={e => setSName(e.target.value)} required /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">رقم الهاتف</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={sPhone} onChange={e => setSPhone(e.target.value)} /></div>
          <button type="submit" className="btn-success col-span-2">حفظ المورد</button>
        </form>
      )}

      {showPurchaseForm && (
        <form onSubmit={handlePurchase} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-6 grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">المورد *</label><select className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={pSupplier} onChange={e => setPSupplier(e.target.value)} required><option value="">اختر المورد</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">الدواء *</label><select className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={pMedicine} onChange={e => setPMedicine(e.target.value)} required><option value="">اختر الدواء</option>{medicines.filter(m=>!m.isDeleted).map(m => <option key={m.id} value={m.id}>{m.nameAr}</option>)}</select></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">الكمية *</label><input type="number" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={pQty} onChange={e => setPQty(e.target.value)} required /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">سعر التكلفة (للقطعة) *</label><input type="number" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={pCost} onChange={e => setPCost(e.target.value)} required /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">سعر الجملة *</label><input type="number" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={pWholesale} onChange={e => setPWholesale(e.target.value)} required /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">سعر المبيع (مفرد) *</label><input type="number" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={pSell} onChange={e => setPSell(e.target.value)} required /></div>
          <button type="submit" className="btn-primary col-span-2">تسجيل الشراء (تحديث المخزون والأسعار)</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/50 border-b border-slate-200">
            <tr><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">المورد</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الهاتف</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الرصيد المستحق</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">سداد دفعة</th></tr>
          </thead>
          <tbody>
            {suppliers.length === 0 ? <tr><td colSpan={4} className="p-12 text-center text-slate-400 text-sm">لا يوجد موردون مسجلون</td></tr> : suppliers.map(sup => (
              <tr key={sup.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="p-4"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center"><Truck className="w-4 h-4 text-blue-600" /></div><span className="text-sm font-semibold text-slate-800">{sup.name}</span></div></td>
                <td className="p-4 text-sm text-slate-500">{sup.phone || '-'}</td>
                <td className="p-4"><span className={`text-sm font-bold ${sup.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{sup.balance.toFixed(2)} د.ع</span></td>
                <td className="p-4">{sup.balance > 0 && (<div className="flex items-center gap-2"><input type="number" placeholder="مبلغ" value={payAmount[sup.id] || ''} onChange={e => setPayAmount({...payAmount, [sup.id]: e.target.value})} className="w-28 px-2 py-1 border border-slate-200 rounded-md text-sm" /><button onClick={() => handlePay(sup.id)} className="btn-success px-3 py-1 text-xs">سداد</button></div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}