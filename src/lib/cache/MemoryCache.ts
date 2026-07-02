// ========================================
// In-Memory Cache - طبقة التخزين المؤقت
// ========================================
// لتقليل الاستعلامات المتكررة على قاعدة البيانات

interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
  lastAccessed: number;
}

class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly maxSize: number = 100;
  private readonly defaultTTL: number = 5 * 60 * 1000; // 5 دقائق

  /** تعيين قيمة في الكاش */
  set<T>(key: string, value: T, ttlMs?: number): void {
    // إذا تجاوز الحد الأقصى، احذف الأقدم وصولاً
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : Date.now() + this.defaultTTL,
      lastAccessed: Date.now(),
    });
  }

  /** الحصول على قيمة من الكاش */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // فحص الانتهاء
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    entry.lastAccessed = Date.now();
    return entry.value as T;
  }

  /** الحصول على قيمة أو حسابها */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  /** حذف مفتاح محدد */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /** حذف جميع المفاتيح التي تبدأ ببادئة معينة */
  deleteByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /** مسح الكاش بالكامل */
  clear(): void {
    this.cache.clear();
  }

  /** إحصائيات الكاش */
  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
  }

  /** إزالة الإدخال الأقدم وصولاً */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

// Singleton
export const cache = new MemoryCache();

// أسماء مفاتيح الكاش الموحدة
export const CacheKeys = {
  medicines: () => 'medicines:all',
  medicineById: (id: string) => `medicines:${id}`,
  medicineByBarcode: (barcode: string) => `medicines:barcode:${barcode}`,
  accountingSummary: () => 'accounting:summary',
  dashboardStats: () => 'dashboard:stats',
  weeklySales: () => 'dashboard:weekly',
  topMedicines: () => 'medicines:top',
  suppliers: () => 'suppliers:all',
  debts: () => 'debts:all',
  patients: () => 'patients:all',
  auditLogs: () => 'audit:recent',
  users: () => 'users:all',
  settings: () => 'settings:all',
  roles: () => 'roles:all',
  permissions: () => 'permissions:all',
};

// دوال مساعدة لإبطال الكاش
export const CacheInvalidator = {
  invalidateMedicines: () => {
    cache.deleteByPrefix('medicines:');
  },
  invalidateAccounting: () => {
    cache.delete(CacheKeys.accountingSummary());
    cache.delete(CacheKeys.dashboardStats());
    cache.delete(CacheKeys.weeklySales());
  },
  invalidateDashboard: () => {
    cache.delete(CacheKeys.dashboardStats());
    cache.delete(CacheKeys.weeklySales());
    cache.delete(CacheKeys.topMedicines());
  },
  invalidateSuppliers: () => {
    cache.delete(CacheKeys.suppliers());
  },
  invalidateDebts: () => {
    cache.delete(CacheKeys.debts());
  },
  invalidatePatients: () => {
    cache.delete(CacheKeys.patients());
  },
  invalidateUsers: () => {
    cache.delete(CacheKeys.users());
  },
  invalidateSettings: () => {
    cache.delete(CacheKeys.settings());
  },
  invalidateAll: () => {
    cache.clear();
  },
};
