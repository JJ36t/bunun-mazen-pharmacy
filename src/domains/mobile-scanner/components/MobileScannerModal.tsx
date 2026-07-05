// Mobile Scanner Modal — النافذة الرئيسية للماسح اللاسلكي
import { useState, useEffect } from 'react';
import { X, Smartphone, QrCode, History, RefreshCw, CheckCircle, Globe, XCircle } from 'lucide-react';
import { useMobileScannerStore } from '../store/mobileScanner.store';
import { useMobileScanner } from '../hooks/useMobileScanner';
import { ScannerConnectionStatus } from './ScannerConnectionStatus';
import { PairingQRCode } from './PairingQRCode';

export function MobileScannerModal({ onClose }: { onClose: () => void }) {
  const store = useMobileScannerStore();
  const { auditLogs, refreshDevices, loadAuditLogs, generateQR } = useMobileScanner();
  const [activeTab, setActiveTab] = useState<'status' | 'devices' | 'history'>('status');

  useEffect(() => {
    refreshDevices();
    loadAuditLogs();
  }, []);

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-[680px] max-h-[90vh] overflow-auto">
          {/* Header */}
          <div className="px-6 py-4 flex items-center justify-between bg-brand-900 text-white rounded-t-2xl">
            <div className="flex items-center gap-3">
              <Smartphone className="w-6 h-6" />
              <div>
                <h3 className="text-lg font-bold">الماسح اللاسلكي</h3>
                <p className="text-xs text-brand-200">Wireless Barcode Scanner</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-lg text-white/70 hover:bg-white/10 flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-5">
              <button
                onClick={() => setActiveTab('status')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'status' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
              >
                الحالة
              </button>
              <button
                onClick={() => setActiveTab('devices')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'devices' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
              >
                الأجهزة
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'history' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
              >
                السجل
              </button>
            </div>

            {activeTab === 'status' && (
              <div className="space-y-4">
                <ScannerConnectionStatus />

                <button onClick={generateQR} className="btn-primary w-full py-3">
                  <QrCode className="w-5 h-5" />
                  توليد QR Code للإقتران
                </button>

                <div className="bg-slate-50 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-slate-700 mb-2">كيفية الاستخدام:</h4>
                  <ol className="text-xs text-slate-600 space-y-1 list-decimal pr-4">
                    <li>اضغط "توليد QR Code" بالأعلى</li>
                    <li>افتح كاميرا الهاتف وامسح الكود</li>
                    <li>تأكد إن الهاتف على نفس شبكة WiFi</li>
                    <li>سيفتح المتصفح ويبدأ المسح تلقائياً</li>
                    <li>وجّه الكاميرا نحو باركود الدواء</li>
                  </ol>
                </div>
              </div>
            )}

            {activeTab === 'devices' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-slate-700">الأجهزة المتصلة ({store.connectedDevices.length})</h4>
                  <button onClick={refreshDevices} className="btn-icon">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {store.connectedDevices.length === 0 ? (
                  <div className="empty-state py-8">
                    <Smartphone className="w-10 h-10 text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400">لا توجد أجهزة متصلة</p>
                    <p className="text-xs text-slate-300">امسح QR Code للإقتران</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {store.connectedDevices.map((device) => (
                      <div key={device.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Smartphone className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{device.deviceName || 'جهاز غير معروف'}</p>
                            <p className="text-xs text-slate-500">{device.deviceIp}</p>
                          </div>
                        </div>
                        <span className="badge-success">متصل</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-slate-700">سجل عمليات المسح ({auditLogs.length})</h4>
                  <button onClick={loadAuditLogs} className="btn-icon">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {auditLogs.length === 0 ? (
                  <div className="empty-state py-8">
                    <History className="w-10 h-10 text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400">لا توجد عمليات مسح</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-auto">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${log.scanResult === 'success' ? 'bg-emerald-50 text-emerald-600' : log.scanResult === 'global_found' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
                            {log.scanResult === 'success' ? <CheckCircle className="w-4 h-4" /> : log.scanResult === 'global_found' ? <Globe className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{log.matchedMedicine || log.barcode}</p>
                            <p className="text-xs text-slate-500">{log.deviceName} • {log.barcodeType}</p>
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 tabular">{new Date(log.createdAt).toLocaleTimeString('en-GB')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <PairingQRCode />
    </>
  );
}
