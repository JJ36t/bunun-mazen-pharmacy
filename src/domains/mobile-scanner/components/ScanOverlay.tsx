// ScanOverlay Component — عرض نتائج المسح
import { CheckCircle, XCircle, Globe, Package } from 'lucide-react';
import type { ScanResult } from '../types/scanner.types';

export function ScanOverlay({ result }: { result: ScanResult }) {
  if (result.status === 'found') {
    return (
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 animate-fade-in">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-bold text-emerald-800">{result.nameAr}</p>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-emerald-600">الكمية: {result.quantity}</span>
          </div>
          <span className="text-lg font-bold text-emerald-700 tabular">{result.price} د.ع</span>
        </div>
        <p className="text-[10px] text-emerald-400 mt-1">{result.barcodeType}</p>
      </div>
    );
  }

  if (result.status === 'global_found') {
    return (
      <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 animate-fade-in">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-5 h-5 text-amber-600" />
          <p className="text-sm font-bold text-amber-800">{result.name}</p>
        </div>
        <p className="text-xs text-amber-600">{result.activeIngredient}</p>
        <p className="text-xs text-amber-500">{result.brandName} • {result.strength}</p>
        <p className="text-[10px] text-amber-400 mt-1">دواء عالمي — غير موجود في المخزون</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-3 animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <XCircle className="w-5 h-5 text-rose-600" />
        <p className="text-sm font-bold text-rose-800">غير موجود</p>
      </div>
      <p className="text-xs text-rose-600">الباركود: {result.barcode}</p>
      <p className="text-[10px] text-rose-400 mt-1">{result.barcodeType}</p>
    </div>
  );
}
