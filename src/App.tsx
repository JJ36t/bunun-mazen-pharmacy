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
import { AdvancedSettingsDashboard } from './domains/settings/AdvancedSettingsDashboard';
import { PluginsDashboard } from './domains/settings/PluginsDashboard';
import { AuditDashboard } from './domains/security/AuditDashboard';
import { DrugIntelligenceDashboard } from './domains/intelligence/DrugIntelligenceDashboard';
import { BarcodeIntelligenceDashboard } from './domains/intelligence/BarcodeIntelligenceDashboard';
import { StockCountDashboard } from './domains/intelligence/StockCountDashboard';
import { PrescriptionsDashboard } from './domains/intelligence/PrescriptionsDashboard';
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
  Pause, Play, Trash2, X, Hash, Tag, Receipt as ReceiptIcon
} from 'lucide-react';

// استيراد الأنظمة المؤسسية الجديدة
import { hasPermission, Permission } from './lib/core/rbac';
import { eventBus, EventNames } from './lib/core/eventBus';
import { sessionManager } from './lib/core/sessionManager';
import { fraudDetector } from './lib/core/fraudDetector';
import { crashRecovery } from './lib/core/crashRecovery';
import { cache } from './lib/cache/MemoryCache';
import { registerAllPlugins, pluginRegistry } from './plugins';

// تهيئة الـ plugins مرة واحدة
let pluginsInitialized = false;
function ensurePluginsInitialized() {
  if (!pluginsInitialized) {
    registerAllPlugins();
    pluginsInitialized = true;
  }
}

type TabKey = 'dashboard' | 'pos' | 'refund' | 'inventory' | 'accounting' | 'debts' | 'suppliers' | 'patients' | 'reporting' | 'audit' | 'backup' | 'settings' | 'users' | 'advanced_settings' | 'plugins' | 'drug_intelligence' | 'barcode_intelligence' | 'stock_count' | 'prescriptions';

