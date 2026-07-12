import { X, Calculator } from 'lucide-react';

export interface PaymentMethod {
  id: string;
  name: string;
  displayName: string;
}

export interface PaymentModalProps {
  total: number;
  paymentMethods: PaymentMethod[];
  selectedMethod: string;
  setSelectedMethod: (m: string) => void;
  paidAmount: string;
  setPaidAmount: (v: string) => void;
  mixedCash: string;
  setMixedCash: (v: string) => void;
  mixedCard: string;
  setMixedCard: (v: string) => void;
  chequeNumber: string;
  setChequeNumber: (v: string) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function PaymentModal({
  total, paymentMethods, selectedMethod, setSelectedMethod,
  paidAmount, setPaidAmount,
  mixedCash, setMixedCash, mixedCard, setMixedCard,
  chequeNumber, setChequeNumber, customerName, setCustomerName, onConfirm, onClose
}: PaymentModalProps) {
  const totalDisplay = total;
  const totalLabel = 'د.ع';

  const paidNum = parseFloat(paidAmount) || 0;
  const change = paidNum - totalDisplay;

  const mixedCashNum = parseFloat(mixedCash) || 0;
  const mixedCardNum = parseFloat(mixedCard) || 0;
  const mixedTotal = mixedCashNum + mixedCardNum;
  const mixedComplete = Math.abs(mixedTotal - totalDisplay) < 0.01;

  const methodLabels: Record<string, string> = {
    cash: 'نقدي', card: 'بطاقة (مدى/Visa)', cheque: 'شيك',
    transfer: 'تحويل بنكي', credit: 'آجل', mixed: 'دفع مقسّم'
  };

  const methodIcons: Record<string, string> = {
    cash: '💵', card: '💳', cheque: '📝', transfer: '🏦', credit: '⏰', mixed: '🔀'
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white p-7 rounded-3xl shadow-2xl w-[480px] animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-bold text-slate-800">إتمام الدفع</h3>
          <button onClick={onClose} className="btn-icon"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-gradient-to-r from-brand-600 to-brand-700 text-white p-5 rounded-2xl mb-5 text-center">
          <p className="text-xs opacity-80">الإجمالي المستحق</p>
          <p className="text-4xl font-bold tabular mt-1">{totalDisplay.toFixed(2)} <span className="text-lg font-normal">{totalLabel}</span></p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {paymentMethods.map((m) => (
            <button key={m.id} onClick={() => setSelectedMethod(m.name)} className={`p-3 rounded-xl text-xs font-semibold transition-all border-2 ${selectedMethod === m.name ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>
              <span className="text-lg block mb-1">{methodIcons[m.name] || '💰'}</span>
              {methodLabels[m.name] || m.displayName}
            </button>
          ))}
        </div>

        {selectedMethod === 'cash' && (
          <div className="mb-4">
            <label className="label-lg">المبلغ المدفوع ({totalLabel})</label>
            <input type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} className="input-lg text-2xl font-bold text-center tabular" placeholder="0.00" autoFocus />
            {paidNum > 0 && (
              <div className={`mt-2 p-3 rounded-xl text-center ${change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {change >= 0 ? `الباقي للزبون: ${change.toFixed(2)} ${totalLabel}` : `المتبقي: ${Math.abs(change).toFixed(2)} ${totalLabel}`}
              </div>
            )}
          </div>
        )}

        {selectedMethod === 'card' && (
          <div className="mb-4 p-4 rounded-xl bg-brand-50 text-center">
            <p className="text-sm font-semibold text-brand-700">سيتم دفع {totalDisplay.toFixed(2)} {totalLabel} عبر بطاقة المدى/Visa</p>
            <p className="text-xs text-slate-400 mt-1">سيتم تأكيد الدفع عبر جهاز POS</p>
          </div>
        )}

        {selectedMethod === 'cheque' && (
          <div className="mb-4">
            <label className="label-lg">رقم الشيك</label>
            <input type="text" value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} className="input tabular" placeholder="123456" />
            <p className="text-xs text-amber-600 mt-2">⚠️ سيتم تسجيل الشيك كمستحق حتى تحصيله</p>
          </div>
        )}

        {selectedMethod === 'transfer' && (
          <div className="mb-4 p-4 rounded-xl bg-brand-50 text-center">
            <p className="text-sm font-semibold text-brand-700">تحويل بنكي بقيمة {totalDisplay.toFixed(2)} {totalLabel}</p>
          </div>
        )}

        {selectedMethod === 'credit' && (
          <div className="mb-4">
            <label className="label-lg">اسم الزبون *</label>
            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="input" placeholder="اسم الزبون" autoFocus />
            <p className="text-xs text-amber-600 mt-2">⚠️ سيتم تسجيل المبلغ كدين على الزبون في قسم الديون</p>
          </div>
        )}

        {selectedMethod === 'mixed' && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label-lg">نقدي ({totalLabel})</label>
              <input type="number" value={mixedCash} onChange={e => setMixedCash(e.target.value)} className="input-lg text-center font-bold tabular" placeholder="0.00" />
            </div>
            <div>
              <label className="label-lg">بطاقة ({totalLabel})</label>
              <input type="number" value={mixedCard} onChange={e => setMixedCard(e.target.value)} className="input-lg text-center font-bold tabular" placeholder="0.00" />
            </div>
            <div className="col-span-2 p-2 rounded-xl text-center text-sm font-semibold">
              الإجمالي: {mixedTotal.toFixed(2)} / {totalDisplay.toFixed(2)} {totalLabel}
              {mixedComplete && <span className="text-emerald-600 mr-2">✓ مكتمل</span>}
            </div>
          </div>
        )}

        <button
          onClick={onConfirm}
          disabled={selectedMethod === 'credit' && !customerName.trim()}
          className="btn-primary w-full py-4 text-base shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Calculator className="w-5 h-5" />
          تأكيد الدفع + طباعة
        </button>
        {selectedMethod === 'credit' && !customerName.trim() && (
          <p className="text-xs text-rose-600 text-center mt-2">⚠️ أدخل اسم الزبون لتفعيل الزر</p>
        )}
      </div>
    </div>
  );
}
