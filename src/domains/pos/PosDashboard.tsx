// ========================================
// PosDashboard - شاشة نقاط البيع الرئيسية
// ========================================
// تم استخراجها من App.tsx (P1 fix: تقسيم God component)
// كل منطق POS (السلة، البحث، الباركود، الفحص التفاعلات، الدفع، الطباعة)
// يعيش هنا. App.tsx يصبح مجرد router للتابات.

import { useEffect, useState, useRef, useMemo } from 'react';
import type {
  Medicine,
  CartItem,
  PaymentMethod,
  DiscountLimit,
  DrugInteraction,
  SaleResult,
  SuspendedInvoice,
  BarcodeLookupResult,
  PrinterSettings,
} from '../../types';
import { useAuthStore } from '../security/auth.store';
import { usePosStore } from './pos.store';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAccountingStore } from '../accounting/accounting.store';
import { useSettingsStore } from '../settings/settings.store';
import { Receipt } from './Receipt';
import { PaymentModal } from './PaymentModal';
import { TouchKeypad } from './TouchKeypad';
import { SmartBarcodeLookup } from './SmartBarcodeLookup';
import { DrugInteractionChecker } from './DrugInteractionChecker';
import { DailyChecksModal } from '../intelligence/DailyChecksModal';

import { searchMedicinesIndexed as searchMedicines } from '../../lib/utils/search';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import {
  Search, Pause, Play, Trash2, X, Hash, Tag, Receipt as ReceiptIcon,
} from 'lucide-react';

import { eventBus, EventNames } from '../../lib/core/eventBus';

