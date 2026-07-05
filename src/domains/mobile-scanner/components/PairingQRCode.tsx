// PairingQRCode Component
import { useEffect, useState } from 'react';
import { X, Smartphone, QrCode, Loader, Copy, Check } from 'lucide-react';
import { useMobileScannerStore } from '../store/mobileScanner.store';
import { generatePairingQR } from '../services/scannerSocket';
import { toast } from 'sonner';

export function PairingQRCode() {
  const { showQRModal, setShowQRModal, pairingQR, pairingUrl, setPairingQR } = useMobileScannerStore();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (showQRModal && !pairingQR) {
      loadQR();
    }
  }, [showQRModal]);

  const loadQR = async () => {
    setLoading(true);
    try {
      const result = await generatePairingQR();
      setPairingQR(result.qrCode, result.url);
    } catch (e) {
      toast.error('فشل توليد QR');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (pairingUrl) {
      navigator.clipboard.writeText(pairingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!showQRModal) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowQRModal(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-brand-700" />
            إقتران الموبايل
          </h3>
          <button onClick={() => setShowQRModal(false)} className="w-9 h-9 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          امسح هذا الكود بكاميرا الهاتف للاتصال المباشر بالنظام
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-10 h-10 text-brand-600 animate-spin" />
          </div>
        ) : pairingQR ? (
          <div className="flex flex-col items-center">
            <img src={pairingQR} alt="QR Code" className="w-64 h-64 rounded-xl border-2 border-slate-100" />
            <button onClick={loadQR} className="text-xs text-brand-600 hover:text-brand-700 mt-3">
              🔄 توليد كود جديد
            </button>
            <div className="mt-3 w-full flex items-center gap-2 bg-slate-50 rounded-lg p-2">
              <input value={pairingUrl || ''} readOnly className="flex-1 bg-transparent text-xs text-slate-500 outline-none" />
              <button onClick={handleCopy} className="p-1.5 rounded hover:bg-slate-200">
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <QrCode className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <button onClick={loadQR} className="btn-primary px-6 py-2">توليد QR Code</button>
          </div>
        )}

        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-amber-700">
            ⚠️ تأكد إن الهاتف والكمبيوتر على نفس شبكة WiFi
          </p>
        </div>
      </div>
    </div>
  );
}
