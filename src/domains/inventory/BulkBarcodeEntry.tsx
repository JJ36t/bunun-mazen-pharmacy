// ========================================
// Bulk Barcode Entry — إدخال جماعي للباركودات الأصلية
// ========================================
// يسمح للمستخدم بإدخال الباركودات الأصلية للأدوية الموجودة بسرعة
// يعمل بأربع طرق:
// 1. مسح الباركود بماسح USB (يحاكي لوحة المفاتيح)
// 2. مسح من الهاتف (الكاميرا + WebSocket)
// 3. إدخال يدوي لكل دواء
// 4. لصق قائمة من Excel (اسم الدواء + باركود)

import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { X, Barcode, Search, Loader, CheckCircle, AlertCircle, Upload, Zap, FileSpreadsheet, Smartphone, QrCode, Wifi, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

// علم global يمنع PosDashboard من معالجة الحدث عندما هذه النافذة مفتوحة
declare global {
  interface Window { __bulkBarcodeActive?: boolean; }
}

interface BulkBarcodeEntryProps {
  onClose: () => void;
  onSaved: () => void;
}

interface MedicineItem {
  id: string;
  nameAr: string;
  currentBarcode: string | null;
  newBarcode: string;
  status: 'idle' | 'saving' | 'saved' | 'error';
  matched?: boolean;
}

export function BulkBarcodeEntry({ onClose, onSaved }: BulkBarcodeEntryProps) {
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [filteredMeds, setFilteredMeds] = useState<MedicineItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoMode, setAutoMode] = useState(true); // وضع الإدخال التلقائي: مسح → يبحث عن أول دواء بدون باركود
  const [pasteMode, setPasteMode] = useState(false);
  const [phoneMode, setPhoneMode] = useState(false); // مسح من الهاتف
  const [pasteText, setPasteText] = useState('');
  const [selectedMedId, setSelectedMedId] = useState<string | null>(null);
  const [scanBuffer, setScanBuffer] = useState('');
  const [lastScan, setLastScan] = useState<{ name: string; barcode: string } | null>(null);
  const [phoneServerStatus, setPhoneServerStatus] = useState<any>(null);
  const [pairingQR, setPairingQR] = useState<string | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // علم global لإخبار PosDashboard بتخطي الحدث
  useEffect(() => {
    window.__bulkBarcodeActive = true;
    return () => { window.__bulkBarcodeActive = false; };
  }, []);
  const stats = {
    total: medicines.length,
    withBarcode: medicines.filter(m => m.currentBarcode).length,
    withoutBarcode: medicines.filter(m => !m.currentBarcode).length,
    saved: medicines.filter(m => m.status === 'saved').length,
  };

  useEffect(() => {
    loadMedicines();
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredMeds(medicines);
    } else {
      const s = search.toLowerCase();
      setFilteredMeds(medicines.filter(m =>
        m.nameAr.toLowerCase().includes(s) ||
        (m.currentBarcode || '').includes(s) ||
        m.newBarcode.includes(s)
      ));
    }
  }, [search, medicines]);

  // تركيز تلقائي على حقل الإدخال
  useEffect(() => {
    if (autoMode && !pasteMode && !phoneMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoMode, pasteMode, phoneMode, medicines.length]);

  // ===== مسح من الهاتف =====
  // ابدأ السيرفر + استمع لأحداث المسح من الموبايل
  useEffect(() => {
    if (!phoneMode) return;

    let unlisten: (() => void) | null = null;

    const setup = async () => {
      try {
        // ابدأ سيرفر WebSocket
        const status = await invoke<any>('start_scanner_server');
        setPhoneServerStatus(status);
        console.log('[BulkBarcode] Scanner server started:', status);

        // استمع لأحداث المسح
        unlisten = await listen<any>('mobile-scan-received', async (event) => {
          const result = event.payload;
          if (!result) return;
          const barcode = String(result.barcode || '');
          if (!barcode) return;

          console.log('[BulkBarcode] Phone scan received:', barcode);

          // لو الباركود موجود بدواء آخر أصلاً، لا تربطه
          const existing = medicines.find(m => m.currentBarcode === barcode);
          if (existing) {
            toast.warning(`الباركود ${barcode} مُسجّل بالفعل لـ: ${existing.nameAr}`);
            return;
          }

          // اربطه بالدواء المحدد أو أول دواء بدون باركود
          await processScannedBarcode(barcode);
        });

        // حدّث قائمة الأجهزة المتصلة
        refreshConnectedDevices();
      } catch (e) {
        console.error('[BulkBarcode] Failed to setup phone scanner:', e);
        toast.error('فشل تشغيل سيرفر المسح اللاسلكي');
      }
    };

    setup();

    // تحديث قائمة الأجهزة كل 5 ثواني
    const interval = setInterval(refreshConnectedDevices, 5000);

    return () => {
      if (unlisten) { try { unlisten(); } catch {} }
      clearInterval(interval);
    };
  }, [phoneMode, medicines]);

  const refreshConnectedDevices = async () => {
    try {
      const devices = await invoke<any[]>('get_connected_devices');
      setConnectedDevices(devices || []);
    } catch (e) { console.error(e); }
  };

  const generateQR = async () => {
    setPhoneLoading(true);
    try {
      const result = await invoke<any>('generate_pairing_qr');
      setPairingQR(result.qrCode);
    } catch (e: any) {
      toast.error('فشل توليد QR: ' + e);
    } finally {
      setPhoneLoading(false);
    }
  };

  const loadMedicines = async () => {
    setLoading(true);
    try {
      const data = await invoke<any[]>('get_medicines_db');
      const items: MedicineItem[] = data
        .filter(m => !m.isDeleted)
        .map(m => ({
          id: m.id,
          nameAr: m.nameAr,
          currentBarcode: m.barcode || null,
          newBarcode: '',
          status: 'idle' as const,
        }))
        // الأدوية بدون باركود أولاً
        .sort((a, b) => {
          if (!a.currentBarcode && b.currentBarcode) return -1;
          if (a.currentBarcode && !b.currentBarcode) return 1;
          return a.nameAr.localeCompare(b.nameAr, 'ar');
        });
      setMedicines(items);
      setFilteredMeds(items);
    } catch (e: any) {
      toast.error('فشل تحميل الأدوية: ' + e);
    } finally {
      setLoading(false);
    }
  };

  // معالجة إدخال الماسح USB — يكتشف Enter كنهاية للباركود
  const handleScanInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const barcode = scanBuffer.trim();
      setScanBuffer('');
      if (!barcode) return;
      processScannedBarcode(barcode);
    }
  };

  const handleScanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScanBuffer(e.target.value);
  };

  // معالجة باركود ممسوح
  const processScannedBarcode = async (barcode: string) => {
    // تحقق إن الباركود مُستخدم بالفعل
    const existing = medicines.find(m => m.currentBarcode === barcode || m.newBarcode === barcode);
    if (existing) {
      toast.warning(`الباركود ${barcode} مُسجّل بالفعل للدواء: ${existing.nameAr}`);
      setLastScan({ name: existing.nameAr, barcode });
      return;
    }

    if (autoMode) {
      // ابحث عن أول دواء بدون باركود (أو المحدد حالياً)
      let target: MedicineItem | undefined;
      if (selectedMedId) {
        target = medicines.find(m => m.id === selectedMedId);
      } else {
        target = medicines.find(m => !m.currentBarcode && m.status !== 'saved');
      }

      if (!target) {
        toast.error('لا يوجد دواء متاح لربط الباركود. اختر دواءً يدوياً.');
        return;
      }

      await saveBarcodeForMedicine(target.id, barcode);
    } else {
      // الوضع اليدوي — ابحث عن الباركود في حقل الدواء المحدد
      if (!selectedMedId) {
        toast.error('اختر دواءً أولاً من القائمة');
        return;
      }
      await saveBarcodeForMedicine(selectedMedId, barcode);
    }
  };

  const saveBarcodeForMedicine = async (medId: string, barcode: string) => {
    setMedicines(prev => prev.map(m =>
      m.id === medId ? { ...m, status: 'saving' as const, newBarcode: barcode } : m
    ));

    try {
      // استدعاء أمر Tauri لربط الباركود بالدواء
      await invoke('link_barcode_to_medicine_db', {
        medicineId: medId,
        barcode: barcode,
        source: 'manual_entry',
      });

      setMedicines(prev => prev.map(m =>
        m.id === medId ? {
          ...m,
          currentBarcode: barcode,
          newBarcode: barcode,
          status: 'saved' as const,
          matched: true,
        } : m
      ));

      const med = medicines.find(m => m.id === medId);
      setLastScan({ name: med?.nameAr || '', barcode });
      toast.success(`تم ربط الباركود ${barcode} بـ: ${med?.nameAr}`);

      // إعادة تحميل بعد فترة قصيرة لتحديث الحالة
      onSaved();
    } catch (e: any) {
      setMedicines(prev => prev.map(m =>
        m.id === medId ? { ...m, status: 'error' as const } : m
      ));
      toast.error(`فشل ربط الباركود: ${e}`);
    }
  };

  // معالجة اللصق من Excel
  const handlePasteImport = async () => {
    if (!pasteText.trim()) {
      toast.error('الصق بيانات أولاً');
      return;
    }

    const lines = pasteText.trim().split('\n');
    let successCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;

    setSaving(true);
    for (const line of lines) {
      const parts = line.split('\t').map(p => p.trim());
      if (parts.length < 2) continue;

      // الصيغة: [اسم الدواء] \t [الباركود]  (أو العكس)
      let name = parts[0];
      let barcode = parts[1];

      // لو الباركود في العمود الأول والأسم في الثاني
      if (/^\d{8,}$/.test(parts[0]) && !/^\d{8,}$/.test(parts[1])) {
        barcode = parts[0];
        name = parts[1];
      }

      if (!name || !barcode) continue;

      // ابحث عن الدواء بالاسم
      const med = medicines.find(m =>
        m.nameAr === name ||
        m.nameAr.includes(name) ||
        name.includes(m.nameAr)
      );

      if (!med) {
        notFoundCount++;
        continue;
      }

      if (med.currentBarcode === barcode) {
        successCount++; // مُسجل مسبقاً
        continue;
      }

      try {
        await invoke('link_barcode_to_medicine_db', {
          medicineId: med.id,
          barcode: barcode,
          source: 'bulk_import',
        });
        successCount++;
        setMedicines(prev => prev.map(m =>
          m.id === med.id ? {
            ...m,
            currentBarcode: barcode,
            newBarcode: barcode,
            status: 'saved' as const,
          } : m
        ));
      } catch (e) {
        errorCount++;
        console.error('Import error for', name, e);
      }
    }

    setSaving(false);
    setPasteMode(false);
    setPasteText('');

    if (successCount > 0) toast.success(`تم ربط ${successCount} باركود بنجاح`);
    if (notFoundCount > 0) toast.warning(`${notFoundCount} دواء غير موجود في القائمة`);
    if (errorCount > 0) toast.error(`فشل في ${errorCount} محاولة`);

    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-[1100px] max-w-[95vw] max-h-[92vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between bg-brand-900 text-white rounded-t-3xl">
          <div className="flex items-center gap-3">
            <Barcode className="w-6 h-6" />
            <div>
              <h3 className="text-lg font-bold">إدخال الباركودات الأصلية</h3>
              <p className="text-xs text-brand-200">Bulk Barcode Entry — اربط الباركودات الحقيقية بالأدوية الموجودة</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg text-white/70 hover:bg-white/10 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-xs text-slate-500">إجمالي الأدوية</p>
            <p className="text-lg font-bold text-slate-800 tabular">{stats.total}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">بباركود</p>
            <p className="text-lg font-bold text-emerald-600 tabular">{stats.withBarcode}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">بدون باركود</p>
            <p className="text-lg font-bold text-amber-600 tabular">{stats.withoutBarcode}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">تم ربطه الآن</p>
            <p className="text-lg font-bold text-brand-600 tabular">{stats.saved}</p>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="px-6 py-3 flex gap-2 border-b border-slate-100 flex-wrap">
          <button
            onClick={() => { setAutoMode(true); setPasteMode(false); setPhoneMode(false); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              autoMode && !pasteMode && !phoneMode ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <Zap className="w-4 h-4" />
            ماسح USB
          </button>
          <button
            onClick={() => { setPhoneMode(true); setPasteMode(false); setAutoMode(false); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              phoneMode ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            }`
            }
          >
            <Smartphone className="w-4 h-4" />
            مسح من الهاتف
            {connectedDevices.length > 0 && phoneMode && (
              <span className="ml-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => { setPasteMode(true); setPhoneMode(false); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              pasteMode ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            لصق من Excel
          </button>
          <button
            onClick={() => { setAutoMode(false); setPasteMode(false); setPhoneMode(false); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              !autoMode && !pasteMode && !phoneMode ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <Search className="w-4 h-4" />
            إدخال يدوي
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Left: Input / Paste area */}
          <div className="w-[420px] border-l border-slate-200 flex flex-col overflow-hidden">
            {phoneMode ? (
              <div className="p-5 flex-1 flex flex-col overflow-auto">
                <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-brand-600" />
                  مسح الباركود بكاميرا الهاتف:
                </h4>

                {/* حالة السيرفر */}
                <div className={`rounded-xl p-3 mb-3 flex items-center gap-2 ${
                  phoneServerStatus ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
                }`}>
                  <Wifi className={`w-4 h-4 ${phoneServerStatus ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <div className="flex-1 text-xs">
                    {phoneServerStatus ? (
                      <>
                        <p className="font-semibold text-emerald-800">السيرفر يعمل</p>
                        <p className="text-emerald-600 font-mono tabular">{phoneServerStatus.mobileUrl}</p>
                      </>
                    ) : (
                      <p className="text-amber-700">جاري تشغيل السيرفر...</p>
                    )}
                  </div>
                </div>

                {/* الأجهزة المتصلة */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-slate-500">الأجهزة المتصلة ({connectedDevices.length})</p>
                    <button onClick={refreshConnectedDevices} className="text-xs text-brand-600 hover:text-brand-700">
                      <RefreshCw className="w-3 h-3 inline" /> تحديث
                    </button>
                  </div>
                  {connectedDevices.length === 0 ? (
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <Smartphone className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">لا توجد أجهزة متصلة بعد</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {connectedDevices.map(d => (
                        <div key={d.id} className="flex items-center gap-2 bg-emerald-50 rounded-lg p-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <p className="text-xs font-semibold text-emerald-800 flex-1">{d.deviceName || 'جهاز'}</p>
                          <span className="text-xs text-emerald-600 tabular">{d.deviceIp}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* زر توليد QR */}
                {!pairingQR ? (
                  <button
                    onClick={generateQR}
                    disabled={phoneLoading || !phoneServerStatus}
                    className="btn-primary w-full py-3 disabled:opacity-50"
                  >
                    {phoneLoading ? <Loader className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                    توليد QR Code للإقتران
                  </button>
                ) : (
                  <div className="flex flex-col items-center mb-3">
                    <img src={pairingQR} alt="QR Code" className="w-48 h-48 rounded-xl border-2 border-slate-100" />
                    <button onClick={generateQR} className="text-xs text-brand-600 hover:text-brand-700 mt-2">
                      🔄 توليد كود جديد
                    </button>
                    <p className="text-xs text-slate-500 mt-2 text-center">
                      افتح كاميرا الهاتف وامسح الكود
                    </p>
                  </div>
                )}

                {/* آخر عملية */}
                {lastScan && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-3 animate-slide-up">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-emerald-800">{lastScan.name}</p>
                        <p className="text-xs text-emerald-600 font-mono tabular">{lastScan.barcode}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* تعليمات */}
                <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 mt-2">
                  <p className="text-xs text-brand-700 font-semibold mb-1">كيف يعمل؟</p>
                  <ol className="text-xs text-brand-700 space-y-0.5 list-decimal pr-4">
                    <li>اضغط "توليد QR Code" بالأعلى</li>
                    <li>افتح كاميرا الهاتف وامسح الكود</li>
                    <li>سيفتح المتصفح ويبدأ الكاميرا تلقائياً</li>
                    <li>وجّه الكاميرا نحو باركود الدواء</li>
                    <li>سيُربط تلقائياً بأول دواء بدون باركود</li>
                  </ol>
                </div>
              </div>
            ) : pasteMode ? (
              <div className="p-5 flex-1 flex flex-col">
                <h4 className="text-sm font-bold text-slate-800 mb-2">الصق بيانات من Excel:</h4>
                <p className="text-xs text-slate-500 mb-3">
                  الصيغة المطلوبة: عمودين — اسم الدواء والباركود (الترتيب غير مهم).
                  انسخ الخلايا من Excel والصقها هنا.
                </p>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder={`بنادول 500mg\t6001234567890\nأموكسيسيلين 250\t6009876543210\n...`}
                  className="input flex-1 font-mono text-xs resize-none tabular"
                  style={{ minHeight: '300px' }}
                  autoFocus
                />
                <button
                  onClick={handlePasteImport}
                  disabled={saving || !pasteText.trim()}
                  className="btn-primary w-full mt-3 py-3 disabled:opacity-50"
                >
                  {saving ? <Loader className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  استيراد الباركودات
                </button>
              </div>
            ) : (
              <div className="p-5 flex-1 flex flex-col">
                <h4 className="text-sm font-bold text-slate-800 mb-2">
                  {autoMode ? 'امسح الباركود بماسح USB:' : 'اختر دواءً وأدخل الباركود:'}
                </h4>
                {autoMode && (
                  <p className="text-xs text-slate-500 mb-3">
                    وجّه الماسح نحو الباركود — سيُربط تلقائياً بأول دواء بدون باركود.
                    {selectedMedId && ' (دواء محدد مُختار)'}
                  </p>
                )}

                <input
                  ref={inputRef}
                  type="text"
                  value={scanBuffer}
                  onChange={handleScanChange}
                  onKeyDown={handleScanInput}
                  placeholder="امسح أو اكتب الباركود هنا..."
                  className="input-lg text-center font-mono tabular text-lg mb-3"
                  autoFocus
                />

                {/* آخر عملية */}
                {lastScan && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-3 animate-slide-up">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-emerald-800">{lastScan.name}</p>
                        <p className="text-xs text-emerald-600 font-mono tabular">{lastScan.barcode}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* قائمة الأدوية بدون باركود — للاختيار اليدوي */}
                <div className="flex-1 overflow-auto">
                  <p className="text-xs text-slate-500 mb-2">
                    أدوية بدون باركود ({medicines.filter(m => !m.currentBarcode).length}):
                  </p>
                  <div className="space-y-1">
                    {medicines
                      .filter(m => !m.currentBarcode)
                      .slice(0, 50)
                      .map(m => (
                        <button
                          key={m.id}
                          onClick={() => setSelectedMedId(m.id)}
                          className={`w-full text-right p-2.5 rounded-lg border transition-all ${
                            selectedMedId === m.id
                              ? 'border-brand-500 bg-brand-50'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-800">{m.nameAr}</p>
                          {m.status === 'saved' && (
                            <span className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                              <CheckCircle className="w-3 h-3" /> تم الربط
                            </span>
                          )}
                        </button>
                      ))
                    }
                  </div>
                </div>
              </div>
            )
            }
          </div>

          {/* Right: All medicines table */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو الباركود..."
                  className="input pr-10"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="py-12 text-center">
                  <Loader className="w-8 h-8 text-brand-600 mx-auto animate-spin" />
                  <p className="text-sm text-slate-500 mt-2">جاري تحميل الأدوية...</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-right p-3 text-xs font-semibold text-slate-600">الدواء</th>
                      <th className="text-right p-3 text-xs font-semibold text-slate-600">الباركود الحالي</th>
                      <th className="text-right p-3 text-xs font-semibold text-slate-600">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMeds.slice(0, 500).map(m => (
                      <tr
                        key={m.id}
                        onClick={() => setSelectedMedId(m.id)}
                        className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${
                          selectedMedId === m.id ? 'bg-brand-50' : ''
                        }`}
                      >
                        <td className="p-3 text-sm text-slate-800 font-medium">{m.nameAr}</td>
                        <td className="p-3 text-sm font-mono tabular text-slate-600">
                          {m.currentBarcode || <span className="text-amber-500">— بدون —</span>}
                        </td>
                        <td className="p-3">
                          {m.status === 'saved' ? (
                            <span className="badge-success text-xs flex items-center gap-1 w-fit">
                              <CheckCircle className="w-3 h-3" /> مربوط
                            </span>
                          ) : m.currentBarcode ? (
                            <span className="badge-neutral text-xs">موجود</span>
                          ) : (
                            <span className="badge-warning text-xs flex items-center gap-1 w-fit">
                              <AlertCircle className="w-3 h-3" /> يحتاج باركود
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-3xl flex items-center justify-between">
          <p className="text-xs text-slate-500">
            💡 الماسح USB يعمل تلقائياً — وجّهه نحو الباركود وسيُسجّل عند الضغط على Enter
          </p>
          <button onClick={onClose} className="btn-ghost border border-slate-200 px-5 py-2">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