const navItems: { key: TabKey; label: string; icon: any; group: string; permission?: Permission }[] = [
  { key: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard, group: 'العمليات' },
  { key: 'pos', label: 'نقاط البيع', icon: ShoppingCart, group: 'العمليات', permission: 'pos.use' as Permission },
  { key: 'refund', label: 'مرتجع المبيعات', icon: RotateCcw, group: 'العمليات', permission: 'pos.refund' as Permission },
  { key: 'prescriptions', label: 'الوصفات الطبية', icon: ScrollText, group: 'العمليات', permission: 'pos.use' as Permission },
  { key: 'inventory', label: 'المخزون', icon: Package, group: 'الإدارة', permission: 'inventory.view' as Permission },
  { key: 'drug_intelligence', label: 'ذكاء الأدوية', icon: Package, group: 'الإدارة', permission: 'inventory.view' as Permission },
  { key: 'barcode_intelligence', label: 'ذكاء الباركود', icon: Package, group: 'الإدارة', permission: 'inventory.view' as Permission },
  { key: 'stock_count', label: 'الجرد', icon: Package, group: 'الإدارة', permission: 'inventory.adjust' as Permission },
  { key: 'accounting', label: 'المحاسبة', icon: CalcIcon, group: 'الإدارة', permission: 'accounting.view' as Permission },
  { key: 'debts', label: 'الديون', icon: Users, group: 'الإدارة', permission: 'accounting.debts' as Permission },
  { key: 'suppliers', label: 'الموردون', icon: Truck, group: 'الإدارة', permission: 'accounting.suppliers' as Permission },
  { key: 'patients', label: 'المرضى', icon: UserCog, group: 'الإدارة', permission: 'system.patients' as Permission },
  { key: 'reporting', label: 'التقارير', icon: FileBarChart, group: 'النظام', permission: 'reports.view' as Permission },
  { key: 'audit', label: 'سجل التدقيق', icon: ScrollText, group: 'النظام', permission: 'system.audit' as Permission },
  { key: 'backup', label: 'النسخ الاحتياطي', icon: Database, group: 'النظام', permission: 'system.backup' as Permission },
  { key: 'users', label: 'المستخدمون', icon: UserCog, group: 'النظام', permission: 'system.users' as Permission },
  { key: 'settings', label: 'الإعدادات', icon: Settings, group: 'النظام', permission: 'system.settings' as Permission },
  { key: 'advanced_settings', label: 'الإعدادات المتقدمة', icon: Settings, group: 'النظام', permission: 'system.settings' as Permission },
  { key: 'plugins', label: 'الإضافات', icon: Settings, group: 'النظام', permission: 'system.settings' as Permission },
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
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white p-6 rounded-3xl shadow-2xl w-80 animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-base font-bold text-slate-800">إدخال الكمية</h3>
          <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
        </div>
        <input type="text" value={val} readOnly className="input-lg text-2xl font-bold text-center mb-5 tabular" placeholder="0" />
        <div className="grid grid-cols-3 gap-2">
          {keys.map(k => <button key={k} onClick={() => handlePress(k)} className={`py-4 rounded-xl text-xl font-bold transition-all active:scale-95 ${k === '✓' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : k === 'C' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{k}</button>)}
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
    <div className="flex-1 flex overflow-hidden animate-fade-in">
      {/* القسم الأيمن - البحث والنتائج */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <div className="flex gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              value={searchTerm} 
              onChange={handleSearch} 
              onKeyPress={handleSearchKeyPress} 
              placeholder="ابحث أو امسح الباركود... (F1 للدفع، F2 للتعليق)" 
              className="input-lg pr-12 pl-4 shadow-sm" 
              autoFocus 
            />
          </div>
          <button 
            onClick={() => { fetchSuspended(); setShowSuspended(true); }} 
            className="btn-ghost bg-white border border-slate-200"
          >
            <Pause className="w-4 h-4" /> 
            <span>الفواتير المعلقة</span>
            {suspendedInvs.length > 0 && (
              <span className="badge-warning">{suspendedInvs.length}</span>
            )}
          </button>
        </div>
        
        <div className="flex-1 overflow-auto">
          {searchTerm && !medicines.find((m:any) => m.barcode === searchTerm.trim()) && (
            <div className="card overflow-hidden animate-slide-up">
              {results.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <Search className="w-9 h-9 text-slate-300" />
                  </div>
                  <p className="text-slate-400 text-sm">لا توجد نتائج مطابقة</p>
                  <p className="text-slate-300 text-xs mt-1">جرّب كلمات أخرى أو تحقق من الباركود</p>
                </div>
              ) : results.map((med:any) => (
                <div 
                  key={med.id} 
                  className="p-4 border-b border-slate-100 last:border-0 hover:bg-brand-50/40 cursor-pointer flex items-center justify-between transition-colors" 
                  onClick={() => handleAddToCart(med)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center ring-1 ring-brand-200/50">
                      <Package className="w-5 h-5 text-brand-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{med.nameAr}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Hash className="w-3 h-3" />{med.barcode}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Tag className="w-3 h-3" />متوفر: {med.quantity}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="font-bold text-brand-700 text-lg tabular">{med.price.toFixed(2)} <span className="text-xs font-normal text-slate-400">د.ع</span></span>
                </div>
              ))}
            </div>
          )}
          {!searchTerm && (
            <div className="empty-state h-full">
              <div className="empty-state-icon bg-gradient-to-br from-brand-100 to-brand-50 ring-1 ring-brand-200/50">
                <ShoppingCart className="w-9 h-9 text-brand-400" />
              </div>
              <p className="text-slate-500 text-base font-semibold">ابحث عن دواء لبدء البيع</p>
              <p className="text-slate-400 text-sm mt-1">اكتب اسم الدواء أو امسح الباركود</p>
            </div>
          )}
        </div>
      </div>
      
      {/* القسم الأيسر - الفاتورة الحالية */}
      <div className="w-[400px] bg-white border-l border-slate-200 flex flex-col">
        <div className="p-5 border-b border-slate-200 bg-gradient-subtle">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <ReceiptIcon className="w-4 h-4 text-brand-600" />
              الفاتورة الحالية
            </h3>
            <div className="flex gap-2">
              {cart.length > 0 && (
                <button onClick={handleSuspend} className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-amber-50">
                  <Pause className="w-3 h-3" />تعليق
                </button>
              )}
              {cart.length > 0 && (
                <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50">
                  إفراغ
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-400">{pharmacyName}</p>
        </div>
        
        <div className="flex-1 overflow-auto p-5">
          {cart.length === 0 ? (
            <div className="empty-state h-full">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
                <ShoppingCart className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-slate-300 text-sm">لم تتم إضافة أصناف بعد</p>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in">
              {cart.map(item => (
                <div key={item.id} className="flex items-start justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{item.nameAr}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button 
                        onClick={() => removeFromCart(item.id)} 
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-red-500 hover:bg-red-50 hover:border-red-200 text-sm font-bold active:scale-95"
                      >−</button>
                      <button 
                        onClick={() => setKeypadTarget(item.id)} 
                        className="text-sm font-semibold text-brand-700 min-w-[44px] text-center bg-brand-50 px-3 py-1 rounded-lg hover:bg-brand-100 tabular"
                      >{item.quantity}</button>
                      <button 
                        onClick={() => handleIncreaseCartQty(item)} 
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 text-sm font-bold active:scale-95"
                      >+</button>
                      <span className="text-xs text-slate-400 mr-2 tabular">× {item.price.toFixed(2)}</span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-800 tabular">{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-5 border-t border-slate-200 bg-slate-50/50">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-slate-500">المجموع الفرعي</span>
            <span className="text-sm font-bold text-slate-700 tabular">{calculateSubtotal().toFixed(2)} د.ع</span>
          </div>
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm text-slate-500">الخصم (الحد الأقصى {maxDiscount}%)</label>
            <input 
              type="number" 
              min="0" 
              max="100" 
              value={discountPercentage || ''} 
              onChange={handleDiscountChange} 
              className="w-24 px-3 py-1.5 text-sm text-left border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 tabular" 
              placeholder="0%" 
            />
          </div>
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200">
            <span className="text-sm text-slate-600 font-semibold">الإجمالي المستحق</span>
            <span className="text-3xl font-bold text-brand-700 tabular">{calculateTotal().toFixed(2)} <span className="text-sm font-normal text-slate-400">د.ع</span></span>
          </div>
          <button 
            onClick={handleCheckout} 
            disabled={cart.length === 0} 
            className="btn-primary w-full py-4 text-base shadow-md"
          >
            <Calculator className="w-5 h-5" />
            إتمام البيع (F1)
          </button>
        </div>
      </div>
      
      {showSuspended && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowSuspended(false)}>
          <div className="bg-white p-6 rounded-3xl shadow-2xl w-96 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Pause className="w-4 h-4 text-amber-500" />
                الفواتير المعلقة
              </h3>
              <button onClick={() => setShowSuspended(false)} className="btn-icon"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 max-h-80 overflow-auto">
              {suspendedInvs.length === 0 ? (
                <div className="empty-state py-12">
                  <div className="empty-state-icon">
                    <Pause className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 text-sm">لا توجد فواتير معلقة</p>
                </div>
              ) : suspendedInvs.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-700 tabular">{new Date(inv.date).toLocaleString('en-GB')}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{JSON.parse(inv.itemsJson).length} أصناف</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleRecall(inv)} className="btn-icon text-brand-600 hover:bg-brand-50">
                        <Play className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => { invoke('delete_suspended_invoice_db', { invId: inv.id }); fetchSuspended(); }} 
                        className="btn-icon text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              )}
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
  
  // تهيئة الأنظمة المؤسسية عند بدء التشغيل
  useEffect(() => {
    if (isLicensed && isAuthenticated) {
      // تهيئة الـ plugins
      ensurePluginsInitialized();
      
      // بدء جلسة المستخدم
      sessionManager.startSession('user-id', username || 'unknown');
      
      // استرجاع العمليات المعلقة (Crash Recovery)
      crashRecovery.recoverPendingOperations().then(result => {
        if (result.recovered > 0) {
          toast.success(`تم استرجاع ${result.recovered} عملية معلقة`);
        }
        if (result.failed > 0) {
          toast.warning(`فشل استرجاع ${result.failed} عملية`);
        }
      });
      
      // نشر حدث تسجيل الدخول
      eventBus.emit(EventNames.USER_LOGGED_IN, { username, role });
      
      // تحميل البيانات
      fetchMedicines(); fetchSummary(); fetchSettings(); fetchDebts(); fetchSuppliers();
      checkShift().then(() => {
        if (!useAuthStore.getState().shiftId) setShowShiftModal(true);
      });
      
      // فحص النسخ الاحتياطي التلقائي
      invoke<boolean>('check_auto_backup').then(shouldBackup => {
        if (shouldBackup) {
          invoke<string>('create_auto_backup_db', { userRole: username || 'system' })
            .then(() => toast.info('تم إنشاء نسخة احتياطية تلقائية'))
            .catch(() => {});
        }
      }).catch(() => {});
    }
  }, [isLicensed, isAuthenticated, fetchMedicines, fetchSummary, fetchSettings, fetchDebts, fetchSuppliers, checkShift, username, role]);
  
  // Cleanup عند الخروج
  useEffect(() => {
    return () => {
      sessionManager.endSession();
      fraudDetector.resetSession();
      cache.clear();
    };
  }, []);

  if (!isLicensed || !isAuthenticated) return <><Login /><Toaster richColors position="bottom-left" /></>;

  // فلترة القائمة حسب الصلاحيات (RBAC)
  const items = navItems.filter(item => {
    if (!item.permission) return true; // العناصر بدون صلاحية = للجميع
    return hasPermission(role || 'cashier', item.permission);
  });
  
  // تنظيم العناصر حسب المجموعة
  const groups = Array.from(new Set(items.map(i => i.group)));

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
      
      {/* ===== الشريط الجانبي الأنيق ===== */}
      <aside className="w-72 bg-gradient-to-b from-brand-900 via-brand-900 to-brand-950 text-white flex flex-col shadow-2xl">
        {/* الشعار + الاسم */}
        <div className="h-20 flex items-center gap-3 px-5 border-b border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-white/95 p-1 shadow-lg flex items-center justify-center">
            <img src="/logo.png" alt="شعار الصيدلية" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-base font-bold text-white">صيدلية بنين مازن</p>
            <p className="text-xs text-brand-200">نظام الإدارة - v2.3</p>
          </div>
        </div>
        
        {/* قائمة التنقل */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
          {groups.map(group => (
            <div key={group}>
              <p className="px-3 mb-2 text-[11px] font-bold text-brand-300 uppercase tracking-wider">{group}</p>
              <div className="space-y-1">
                {items.filter(i => i.group === group).map(item => { 
                  const Icon = item.icon; 
                  const isActive = activeTab === item.key; 
                  return (
                    <button 
                      key={item.key} 
                      onClick={() => setActiveTab(item.key)} 
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        isActive 
                          ? 'bg-white text-brand-800 shadow-lg shadow-brand-950/30' 
                          : 'text-brand-100 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px]" />
                      <span>{item.label}</span>
                    </button>
                  ); 
                })}
              </div>
            </div>
          ))}
        </nav>
        
        {/* حالة النظام */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-2 text-xs text-brand-200 bg-white/5 rounded-lg px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span>النظام يعمل بشكل طبيعي</span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ===== الهيدر العلوي ===== */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 print:hidden shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800">{pharmacyName}</h2>
            <span className="px-3 py-1 rounded-lg bg-brand-50 text-brand-700 text-xs font-semibold border border-brand-100">النظام الإداري</span>
          </div>
          <div className="flex items-center gap-5">
            <button 
              onClick={handleCloseShift} 
              className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all ${
                shiftId 
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200' 
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {shiftId ? 'إغلاق الشفت' : 'شفت مغلق'}
            </button>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md ring-2 ring-white">
                <span className="text-white font-bold text-sm">{username?.charAt(0)}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">{username}</p>
                <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  الشفت مفتوح
                </p>
              </div>
            </div>
            <button onClick={() => logout()} className="btn-icon text-red-500 hover:bg-red-50">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>
        
        <main className="flex-1 overflow-hidden print:overflow-visible">
          {activeTab === 'dashboard' && <MainDashboard />}
          {activeTab === 'pos' && <PosDashboard />}
          {activeTab === 'refund' && <RefundDashboard />}
          {activeTab === 'inventory' && <InventoryDashboard />}
          {hasPermission(role || 'cashier', 'accounting.view' as Permission) && activeTab === 'accounting' && <AccountingDashboard />}
          {hasPermission(role || 'cashier', 'accounting.debts' as Permission) && activeTab === 'debts' && <DebtsDashboard />}
          {hasPermission(role || 'cashier', 'accounting.suppliers' as Permission) && activeTab === 'suppliers' && <SuppliersDashboard />}
          {hasPermission(role || 'cashier', 'system.patients' as Permission) && activeTab === 'patients' && <PatientsDashboard />}
          {hasPermission(role || 'cashier', 'reports.view' as Permission) && activeTab === 'reporting' && <ReportingDashboard />}
          {hasPermission(role || 'cashier', 'system.audit' as Permission) && activeTab === 'audit' && <AuditDashboard />}
          {hasPermission(role || 'cashier', 'system.backup' as Permission) && activeTab === 'backup' && <BackupDashboard />}
          {hasPermission(role || 'cashier', 'system.users' as Permission) && activeTab === 'users' && <UserManagementDashboard />}
          {hasPermission(role || 'cashier', 'system.settings' as Permission) && activeTab === 'settings' && <SettingsDashboard />}
          {hasPermission(role || 'cashier', 'system.settings' as Permission) && activeTab === 'advanced_settings' && <AdvancedSettingsDashboard />}
          {hasPermission(role || 'cashier', 'system.settings' as Permission) && activeTab === 'plugins' && <PluginsDashboard />}
          
          {/* صفحات PharmIQ Intelligence الجديدة */}
          {activeTab === 'drug_intelligence' && <DrugIntelligenceDashboard />}
          {activeTab === 'barcode_intelligence' && <BarcodeIntelligenceDashboard />}
          {activeTab === 'stock_count' && <StockCountDashboard />}
          {activeTab === 'prescriptions' && <PrescriptionsDashboard />}
          
          {/* عرض صفحات الـ plugins المفعّلة */}
          {pluginRegistry.getWithDashboard().map(plugin => 
            activeTab === `plugin-${plugin.name}` && plugin.dashboard 
              ? <plugin.dashboard key={plugin.name} /> 
              : null
          )}
        </main>
      </div>

      {showShiftModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white p-7 rounded-3xl shadow-2xl w-96 animate-scale-in">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center">
                <Calculator className="w-4 h-4 text-brand-700" />
              </div>
              بدء شفت جديد
            </h3>
            <p className="text-xs text-slate-500 mb-5">أدخل المبلغ الافتتاحي الموجود في الصندوق لبداية الشفت.</p>
            <input 
              type="number" 
              value={shiftAmount} 
              onChange={e => setShiftAmount(e.target.value)} 
              className="input-lg text-center text-2xl font-bold tabular mb-5" 
              placeholder="0.00" 
              autoFocus
            />
            <button onClick={handleStartShift} className="btn-primary w-full py-3 text-base">
              بدء الشفت
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
