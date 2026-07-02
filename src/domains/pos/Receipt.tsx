import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../settings/settings.store';
import { Printer, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface CartItem { id: string; nameAr: string; quantity: number; price: number; }
interface ReceiptProps { invoiceNumber: string; items: CartItem[]; total: number; onClose: () => void; }

export function Receipt({ invoiceNumber, items, total, onClose }: ReceiptProps) {
  const { pharmacyName } = useSettingsStore();
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
    } catch (e: any) {
      toast.error("فشل الاتصال بالطابعة: " + e);
    }
  };

  return (
    <div dir="rtl" className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white p-7 rounded-3xl shadow-2xl w-[420px] text-center animate-scale-in">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
              <Printer className="w-4.5 h-4.5 text-brand-700" />
            </div>
            طباعة الفاتورة
          </h2>
          <button onClick={onClose} className="btn-icon"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl mb-5 flex items-center justify-center gap-2 border border-emerald-200">
          <CheckCircle className="w-5 h-5" />
          <span className="font-semibold">تم تسجيل البيع بنجاح</span>
        </div>

        <div className="text-right mb-5">
          <label className="label">اختر الطابعة الحرارية</label>
          <select 
            value={selectedPrinter} 
            onChange={(e) => setSelectedPrinter(e.target.value)}
            className="input"
          >
            <option value="">-- اختر طابعة --</option>
            {printers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div id="receipt-print-area" className="bg-slate-50 p-4 rounded-2xl mb-5 text-xs text-slate-600 max-h-48 overflow-y-auto text-left font-mono border border-slate-200" dir="ltr">
          <p className="text-center font-bold text-base mb-1">{pharmacyName}</p>
          <p>Invoice: {invoiceNumber}</p>
          <hr className="my-2 border-dashed border-slate-300" />
          {items.map(i => <div key={i.id} className="flex justify-between"><span>{i.nameAr} (x{i.quantity})</span><span>{(i.price * i.quantity).toFixed(2)}</span></div>)}
          <hr className="my-2 border-dashed border-slate-300" />
          <div className="font-bold text-sm flex justify-between"><span>TOTAL:</span><span>{total.toFixed(2)} IQD</span></div>
        </div>

        <button 
          onClick={handleDirectPrint}
          className="btn-primary w-full py-3.5 text-base shadow-elegant"
        >
          <Printer className="w-5 h-5" />
          طباعة مباشرة (Silent Print)
        </button>
      </div>
    </div>
  );
}
