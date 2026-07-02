import { test, expect } from '@playwright/test';
import { mockTauriCommands } from './mocks';

// زيادة المهلة الافتراضية لجميع الاختبارات
test.setTimeout(60000);

test.describe('Pharmacy POS Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await mockTauriCommands(page);
    // استخدام domcontentloaded بدلاً من load لتسريع الاختبار وتجنب التايم أوت
    await page.goto('http://localhost:1420', { waitUntil: 'domcontentloaded' });
  });

  test('Cashier can search, add to cart, and checkout', async ({ page }) => {
    // 1. تسجيل الدخول
    await page.fill('input[placeholder="admin"]', 'admin');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    
    // 2. الانتقال إلى تبويب نقاط البيع
    await page.click('button:has-text("نقاط البيع")');
    
    // 3. الانتظار حتى تفتح شاشة الـ POS
    await expect(page.locator('h3:has-text("الفاتورة الحالية")')).toBeVisible({ timeout: 15000 });
    
    // 4. البحث عن دواء
    await page.fill('input[placeholder*="ابحث أو امسح الباركود"]', 'باراسي');
    
    // 5. النقر على نتيجة البحث لإضافته للسلة
    await page.click('div:has-text("باراسيتامول")');
    
    // 6. التحقق من أنه أُضيف للسلة والإجمالي تحديث
    await expect(page.locator('text=باراسيتامول')).toBeVisible();
    await expect(page.locator('text=5.00')).toBeVisible();
    
    // 7. الضغط على إتمام البيع
    await page.click('button:has-text("إتمام البيع")');
    
    // 8. التحقق من ظهور نافذة الطباعة
    await expect(page.locator('h2:has-text("طباعة الفاتورة")')).toBeVisible({ timeout: 10000 });
    
    // 9. اختيار الطابعة المحاكاة والطباعة
    await page.selectOption('select', 'MockPrinter_80mm');
    await page.click('button:has-text("طباعة مباشرة")');
    
    // 10. التحقق من نجاح العملية وإغلاق النافذة
    await expect(page.locator('text=تم إرسال الفاتورة للطابعة بنجاح')).toBeVisible({ timeout: 5000 });
  });

  test('Inventory management loads correctly', async ({ page }) => {
    // تسجيل الدخول
    await page.fill('input[placeholder="admin"]', 'admin');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    
    // الذهاب لتبويب المخزون
    await page.click('button:has-text("المخزون")');
    
    // التحقق من أن جدول الأدوية ظهر ويحتوي على الباراسيتامول
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=باراسيتامول')).toBeVisible();
  });
});