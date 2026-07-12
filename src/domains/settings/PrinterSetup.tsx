// ========================================
// Printer Setup Component
// ========================================
// إعدادات الطابعات: إيصالات + ملصقات + A4

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Printer, Receipt, Tag, FileText, Check, Loader, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'sonner';

export function PrinterSetupSection() {
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [printers, saved] = await Promise.all([
        invoke<string[]>('get_available_printers'),
        invoke<any>('get_printer_settings_db'),
      ]);
      setAvailablePrinters(printers || []);
      setSettings(saved || {});
    } catch (e: unknown) {
      toast.error('فشل تحميل إعدادات الطابعة: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke('save_printer_settings_db', {
        receiptPrinter: settings.receiptPrinter || null,
        labelsPrinter: settings.labelsPrinter || null,
        a4Printer: settings.a4Printer || null,
        receiptSize: settings.receiptSize || null,
      });
      toast.success('تم حفظ إعدادات الطابعة');
    } catch (e: unknown) {
      toast.error('فشل الحفظ: ' + e);
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrint = async (printerName: string) => {
    if (!printerName) {
      toast.error('اختر طابعة أولاً');
      return;
    }
    setTesting(printerName);
    try {
      await invoke('print_receipt_direct', {
        printerName,
        pharmacyName: 'صيدلية بنين مازن',
        invoiceNum: 'TEST-' + Date.now(),
        itemsJson: JSON.stringify([
          { nameAr: 'صفحة اختبار الطابعة', quantity: 1, price: 0 },
        ]),
        total: '0.00',
      });
      toast.success(`تم إرسال صفحة اختبار إلى: ${printerName}`);
    } catch (e: unknown) {
      toast.error(`فشل الاختبار: ${e}`);
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="card-elegant p-8 text-center">
        <Loader className="w-6 h-6 text-brand-600 mx-auto animate-spin" />
        <p className="text-sm text-slate-500 mt-2">جاري تحميل الطابعات...</p>
      </div>
    );
  }

  return (
    <div className="card-elegant p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
          <SettingsIcon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800">إعدادات الطابعات</h3>
          <p className="text-xs text-slate-500">اختر الطابعة المناسبة لكل نوع طباعة</p>
        </div>
      </div>

      {availablePrinters.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-sm text-amber-700">لا توجد طابعات متصلة بالكمبيوتر</p>
          <p className="text-xs text-amber-600 mt-1">أوصل طابعة وأعد تشغيل التطبيق</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* طابعة الإيصالات */}
          <PrinterRow
            label="طابعة الإيصالات الحرارية"
            icon={Receipt}
            iconColor="text-brand-600"
            iconBg="bg-brand-50"
            value={settings.receiptPrinter || ''}
            onChange={(v: string) => setSettings({ ...settings, receiptPrinter: v })}
            printers={availablePrinters}
            onTest={() => handleTestPrint(settings.receiptPrinter || '')}
            testing={testing === settings.receiptPrinter}
          />

          {/* حجم ورق الإيصال */}
          <div className="flex items-center gap-3 pl-12">
            <label className="text-sm text-slate-600 w-32">حجم ورق الإيصال:</label>
            <select
              value={settings.receiptSize || '80mm'}
              onChange={(e) => setSettings({ ...settings, receiptSize: e.target.value })}
              className="input flex-1"
            >
              <option value="80mm">80mm (الأكثر شيوعاً)</option>
              <option value="58mm">58mm (صغيرة)</option>
            </select>
          </div>

          {/* طابعة الملصقات */}
          <PrinterRow
            label="طابعة ملصقات الباركود"
            icon={Tag}
            iconColor="text-purple-600"
            iconBg="bg-purple-50"
            value={settings.labelsPrinter || ''}
            onChange={(v: string) => setSettings({ ...settings, labelsPrinter: v })}
            printers={availablePrinters}
            onTest={() => handleTestPrint(settings.labelsPrinter || '')}
            testing={testing === settings.labelsPrinter}
          />

          {/* طابعة A4 */}
          <PrinterRow
            label="طابعة A4 (للتقارير)"
            icon={FileText}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
            value={settings.a4Printer || ''}
            onChange={(v: string) => setSettings({ ...settings, a4Printer: v })}
            printers={availablePrinters}
            onTest={() => handleTestPrint(settings.a4Printer || '')}
            testing={testing === settings.a4Printer}
          />

          {/* زر الحفظ */}
          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary w-full py-3 disabled:opacity-50"
            >
              {saving ? <Loader className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              حفظ إعدادات الطابعات
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// صف طابعة واحد
function PrinterRow({ label, icon: Icon, iconColor, iconBg, value, onChange, printers, onTest, testing }: unknown) {
  // type any is acceptable for this simple internal component
  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <label className="text-sm font-medium text-slate-700 block mb-1">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input"
        >
          <option value="">— غير محدد —</option>
          {printers.map((p: string) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <button
        onClick={onTest}
        disabled={!value || testing}
        className="btn-ghost border border-slate-200 px-4 py-2 mt-5 disabled:opacity-40"
        title="اختبار الطابعة"
      >
        {testing ? <Loader className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        اختبار
      </button>
    </div>
  );
}
