// ScannerConnectionStatus Component
import { Wifi, WifiOff } from "lucide-react";
import { useMobileScannerStore } from '../store/mobileScanner.store';

export function ScannerConnectionStatus() {
  const { serverRunning, localIp, port, mobileUrl, connectedDevices } = useMobileScannerStore();

  return (
    <div className="card-elegant p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${serverRunning ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            {serverRunning ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">سيرفر المسح اللاسلكي</p>
            <p className="text-xs text-slate-500">{serverRunning ? 'يعمل' : 'متوقف'}</p>
          </div>
        </div>
        <span className={`badge ${serverRunning ? 'badge-success' : 'badge-neutral'}`}>
          {serverRunning ? `${connectedDevices.length} جهاز` : 'متوقف'}
        </span>
      </div>

      {serverRunning && (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-slate-50 rounded-lg p-2">
            <span className="text-xs text-slate-500">عنوان الموبايل</span>
            <span className="text-xs font-mono text-brand-700">{mobileUrl}</span>
          </div>
          <div className="flex items-center justify-between bg-slate-50 rounded-lg p-2">
            <span className="text-xs text-slate-500">WebSocket</span>
            <span className="text-xs font-mono text-brand-700">ws://{localIp}:{port}</span>
          </div>
        </div>
      )}
    </div>
  );
}
