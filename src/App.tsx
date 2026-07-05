import { useEffect, useState, useRef } from 'react';
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
import { StockCountDashboard } from './domains/intelligence/StockCountDashboard';
import { PrescriptionsDashboard } from './domains/intelligence/PrescriptionsDashboard';
import { ImportDashboard } from './domains/intelligence/ImportDashboard';
import { CashDrawerDashboard } from './domains/intelligence/CashDrawerDashboard';
import { LabelPrintingDashboard } from './domains/intelligence/LabelPrintingDashboard';
import { EnterpriseDashboard } from './domains/intelligence/EnterpriseDashboard';
import { InvoicesDashboard } from './domains/reporting/InvoicesDashboard';
import { QuickPurchaseDashboard } from './domains/suppliers/QuickPurchaseDashboard';
import { RefundDashboard } from './domains/pos/RefundDashboard';
import { PatientsDashboard } from './domains/patients/PatientsDashboard';
import { Receipt } from './domains/pos/Receipt';

import { searchMedicines } from './lib/utils/search';
import { invoke } from '@tauri-apps/api/core';
import { SmartBarcodeLookup } from './domains/pos/SmartBarcodeLookup';
import { DrugInteractionChecker } from './domains/pos/DrugInteractionChecker';
import { DailyChecksModal } from './domains/intelligence/DailyChecksModal';
import { Toaster, toast } from 'sonner';
import { parseISO, startOfDay, isBefore, isAfter, addDays } from 'date-fns';
import {
  Search, LogOut, Calculator, ShoppingCart, RotateCcw, Home,
  Package, Calculator as CalcIcon, Users, FileBarChart, ScrollText, Database, Settings, Truck, UserCog,
  Pause, Play, Trash2, X, Hash, Tag, Receipt as ReceiptIcon, Shield
} from 'lucide-react';

// استيراد الأنظمة المؤسسية الجديدة
import { hasPermission, Permission } from './lib/core/rbac';
import { eventBus, EventNames } from './lib/core/eventBus';
import { sessionManager } from './lib/core/sessionManager';
import { fraudDetector } from './lib/core/fraudDetector';
import { crashRecovery } from './lib/core/crashRecovery';
import { cache } from './lib/cache/MemoryCache';
import { registerAllPlugins } from './plugins';

// تهيئة الـ plugins مرة واحدة
let pluginsInitialized = false;
function ensurePluginsInitialized() {
  if (!pluginsInitialized) {
    registerAllPlugins();
    pluginsInitialized = true;
  }
}

type TabKey = 'dashboard' | 'pos' | 'refund' | 'inventory' | 'accounting' | 'debts' | 'suppliers' | 'quick_purchase' | 'patients' | 'reporting' | 'invoices' | 'audit' | 'backup' | 'settings' | 'users' | 'stock_count' | 'prescriptions' | 'import' | 'cash_drawer' | 'label_printing' | 'enterprise';

