import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useInventoryStore } from '../inventory/inventory.store';
import { useSuppliersStore } from './suppliers.store';
import { useAuthStore } from '../security/auth.store';
import { useAccountingStore } from '../accounting/accounting.store';
import { Search, Barcode, Plus, Trash2, Upload, FileDown, ShoppingCart, Package, Check } from 'lucide-react';
import { toast } from 'sonner';

export function QuickPurchaseDashboard() {
  const { suppliers, fetchSuppliers } = useSuppliersStore();
  const { medicines, fetchMedicines } = useInventoryStore();
  const { role } = useAuthStore();
  const { fetchSummary } = useAccountingStore();
  
  const [supplierId, setSupplierId] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [usdRate, setUsdRate] = useState(1310);
  const [currency, setCurrency] = useState<'IQD' | 'USD'>('IQD');
  const [loading, setLoading] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSuppliers();
    fetchMedicines();
    invoke<any>('get_settings_db').then((s: any) => {
      if (s?.usd_exchange_rate) setUsdRate(parseFloat(s.usd_exchange_rate));
    }).catch(() => {});
    barcodeRef.current?.focus();
  }, []);

  const filteredMeds = search.trim() 
    ? medicines.filter((m: any) => !m.isDeleted && (
        m.nameAr?.includes(search) || 
        m.barcode?.includes(search) ||
        m.nameEn?.toLowerCase().includes(search.toLowerCase())
      ))
    : [];

  const handleBarcodeEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      const med = medicines.find((m: any) => m.barcode === barcodeInput.trim() && !m.isDeleted);
      if (med) {
        addToCart(med);
        setBarcodeInput('');
      } else {
        toast.warning('الباركود غير معروف: ' + barcodeInput);
        setSearch(barcodeInput);
        setBarcodeInput('');
      }
    }
  };

  const addToCart = (med: any) => {
    const existing = cart.find(i => i.id === med.id);
    if (existing) {
      setCart(prev => prev.map(i => i.id === med.id ? { ...i, qty: i.qty + 1 } : i));
    } else {
      const cost = med.costPrice || Math.round(med.price * 0.7);
      const sell = med.price || Math.round(cost * 1.4);
      const wholesale = med.wholesalePrice || Math.round(cost * 1.2);
      setCart(prev => [...prev, { id: med.id, name: med.nameAr, barcode: med.barcode, qty: 1, cost, sell, wholesale }]);
    }
    toast.success('تمت إضافة: ' + med.nameAr);
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter(i => i.id !== id)); return; }
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  };

  const updatePrice = (id: string, field: 'cost' | 'sell' | 'wholesale', value: number) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const fields = lines[i].split(',').map(f => f.trim());
        if (fields.length < 4) continue;
        const name = fields[0];
        const barcode = fields[1];
        const qty = parseInt(fields[2]) || 1;
        const cost = parseFloat(fields[3]) || 0;
        const sell = parseFloat(fields[4]) || cost * 1.4;
        const wholesale = parseFloat(fields[5]) || cost * 1.2;
        const med = medicines.find((m: any) => !m.isDeleted && (m.nameAr === name || m.barcode === barcode));
        if (med) {
          const existing = cart.find(i => i.id === med.id);
          if (existing) {
            setCart(prev => prev.map(i => i.id === med.id ? { ...i, qty: i.qty + qty, cost, sell, wholesale } : i));
          } else {
            setCart(prev => [...prev, { id: med.id, name: med.nameAr, barcode: med.barcode, qty, cost, sell, wholesale }]);
          }
          imported++;
        }
      }
      if (imported > 0) toast.success('تم استيراد ' + imported + ' دواء من الملف');
      else toast.warning('لم يتم العثور على أدوية مطابقة');
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const header = 'name,barcode,qty,cost_price,sell_price,wholesale_price\n';
    const sample = 'باراسيتامول,6000000001,50,300,500,400\nبنادول,6000000002,30,400,600,500';
    const blob = new Blob([header + sample], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'purchase_template.csv';
    a.click();
    toast.success('تم تنزيل القالب');
  };

  const handleConfirm = async () => {
    if (!supplierId) { toast.error('اختر المورد'); return; }
    if (cart.length === 0) { toast.error('السلة فارغة'); return; }
    setLoading(true);
    let success = 0;
    let failed = 0;
    for (const item of cart) {
      try {
        let cost = item.cost;
        if (currency === 'USD') cost = cost * usdRate;
        await invoke('record_purchase_db', {
          supplierId, medicineId: item.id, quantity: item.qty,
          costPrice: cost, sellingPrice: item.sell, wholesalePrice: item.wholesale,
          userRole: role || 'Unknown',
        });
        success++;
      } catch (e) { failed++; }
    }
    await fetchMedicines();
    await fetchSummary();
    if (success > 0) toast.success('تم تسجيل ' + success + ' صنف بنجاح');
    if (failed > 0) toast.error('فشل ' + failed + ' صنف');
    setCart([]);
    setLoading(false);
  };

  const totalCost = cart.reduce((s, i) => s + (i.cost * i.qty), 0);
  const totalSell = cart.reduce((s, i) => s + (i.sell * i.qty), 0);
  const totalProfit = totalSell - totalCost;

  const iqdBtnClass = currency === 'IQD' ? 'px-4 py-2.5 rounded-xl text-sm font-bold bg-brand-600 text-white' : 'px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-600';
  const usdBtnClass = currency === 'USD' ? 'px-4 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 text-white' : 'px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-600';

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">الشراء السريع</h1>
        <p className="section-subtitle">مسح باركود + استيراد Excel + إدخال سريع</p>
      </div>

      <div className="card-elegant p-4 mb-5 flex items-center gap-4">
        <div className="flex-1">
          <label className="label">المورد *</label>
          <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="input">
            <option value="">اختر المورد</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">العملة</label>
          <div className="flex gap-2">
            <button onClick={() => setCurrency('IQD')} className={iqdBtnClass}>IQD</button>
            <button onClick={() => setCurrency('USD')} className={usdBtnClass}>USD</button>
          </div>
        </div>
        <div className="text-xs text-slate-400">1 USD = {usdRate} IQD</div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-4">
          <div className="card-elegant p-5">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center"><Barcode className="w-5 h-5" /></div>
              مسح الباركود
            </h3>
            <input ref={barcodeRef} type="text" value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} onKeyDown={handleBarcodeEnter} className="input-lg text-center text-xl font-bold tabular" placeholder="امسح الباركود هنا..." autoFocus />
            <p className="text-xs text-slate-400 mt-2 text-center">وجّه الماسح نحو الباركود أو اكتبه واضغط Enter</p>
          </div>

          <div className="card-elegant p-5">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center"><Search className="w-5 h-5" /></div>
              بحث يدوي
            </h3>
            <div className="relative mb-3">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="input pr-10" placeholder="ابحث بالاسم أو الباركود..." />
            </div>
            <div className="max-h-64 overflow-auto space-y-1">
              {filteredMeds.slice(0, 30).map((med: any) => (
                <div key={med.id} onClick={() => { addToCart(med); setSearch(''); }} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-brand-50 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{med.nameAr}</p>
                      <p className="text-[10px] text-slate-400">{med.barcode} • مخزون: {med.quantity}</p>
                    </div>
                  </div>
                  <Plus className="w-4 h-4 text-brand-600" />
                </div>
              ))}
              {search && filteredMeds.length === 0 && <p className="text-center text-slate-400 text-sm py-4">لا توجد نتائج</p>}
            </div>
          </div>

          <div className="card-elegant p-5">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><Upload className="w-5 h-5" /></div>
              استيراد فاتورة المورد
            </h3>
            <p className="text-xs text-slate-500 mb-3">ارفع ملف CSV من المستودع ليتم استيراد الأدوية تلقائياً</p>
            <div className="flex gap-2">
              <label className="btn-primary flex-1 cursor-pointer">
                <Upload className="w-4 h-4" />
                رفع ملف CSV
                <input type="file" accept=".csv,.txt" onChange={handleImportCSV} className="hidden" />
              </label>
              <button onClick={downloadTemplate} className="btn-ghost border border-slate-200">
                <FileDown className="w-4 h-4" />
                قالب
              </button>
            </div>
            <div className="mt-3 p-3 rounded-xl bg-slate-50 text-xs text-slate-500">
              <p className="font-semibold mb-1">تنسيق الملف:</p>
              <p className="font-mono" dir="ltr">name, barcode, qty, cost_price, sell_price, wholesale_price</p>
            </div>
          </div>
        </div>

        <div className="card-elegant flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-brand-600" />
              سلة الشراء ({cart.length})
            </h3>
            {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-red-500 font-medium">إفراغ</button>}
          </div>

          <div className="flex-1 overflow-auto p-4" style={{ maxHeight: '400px' }}>
            {cart.length === 0 ? (
              <div className="empty-state py-12">
                <div className="empty-state-icon"><ShoppingCart className="w-10 h-10 text-slate-300" /></div>
                <p className="text-slate-400 text-sm">امسح باركود أو ابحث عن دواء</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{item.name}</p>
                        <p className="text-[10px] text-slate-400">{item.barcode}</p>
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:bg-red-50 p-1 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400">الكمية</label>
                        <input type="number" min="1" value={item.qty} onChange={e => updateQty(item.id, parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border border-slate-200 rounded-lg text-sm tabular text-center" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">تكلفة</label>
                        <input type="number" value={item.cost} onChange={e => updatePrice(item.id, 'cost', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border border-slate-200 rounded-lg text-sm tabular text-center" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">مفرد</label>
                        <input type="number" value={item.sell} onChange={e => updatePrice(item.id, 'sell', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border border-slate-200 rounded-lg text-sm tabular text-center" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">جملة</label>
                        <input type="number" value={item.wholesale} onChange={e => updatePrice(item.id, 'wholesale', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border border-slate-200 rounded-lg text-sm tabular text-center" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="p-4 border-t border-slate-200 bg-slate-50/50">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center p-2 rounded-xl bg-amber-50">
                  <p className="text-[10px] text-slate-500">إجمالي التكلفة</p>
                  <p className="text-sm font-bold text-amber-700 tabular">{totalCost.toFixed(0)}</p>
                </div>
                <div className="text-center p-2 rounded-xl bg-emerald-50">
                  <p className="text-[10px] text-slate-500">إجمالي البيع</p>
                  <p className="text-sm font-bold text-emerald-700 tabular">{totalSell.toFixed(0)}</p>
                </div>
                <div className="text-center p-2 rounded-xl bg-brand-50">
                  <p className="text-[10px] text-slate-500">الربح المتوقع</p>
                  <p className="text-sm font-bold text-brand-700 tabular">{totalProfit.toFixed(0)}</p>
                </div>
              </div>
              <button onClick={handleConfirm} disabled={loading || !supplierId} className="btn-primary w-full py-3.5">
                <Check className="w-5 h-5" />
                {loading ? 'جاري التسجيل...' : 'تأكيد الشراء (' + cart.length + ' صنف)'}
              </button>
              {!supplierId && <p className="text-xs text-amber-600 text-center mt-2">اختر المورد أولاً</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
