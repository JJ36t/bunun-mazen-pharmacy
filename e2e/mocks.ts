import { Page } from '@playwright/test';

export async function mockTauriCommands(page: Page) {
  // حقن كود المحاكاة قبل تحميل الصفحة
  await page.addInitScript(() => {
    // هيكل Tauri v2
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: any) => {
        console.log(`Mocked invoke: ${cmd}`, args);
        
        switch (cmd) {
          case 'check_license':
            return true;
          case 'login':
            // Phase 14 Fix: return sessionToken + userId (was missing — broke auth.store)
            return { username: 'admin', role: 'Super Admin', sessionToken: 'mock-session-token-123', userId: '00000000-0000-0000-0000-000000000001' };
          case 'get_medicines_db':
            return [
              { id: '1', nameAr: 'باراسيتامول', nameEn: 'Paracetamol', scientificName: 'Paracetamol', barcode: '123', price: 5.0, costPrice: 3.0, wholesalePrice: 4.0, quantity: 100, batchNumber: 'B1', expiryDate: '2026-12-31', isDeleted: false }
            ];
          case 'record_sale_db':
            return; 
          case 'get_available_printers':
            return ['MockPrinter_80mm'];
          case 'print_receipt_direct':
            return;
          case 'check_auto_backup':
            return false;
          case 'get_settings_db':
            return { pharmacy_name: 'صيدلية الاختبار', max_discount: '10' };
          case 'get_accounting_summary_db':
            return { totalSales: 0, totalProfits: 0, totalExpenses: 0, cashbox: 0, expenses: [] };
          case 'get_active_shift_db':
            return { id: 'shift-1', openingAmount: 0 }; // محاكاة وجود شفت مفتوح لمنع ظهور النافذة
          case 'get_users_db':
            return [];
          case 'get_customer_debts_db':
            return [];
          case 'get_suppliers_db':
            return [];
          case 'get_patients_db':
            return [];
          case 'get_audit_logs_db':
            return [];
          case 'get_top_medicines_db':
            return [];
          case 'get_dashboard_stats':
            return { todaySales: 0, todayInvoices: 0, lowStockCount: 0 };
          case 'get_weekly_sales_stats':
            return [];
          default:
            return [];
        }
      }
    };
    
    // توفير الـ API العام الذي تستدعيه مكتبة @tauri-apps/api
    window.__TAURI__ = {
      core: {
        invoke: (cmd: string, args?: any) => window.__TAURI_INTERNALS__?.invoke(cmd, args)
      },
      event: {
        // Phase 14 Fix: return proper UnlistenFn shape
        listen: () => Promise.resolve(() => {})
      }
    };
  });
}