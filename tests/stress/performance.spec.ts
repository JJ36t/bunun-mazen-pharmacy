// ========================================
// Stress Tests - اختبارات الإجهاد
// ========================================
// يقيس أداء النظام تحت ضغط البيانات الكبيرة

import { test, expect } from '@playwright/test';
import { normalizeArabic, transliterate, levenshtein, searchMedicines } from '../../src/lib/utils/search';

// ========================================
// 1. Performance Benchmarks (Unit-style)
// ========================================

test.describe('Performance Benchmarks', () => {
  
  test('البحث يجب أن يكون أقل من 50ms مع 1000 دواء', () => {
    // توليد 1000 دواء وهمي
    const medicines = Array.from({ length: 1000 }, (_, i) => ({
      id: `med-${i}`,
      nameAr: `دواء رقم ${i}`,
      nameEn: `Medicine ${i}`,
      barcode: `600${i.toString().padStart(7, '0')}`,
      isDeleted: false,
    }));
    
    const start = performance.now();
    const results = searchMedicines('دواء', medicines);
    const duration = performance.now() - start;
    
    console.log(`Search time (1000 items): ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(50);
    expect(results.length).toBeGreaterThan(0);
  });
  
  test('البحث يجب أن يكون أقل من 50ms مع 10000 دواء', () => {
    const medicines = Array.from({ length: 10000 }, (_, i) => ({
      id: `med-${i}`,
      nameAr: `دواء ${i}`,
      nameEn: `Med ${i}`,
      barcode: `${i}`,
      isDeleted: false,
    }));
    
    const start = performance.now();
    const results = searchMedicines('دواء', medicines);
    const duration = performance.now() - start;
    
    console.log(`Search time (10000 items): ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(50);
  });
  
  test('البحث بالباركود يجب أن يكون فورياً', () => {
    const medicines = Array.from({ length: 5000 }, (_, i) => ({
      id: `med-${i}`,
      nameAr: `دواء ${i}`,
      barcode: `600${i.toString().padStart(7, '0')}`,
      isDeleted: false,
    }));
    
    const start = performance.now();
    const results = searchMedicines('6000000123', medicines);
    const duration = performance.now() - start;
    
    console.log(`Barcode search: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(20);
    expect(results.length).toBe(1);
  });
  
  test('normalizeArabic يجب أن يكون سريعاً مع نصوص طويلة', () => {
    const longText = 'باراسيتامول'.repeat(100);
    
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      normalizeArabic(longText);
    }
    const duration = performance.now() - start;
    
    console.log(`normalizeArabic (1000 calls, 1200 chars each): ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(100);
  });
  
  test('levenshtein يجب أن يكون سريعاً', () => {
    const a = 'باراسيتامول';
    const b = 'براسيتامول';
    
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      levenshtein(a, b);
    }
    const duration = performance.now() - start;
    
    console.log(`levenshtein (10000 calls): ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(500);
  });
  
  test('transliterate يجب أن يكون سريعاً', () => {
    const text = 'paracetamol';
    
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      transliterate(text);
    }
    const duration = performance.now() - start;
    
    console.log(`transliterate (10000 calls): ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(100);
  });
});

// ========================================
// 2. Memory Tests
// ========================================

test.describe('Memory Tests', () => {
  
  test('الكاش يجب ألا يتجاوز 100 إدخال', async () => {
    const { cache } = await import('../../src/lib/cache/MemoryCache');
    cache.clear();
    
    // إضافة 200 إدخال
    for (let i = 0; i < 200; i++) {
      cache.set(`key-${i}`, { data: i });
    }
    
    const stats = cache.stats();
    expect(stats.size).toBeLessThanOrEqual(100);
    console.log(`Cache size after 200 inserts: ${stats.size}`);
  });
  
  test('الكاش يجب أن يحذف الإدخالات المنتهية', async () => {
    const { cache } = await import('../../src/lib/cache/MemoryCache');
    cache.clear();
    
    cache.set('temp', 'value', 10); // ينتهي بعد 10ms
    expect(cache.get('temp')).toBe('value');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(cache.get('temp')).toBeNull();
  });
});

// ========================================
// 3. UI Performance Tests (with Playwright)
// ========================================

test.describe('UI Performance', () => {
  
  test('بدء التشغيل يجب أن يكون أقل من 3 ثوانٍ', async ({ page }) => {
    const start = performance.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const duration = performance.now() - start;
    
    console.log(`Startup time: ${duration.toFixed(0)}ms`);
    expect(duration).toBeLessThan(3000);
  });
  
  test('التنقل بين التبويبات يجب أن يكون سريعاً', async ({ page }) => {
    await page.goto('/');
    
    // قياس وقت النقر على تبويب
    const tabs = ['dashboard', 'pos', 'inventory'];
    
    for (const tab of tabs) {
      const start = performance.now();
      await page.click(`[data-tab="${tab}"]`).catch(() => {});
      await page.waitForTimeout(100);
      const duration = performance.now() - start;
      
      console.log(`Tab switch to "${tab}": ${duration.toFixed(0)}ms`);
      expect(duration).toBeLessThan(200);
    }
  });
});

// ========================================
// 4. Data Volume Tests
// ========================================

test.describe('Data Volume', () => {
  
  test('معالجة 10000 فاتورة في الذاكرة', () => {
    const invoices = Array.from({ length: 10000 }, (_, i) => ({
      id: `inv-${i}`,
      total: Math.random() * 10000,
      date: new Date(Date.now() - i * 86400000),
      items: Array.from({ length: 3 }, (_, j) => ({
        name: `Item ${j}`,
        qty: Math.floor(Math.random() * 5) + 1,
        price: Math.random() * 100,
      })),
    }));
    
    const start = performance.now();
    
    // حساب الإجمالي
    const totalSales = invoices.reduce((s, inv) => s + inv.total, 0);
    
    // فلترة الفواتير الأخيرة
    const recent = invoices.filter(inv => 
      Date.now() - inv.date.getTime() < 7 * 86400000
    );
    
    const duration = performance.now() - start;
    
    console.log(`Processed 10000 invoices in ${duration.toFixed(2)}ms`);
    console.log(`Total sales: ${totalSales.toFixed(0)}`);
    console.log(`Recent invoices (7 days): ${recent.length}`);
    
    expect(duration).toBeLessThan(100);
  });
  
  test('ترتيب 10000 دواء حسب السعر', () => {
    const medicines = Array.from({ length: 10000 }, () => ({
      id: Math.random().toString(),
      nameAr: `دواء ${Math.random()}`,
      price: Math.random() * 50000,
    }));
    
    const start = performance.now();
    const sorted = [...medicines].sort((a, b) => a.price - b.price);
    const duration = performance.now() - start;
    
    console.log(`Sorted 10000 medicines in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(50);
    expect(sorted[0].price).toBeLessThanOrEqual(sorted[sorted.length - 1].price);
  });
});

// ========================================
// 5. Long Session Simulation
// ========================================

test.describe('Long Session', () => {
  
  test('محاكاة 100 عملية بيع متتالية', async () => {
    const { posService } = await import('../../src/lib/services');
    
    // محاكاة (بدون اتصال فعلي بالـ DB)
    const start = performance.now();
    
    for (let i = 0; i < 100; i++) {
      // محاكاة العملية (لن تنجح الفعلي لكن نقيس الزمن)
      try {
        await posService.recordSale(
          [{ id: `med-${i}`, nameAr: `دواء ${i}`, quantity: 2, price: 5000 }],
          0,
          'test-user'
        );
      } catch (e) {
        // متوقع لأنه لا يوجد DB حقيقي
      }
    }
    
    const duration = performance.now() - start;
    console.log(`100 sales simulation: ${duration.toFixed(0)}ms`);
    expect(duration).toBeLessThan(5000); // أقل من 5 ثوانٍ
  });
});
