// ========================================
// Shared Types — أنواع مشتركة بين الواجهة والـ backend
// ========================================

export interface Medicine {
  id: string;
  nameAr: string;
  nameEn: string;
  scientificName?: string;
  barcode: string;
  price: number;
  costPrice: number;
  quantity: number;
  batchNumber: string;
  expiryDate: string;
  isDeleted: boolean;
}

export interface CartItem {
  id: string;
  nameAr: string;
  quantity: number;
  price: number;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
}

export interface Invoice {
  id: string;
  totalAmount: number;
  profitAmount: number;
  discountAmount?: number;
  userRole: string;
  date: string;
  isReversed?: boolean;
  items: InvoiceItem[];
  dailyReceiptNumber?: number;
  printedBy?: string;
  printedAt?: string;
  refundReasonCode?: string;
  refundNotes?: string;
}

export interface InvoiceItem {
  name: string;
  qty: number;
  price: number;
}

export interface Patient {
  id: string;
  name: string;
  nationalId: string;
  phone: string;
  notes?: string;
  date: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  balance: number;
}

export interface Debt {
  id: string;
  customerName: string;
  amount: number;
  isPaid: boolean;
  note?: string;
  date: string;
  paidDate?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  category?: string;
}

export interface AccountingSummary {
  cashbox: number;
  totalSales: number;
  totalProfits: number;
  totalExpenses: number;
  totalDiscounts: number;
  expenses: Expense[];
}

export interface DashboardStats {
  todaySales: number;
  todayInvoices: number;
  lowStockCount: number;
}

export interface SalesReport {
  totalSales: number;
  totalProfits: number;
  totalDiscounts: number;
  invoiceCount: number;
}

export interface LoginResult {
  username: string;
  role: string;
  sessionToken: string;
  userId: string;
}

export interface SaleResult {
  invoiceId: string;
  replayed: boolean;
}

export interface User {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  lastLogin?: string;
}

export interface AuditLog {
  id: string;
  userRole: string;
  actionType: string;
  description: string;
  date: string;
}

export interface DiscountLimit {
  maxAmount: number;
  usedToday: number;
  remaining: number;
}

export interface AppError {
  kind: string;
  message: string;
}

export interface BackupResult {
  success: boolean;
  restored: Record<string, number>;
  message: string;
}

export interface WeeklySales {
  date: string;
  sales: number;
}

export interface TopMedicine {
  name: string;
  totalQty: number;
  totalRevenue: number;
}

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
}

export interface Permission {
  id: string;
  name: string;
  displayName: string;
  category: string;
}
