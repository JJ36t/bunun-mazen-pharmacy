// ========================================
// ShiftModal - نافذة بدء شفت جديد
// ========================================
// تم استخراجها من App.tsx (P1 fix: تقسيم God component)

import { Calculator } from 'lucide-react';

interface ShiftModalProps {
  shiftAmount: string;
  setShiftAmount: (val: string) => void;
  onStart: () => void;
}

export function ShiftModal({ shiftAmount, setShiftAmount, onStart }: ShiftModalProps) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white p-7 rounded-3xl shadow-2xl w-96 animate-scale-in">
        <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center">
            <Calculator className="w-4 h-4 text-brand-700" />
          </div>
          بدء شفت جديد
        </h3>
        <p className="text-xs text-slate-500 mb-5">
          أدخل المبلغ الافتتاحي الموجود في الصندوق لبداية الشفت.
        </p>
        <input
          type="number"
          value={shiftAmount}
          onChange={e => setShiftAmount(e.target.value)}
          className="input-lg text-center text-2xl font-bold tabular mb-5"
          placeholder="0.00"
          autoFocus
        />
        <button onClick={onStart} className="btn-primary w-full py-3 text-base">
          بدء الشفت
        </button>
      </div>
    </div>
  );
}