const navItems: { key: TabKey; label: string; icon: any; group: string; permission?: Permission }[] = [
  // 'dashboard' تم إزالته من القائمة — الشاشة الرئيسية تظهر افتراضياً
  { key: 'pos', label: 'نقاط البيع', icon: ShoppingCart, group: 'العمليات', permission: 'pos.use' as Permission },
  { key: 'refund', label: 'مرتجع المبيعات', icon: RotateCcw, group: 'العمليات', permission: 'pos.refund' as Permission },
  { key: 'prescriptions', label: 'الوصفات الطبية', icon: ScrollText, group: 'العمليات', permission: 'pos.use' as Permission },
  { key: 'cash_drawer', label: 'موازنة الصندوق', icon: CalcIcon, group: 'العمليات', permission: 'pos.use' as Permission },
  { key: 'inventory', label: 'المخزون', icon: Package, group: 'الإدارة', permission: 'inventory.view' as Permission },
  { key: 'label_printing', label: 'طباعة الملصقات', icon: Package, group: 'الإدارة', permission: 'inventory.view' as Permission },
  { key: 'stock_count', label: 'الجرد', icon: Package, group: 'الإدارة', permission: 'inventory.adjust' as Permission },
  { key: 'import', label: 'استيراد الأدوية', icon: Package, group: 'الإدارة', permission: 'inventory.add' as Permission },
  { key: 'enterprise', label: 'الإدارة المؤسسية', icon: Database, group: 'النظام', permission: 'system.settings' as Permission },
  { key: 'accounting', label: 'المحاسبة', icon: CalcIcon, group: 'الإدارة', permission: 'accounting.view' as Permission },
  { key: 'debts', label: 'الديون', icon: Users, group: 'الإدارة', permission: 'accounting.debts' as Permission },
  { key: 'suppliers', label: 'الموردون', icon: Truck, group: 'الإدارة', permission: 'accounting.suppliers' as Permission },
  { key: 'quick_purchase', label: 'الشراء السريع', icon: Truck, group: 'الإدارة', permission: 'accounting.suppliers' as Permission },
  { key: 'patients', label: 'المرضى', icon: UserCog, group: 'الإدارة', permission: 'system.patients' as Permission },
  { key: 'reporting', label: 'التقارير', icon: FileBarChart, group: 'النظام', permission: 'reports.view' as Permission },
  { key: 'invoices', label: 'الفواتير الشاملة', icon: FileBarChart, group: 'النظام', permission: 'reports.view' as Permission },
  { key: 'audit', label: 'سجل التدقيق', icon: ScrollText, group: 'النظام', permission: 'system.audit' as Permission },
  { key: 'backup', label: 'النسخ الاحتياطي', icon: Database, group: 'النظام', permission: 'system.backup' as Permission },
  { key: 'users', label: 'المستخدمون', icon: UserCog, group: 'النظام', permission: 'system.users' as Permission },
  { key: 'settings', label: 'الإعدادات', icon: Settings, group: 'النظام', permission: 'system.settings' as Permission },

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
  const { pharmacyName } = useSettingsStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [invoiceData, setInvoiceData] = useState<{ items: any[], total: number, invoiceNumber: string } | null>(null);
  const [suspendedInvs, setSuspendedInvs] = useState<any[]>([]);
  const [showSuspended, setShowSuspended] = useState(false);
  const [keypadTarget, setKeypadTarget] = useState<string | null>(null);
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    const loadDraft = async () => {
      try {
        const draft = await invoke<any | null>('load_draft_session_db', { sessionKey: 'pos_cart' });
        if (draft && draft.items && Array.isArray(draft.items) && draft.items.length > 0 && cart.length === 0) {
          draft.items.forEach((item: any) => addToCart(item));
          if (draft.discount) setDiscountPercentage(draft.discount);
          toast.info('تم استرجاع السلة المحفوظة');
        }
      } catch (e) { console.error(e); }
    };
    loadDraft();
  }, []);

  // حفظ السلة عند كل تغيير
  useEffect(() => {
    if (cart.length > 0) {
      invoke('save_draft_session_db', {
        sessionKey: 'pos_cart',
        sessionData: JSON.stringify({ items: cart, discount: discountPercentage }),
        userRole: username || 'Unknown',
      }).catch(() => {});
    } else {
      invoke('clear_draft_session_db', { sessionKey: 'pos_cart' }).catch(() => {});
    }
  }, [cart, discountPercentage]);
  const [showPayment, setShowPayment] = useState(false);
  const [smartLookupBarcode, setSmartLookupBarcode] = useState<string | null>(null);
  const [showInteractionCheck, setShowInteractionCheck] = useState(false);
  const [interactionOverrideGranted, setInteractionOverrideGranted] = useState(false);
  const [showDailyChecks, setShowDailyChecks] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [mixedCash, setMixedCash] = useState('');
  const [mixedCard, setMixedCard] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [customerName, setCustomerName] = useState('');

  // تحميل طرق الدفع
  useEffect(() => {
    invoke<any[]>('get_payment_methods_db').then(setPaymentMethods).catch(() => {});
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => { setSearchTerm(e.target.value); };
  
  const handleSearchKeyPress = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = searchTerm.trim();
      if (!trimmed) return;

      // 1. مطابقة محلية سريعة في medicines.barcode (المحملة في الذاكرة)
      const localMatch = medicines.find((m:any) =>
        m.barcode && String(m.barcode).trim() === trimmed
      );
      if (localMatch) { handleAddToCart(localMatch); setSearchTerm(''); return; }

      // 2. للباركودات الرقمية (8+ أرقام): استعلام قاعدة البيانات
      //     يشمل medicine_barcodes التي قد لا تكون محملة في الذاكرة
      if (/^\d{8,}$/.test(trimmed)) {
        try {
          const result = await invoke<any | null>('lookup_barcode_db', { barcode: trimmed });
          if (result && result.medicineId) {
            const med = medicines.find((m:any) => m.id === result.medicineId);
            if (med) { handleAddToCart(med); setSearchTerm(''); return; }
          }
        } catch (err) { console.error('Barcode lookup failed:', err); }
      }

      // 3. البحث بالاسم (يشمل الباركود الجزئي)
      const results = searchMedicines(searchTerm, medicines.filter((m:any) => !m.isDeleted));
      if (results.length === 1) { handleAddToCart(results[0]); setSearchTerm(''); return; }

      // 4. لو الباركود رقمي وما لقيناه في أي مكان → افتح البحث الذكي
      if (/^\d{8,}$/.test(trimmed) && results.length === 0) {
        setSmartLookupBarcode(trimmed);
      }
    }
  };

  // بعد إضافة دواء من SmartBarcodeLookup
  const handleSmartLookupAdded = async (medicineId: string) => {
    await fetchMedicines();
    const newMed = (await invoke<any[]>('get_medicines_db')).find((m: any) => m.id === medicineId);
    if (newMed) handleAddToCart(newMed);
    setSmartLookupBarcode(null);
  };
  
  const handleAddToCart = async (med: any) => {
    if (med.quantity <= 0) {
      if (med.scientificName) {
        const substitutes = medicines.filter((m:any) => !m.isDeleted && m.scientificName === med.scientificName && m.quantity > 0 && m.id !== med.id);
        if (substitutes.length > 0) toast.info(`نفد الدواء. البدائل: ${substitutes.map((s:any) => s.nameAr).join('، ')}`);
        else toast.error("نفد هذا الدواء ولا يوجد بدائل متوفرة.");
      } else toast.error("نفد هذا الدواء.");
      return;
    }

    const expiryDateStr = med.expiryDate ? String(med.expiryDate).split('T')[0] : null;
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

    // ===== فحص التفاعلات الدوائية عند الإضافة للسلة =====
    const newCartItems = [...cart, { id: med.id, nameAr: med.nameAr, quantity: 1, price: med.price }];
    const activeIngredients = newCartItems
      .map(item => {
        const m = medicines.find((med: any) => med.id === item.id);
        return m?.scientificName || '';
      })
      .filter(name => name && name.trim().length > 0);

    if (activeIngredients.length >= 2) {
      try {
        const interactions = await invoke<any[]>('check_drug_interactions_db', {
          drugNamesJson: JSON.stringify(activeIngredients),
        });
        if (interactions.length > 0) {
          // أضف الدواء للسلة أولاً
          addToCart({ id: med.id, nameAr: med.nameAr, quantity: 1, price: med.price });
          setSearchTerm('');
          // ثم اعرض نافذة التفاعلات
          setShowInteractionCheck(true);
          return;
        }
      } catch (e) { console.error('Interaction check failed:', e); }
    }

    addToCart({ id: med.id, nameAr: med.nameAr, quantity: 1, price: med.price });
    setSearchTerm('');
  };

  const handleIncreaseCartQty = (item: any) => {
    const medData = medicines.find((m:any) => m.id === item.id);
    if (medData && item.quantity < medData.quantity) addToCart({ ...item, quantity: 1 });
    else toast.error("الكمية المتوفرة لا تكفي.");
  };

  const handleDecreaseCartQty = (item: any) => {
    if (item.quantity > 1) {
      updateItemQuantity(item.id, item.quantity - 1);
    } else {
      removeFromCart(item.id);
    }
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

  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountLimit, setDiscountLimit] = useState<any>(null);
  const [showAdminDiscount, setShowAdminDiscount] = useState(false);
  const [adminDiscountPass, setAdminDiscountPass] = useState('');
  const [pendingDiscount, setPendingDiscount] = useState(0);

  // تحميل حد الخصم عند الدخول
  useEffect(() => {
    invoke<any>('get_discount_limit_db', { userRole: username || 'cashier' })
      .then(setDiscountLimit).catch(() => {});
  }, [username]);

  const handleDiscountChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0;
    setDiscountAmount(val);
    setDiscountPercentage(0); // صفر النسبة القديمة، نستخدم المبلغ

    if (val > 0 && discountLimit) {
      const remaining = discountLimit.remaining || 0;
      if (val > remaining) {
        // تجاوز الحد — اطلب كلمة مرور المدير
        setPendingDiscount(val);
        setShowAdminDiscount(true);
        return;
      }
      // ضمن الحد — سجل الاستخدام
      try {
        await invoke('record_discount_usage_db', { userRole: username || 'cashier', amount: val });
        invoke<any>('get_discount_limit_db', { userRole: username || 'cashier' }).then(setDiscountLimit);
      } catch (e) { console.error(e); }
    }
  };

  const handleAdminDiscountConfirm = async () => {
    try {
      const ok = await invoke<boolean>('admin_override_discount_db', {
        password: adminDiscountPass,
        discountAmount: pendingDiscount,
        userRole: username || 'cashier',
      });
      if (ok) {
        setDiscountAmount(pendingDiscount);
        await invoke('record_discount_usage_db', { userRole: username || 'cashier', amount: pendingDiscount });
        invoke<any>('get_discount_limit_db', { userRole: username || 'cashier' }).then(setDiscountLimit);
        toast.success('تم تجاوز حد الخصم بإذن المدير');
        setShowAdminDiscount(false);
        setAdminDiscountPass('');
      }
    } catch (e: any) {
      toast.error('فشل: ' + e);
    }
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setShowPayment(true);
  };

  const handleConfirmPayment = async () => {
    const currentItems = [...cart];
    const finalTotal = calculateTotal();
    const newInvoiceNum = `INV-${Date.now()}`;

    // التحقق من اسم الزبون عند الدفع الآجل
    if (selectedPaymentMethod === 'credit' && !customerName.trim()) {
      toast.error("يجب إدخال اسم الزبون للدفع الآجل!");
      return;
    }

    // فحص تفاعلات الأدوية قبل إتمام البيع (لو لم يتم التجاوز مسبقاً)
    if (!interactionOverrideGranted) {
      // اجمع المواد الفعالة من السلة
      const activeIngredients = currentItems
        .map(item => {
          const med = medicines.find((m: any) => m.id === item.id);
          return med?.scientificName || med?.nameAr || '';
        })
        .filter(name => name && name.trim().length > 0);

      if (activeIngredients.length >= 2) {
        try {
          const interactions = await invoke<any[]>('check_drug_interactions_db', {
            drugNamesJson: JSON.stringify(activeIngredients),
          });
          if (interactions.length > 0) {
            setShowPayment(false); // أغلق نافذة الدفع أولاً
            setShowInteractionCheck(true);
            return; // أوقف البيع حتى يراجع الصيدلي
          }
        } catch (e) { console.error('Interaction check failed:', e); }
      }
    }

    try {
        await invoke('record_sale_db', {
          discountPercentage: discountPercentage,
          itemsJson: JSON.stringify(currentItems),
          userRole: username || 'Unknown'
        });

        // إذا كان الدفع آجل، أضف دين للزبون (اسم الزبون إلزامي)
        if (selectedPaymentMethod === 'credit') {
          const debtCustomerName = customerName.trim();
          await invoke('add_customer_debt_db', {
            customerName: debtCustomerName,
            amount: finalTotal,
            note: `فاتورة آجلة - ${newInvoiceNum}`,
            userRole: username || 'Unknown',
          });
          toast.info(`تم تسجيل دين بقيمة ${finalTotal.toFixed(0)} د.ع للزبون: ${debtCustomerName}`);
        }

        await fetchMedicines();
        await fetchSummary();

        // طباعة مباشرة تلقائياً (استخدم طابعة الإيصالات المحفوظة)
        try {
          let printerName = '';
          try {
            const printerSettings = await invoke<any>('get_printer_settings_db');
            printerName = printerSettings.receiptPrinter || '';
          } catch {}
          if (!printerName) {
            const printers = await invoke<string[]>('get_available_printers');
            printerName = printers[0] || '';
          }
          if (printerName) {
            await invoke('print_receipt_direct', {
              printerName,
              pharmacyName,
              invoiceNum: newInvoiceNum,
              itemsJson: JSON.stringify(currentItems),
              total: finalTotal.toFixed(2)
            });
          }
        } catch (e) { console.error('Print failed:', e); }

        clearCart();
        setShowPayment(false);
        setInteractionOverrideGranted(false); // reset للفاتورة الجاية
        setPaidAmount(''); setMixedCash(''); setMixedCard(''); setChequeNumber(''); setCustomerName('');
        toast.success("تم تسجيل البيع والطباعة بنجاح.");
    } catch (e: any) {
        toast.error(e.toString() || "فشل تسجيل الفاتورة! تحقق من الصلاحيات.");
    }
  };

  const handlePrintOnly = async () => {
    if (cart.length === 0) return;
    const currentItems = [...cart];
    const finalTotal = calculateTotal();
    const newInvoiceNum = `PRINT-${Date.now()}`;
    
    try {
      const printers = await invoke<string[]>('get_available_printers');
      if (printers.length === 0) {
        toast.error("لا توجد طابعة متاحة");
        return;
      }
      await invoke('print_receipt_direct', {
        printerName: printers[0],
        pharmacyName,
        invoiceNum: newInvoiceNum,
        itemsJson: JSON.stringify(currentItems),
        total: finalTotal.toFixed(2)
      });
      toast.success("تم طباعة الوصل بنجاح (بدون تسجيل بيع).");
    } catch (e: any) {
      toast.error("فشلت الطباعة: " + e);
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
          {searchTerm && !medicines.find((m:any) => m.barcode && String(m.barcode).trim() === searchTerm.trim()) && (
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
                <button onClick={handleSuspend} className="btn-warning px-4 py-2 text-sm">
                  <Pause className="w-4 h-4" /> تعليق الفاتورة
                </button>
              )}
              {cart.length > 0 && (
                <button onClick={clearCart} className="btn-danger px-4 py-2 text-sm">
                  <Trash2 className="w-4 h-4" /> إفراغ السلة
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
                        onClick={() => handleDecreaseCartQty(item)} 
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
            <div>
              <label className="text-sm text-slate-500">الخصم (د.ع)</label>
              {discountLimit && (
                <p className="text-[10px] text-slate-400 tabular">
                  المتبقي اليوم: {discountLimit.remaining?.toFixed(0) || 0} د.ع
                </p>
              )}
            </div>
            <input
              type="number"
              min="0"
              value={discountAmount || ''}
              onChange={handleDiscountChange}
              className="w-28 px-3 py-1.5 text-sm text-left border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 tabular"
              placeholder="0"
            />
          </div>
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200">
            <span className="text-sm text-slate-600 font-semibold">الإجمالي المستحق</span>
            <span className="text-3xl font-bold text-brand-700 tabular">{Math.max(0, calculateTotal() - discountAmount).toFixed(2)} <span className="text-sm font-normal text-slate-400">د.ع</span></span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={handleCheckout} 
              disabled={cart.length === 0} 
              className="btn-primary py-4 text-base shadow-md"
            >
              <Calculator className="w-5 h-5" />
              إتمام البيع + طباعة (F1)
            </button>
            <button 
              onClick={handlePrintOnly} 
              disabled={cart.length === 0}
              className="btn-outline py-4 text-base"
            >
              <ReceiptIcon className="w-5 h-5" />
              طباعة الوصل فقط
            </button>
          </div>
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

      {smartLookupBarcode && (
        <SmartBarcodeLookup
          barcode={smartLookupBarcode}
          onClose={() => setSmartLookupBarcode(null)}
          onMedicineAdded={handleSmartLookupAdded}
        />
      )}

      {showInteractionCheck && (
        <DrugInteractionChecker
          drugNames={cart.map(item => {
            const med = medicines.find((m: any) => m.id === item.id);
            return med?.scientificName || med?.nameAr || '';
          }).filter(name => name && name.trim().length > 0)}
          onOverride={() => {
            setInteractionOverrideGranted(true);
            setShowInteractionCheck(false);
            toast.success('تم تجاوز التحذيرات. اضغط "تأكيد الدفع" مرة أخرى.');
          }}
          onClose={() => setShowInteractionCheck(false)}
        />
      )}

      {showDailyChecks && (
        <DailyChecksModal onClose={() => setShowDailyChecks(false)} />
      )}

      {showPayment && (
        <PaymentModal
          total={calculateTotal()}
          paymentMethods={paymentMethods}
          selectedMethod={selectedPaymentMethod}
          setSelectedMethod={setSelectedPaymentMethod}
          paidAmount={paidAmount}
          setPaidAmount={setPaidAmount}
          mixedCash={mixedCash}
          setMixedCash={setMixedCash}
          mixedCard={mixedCard}
          setMixedCard={setMixedCard}
          chequeNumber={chequeNumber}
          setChequeNumber={setChequeNumber}
          customerName={customerName}
          setCustomerName={setCustomerName}
          onConfirm={handleConfirmPayment}
          onClose={() => setShowPayment(false)}
        />
      )}
      {invoiceData && <Receipt invoiceNumber={invoiceData.invoiceNumber} items={invoiceData.items} total={invoiceData.total} onClose={() => setInvoiceData(null)} />}

      {/* نافذة تجاوز حد الخصم */}
      {showAdminDiscount && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-80">
            <h3 className="text-base font-bold text-slate-800 mb-2">تجاوز حد الخصم</h3>
            <p className="text-xs text-slate-500 mb-4">الخصم المطلوب: {pendingDiscount} د.ع يتجاوز الحد المتبقي. أدخل كلمة مرور المدير.</p>
            <input
              type="password"
              value={adminDiscountPass}
              onChange={e => setAdminDiscountPass(e.target.value)}
              className="input-lg text-center mb-4"
              placeholder="••••••••"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={handleAdminDiscountConfirm} className="btn-primary flex-1 py-2.5">تأكيد</button>
              <button onClick={() => { setShowAdminDiscount(false); setDiscountAmount(0); setAdminDiscountPass(''); }} className="btn-ghost border border-slate-200 flex-1 py-2.5">إلغاء</button>
            </div>
          </div>
        </div>
      )}
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
  const [showDailyChecks, setShowDailyChecks] = useState(false);

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

      // فحص يومي للمخزون (تنبيهات الانتهاء والمخزون المنخفض)
      setTimeout(() => setShowDailyChecks(true), 1500);

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
    <div dir="rtl" className="h-screen flex flex-col bg-slate-50 font-sans no-select overflow-hidden">
      <Toaster richColors position="bottom-left" />

      {/* ===== نافذة الفحص اليومي ===== */}
      {showDailyChecks && (
        <DailyChecksModal onClose={() => setShowDailyChecks(false)} />
      )}

      {/* ===== الشريط العلوي ===== */}
      <header className="bg-brand-900 text-white px-6 py-3 flex items-center justify-between shadow-md flex-shrink-0">
        <div className="flex items-center gap-3">
          {activeTab !== 'dashboard' && (
            <button onClick={() => setActiveTab('dashboard')} className="btn-ghost text-white hover:bg-white/10 px-3 py-2">
              <Home className="w-5 h-5" />
              الرئيسية
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-white/95 p-1 flex items-center justify-center">
            <img src="/logo.png" alt="شعار الصيدلية" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-sm font-bold">{pharmacyName || 'صيدلية بنين مازن'}</p>
            <p className="text-[11px] text-brand-200">نظام الإدارة - v2.3</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={handleCloseShift} 
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
              shiftId 
                ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30' 
                : 'bg-emerald-500/20 text-emerald-200'
            }`}
          >
            {shiftId ? 'إغلاق الشفت' : 'شفت مغلق'}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">{username?.charAt(0)}</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{username}</p>
              <p className="text-[11px] text-brand-200">{role}</p>
            </div>
          </div>
          <button onClick={() => logout()} className="p-2 text-red-300 hover:bg-red-500/20 rounded-lg">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ===== المحتوى الرئيسي ===== */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'dashboard' ? (
          /* ===== الصفحة الرئيسية المحسّنة ===== */
          <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-brand-50/30 to-slate-50">
            <div className="max-w-6xl mx-auto px-6 py-6">

              {/* ===== ترحيب + تاريخ ===== */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">أهلاً، {username} 👋</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    {new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${shiftId ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                  {shiftId ? '✓ الشفت مفتوح' : '⚠ الشفت مغلق'}
                </div>
              </div>

              {/* ===== قسم العمليات ===== */}
              <div className="mb-6">
                <h2 className="text-sm font-bold text-slate-600 mb-3 px-1">العمليات</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {navItems.filter(item => (!item.permission || hasPermission(role || 'cashier', item.permission)) && item.group === 'العمليات').map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        onClick={() => setActiveTab(item.key)}
                        className="nav-tile h-40 p-4"
                      >
                        <div className="nav-tile-icon bg-brand-50 text-brand-700 w-16 h-16">
                          <Icon className="w-8 h-8" />
                        </div>
                        <p className="nav-tile-label text-base">{item.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ===== قسم الإدارة ===== */}
              <div className="mb-6">
                <h2 className="text-sm font-bold text-slate-600 mb-3 px-1">الإدارة</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {navItems.filter(item => (!item.permission || hasPermission(role || 'cashier', item.permission)) && item.group === 'الإدارة').map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        onClick={() => setActiveTab(item.key)}
                        className="nav-tile h-40 p-4"
                      >
                        <div className="nav-tile-icon bg-emerald-50 text-emerald-700 w-16 h-16">
                          <Icon className="w-8 h-8" />
                        </div>
                        <p className="nav-tile-label text-base">{item.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ===== قسم النظام ===== */}
              <div className="mb-6">
                <h2 className="text-sm font-bold text-slate-600 mb-3 px-1">النظام</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {navItems.filter(item => (!item.permission || hasPermission(role || 'cashier', item.permission)) && item.group === 'النظام').map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        onClick={() => setActiveTab(item.key)}
                        className="nav-tile h-40 p-4"
                      >
                        <div className="nav-tile-icon bg-amber-50 text-amber-700 w-16 h-16">
                          <Icon className="w-8 h-8" />
                        </div>
                        <p className="nav-tile-label text-base">{item.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ===== الإحصائيات السريعة (في الأسفل) ===== */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8 pt-6 border-t border-slate-200">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">مبيعات اليوم</p>
                    <p className="text-lg font-bold text-slate-800 tabular">{useAccountingStore.getState().totalSales.toLocaleString('en-US')} د.ع</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">الأصناف في المخزون</p>
                    <p className="text-lg font-bold text-slate-800 tabular">{useInventoryStore.getState().medicines.filter(m => !m.isDeleted).length} صنف</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">قاعدة الأدوية العالمية</p>
                    <p className="text-lg font-bold text-slate-800 tabular">9,375 دواء</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">تفاعلات دوائية</p>
                    <p className="text-lg font-bold text-slate-800 tabular">1,051 تفاعل</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ===== صفحة القسم المختار ===== */
          <div className="h-full overflow-hidden">
            <main className="h-full overflow-auto print:overflow-visible">
              {activeTab === 'pos' && <PosDashboard />}
              {activeTab === 'refund' && <RefundDashboard />}
              {activeTab === 'inventory' && <InventoryDashboard />}
              {hasPermission(role || 'cashier', 'accounting.view' as Permission) && activeTab === 'accounting' && <AccountingDashboard />}
              {hasPermission(role || 'cashier', 'accounting.debts' as Permission) && activeTab === 'debts' && <DebtsDashboard />}
              {hasPermission(role || 'cashier', 'accounting.suppliers' as Permission) && activeTab === 'suppliers' && <SuppliersDashboard />}
              {hasPermission(role || 'cashier', 'accounting.suppliers' as Permission) && activeTab === 'quick_purchase' && <QuickPurchaseDashboard />}
              {hasPermission(role || 'cashier', 'system.patients' as Permission) && activeTab === 'patients' && <PatientsDashboard />}
              {hasPermission(role || 'cashier', 'reports.view' as Permission) && activeTab === 'reporting' && <ReportingDashboard />}
              {hasPermission(role || 'cashier', 'reports.view' as Permission) && activeTab === 'invoices' && <InvoicesDashboard />}
              {hasPermission(role || 'cashier', 'system.audit' as Permission) && activeTab === 'audit' && <AuditDashboard />}
              {hasPermission(role || 'cashier', 'system.backup' as Permission) && activeTab === 'backup' && <BackupDashboard />}
              {hasPermission(role || 'cashier', 'system.users' as Permission) && activeTab === 'users' && <UserManagementDashboard />}
              {hasPermission(role || 'cashier', 'system.settings' as Permission) && activeTab === 'settings' && <SettingsDashboard />}
              {activeTab === 'stock_count' && <StockCountDashboard />}
              {activeTab === 'prescriptions' && <PrescriptionsDashboard />}
              {activeTab === 'cash_drawer' && <CashDrawerDashboard />}
              {activeTab === 'import' && <ImportDashboard />}
              {activeTab === 'label_printing' && <LabelPrintingDashboard />}
              {activeTab === 'enterprise' && <EnterpriseDashboard />}
            </main>
          </div>
        )}
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

// ========================================
// Payment Modal - نافذة الدفع (دينار عراقي فقط)
// ========================================
function PaymentModal({ 
  total, paymentMethods, selectedMethod, setSelectedMethod,
  paidAmount, setPaidAmount,
  mixedCash, setMixedCash, mixedCard, setMixedCard,
  chequeNumber, setChequeNumber, customerName, setCustomerName, onConfirm, onClose 
}: any) {
  const totalDisplay = total;
  const totalLabel = 'د.ع';

  const paidNum = parseFloat(paidAmount) || 0;
  const change = paidNum - totalDisplay;

  const mixedCashNum = parseFloat(mixedCash) || 0;
  const mixedCardNum = parseFloat(mixedCard) || 0;
  const mixedTotal = mixedCashNum + mixedCardNum;
  const mixedComplete = Math.abs(mixedTotal - totalDisplay) < 0.01;

  const methodLabels: any = {
    cash: 'نقدي', card: 'بطاقة (مدى/Visa)', cheque: 'شيك', 
    transfer: 'تحويل بنكي', credit: 'آجل', mixed: 'دفع مقسّم'
  };

  const methodIcons: any = {
    cash: '💵', card: '💳', cheque: '📝', transfer: '🏦', credit: '⏰', mixed: '🔀'
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white p-7 rounded-3xl shadow-2xl w-[480px] animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-bold text-slate-800">إتمام الدفع</h3>
          <button onClick={onClose} className="btn-icon"><X className="w-5 h-5" /></button>
        </div>

        {/* الإجمالي */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-700 text-white p-5 rounded-2xl mb-5 text-center">
          <p className="text-xs opacity-80">الإجمالي المستحق</p>
          <p className="text-4xl font-bold tabular mt-1">{totalDisplay.toFixed(2)} <span className="text-lg font-normal">{totalLabel}</span></p>
        </div>

        {/* اختيار طريقة الدفع */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {paymentMethods.map((m: any) => (
            <button key={m.id} onClick={() => setSelectedMethod(m.name)} className={`p-3 rounded-xl text-xs font-semibold transition-all border-2 ${selectedMethod === m.name ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>
              <span className="text-lg block mb-1">{methodIcons[m.name] || '💰'}</span>
              {methodLabels[m.name] || m.displayName}
            </button>
          ))}
        </div>

        {/* حقول الدفع حسب الطريقة */}
        {selectedMethod === 'cash' && (
          <div className="mb-4">
            <label className="label-lg">المبلغ المدفوع ({totalLabel})</label>
            <input type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} className="input-lg text-2xl font-bold text-center tabular" placeholder="0.00" autoFocus />
            {paidNum > 0 && (
              <div className={`mt-2 p-3 rounded-xl text-center ${change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {change >= 0 ? `الباقي للزبون: ${change.toFixed(2)} ${totalLabel}` : `المتبقي: ${Math.abs(change).toFixed(2)} ${totalLabel}`}
              </div>
            )}
          </div>
        )}

        {selectedMethod === 'card' && (
          <div className="mb-4 p-4 rounded-xl bg-brand-50 text-center">
            <p className="text-sm font-semibold text-brand-700">سيتم دفع {totalDisplay.toFixed(2)} {totalLabel} عبر بطاقة المدى/Visa</p>
            <p className="text-xs text-slate-400 mt-1">سيتم تأكيد الدفع عبر جهاز POS</p>
          </div>
        )}

        {selectedMethod === 'cheque' && (
          <div className="mb-4">
            <label className="label-lg">رقم الشيك</label>
            <input type="text" value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} className="input tabular" placeholder="123456" />
            <p className="text-xs text-amber-600 mt-2">⚠️ سيتم تسجيل الشيك كمستحق حتى تحصيله</p>
          </div>
        )}

        {selectedMethod === 'transfer' && (
          <div className="mb-4 p-4 rounded-xl bg-brand-50 text-center">
            <p className="text-sm font-semibold text-brand-700">تحويل بنكي بقيمة {totalDisplay.toFixed(2)} {totalLabel}</p>
          </div>
        )}

        {selectedMethod === 'credit' && (
          <div className="mb-4">
            <label className="label-lg">اسم الزبون *</label>
            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="input" placeholder="اسم الزبون" autoFocus />
            <p className="text-xs text-amber-600 mt-2">⚠️ سيتم تسجيل المبلغ كدين على الزبون في قسم الديون</p>
          </div>
        )}

        {selectedMethod === 'mixed' && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label-lg">نقدي ({totalLabel})</label>
              <input type="number" value={mixedCash} onChange={e => setMixedCash(e.target.value)} className="input-lg text-center font-bold tabular" placeholder="0.00" />
            </div>
            <div>
              <label className="label-lg">بطاقة ({totalLabel})</label>
              <input type="number" value={mixedCard} onChange={e => setMixedCard(e.target.value)} className="input-lg text-center font-bold tabular" placeholder="0.00" />
            </div>
            <div className="col-span-2 p-2 rounded-xl text-center text-sm font-semibold">
              الإجمالي: {mixedTotal.toFixed(2)} / {totalDisplay.toFixed(2)} {totalLabel}
              {mixedComplete && <span className="text-emerald-600 mr-2">✓ مكتمل</span>}
            </div>
          </div>
        )}

        {/* زر التأكيد */}
        <button
          onClick={onConfirm}
          disabled={selectedMethod === 'credit' && !customerName.trim()}
          className="btn-primary w-full py-4 text-base shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Calculator className="w-5 h-5" />
          تأكيد الدفع + طباعة
        </button>
        {selectedMethod === 'credit' && !customerName.trim() && (
          <p className="text-xs text-rose-600 text-center mt-2">⚠️ أدخل اسم الزبون لتفعيل الزر</p>
        )}
      </div>
    </div>
  );
}

export default App;

// ===== Daily Checks Modal render =====
// ملاحظة: showDailyChecks يُدار في كل من PosDashboard و App بشكل منفصل
// النافذة تظهر في PosDashboard عند بدء التشغيل
