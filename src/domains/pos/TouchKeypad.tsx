import { useState } from 'react';
import { X } from 'lucide-react';

export function TouchKeypad({ onConfirm, onClose }: { onConfirm: (val: string) => void; onClose: () => void }) {
  const [val, setVal] = useState('');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'C', '✓'];
  const handlePress = (k: string) => {
    if (k === 'C') setVal('');
    else if (k === '✓') { onConfirm(val); onClose(); }
    else setVal(prev => prev + k);
  };
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white p-6 rounded-3xl shadow-2xl w-80 animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-base font-bold text-slate-800">إدخال الكمية</h3>
          <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
        </div>
        <input type="text" value={val} readOnly className="input-lg text-2xl font-bold text-center mb-5 tabular" placeholder="0" />
        <div className="grid grid-cols-3 gap-2">
          {keys.map(k => (
            <button key={k} onClick={() => handlePress(k)}
              className={`py-4 rounded-xl text-xl font-bold transition-all active:scale-95 ${k === 'C' ? 'bg-red-50 text-red-600 hover:bg-red-100' : k === '✓' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
              {k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
