import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../settings/settings.store';
import { Printer, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface CartItem { id: string; nameAr: string; quantity: number; price: number; }
interface ReceiptProps { invoiceNumber: string; items: CartItem[]; total: number; discountAmount?: number; onClose: () => void; }

export function Receipt({ invoiceNumber, items, total, discountAmount, onClose }: ReceiptProps) {
  const { pharmacyName, phone, address } = useSettingsStore();
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');

  useEffect(() => {
    invoke<string[]>('get_available_printers').then(setPrinters).catch(console.error);
  }, []);

  const handleDirectPrint = async () => {
    if (!selectedPrinter) {
      toast.error("يرجى اختيار الطابعة الحرارية أولاً.");
      return;
    }
    try {
      await invoke('print_receipt_direct', {
        printerName: selectedPrinter,
        pharmacyName,
        invoiceNum: invoiceNumber,
        itemsJson: JSON.stringify(items),
        total: total.toFixed(2)
      });
      toast.success("تم إرسال الفاتورة للطابعة بنجاح.");
      onClose();
    } catch (e: unknown) {
      toast.error("فشل الاتصال بالطابعة: " + e);
    }
  };

  const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const now = new Date();

  return (
    <div dir="rtl" className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white p-7 rounded-3xl shadow-2xl w-[440px] text-center animate-scale-in">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center"><Printer className="w-4.5 h-4.5 text-brand-700" /></div>
            طباعة الفاتورة
          </h2>
          <button onClick={onClose} className="btn-icon"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl mb-5 flex items-center justify-center gap-2 border border-emerald-200">
          <CheckCircle className="w-5 h-5" />
          <span className="font-semibold">تم تسجيل البيع بنجاح</span>
        </div>

        {/* معاينة الفاتورة */}
        <div id="receipt-print-area" className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-4 mb-5 text-right" dir="rtl">
          {/* رأس الفاتورة */}
          <div className="text-center border-b-2 border-slate-200 pb-3 mb-3">
            <div className="flex justify-center mb-2">
              <img src="/logo.png" alt="شعار" className="w-16 h-16 object-contain" />
            </div>
            <p className="text-lg font-bold text-slate-800">{pharmacyName}</p>
            {phone && <p className="text-xs text-slate-500 tabular">هاتف: {phone}</p>}
            {address && <p className="text-xs text-slate-500">{address}</p>}
          </div>

          {/* معلومات الفاتورة */}
          <div className="space-y-1 mb-3 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">رقم الفاتورة:</span>
              <span className="font-mono font-bold text-slate-700">{invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">التاريخ:</span>
              <span className="text-slate-700 tabular">{now.toLocaleDateString('en-GB')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">الوقت:</span>
              <span className="text-slate-700 tabular">{now.toLocaleTimeString('en-GB')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">عدد الأصناف:</span>
              <span className="text-slate-700 tabular">{itemCount} قطعة</span>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-300 pt-2 mb-2">
            <div className="flex justify-between text-[10px] font-bold text-slate-500 pb-2">
              <span>الصنف</span>
              <span>الكمية × السعر = الإجمالي</span>
            </div>
            {items.map(i => (
              <div key={i.id} className="flex justify-between text-xs py-1 border-b border-slate-50">
                <span className="text-slate-700 font-medium">{i.nameAr}</span>
                <span className="text-slate-600 tabular">
                  {i.quantity} × {i.price.toFixed(2)} = <span className="font-bold">{(i.price * i.quantity).toFixed(2)}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="border-t-2 border-slate-200 pt-2 mt-2">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-500">المجموع الفرعي:</span>
              <span className="text-slate-700 tabular">{subtotal.toFixed(2)} د.ع</span>
            </div>
            {discountAmount && discountAmount > 0 && (
              <div className="flex justify-between text-sm mb-1 text-rose-600">
                <span>الخصم:</span>
                <span className="tabular">-{discountAmount.toFixed(2)} د.ع</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold">
              <span className="text-slate-800">الإجمالي:</span>
              <span className="text-brand-700 tabular">{total.toFixed(2)} د.ع</span>
            </div>
          </div>

          <div className="text-center mt-4 pt-3 border-t border-dashed border-slate-300">
            <p className="text-xs text-slate-500">شكراً لزيارتكم</p>
            <p className="text-[10px] text-slate-400 mt-1">{pharmacyName} - نظام الإدارة</p>
          </div>
        </div>

        <div className="text-right mb-5">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">اختر الطابعة الحرارية</label>
          <select value={selectedPrinter} onChange={(e) => setSelectedPrinter(e.target.value)} className="input">
            <option value="">-- اختر طابعة --</option>
            {printers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <button onClick={handleDirectPrint} className="btn-primary w-full py-3.5 text-base shadow-elegant">
          <Printer className="w-5 h-5" /> طباعة مباشرة
        </button>
      </div>
    </div>
  );
}
