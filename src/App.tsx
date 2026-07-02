import { useEffect, useState } from 'react';
import { useAuthStore } from './domains/security/auth.store';
import { Login } from './domains/security/Login';
import { usePosStore } from './domains/pos/pos.store';
import { useInventoryStore } from './domains/inventory/inventory.store';
import { useAccountingStore } from './domains/accounting/accounting.store';
import { useSettingsStore } from './domains/settings/settings.store';
import { useDebtsStore } from './domains/accounting/debts.store';
import { useSuppliersStore } from './domains/suppliers/suppliers.store';
import { InventoryDashboard } from './domains/inventory/InventoryDashboard';
import { AccountingDashboard } from './domains/accounting/AccountingDashboard';
import { DebtsDashboard } from './domains/accounting/DebtsDashboard';
import { SuppliersDashboard } from './domains/suppliers/SuppliersDashboard';
import { ReportingDashboard } from './domains/reporting/ReportingDashboard';
import { BackupDashboard } from './domains/settings/BackupDashboard';
import { SettingsDashboard } from './domains/settings/SettingsDashboard';
import { UserManagementDashboard } from './domains/settings/UserManagementDashboard';
import { AuditDashboard } from './domains/security/AuditDashboard';
import { RefundDashboard } from './domains/pos/RefundDashboard';
import { PatientsDashboard } from './domains/patients/PatientsDashboard';
import { Receipt } from './domains/pos/Receipt';
import { MainDashboard } from './MainDashboard';
import { searchMedicines } from './lib/utils/search';
import { invoke } from '@tauri-apps/api/core';
import { Toaster, toast } from 'sonner';
import { parseISO, startOfDay, isBefore, isAfter, addDays } from 'date-fns';
import { 
  Search, LogOut, Calculator, LayoutDashboard, ShoppingCart, RotateCcw, 
  Package, Calculator as CalcIcon, Users, FileBarChart, ScrollText, Database, Settings, Truck, UserCog,
  Pause, Play, Trash2, X
} from 'lucide-react';

type TabKey = 'dashboard' | 'pos' | 'refund' | 'inventory' | 'accounting' | 'debts' | 'suppliers' | 'patients' | 'reporting' | 'audit' | 'backup' | 'settings' | 'users';

const navItems = [
  { key: 'dashboard' as TabKey, label: 'الرئيسية', icon: LayoutDashboard },
  { key: 'pos' as TabKey, label: 'نقاط البيع', icon: ShoppingCart },
  { key: 'refund' as TabKey, label: 'مرتجع المبيعات', icon: RotateCcw },
  { key: 'inventory' as TabKey, label: 'المخزون', icon: Package },
  { key: 'accounting' as TabKey, label: 'المحاسبة', icon: CalcIcon, adminOnly: true },
  { key: 'debts' as TabKey, label: 'الديون', icon: Users, adminOnly: true },
  { key: 'suppliers' as TabKey, label: 'الموردون', icon: Truck, adminOnly: true },
  { key: 'patients' as TabKey, label: 'المرضى', icon: UserCog, adminOnly: true },
  { key: 'reporting' as TabKey, label: 'التقارير', icon: FileBarChart, adminOnly: true },
  { key: 'audit' as TabKey, label: 'سجل التدقيق', icon: ScrollText, adminOnly: true },
  { key: 'backup' as TabKey, label: 'النسخ الاحتياطي', icon: Database, adminOnly: true },
  { key: 'users' as TabKey, label: 'المستخدمون', icon: UserCog, adminOnly: true },
  { key: 'settings' as TabKey, label: 'الإعدادات', icon: Settings, adminOnly: true },
];

function TouchKeypad({ onConfirm, onClose }: { onConfirm: (val: string) => void; onClose: () => void }) {
  const [val, setVal] = useState('');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'C', '✓'];
  const handlePress = (k: string) => {
    if (k === 'C') setVal('');
    else if (k === '✓') { onConfirm(val); onClose(); }
    else setVal(prev => prev + k);
  };
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white p-6 rounded-2xl shadow-2xl w-80" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4"><h3 className="text-base font-bold text-slate-800">إدخال الكمية</h3><button onClick={onClose} className="text-slate-400"><X className="w-4 h-4" /></button></div>
        <input type="text" value={val} readOnly className="w-full text-2xl font-bold text-center bg-slate-100 rounded-lg py-3 mb-4" placeholder="0" />
        <div className="grid grid-cols-3 gap-2">
          {keys.map(k => <button key={k} onClick={() => handlePress(k)} className={`py-4 rounded-xl text-xl font-bold ${k === '✓' ? 'bg-emerald-600 text-white' : k === 'C' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'}`}>{k}</button>)}
        </div>
      </div>
    </div>
  );
}

