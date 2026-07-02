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
    <div dir="rtl" className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl shadow-2xl w-96 text-center">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-800">طباعة الفاتورة</h2>
          <button onClick={onClose} className="text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg mb-4 flex items-center justify-center gap-2">
          <CheckCircle className="w-5 h-5" />
          <span>تم تسجيل البيع بنجاح</span>
        </div>

        <div className="text-right mb-4">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">اختر الطابعة الحرارية</label>
          <select 
            value={selectedPrinter} 
            onChange={(e) => setSelectedPrinter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          >
            <option value="">-- اختر طابعة --</option>
            {printers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="bg-slate-50 p-3 rounded-lg mb-4 text-xs text-slate-500 max-h-40 overflow-y-auto text-left font-mono" dir="ltr">
          <p className="text-center font-bold">{pharmacyName}</p>
          <p>Invoice: {invoiceNumber}</p>
          <hr className="my-1 border-dashed" />
          {items.map(i => <div key={i.id}>{i.nameAr} (x{i.quantity}) ... {(i.price * i.quantity).toFixed(2)}</div>)}
          <hr className="my-1 border-dashed" />
          <div className="font-bold">TOTAL: {total.toFixed(2)} IQD</div>
        </div>

        <button 
          onClick={handleDirectPrint}
          className="w-full bg-purple-600 text-white py-3 rounded-xl text-base font-bold hover:bg-purple-700 flex items-center justify-center gap-2"
        >
          <Printer className="w-5 h-5" /> طباعة مباشرة (Silent Print)
        </button>
      </div>
    </div>
  );
}