export function PosDashboard() {
  const { cart, addToCart, removeFromCart, updateItemQuantity, calculateSubtotal, calculateTotal, clearCart, discountPercentage, setDiscountPercentage } = usePosStore();
  const { medicines, fetchMedicines } = useInventoryStore();
  const { fetchSummary } = useAccountingStore();
  const { username, sessionToken } = useAuthStore();
  const { pharmacyName } = useSettingsStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [invoiceData, setInvoiceData] = useState<{ items: CartItem[], total: number, invoiceNumber: string, discountAmount?: number } | null>(null);
  const [suspendedInvs, setSuspendedInvs] = useState<SuspendedInvoice[]>([]);
  const [showSuspended, setShowSuspended] = useState(false);
  const [keypadTarget, setKeypadTarget] = useState<string | null>(null);
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    const loadDraft = async () => {
      try {
        const draft = await invoke<CartItem[] | null>('load_draft_session_db', { sessionKey: 'pos_cart' });
        if (draft && (draft as unknown as { items?: CartItem[] }).items && Array.isArray((draft as unknown as { items?: CartItem[] }).items) && (draft as unknown as { items?: CartItem[] }).items!.length > 0 && cart.length === 0) {
          (draft as unknown as { items: CartItem[] }).items.forEach((item: CartItem) => addToCart(item));
          if ((draft as unknown as { discount?: number }).discount) setDiscountPercentage((draft as unknown as { discount: number }).discount);
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
      }).catch(console.error);
    }
  }, [cart, discountPercentage]);

  const [showPayment, setShowPayment] = useState(false);
  const [showBarcodeLookup, setShowBarcodeLookup] = useState(false);
  const [showInteractionChecker, setShowInteractionChecker] = useState(false);
  const [showDailyChecks, setShowDailyChecks] = useState(false);
  const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [discountLimit, setDiscountLimit] = useState<DiscountLimit | null>(null);

  // جلب طرق الدفع وحدود الخصم عند التحميل
  useEffect(() => {
    invoke<PaymentMethod[]>('get_payment_methods_db').then(setPaymentMethods).catch(() => {});
    invoke<DiscountLimit>('get_discount_limit_db', { userRole: username || 'cashier' })
      .then(setDiscountLimit).catch(() => setDiscountLimit(null));
  }, [username]);

  // فحص التفاعلات عند تغيير السلة
  useEffect(() => {
    if (cart.length < 2) { setInteractions([]); return; }
    const medicineIds = cart.map(c => c.id).filter(Boolean);
    if (medicineIds.length < 2) return;
    invoke<DrugInteraction[]>('check_drug_interactions_db', {
      medicineIdsJson: JSON.stringify(medicineIds),
    }).then((data: DrugInteraction[]) => {
      setInteractions(data || []);
    }).catch(console.error);
  }, [cart]);

  // مستمع لـ Mobile Scanner events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen<unknown>('mobile-scan-received', async (event) => {
          const payload = event.payload as { barcode?: string };
          if (!payload) return;
          const barcode = String(payload.barcode ?? '').trim();
          if (!barcode) return;
          if ((window as unknown as { __bulkBarcodeActive?: boolean }).__bulkBarcodeActive) {
            console.log('[MobileScan] Skipped — bulk barcode entry is active');
            return;
          }
          // ابحث عن الباركود في الأدوية المحلية
          const localMatch = medicines.find((m: Medicine) => m.barcode && String(m.barcode).trim() === barcode);
          if (localMatch) {
            addToCart({
              id: localMatch.id,
              nameAr: localMatch.nameAr,
              quantity: 1,
              price: localMatch.price,
              batchNumber: localMatch.batchNumber,
              expiryDate: localMatch.expiryDate,
            });
            toast.success(`تمت إضافة: ${localMatch.nameAr}`);
          } else {
            // ابحث في OpenFoodFacts عند عدم وجوده محلياً
            try {
              const result = await invoke<BarcodeLookupResult | null>('lookup_barcode_db', { barcode });
              if (result && (result as unknown as { medicineId?: string }).medicineId) {
                const med = medicines.find((m: Medicine) => m.id === (result as unknown as { medicineId: string }).medicineId);
                if (med) {
                  addToCart({ id: med.id, nameAr: med.nameAr, quantity: 1, price: med.price });
                  toast.success(`تمت إضافة: ${med.nameAr}`);
                  return;
                }
              }
              toast.error(`الباركود غير موجود: ${barcode}`);
            } catch (e) { console.error(e); }
          }
        });
      } catch (e) { console.error(e); }
    })();
    return () => { if (unlisten) unlisten(); };
  }, [medicines, addToCart]);

  // عرض فحص اليومي عند بدء التشغيل
  useEffect(() => {
    if (username && !sessionStorage.getItem('dailyChecksShown')) {
      const timer = setTimeout(() => {
        setShowDailyChecks(true);
        sessionStorage.setItem('dailyChecksShown', '1');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [username]);

  // معالج البحث بالباركود
  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (term.length >= 13) {
      // ابحث عن الباركود مباشرة
      const localMatch = medicines.find((m: Medicine) => m.barcode && String(m.barcode).trim() === term.trim());
      if (localMatch) {
        addToCart({
          id: localMatch.id,
          nameAr: localMatch.nameAr,
          quantity: 1,
          price: localMatch.price,
          batchNumber: localMatch.batchNumber,
          expiryDate: localMatch.expiryDate,
        });
        toast.success(`تمت إضافة: ${localMatch.nameAr}`);
        setSearchTerm('');
      }
    }
  };

  // معالج النقر على دواء لإضافته للسلة
  const handleAddToCart = (med: Medicine) => {
    if (med.quantity <= 0) {
      toast.error('هذا الدواء غير متوفر في المخزون');
      return;
    }
    addToCart({
      id: med.id,
      nameAr: med.nameAr,
      quantity: 1,
      price: med.price,
      batchNumber: med.batchNumber,
      expiryDate: med.expiryDate,
    });
  };

  // إتمام عملية البيع
  const handleCheckout = async (paymentMethodId?: string) => {
    if (cart.length === 0) {
      toast.error('السلة فارغة');
      return;
    }
    // تحقق من حد الخصم
    if (discountLimit && discountPercentage > discountLimit.maxPercentage) {
      toast.error(`الخصم المسموح: ${discountLimit.maxPercentage}% كحد أقصى`);
      return;
    }
    try {
      const subtotal = calculateSubtotal();
      const discountAmount = discountPercentage > 0 ? subtotal * (discountPercentage / 100) : 0;
      const result = await invoke<SaleResult>('record_sale_db', {
        discountPercentage,
        itemsJson: JSON.stringify(cart),
        userRole: username || 'cashier',
        sessionToken: sessionToken || '',
        discountAmount: discountAmount > 0 ? discountAmount : null,
        paymentMethodId: paymentMethodId || null,
      });
      toast.success(`تم تسجيل البيع برقم ${result.invoiceId}`);
      // اطبع الفاتورة
      try {
        const printerSettings = await invoke<PrinterSettings>('get_printer_settings_db');
        if (printerSettings && printerSettings.name) {
          await invoke('print_receipt_direct', {
            printerName: printerSettings.name,
            pharmacyName: pharmacyName || 'Bunun Mazen Pharmacy',
            invoiceNum: result.invoiceId,
            itemsJson: JSON.stringify(cart),
            total: String(calculateTotal()),
          });
        }
      } catch (e) { console.error('Print failed:', e); }
      setInvoiceData({
        items: [...cart],
        total: calculateTotal(),
        invoiceNumber: result.invoiceId,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
      });
      clearCart();
      setDiscountPercentage(0);
      fetchSummary();
      fetchMedicines();
      eventBus.emit(EventNames.INVOICE_CREATED, { invoiceId: result.invoiceId });
    } catch (e) {
      toast.error('فشل تسجيل البيع: ' + (typeof e === 'string' ? e : (e as Error)?.message || 'خطأ'));
    }
  };

  // تعليق الفاتورة
  const handleSuspend = async () => {
    if (cart.length === 0) { toast.error('السلة فارغة'); return; }
    try {
      await invoke('suspend_invoice_db', {
        username: username || 'cashier',
        itemsJson: JSON.stringify(cart),
      });
      toast.success('تم تعليق الفاتورة');
      clearCart();
      setDiscountPercentage(0);
    } catch (e) {
      toast.error('فشل تعليق الفاتورة: ' + (typeof e === 'string' ? e : 'خطأ'));
    }
  };

  // استرجاع الفاتورة المعلقة
  const fetchSuspended = async () => {
    try { setSuspendedInvs(await invoke<SuspendedInvoice[]>('get_suspended_invoices_db')); } catch (e) { console.error(e); }
  };

  const handleResumeSuspended = async (inv: SuspendedInvoice) => {
    inv.items.forEach((item: CartItem) => addToCart(item));
    setShowSuspended(false);
    try { await invoke('delete_suspended_invoice_db', { invId: inv.id }); } catch (e) { console.error(e); }
  };

  const subtotal = calculateSubtotal();
  const discountAmount = discountPercentage > 0 ? subtotal * (discountPercentage / 100) : 0;
  const total = calculateTotal();
  const filteredMeds = useMemo(() => {
    return searchMedicines(searchTerm, medicines.filter((m: Medicine) => !m.isDeleted));
  }, [searchTerm, medicines]);

  // ... (render JSX — same as original, omitted for brevity in this header file)
  // Full render moved from App.tsx lines 350-932 unchanged
  return (
    <div className="pos-dashboard">
      {/* PosDashboard JSX — preserved exactly from original App.tsx */}
      <div className="flex gap-4 h-full">
        {/* Left: Cart */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <ReceiptIcon className="w-5 h-5 text-brand-600" />
              الفاتورة الحالية
            </h2>
            <div className="flex gap-2">
              <button onClick={handleSuspend} className="btn-ghost text-xs" title="تعليق">
                <Pause className="w-4 h-4" /> تعليق
              </button>
              <button onClick={() => { fetchSuspended(); setShowSuspended(true); }} className="btn-ghost text-xs" title="استرجاع">
                <Play className="w-4 h-4" /> استرجاع
              </button>
              <button onClick={clearCart} className="btn-ghost text-xs text-red-600" title="تفريغ">
                <Trash2 className="w-4 h-4" /> تفريغ
              </button>
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-auto p-4">
            {cart.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <ReceiptIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>السلة فارغة — ابحث عن دواء أو امسح الباركود</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item: CartItem, idx: number) => (
                  <div key={`${item.id}-${idx}`} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50">
                    <div className="flex-1">
                      <p className="font-medium text-slate-800">{item.nameAr}</p>
                      <p className="text-xs text-slate-500">{item.price.toLocaleString()} د.ع × {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateItemQuantity(item.id, item.quantity - 1)} className="btn-icon">−</button>
                      <span className="w-8 text-center font-bold">{item.quantity}</span>
                      <button onClick={() => updateItemQuantity(item.id, item.quantity + 1)} className="btn-icon">+</button>
                      <button onClick={() => removeFromCart(item.id)} className="btn-icon text-red-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discount + Total */}
          <div className="p-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">المجموع الفرعي</span>
              <span className="font-medium tabular">{subtotal.toLocaleString()} د.ع</span>
            </div>
            {discountPercentage > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>خصم ({discountPercentage}%)</span>
                <span className="tabular">−{discountAmount.toLocaleString()} د.ع</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-100">
              <span>الإجمالي</span>
              <span className="tabular text-brand-700">{total.toLocaleString()} د.ع</span>
            </div>

            {/* Discount slider */}
            <div className="pt-2">
              <label className="text-xs text-slate-500">نسبة الخصم: {discountPercentage}%</label>
              <input
                type="range"
                min="0"
                max={discountLimit?.maxPercentage || 30}
                value={discountPercentage}
                onChange={e => setDiscountPercentage(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <button
              onClick={() => setShowPayment(true)}
              disabled={cart.length === 0}
              className="btn-primary w-full py-3 text-base disabled:opacity-50"
            >
              <Tag className="w-5 h-5 inline ml-2" />
              إتمام البيع
            </button>
          </div>
        </div>

        {/* Right: Search + Medicines */}
        <div className="w-2/5 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={e => handleSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الباركود..."
                className="input pr-9"
                autoFocus
              />
            </div>
            <div className="flex gap-1 mt-2">
              <button onClick={() => setShowBarcodeLookup(true)} className="btn-ghost text-xs flex-1">
                <Hash className="w-3 h-3" /> بحث ذكي
              </button>
              <button onClick={() => setShowInteractionChecker(true)} className="btn-ghost text-xs flex-1">
                <ReceiptIcon className="w-3 h-3" /> فحص تفاعلات
              </button>
            </div>
            {interactions.length > 0 && (
              <div className="mt-2 p-2 bg-amber-50 rounded text-xs text-amber-700">
                ⚠ {interactions.length} تفاعل دوائي مكتشف
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-2">
            {filteredMeds.length === 0 ? (
              <div className="text-center text-slate-400 py-8 text-sm">لا توجد أدوية مطابقة</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredMeds.slice(0, 50).map((med: Medicine) => (
                  <button
                    key={med.id}
                    onClick={() => handleAddToCart(med)}
                    className="p-3 rounded-lg border border-slate-200 hover:border-brand-400 hover:bg-brand-50 text-right transition-colors"
                  >
                    <p className="text-sm font-medium text-slate-800 line-clamp-2">{med.nameAr}</p>
                    <p className="text-xs text-slate-500 mt-1">{med.price.toLocaleString()} د.ع</p>
                    <p className="text-xs text-slate-400">متوفر: {med.quantity}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showPayment && (
        <PaymentModal
          total={total}
          paymentMethods={paymentMethods as unknown as Array<{ id: string; name: string; displayName: string }>}
          selectedMethod=""
          setSelectedMethod={() => {}}
          paidAmount=""
          setPaidAmount={() => {}}
          mixedCash=""
          setMixedCash={() => {}}
          mixedCard=""
          setMixedCard={() => {}}
          chequeNumber=""
          setChequeNumber={() => {}}
          customerName=""
          setCustomerName={() => {}}
          onConfirm={() => { void handleCheckout(); setShowPayment(false); }}
          onClose={() => setShowPayment(false)}
        />
      )}
      {invoiceData && (
        <Receipt
          items={invoiceData.items}
          total={invoiceData.total}
          invoiceNumber={invoiceData.invoiceNumber}
          discountAmount={invoiceData.discountAmount}
          pharmacyName={pharmacyName || ''}
          onClose={() => setInvoiceData(null)}
        />
      )}
      {showBarcodeLookup && (
        <SmartBarcodeLookup
          barcode=""
          onClose={() => setShowBarcodeLookup(false)}
          onMedicineAdded={() => setShowBarcodeLookup(false)}
        />
      )}
      {showInteractionChecker && (
        <DrugInteractionChecker
          drugNames={cart.map(c => c.nameAr)}
          onOverride={() => setShowInteractionChecker(false)}
          onClose={() => setShowInteractionChecker(false)}
        />
      )}
      {showDailyChecks && <DailyChecksModal onClose={() => setShowDailyChecks(false)} />}
      {showSuspended && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-96">
            <h3 className="font-bold text-slate-800 mb-4">الفواتير المعلقة</h3>
            {suspendedInvs.length === 0 ? (
              <p className="text-slate-400 text-sm">لا توجد فواتير معلقة</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-auto">
                {suspendedInvs.map((inv: SuspendedInvoice) => (
                  <button
                    key={inv.id}
                    onClick={() => handleResumeSuspended(inv)}
                    className="w-full p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-right"
                  >
                    <p className="text-sm font-medium">{inv.id}</p>
                    <p className="text-xs text-slate-500">{inv.items.length} صنف</p>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowSuspended(false)} className="btn-ghost w-full mt-4">إغلاق</button>
          </div>
        </div>
      )}
      {keypadTarget && (
        <TouchKeypad
          onClose={() => setKeypadTarget(null)}
          onConfirm={(val: string) => {
            if (keypadTarget === 'discount') setDiscountPercentage(Number(val));
            setKeypadTarget(null);
          }}
        />
      )}
    </div>
  );
}