function PosDashboard() {
  const { cart, addToCart, removeFromCart, updateItemQuantity, calculateSubtotal, calculateTotal, clearCart, discountPercentage, setDiscountPercentage } = usePosStore();
  const { medicines, fetchMedicines } = useInventoryStore();
  const { fetchSummary } = useAccountingStore();
  const { username } = useAuthStore();
  const { pharmacyName, maxDiscount } = useSettingsStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [invoiceData, setInvoiceData] = useState<{ items: any[], total: number, invoiceNumber: string } | null>(null);
  const [suspendedInvs, setSuspendedInvs] = useState<any[]>([]);
  const [showSuspended, setShowSuspended] = useState(false);
  const [keypadTarget, setKeypadTarget] = useState<string | null>(null);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => { setSearchTerm(e.target.value); };
  
  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const results = searchMedicines(searchTerm, medicines.filter((m:any) => !m.isDeleted));
      const exactBarcode = medicines.find((m:any) => m.barcode === searchTerm.trim());
      if (exactBarcode) handleAddToCart(exactBarcode);
      else if (results.length === 1) handleAddToCart(results[0]);
    }
  };
  
  const handleAddToCart = (med: any) => {
    if (med.quantity <= 0) {
      if (med.scientificName) {
        const substitutes = medicines.filter((m:any) => !m.isDeleted && m.scientificName === med.scientificName && m.quantity > 0 && m.id !== med.id);
        if (substitutes.length > 0) toast.info(`نفد الدواء. البدائل: ${substitutes.map((s:any) => s.nameAr).join('، ')}`);
        else toast.error("نفد هذا الدواء ولا يوجد بدائل متوفرة.");
      } else toast.error("نفد هذا الدواء.");
      return;
    }
    
    const expiryDateStr = med.expiryDate ? med.expiryDate.split('T')[0] : null;
    if (!expiryDateStr) return;
    
    const expDate = parseISO(expiryDateStr);
    const today = startOfDay(new Date());
    
    if (isBefore(expDate, today)) { 
      toast.error(`تنبيه: (${med.nameAr}) منتهي الصلاحية!`); 
      return; 
    }
    
    const ninetyDaysLater = addDays(today, 90);
    
    if (isAfter(expDate, today) && isBefore(expDate, ninetyDaysLater)) {
      toast.warning(`تنبيه: (${med.nameAr}) على وشك الانتهاء.`);
    }
    
    addToCart({ id: med.id, nameAr: med.nameAr, quantity: 1, price: med.price });
    setSearchTerm('');
  };

  const handleIncreaseCartQty = (item: any) => {
    const medData = medicines.find((m:any) => m.id === item.id);
    if (medData && item.quantity < medData.quantity) addToCart({ ...item, quantity: 1 });
    else toast.error("الكمية المتوفرة لا تكفي.");
  };

  const handleKeypadConfirm = (val: string) => {
    if (!val) return;
    const qty = parseInt(val, 10);
    if (isNaN(qty)) { setKeypadTarget(null); return; }
    if (keypadTarget) {
      const item = cart.find(i => i.id === keypadTarget);
      const medData = medicines.find((m:any) => m.id === keypadTarget);
      if (item && medData) {
        if (qty <= medData.quantity) updateItemQuantity(item.id, qty);
        else toast.error("الكمية تتجاوز المخزون!");
      }
    }
    setKeypadTarget(null);
  };

  const handleDiscountChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0;
    if (val > maxDiscount) {
      const adminPass = prompt(`تجاوزت الحد الأقصى (${maxDiscount}%). أدخل كلمة مرور المدير:`);
      if (adminPass) {
        const isValid = await invoke<boolean>('verify_admin_password_db', { password: adminPass });
        if (isValid) setDiscountPercentage(val);
        else { toast.error("كلمة المرور خاطئة. تم رفض الخصم."); setDiscountPercentage(0);
        }
      } else setDiscountPercentage(0);
    } else setDiscountPercentage(val);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    const currentItems = [...cart]; 
    const finalTotal = calculateTotal(); 
    const newInvoiceNum = `INV-${Date.now()}`;
    
    try {
        await invoke('record_sale_db', { 
          discountPercentage: discountPercentage, 
          itemsJson: JSON.stringify(currentItems), 
          userRole: username || 'Unknown' 
        });
        
        await fetchMedicines(); 
        await fetchSummary(); 
        
        setInvoiceData({ items: currentItems, total: finalTotal, invoiceNumber: newInvoiceNum }); 
        clearCart();
        toast.success("تم تسجيل الفاتورة بنجاح.");
    } catch (e: any) {
        toast.error(e.toString() || "فشل تسجيل الفاتورة! تحقق من الصلاحيات.");
    }
  };

  const handleSuspend = async () => {
    if (cart.length === 0) return;
    await invoke('suspend_invoice_db', { username, itemsJson: JSON.stringify(cart) });
    toast.success("تم تعليق الفاتورة بنجاح.");
    clearCart(); fetchSuspended();
  };
  
  const fetchSuspended = async () => { try { setSuspendedInvs(await invoke<any[]>('get_suspended_invoices_db')); } catch (e) { console.error(e); } };
  const handleRecall = (inv: any) => {
    const items = JSON.parse(inv.itemsJson);
    items.forEach((it: any) => addToCart(it));
    invoke('delete_suspended_invoice_db', { invId: inv.id });
    setShowSuspended(false);
  };
  
  const results = searchTerm.trim() ? searchMedicines(searchTerm, medicines.filter((m:any) => !m.isDeleted)) : [];
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
      if (e.key === 'F1') { e.preventDefault(); handleCheckout(); } 
      if (e.key === 'F2') { e.preventDefault(); handleSuspend(); } 
    };
    window.addEventListener('keydown', handleKeyDown); 
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, medicines, discountPercentage]);

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1"><Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input type="text" value={searchTerm} onChange={handleSearch} onKeyPress={handleSearchKeyPress} placeholder="ابحث أو امسح الباركود... (F1 للدفع، F2 للتعليق)" className="w-full pr-12 pl-4 py-4 bg-white border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm" autoFocus /></div>
          <button onClick={() => { fetchSuspended(); setShowSuspended(true); }} className="bg-slate-100 text-slate-600 px-4 rounded-xl hover:bg-slate-200 flex items-center gap-2 text-sm font-medium"><Pause className="w-4 h-4" /> الفواتير المعلقة</button>
        </div>
        <div className="flex-1 overflow-auto">
          {searchTerm && !medicines.find((m:any) => m.barcode === searchTerm.trim()) && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {results.length === 0 ? <p className="p-12 text-center text-slate-400 text-sm">لا توجد نتائج مطابقة</p> : results.map((med:any) => (
                <div key={med.id} className="p-4 border-b border-slate-100 last:border-0 hover:bg-blue-50/50 cursor-pointer flex items-center justify-between transition-colors" onClick={() => handleAddToCart(med)}>
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><span className="text-slate-400 font-bold text-sm">{med.nameAr.charAt(0)}</span></div><div><p className="font-semibold text-slate-800">{med.nameAr}</p><p className="text-xs text-slate-400">باركود: {med.barcode} • متوفر: {med.quantity}</p></div></div><span className="font-bold text-blue-600">{med.price.toFixed(2)} د.ع</span>
                </div>
              ))}
            </div>
          )}
          {!searchTerm && (<div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4"><Search className="w-7 h-7 text-slate-300" /></div><p className="text-slate-400 text-sm">ابحث عن دواء لبدء البيع</p></div></div>)}
        </div>
      </div>
      <div className="w-[380px] bg-white border-l border-slate-200 flex flex-col">
        <div className="p-5 border-b border-slate-200"><div className="flex items-center justify-between mb-1"><h3 className="font-bold text-slate-800">الفاتورة الحالية</h3><div className="flex gap-2">{cart.length > 0 && <button onClick={handleSuspend} className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"><Pause className="w-3 h-3" />تعليق (F2)</button>}<button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700 font-medium">إفراغ</button></div></div><p className="text-xs text-slate-400">{pharmacyName}</p></div>
        <div className="flex-1 overflow-auto p-5">
          {cart.length === 0 ? <div className="flex items-center justify-center h-full"><p className="text-slate-300 text-sm">لم تتم إضافة أصناف بعد</p></div> : (
            <div className="space-y-3">{cart.map(item => (
              <div key={item.id} className="flex items-start justify-between p-3 rounded-lg bg-slate-50">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{item.nameAr}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button onClick={() => removeFromCart(item.id)} className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-red-500 hover:bg-red-50 text-sm font-bold">−</button>
                    <button onClick={() => setKeypadTarget(item.id)} className="text-sm font-semibold text-blue-700 min-w-[40px] text-center bg-blue-50 px-2 py-1 rounded-md">{item.quantity}</button>
                    <button onClick={() => handleIncreaseCartQty(item)} className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-emerald-500 hover:bg-emerald-50 text-sm font-bold">+</button>
                    <span className="text-xs text-slate-400 mr-2">× {item.price.toFixed(2)}</span>
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-800">{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}</div>)}
        </div>
        <div className="p-5 border-t border-slate-200 bg-slate-50/50">
          <div className="flex justify-between items-center mb-2"><span className="text-sm text-slate-500">المجموع الفرعي</span><span className="text-sm font-bold text-slate-700">{calculateSubtotal().toFixed(2)} د.ع</span></div>
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm text-slate-500">الخصم (الحد الأقصى {maxDiscount}%)</label>
            <input type="number" min="0" max="100" value={discountPercentage || ''} onChange={handleDiscountChange} className="w-24 px-2 py-1 text-sm text-left border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="0%" />
          </div>
          <div className="flex justify-between items-center mb-4"><span className="text-sm text-slate-500">الإجمالي المستحق</span><span className="text-2xl font-bold text-slate-800">{calculateTotal().toFixed(2)} <span className="text-sm font-normal text-slate-400">د.ع</span></span></div>
          <button onClick={handleCheckout} disabled={cart.length === 0} className="w-full bg-blue-600 text-white py-3.5 rounded-xl text-base font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"><Calculator className="w-4 h-4" />إتمام البيع (F1)</button>
        </div>
      </div>
      
      {showSuspended && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50" onClick={() => setShowSuspended(false)}>
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-96" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h3 className="text-base font-bold text-slate-800">الفواتير المعلقة</h3><button onClick={() => setShowSuspended(false)} className="text-slate-400"><X className="w-4 h-4" /></button></div>
            <div className="space-y-2 max-h-80 overflow-auto">
              {suspendedInvs.length === 0 ? <p className="text-center text-slate-400 py-8">لا توجد فواتير معلقة</p> : 
                suspendedInvs.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div><p className="text-sm font-medium text-slate-700">{new Date(inv.date).toLocaleString('en-GB')}</p><p className="text-xs text-slate-400">{JSON.parse(inv.itemsJson).length} أصناف</p></div>
                    <div className="flex gap-1">
                      <button onClick={() => handleRecall(inv)} className="bg-blue-50 text-blue-600 p-2 rounded-lg hover:bg-blue-100"><Play className="w-4 h-4" /></button>
                      <button onClick={() => { invoke('delete_suspended_invoice_db', { invId: inv.id }); fetchSuspended(); }} className="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {keypadTarget && <TouchKeypad onConfirm={handleKeypadConfirm} onClose={() => setKeypadTarget(null)} />}
      {invoiceData && <Receipt invoiceNumber={invoiceData.invoiceNumber} items={invoiceData.items} total={invoiceData.total} onClose={() => setInvoiceData(null)} />}
    </div>
  );
}

function App() {
  const { isAuthenticated, isLicensed, checkLicense, role, username, logout, shiftId, checkShift, startShift, closeShift } = useAuthStore();
  const { fetchMedicines } = useInventoryStore(); const { fetchSummary } = useAccountingStore();
  const { fetchSettings } = useSettingsStore(); const { fetchDebts } = useDebtsStore();
  const { fetchSuppliers } = useSuppliersStore();
  const { pharmacyName } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftAmount, setShiftAmount] = useState('');

  useEffect(() => { checkLicense(); }, [checkLicense]);
  useEffect(() => {
    if (isLicensed && isAuthenticated) {
      fetchMedicines(); fetchSummary(); fetchSettings(); fetchDebts(); fetchSuppliers();
      checkShift().then(() => {
        if (!useAuthStore.getState().shiftId) setShowShiftModal(true);
      });
    }
  }, [isLicensed, isAuthenticated, fetchMedicines, fetchSummary, fetchSettings, fetchDebts, fetchSuppliers, checkShift]);

  if (!isLicensed || !isAuthenticated) return <><Login /><Toaster richColors position="bottom-left" /></>;

  const isAdmin = role === 'Super Admin';
  const items = navItems.filter(i => !i.adminOnly || isAdmin);

  const handleStartShift = () => {
    const amt = parseFloat(shiftAmount) || 0;
    startShift(amt);
    setShowShiftModal(false); setShiftAmount('');
  };

  const handleCloseShift = async () => {
    const closingAmountStr = prompt("أدخل المبلغ الفعلي الموجود في الصندوق لإغلاق الشفت:");
    if (closingAmountStr !== null) {
      const closingAmount = parseFloat(closingAmountStr) || 0;
      await closeShift(closingAmount);
      useAuthStore.setState({ shiftId: null });
      toast.success("تم إغلاق الشفت بنجاح.");
    }
  };

  return (
    <div dir="rtl" className="h-screen flex bg-slate-50 font-sans no-select overflow-hidden">
      <Toaster richColors position="bottom-left" />
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800"><img src="/logo.png" alt="شعار الصيدلية" className="w-10 h-10 rounded-lg object-contain bg-white/95 p-0.5" /><div><p className="text-sm font-bold text-white">صيدلية بنين مازن</p><p className="text-xs text-slate-400">نظام الإدارة - الإصدار 2.3</p></div></div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {items.map(item => { const Icon = item.icon; const isActive = activeTab === item.key; return (<button key={item.key} onClick={() => setActiveTab(item.key)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Icon className="w-[18px] h-[18px]" /><span>{item.label}</span></button>); })}
        </nav>
        <div className="p-4 border-t border-slate-800"><div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span>النظام يعمل بشكل طبيعي</span></div></div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 print:hidden">
          <div className="flex items-center gap-4"><h2 className="text-base font-bold text-slate-800">{pharmacyName}</h2><span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs font-medium">النظام الإداري</span></div>
          <div className="flex items-center gap-6">
            <button onClick={handleCloseShift} className={`text-xs font-medium px-3 py-1.5 rounded-lg ${shiftId ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600'}`}>{shiftId ? 'إغلاق الشفت' : 'شفت مغلق'}</button>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center"><span className="text-purple-700 font-bold text-sm">{username?.charAt(0)}</span></div><div><p className="text-xs font-semibold text-slate-700">{username}</p><p className="text-[10px] text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>الشفت مفتوح</p></div></div>
            <button onClick={() => logout()} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><LogOut className="w-5 h-5" /></button>
          </div>
        </header>
        <main className="flex-1 overflow-hidden print:overflow-visible">
          {activeTab === 'dashboard' && <MainDashboard />}
          {activeTab === 'pos' && <PosDashboard />}
          {activeTab === 'refund' && <RefundDashboard />}
          {activeTab === 'inventory' && <InventoryDashboard />}
          {isAdmin && activeTab === 'accounting' && <AccountingDashboard />}
          {isAdmin && activeTab === 'debts' && <DebtsDashboard />}
          {isAdmin && activeTab === 'suppliers' && <SuppliersDashboard />}
          {isAdmin && activeTab === 'patients' && <PatientsDashboard />}
          {isAdmin && activeTab === 'reporting' && <ReportingDashboard />}
          {isAdmin && activeTab === 'audit' && <AuditDashboard />}
          {isAdmin && activeTab === 'backup' && <BackupDashboard />}
          {isAdmin && activeTab === 'users' && <UserManagementDashboard />}
          {isAdmin && activeTab === 'settings' && <SettingsDashboard />}
        </main>
      </div>

      {showShiftModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-96">
            <h3 className="text-base font-bold text-slate-800 mb-4">بدء شفت جديد</h3>
            <p className="text-xs text-slate-500 mb-4">أدخل المبلغ الافتتاحي الموجود في الصندوق لبداية الشفت.</p>
            <input type="number" value={shiftAmount} onChange={e => setShiftAmount(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm mb-4" placeholder="0.00" />
            <button onClick={handleStartShift} className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700">بدء الشفت</button>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;