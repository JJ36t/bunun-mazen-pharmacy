import { useState, useEffect } from 'react';
import { useSuppliersStore } from './suppliers.store';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAuthStore } from '../security/auth.store';
import { useAccountingStore } from '../accounting/accounting.store';
import { Truck, Plus, PackagePlus, Phone, Wallet, RotateCcw, History, DollarSign } from 'lucide-react';
import { supplierReturnsService } from '../../lib/services/pharmiq_complete';
import { toast } from 'sonner';

export function SuppliersDashboard() {
  const { suppliers, fetchSuppliers, addSupplier, recordPurchase, paySupplier } = useSuppliersStore();
  const { medicines, fetchMedicines } = useInventoryStore();
  const { role, username } = useAuthStore();
  const { fetchSummary } = useAccountingStore();
  
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [sName, setSName] = useState('');
  const [showReturns, setShowReturns] = useState(false);
  const [returns, setReturns] = useState<any[]>([]);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnSupplier, setReturnSupplier] = useState('');
  const [returnAmount, setReturnAmount] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [sPhone, setSPhone] = useState('');
  
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [pSupplier, setPSupplier] = useState('');
  const [pMedicine, setPMedicine] = useState('');
  const [pQty, setPQty] = useState('');
  const [pCost, setPCost] = useState('');
  const [pSell, setPSell] = useState('');
  const [pWholesale, setPWholesale] = useState('');
  const [purchaseCurrency, setPurchaseCurrency] = useState<'IQD' | 'USD'>('IQD');
  const [usdRate, setUsdRate] = useState(1310);
  
  const [payAmount, setPayAmount] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    fetchSuppliers();
    invoke<any>('get_settings_db').then((s: any) => {
      if (s?.usd_exchange_rate) setUsdRate(parseFloat(s.usd_exchange_rate));
    }).catch(() => {});
  }, [fetchSuppliers]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName) return;
    await addSupplier(sName, sPhone);
    setSName(''); setSPhone(''); setShowSupplierForm(false);
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(pQty); 
    let cost = parseFloat(pCost); 
    const sell = parseFloat(pSell); 
    const wholesale = parseFloat(pWholesale);
    if (!pSupplier || !pMedicine || isNaN(qty) || isNaN(cost) || isNaN(sell) || isNaN(wholesale)) {
      alert("يرجى ملء جميع الحقول بشكل صحيح");
      return;
    }
    // تحويل USD إلى IQD إذا لزم الأمر
    if (purchaseCurrency === 'USD') {
      cost = cost * usdRate; // تحويل للدينار
    }
    await recordPurchase(pSupplier, pMedicine, qty, cost, sell, wholesale, role || 'Unknown');
    await fetchMedicines();
    setPSupplier(''); setPMedicine(''); setPQty(''); setPCost(''); setPSell(''); setPWholesale(''); 
    setShowPurchaseForm(false);
  };

  const handlePay = async (supId: string) => {
    const amt = parseFloat(payAmount[supId] || '0');
    if (isNaN(amt) || amt <= 0) return;
    await paySupplier(supId, amt, role || 'Unknown');
    await fetchSummary();
    setPayAmount({ ...payAmount, [supId]: '' });
  };

  const totalBalance = suppliers.reduce((sum, s) => sum + s.balance, 0);

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">الموردون والمشتريات</h1>
          <p className="section-subtitle">إدارة الموردين وتسجيل فواتير الشراء</p>
        </div>
        <div className="flex gap-2">
          <button onClick={async () => { setShowReturns(!showReturns); if (!showReturns) { try { setReturns(await supplierReturnsService.get()); } catch (e) { console.error(e); } } }} className="btn-ghost border border-slate-200">
            <History className="w-4 h-4" />
            المرتجعات
          </button>
          <button onClick={() => setShowReturnForm(!showReturnForm)} className="btn-ghost border border-slate-200">
            <RotateCcw className="w-4 h-4" />
            مرتجع مورد
          </button>
          <button onClick={() => setShowPurchaseForm(!showPurchaseForm)} className="btn-outline">
            <PackagePlus className="w-4 h-4" />
            تسجيل فاتورة شراء
          </button>
          <button onClick={() => setShowSupplierForm(!showSupplierForm)} className="btn-primary">
            <Plus className="w-4 h-4" />
            مورد جديد
          </button>
        </div>
      </div>

      {/* نموذج مرتجع مورد */}
      {showReturnForm && (
        <div className="card-elegant p-5 mb-5 animate-slide-up">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-brand-600" /> تسجيل مرتجع مورد
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="label">المورد *</label>
              <select value={returnSupplier} onChange={(e) => setReturnSupplier(e.target.value)} className="input">
                <option value="">اختر المورد</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">المبلغ *</label>
              <input type="number" value={returnAmount} onChange={(e) => setReturnAmount(e.target.value)} className="input tabular" placeholder="0.00" />
            </div>
            <div>
              <label className="label">السبب</label>
              <input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="input" placeholder="سبب المرتجع" />
            </div>
          </div>
          <button onClick={async () => {
            if (!returnSupplier || !returnAmount) { toast.error('أدخل المورد والمبلغ'); return; }
            try {
              await supplierReturnsService.create(returnSupplier, parseFloat(returnAmount), returnReason, username || 'admin');
              toast.success('تم تسجيل المرتجع');
              setShowReturnForm(false);
              setReturnSupplier(''); setReturnAmount(''); setReturnReason('');
              setReturns(await supplierReturnsService.get());
            } catch (e) { toast.error('فشل التسجيل: ' + e); }
          }} className="btn-success">
            <RotateCcw className="w-4 h-4" /> تسجيل
          </button>
        </div>
      )}

      {/* سجل المرتجعات */}
      {showReturns && (
        <div className="card-elegant overflow-hidden mb-5">
          <div className="p-4 border-b border-slate-100"><h3 className="text-base font-bold text-slate-800">سجل مرتجعات الموردين ({returns.length})</h3></div>
          <table className="w-full">
            <thead className="bg-slate-50/80 border-b border-slate-200/60">
              <tr>
                <th className="table-header text-right p-3">المورد</th>
                <th className="table-header text-right p-3">المبلغ</th>
                <th className="table-header text-right p-3">السبب</th>
                <th className="table-header text-right p-3">الحالة</th>
                <th className="table-header text-right p-3">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {returns.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state py-8"><p className="text-slate-400 text-sm">لا توجد مرتجعات</p></div></td></tr>
              ) : returns.map(r => (
                <tr key={r.id} className="table-row">
                  <td className="p-3 text-sm font-semibold text-slate-800">{r.supplierName}</td>
                  <td className="p-3 text-sm font-bold text-rose-600 tabular">{r.totalAmount.toFixed(2)}</td>
                  <td className="p-3 text-sm text-slate-600">{r.reason || '-'}</td>
                  <td className="p-3"><span className={`badge ${r.status === 'completed' ? 'badge-success' : r.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>{r.status}</span></td>
                  <td className="p-3 text-xs text-slate-400 tabular">{new Date(r.createdAt).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* بطاقة إحصائية */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">عدد الموردين</p>
            <p className="text-xl font-bold text-slate-800 tabular">{suppliers.length}</p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">إجمالي المستحقات</p>
            <p className="text-xl font-bold text-slate-800 tabular">{totalBalance.toFixed(0)} <span className="text-xs font-normal text-slate-400">د.ع</span></p>
          </div>
        </div>
      </div>

      {showSupplierForm && (
        <form onSubmit={handleAddSupplier} className="card-elegant p-6 mb-6 animate-slide-up">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
              <Truck className="w-4.5 h-4.5 text-brand-700" />
            </div>
            إضافة مورد جديد
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">اسم المورد *</label><input className="input" value={sName} onChange={e => setSName(e.target.value)} required /></div>
            <div><label className="label">رقم الهاتف</label><input className="input" value={sPhone} onChange={e => setSPhone(e.target.value)} /></div>
          </div>
          <div className="flex gap-2 mt-5">
            <button type="submit" className="btn-success">حفظ المورد</button>
            <button type="button" onClick={() => setShowSupplierForm(false)} className="btn-ghost">إلغاء</button>
          </div>
        </form>
      )}

      {showPurchaseForm && (
        <form onSubmit={handlePurchase} className="card-elegant p-6 mb-6 animate-slide-up">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <PackagePlus className="w-4.5 h-4.5 text-emerald-700" />
            </div>
            تسجيل فاتورة شراء
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">المورد *</label>
              <select className="input" value={pSupplier} onChange={e => setPSupplier(e.target.value)} required>
                <option value="">اختر المورد</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">الدواء *</label>
              <select className="input" value={pMedicine} onChange={e => setPMedicine(e.target.value)} required>
                <option value="">اختر الدواء</option>
                {medicines.filter(m=>!m.isDeleted).map(m => <option key={m.id} value={m.id}>{m.nameAr}</option>)}
              </select>
            </div>
            <div><label className="label">الكمية *</label><input type="number" className="input tabular" value={pQty} onChange={e => setPQty(e.target.value)} required /></div>
            <div>
              <label className="label">عملة الشراء *</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPurchaseCurrency('IQD')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${purchaseCurrency === 'IQD' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  دينار (IQD)
                </button>
                <button type="button" onClick={() => setPurchaseCurrency('USD')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${purchaseCurrency === 'USD' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  دولار (USD)
                </button>
              </div>
            </div>
            <div>
              <label className="label">سعر التكلفة ({purchaseCurrency}) {purchaseCurrency === 'USD' && <span className="text-emerald-600">× {usdRate} = {(parseFloat(pCost || '0') * usdRate).toFixed(0)} د.ع</span>}</label>
              <input type="number" className="input tabular" value={pCost} onChange={e => setPCost(e.target.value)} required />
            </div>
            <div>
              <label className="label">سعر الجملة (د.ع) *</label>
              <input type="number" className="input tabular" value={pWholesale} onChange={e => setPWholesale(e.target.value)} required />
            </div>
            <div>
              <label className="label">سعر المبيع مفرد (د.ع) *</label>
              <input type="number" className="input tabular" value={pSell} onChange={e => setPSell(e.target.value)} required />
            </div>
          </div>
          {purchaseCurrency === 'USD' && (
            <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-emerald-700">سيتم تحويل سعر التكلفة من USD إلى IQD تلقائياً عند الحفظ (1 USD = {usdRate} IQD)</span>
            </div>
          )}
          <div className="flex gap-2 mt-5">
            <button type="submit" className="btn-primary">
              <PackagePlus className="w-4 h-4" />
              تسجيل الشراء
            </button>
            <button type="button" onClick={() => setShowPurchaseForm(false)} className="btn-ghost">إلغاء</button>
          </div>
        </form>
      )}

      <div className="card-elegant overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60">
            <tr>
              <th className="table-header text-right p-4">المورد</th>
              <th className="table-header text-right p-4">الهاتف</th>
              <th className="table-header text-right p-4">الرصيد المستحق</th>
              <th className="table-header text-right p-4">سداد دفعة</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 ? (
              <tr><td colSpan={4}>
                <div className="empty-state py-12">
                  <div className="empty-state-icon">
                    <Truck className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 text-sm">لا يوجد موردون مسجلون</p>
                </div>
              </td></tr>
            ) : suppliers.map(sup => (
              <tr key={sup.id} className="table-row">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center ring-1 ring-brand-200/50">
                      <Truck className="w-4 h-4 text-brand-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{sup.name}</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-1.5 text-sm text-slate-500">
                    {sup.phone ? (
                      <>
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="tabular">{sup.phone}</span>
                      </>
                    ) : '-'}
                  </div>
                </td>
                <td className="p-4">
                  <span className={`text-sm font-bold tabular ${sup.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {sup.balance.toFixed(2)} <span className="text-xs font-normal text-slate-400">د.ع</span>
                  </span>
                </td>
                <td className="p-4">
                  {sup.balance > 0 && (
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        placeholder="مبلغ" 
                        value={payAmount[sup.id] || ''} 
                        onChange={e => setPayAmount({...payAmount, [sup.id]: e.target.value})} 
                        className="w-28 px-3 py-1.5 border border-slate-200 rounded-lg text-sm tabular focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" 
                      />
                      <button onClick={() => handlePay(sup.id)} className="btn-success px-3 py-1.5 text-xs">سداد</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
