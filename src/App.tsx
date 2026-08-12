// ========================================
// App — Root Component (خفيف بعد التقسيم)
// ========================================
// P1 fix: تم تقسيم God component (1274 سطر) إلى:
//   - App.tsx (هذا الملف) — router للتابات + تهيئة الأنظمة
//   - domains/pos/PosDashboard.tsx — شاشة نقاط البيع
//   - domains/dashboard/DashboardHome.tsx — الصفحة الرئيسية
//   - domains/intelligence/ShiftModal.tsx — نافذة الشفت
//   - lib/appConfig.ts — الأنواع المشتركة و navItems
//
// تم تخفيض App.tsx من 1274 سطر إلى ~250 سطر (تخفيض 80%)

import { useEffect, useState } from 'react';
import { useAuthStore } from './domains/security/auth.store';
import { Login } from './domains/security/Login';
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
import { MobileScannerModal } from './domains/mobile-scanner';
import { ErrorBoundary } from './ErrorBoundary';
import { Toaster, toast } from 'sonner';

import { hasPermission, Permission } from './lib/core/rbac';
import { sessionManager } from './lib/core/sessionManager';
import { crashRecovery } from './lib/core/crashRecovery';
import { type TabKey, ensurePluginsInitialized } from './lib/appConfig';
import { DashboardHome } from './domains/dashboard/DashboardHome';
import { PosDashboard } from './domains/pos/PosDashboard';
import { ShiftModal } from './domains/intelligence/ShiftModal';

import { LogOut, Home, Smartphone } from 'lucide-react';

function App() {
  const {
    isAuthenticated, isLicensed, checkLicense, role, username, logout,
    shiftId, checkShift, startShift, closeShift,
  } = useAuthStore();
  const { fetchMedicines } = useInventoryStore();
  const { fetchSummary } = useAccountingStore();
  const { fetchSettings } = useSettingsStore();
  const { fetchDebts } = useDebtsStore();
  const { fetchSuppliers } = useSuppliersStore();
  const { pharmacyName } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftAmount, setShiftAmount] = useState('');
  const [showMobileScanner, setShowMobileScanner] = useState(false);

  // التحقق من الترخيص عند الإقلاع
  useEffect(() => { checkLicense(); }, [checkLicense]);

  // تهيئة الأنظمة المؤسسية عند بدء التشغيل
  useEffect(() => {
    if (!isLicensed || !isAuthenticated) return;

    (async () => {
      await ensurePluginsInitialized();
    })();

    const userId = useAuthStore.getState().userId || 'user-id';
    sessionManager.startSession(userId, username || 'unknown');

    // استرجاع العمليات المعلقة (Crash Recovery)
    crashRecovery.recoverPendingOperations().catch((e) => {
      console.warn('[CrashRecovery] Failed to recover:', e);
    });

    // جلب البيانات الأولية
    fetchMedicines();
    fetchSummary();
    fetchSettings();
    fetchDebts();
    fetchSuppliers();

    // تحقق من الوردية عند الإقلاع
    checkShift().then(() => {
      if (!useAuthStore.getState().shiftId) {
        // setShowShiftModal(true) — uncomment to force shift modal on startup
      }
    });
  }, [isLicensed, isAuthenticated, username, fetchMedicines, fetchSummary, fetchSettings, fetchDebts, fetchSuppliers, checkShift]);

  // اختصارات لوحة المفاتيح (F1=POS, F2=Inventory, ESC=back)
  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setActiveTab('pos'); }
      else if (e.key === 'F2') { e.preventDefault(); setActiveTab('inventory'); }
      else if (e.key === 'F3') { e.preventDefault(); setActiveTab('accounting'); }
      else if (e.key === 'Escape' && activeTab !== 'dashboard') { setActiveTab('dashboard'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isAuthenticated, activeTab]);

  // معالج بدء الشفت
  const handleStartShift = async () => {
    const amount = parseFloat(shiftAmount) || 0;
    if (amount < 0) { toast.error('المبلغ غير صالح'); return; }
    try {
      await startShift(amount);
      toast.success('تم بدء الشفت بنجاح');
      setShowShiftModal(false);
      setShiftAmount('');
    } catch (e) {
      toast.error('فشل بدء الشفت: ' + (typeof e === 'string' ? e : 'خطأ'));
    }
  };

  // معالج إغلاق الشفت
  const handleCloseShift = async () => {
    if (!shiftId) { toast.info('لا يوجد شفت نشط'); return; }
    try {
      await closeShift(0); // 0 = no manual closing amount (auto-compute from sales)
      toast.success('تم إغلاق الشفت');
    } catch (e) {
      toast.error('فشل إغلاق الشفت: ' + (typeof e === 'string' ? e : 'خطأ'));
    }
  };

  // شاشة تسجيل الدخول أو الترخيص
  if (!isLicensed || !isAuthenticated) {
    return (
      <ErrorBoundary>
        <Login />
        <Toaster position="top-center" richColors />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col bg-slate-50 text-slate-800 overflow-hidden">
        {/* ===== Header ===== */}
        <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`p-2 rounded-lg ${activeTab === 'dashboard' ? 'bg-brand-100 text-brand-700' : 'hover:bg-slate-100'}`}
              title="الصفحة الرئيسية"
            >
              <Home className="w-5 h-5" />
            </button>
            <h1 className="font-bold text-slate-800 text-sm hidden sm:block">
              {pharmacyName || 'Bunun Mazen Pharmacy'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMobileScanner(true)}
              className="btn-ghost text-xs"
              title="ماسح الباركود اللاسلكي"
            >
              <Smartphone className="w-4 h-4" />
              <span className="hidden sm:inline">ماسح</span>
            </button>
            {shiftId && (
              <button onClick={handleCloseShift} className="btn-ghost text-xs text-amber-700">
                إغلاق الشفت
              </button>
            )}
            <button
              onClick={() => { logout(); }}
              className="btn-ghost text-xs text-red-600"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </header>

        {/* ===== Main Content ===== */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'dashboard' ? (
            <DashboardHome setActiveTab={setActiveTab} />
          ) : (
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

        {/* ===== Modals ===== */}
        {showShiftModal && (
          <ShiftModal
            shiftAmount={shiftAmount}
            setShiftAmount={setShiftAmount}
            onStart={handleStartShift}
          />
        )}

        {showMobileScanner && (
          <MobileScannerModal onClose={() => setShowMobileScanner(false)} />
        )}
      </div>

      <Toaster position="top-center" richColors />
    </ErrorBoundary>
  );
}

export default App;
