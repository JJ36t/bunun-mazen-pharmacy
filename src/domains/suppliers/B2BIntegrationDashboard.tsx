// ========================================
// B2B Integration Dashboard
// ========================================
// ربط مباشر مع المستودعات - إرسال طلبات شراء + استقبال الفواتير

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useInventoryStore } from '../inventory/inventory.store';
import { useSuppliersStore } from './suppliers.store';
import { useAuthStore } from '../security/auth.store';
import { Send, Download, Cloud, Check, X, Package, Truck, RefreshCw, FileText, Link2, AlertCircle, Zap } from 'lucide-react';
import { toast } from 'sonner';

// قائمة المستودعات العراقية المدعومة
const WAREHOUSES = [
  { id: 'capsula', name: 'كبسولة (Capsula)', api: 'https://api.capsula.iq/v1', logo: '💊' },
  { id: 'merckato', name: 'ميركاتو (Merckato)', api: 'https://api.merckato.iq/v1', logo: '📦' },
  { id: 'almorabaa', name: 'المربع (AlMorabaa)', api: 'https://api.almorabaa.iq/v1', logo: '🏛️' },
  { id: 'iraqsoft', name: 'عراق سوفت (IraqSoft)', api: 'https://api.iraqsoft.iq/v1', logo: '💻' },
  { id: 'custom', name: 'مستودع مخصص', api: '', logo: '🔗' },
];

export function B2BIntegrationDashboard() {
  const { suppliers, fetchSuppliers } = useSuppliersStore();
  const { medicines, fetchMedicines } = useInventoryStore();
  const { role } = useAuthStore();
  
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState<'connect' | 'order' | 'receive'>('connect');
  const [orderCart, setOrderCart] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [receivedInvoices, setReceivedInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSuppliers();
    fetchMedicines();
    loadApiToken();
  }, []);

  const loadApiToken = async () => {
    try {
      const settings = await invoke<any>('get_settings_db');
      const token = settings?.b2b_api_token || '';
      const wh = settings?.b2b_warehouse || '';
      if (token) { setApiToken(token); setSelectedWarehouse(wh); }
    } catch (e) { console.error(e); }
  };

  const handleConnect = async () => {
    if (!selectedWarehouse) { toast.error('اختر مستودعاً'); return; }
    if (!apiToken) { toast.error('أدخل API Token'); return; }
    
    setConnecting(true);
    try {
      // حفظ الإعدادات
      await invoke('save_settings_db', {
        settingsJson: JSON.stringify({
          b2b_api_token: apiToken,
          b2b_warehouse: selectedWarehouse,
        }),
      });
      
      // محاكاة الاتصال (في الإنتاج: طلب API حقيقي)
      await new Promise(r => setTimeout(r, 1500));
      
      setConnected(true);
      toast.success('تم الاتصال بـ ' + WAREHOUSES.find(w => w.id === selectedWarehouse)?.name);
      setActiveTab('order');
    } catch (e: any) {
      toast.error('فشل الاتصال: ' + e);
    }
    setConnecting(false);
  };

  const filteredMeds = search.trim() 
    ? medicines.filter((m: any) => !m.isDeleted && (m.nameAr?.includes(search) || m.barcode?.includes(search)))
    : [];

  const addToOrder = (med: any) => {
    const existing = orderCart.find(i => i.id === med.id);
    if (existing) {
      setOrderCart(prev => prev.map(i => i.id === med.id ? { ...i, qty: i.qty + 10 } : i));
    } else {
      setOrderCart(prev => [...prev, { id: med.id, name: med.nameAr, barcode: med.barcode, qty: 10, currentStock: med.quantity }]);
    }
  };

  const updateOrderQty = (id: string, qty: number) => {
    setOrderCart(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  };

  const removeFromOrder = (id: string) => {
    setOrderCart(prev => prev.filter(i => i.id !== id));
  };

  const handleSendOrder = async () => {
    if (orderCart.length === 0) { toast.error('السلة فارغة'); return; }
    setLoading(true);
    try {
      // محاكاة إرسال الطلب للمستودع
      await new Promise(r => setTimeout(r, 2000));
      
      // تسجيل في سجل التدقيق
      await invoke('log_action_db', {
        userRole: role || 'Unknown',
        actionType: 'B2B_ORDER_SENT',
        description: `إرسال طلب شراء إلى ${WAREHOUSES.find(w => w.id === selectedWarehouse)?.name} - ${orderCart.length} صنف`,
      });
      
      toast.success(`تم إرسال طلب الشراء (${orderCart.length} صنف) إلى المستودع`);
      
      // محاكاة استقبال الفاتورة بعد فترة
      const mockInvoice = {
        id: 'INV-' + Date.now(),
        warehouse: WAREHOUSES.find(w => w.id === selectedWarehouse)?.name,
        items: orderCart.map(item => ({
          name: item.name,
          barcode: item.barcode,
          qty: item.qty,
          cost: 300 + Math.floor(Math.random() * 500),
          sell: 500 + Math.floor(Math.random() * 700),
        })),
        total: orderCart.reduce((s, i) => s + (300 + Math.floor(Math.random() * 500)) * i.qty, 0),
        status: 'received',
        date: new Date().toISOString(),
      };
      
      setReceivedInvoices(prev => [mockInvoice, ...prev]);
      setOrderCart([]);
      setActiveTab('receive');
      toast.info('تم استقبال فاتورة من المستودع! راجعها في تبويب "استقبال الفواتير"');
    } catch (e: any) {
      toast.error('فشل إرسال الطلب: ' + e);
    }
    setLoading(false);
  };

  const handleAcceptInvoice = async (invoice: any) => {
    setLoading(true);
    try {
      // إضافة الأصناف للمخزون
      for (const item of invoice.items) {
        const med = medicines.find((m: any) => m.barcode === item.barcode && !m.isDeleted);
        if (med) {
          await invoke('record_purchase_db', {
            supplierId: suppliers[0]?.id || '',
            medicineId: med.id,
            quantity: item.qty,
            costPrice: item.cost,
            sellingPrice: item.sell,
            wholesalePrice: Math.round(item.cost * 1.2),
            userRole: role || 'Unknown',
          });
        }
      }
      
      await fetchMedicines();
      
      // تحديث حالة الفاتورة
      setReceivedInvoices(prev => prev.map(inv => inv.id === invoice.id ? { ...inv, status: 'accepted' } : inv));
      
      toast.success(`تم قبول الفاتورة وتحديث المخزون (${invoice.items.length} صنف)`);
    } catch (e: any) {
      toast.error('فشل قبول الفاتورة: ' + e);
    }
    setLoading(false);
  };

  const handleRejectInvoice = (invoiceId: string) => {
    setReceivedInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: 'rejected' } : inv));
    toast.info('تم رفض الفاتورة');
  };

  const tabs = [
    { key: 'connect' as const, label: 'الاتصال', icon: Link2 },
    { key: 'order' as const, label: 'إرسال طلب', icon: Send },
    { key: 'receive' as const, label: 'استقبال الفواتير', icon: Download },
  ];

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">الربط مع المستودعات (B2B)</h1>
        <p className="section-subtitle">إرسال طلبات شراء + استقبال فواتير تلقائياً + تحديث المخزون</p>
      </div>

      {/* تبويبات */}
      <div className="flex gap-1 bg-white p-1 rounded-xl mb-6 border border-slate-200 w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* تبويب الاتصال */}
      {activeTab === 'connect' && (
        <div className="grid grid-cols-2 gap-5">
          <div className="card-elegant p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center"><Cloud className="w-4.5 h-4.5 text-brand-700" /></div>
              الاتصال بالمستودع
            </h3>
            <div className="space-y-4">
              <div>
                <label className="label-lg">اختر المستودع</label>
                <select value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)} className="input">
                  <option value="">اختر مستودعاً</option>
                  {WAREHOUSES.map(w => <option key={w.id} value={w.id}>{w.logo} {w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-lg">API Token</label>
                <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} className="input font-mono" placeholder="أدخل Token من حسابك في المستودع" />
                <p className="text-xs text-slate-400 mt-1">يحصل عليه من صفحة الإعدادات في حساب المستودع</p>
              </div>
              <button onClick={handleConnect} disabled={connecting} className="btn-primary w-full py-3">
                {connecting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5" />}
                {connecting ? 'جاري الاتصال...' : 'اتصال'}
              </button>
              {connected && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700">متصل بـ {WAREHOUSES.find(w => w.id === selectedWarehouse)?.name}</span>
                </div>
              )}
            </div>
          </div>

          <div className="card-elegant p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">كيف يعمل؟</h3>
            <div className="space-y-3">
              {[
                { icon: Link2, title: '1. اتصل بالمستودع', desc: 'أدخل API Token من حسابك' },
                { icon: Send, title: '2. أرسل طلب شراء', desc: 'اختر الأدوية والكميات' },
                { icon: Cloud, title: '3. المستودع يستلم', desc: 'يجهّز الفاتورة إلكترونياً' },
                { icon: Download, title: '4. استقبل الفاتورة', desc: 'تظهر تلقائياً في البرنامج' },
                { icon: Check, title: '5. اقبل الفاتورة', desc: 'يُحدّث المخزون تلقائياً' },
              ].map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4" /></div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{step.title}</p>
                      <p className="text-xs text-slate-400">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* تبويب إرسال طلب */}
      {activeTab === 'order' && (
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-4">
            <div className="card-elegant p-5">
              <h3 className="text-base font-bold text-slate-800 mb-3">بحث وإضافة</h3>
              <div className="relative mb-3">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="input pr-10" placeholder="ابحث عن دواء..." />
              </div>
              <div className="max-h-64 overflow-auto space-y-1">
                {filteredMeds.slice(0, 20).map((med: any) => (
                  <div key={med.id} onClick={() => addToOrder(med)} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-brand-50 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{med.nameAr}</p>
                        <p className="text-[10px] text-slate-400">مخزون: {med.quantity}</p>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-brand-600" />
                  </div>
                ))}
                {search && filteredMeds.length === 0 && <p className="text-center text-slate-400 text-sm py-4">لا توجد نتائج</p>}
              </div>
            </div>
          </div>

          <div className="card-elegant flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">طلب الشراء ({orderCart.length})</h3>
              {orderCart.length > 0 && <button onClick={() => setOrderCart([])} className="text-xs text-red-500">إفراغ</button>}
            </div>
            <div className="flex-1 overflow-auto p-4 max-h-80">
              {orderCart.length === 0 ? (
                <div className="empty-state py-12"><div className="empty-state-icon"><Send className="w-8 h-8 text-slate-300" /></div><p className="text-slate-400 text-sm">أضف أدوية للطلب</p></div>
              ) : (
                <div className="space-y-2">
                  {orderCart.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-700">{item.name}</p>
                        <p className="text-[10px] text-slate-400">مخزون حالي: {item.currentStock}</p>
                      </div>
                      <input type="number" min="1" value={item.qty} onChange={e => updateOrderQty(item.id, parseInt(e.target.value) || 0)} className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm tabular text-center" />
                      <button onClick={() => removeFromOrder(item.id)} className="text-red-400 hover:bg-red-50 p-1 rounded ml-2"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {orderCart.length > 0 && (
              <div className="p-4 border-t border-slate-200">
                <button onClick={handleSendOrder} disabled={loading} className="btn-primary w-full py-3.5">
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  {loading ? 'جاري الإرسال...' : `إرسال الطلب (${orderCart.length} صنف)`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* تبويب استقبال الفواتير */}
      {activeTab === 'receive' && (
        <div className="space-y-4">
          {receivedInvoices.length === 0 ? (
            <div className="card-elegant p-12">
              <div className="empty-state">
                <div className="empty-state-icon"><Download className="w-12 h-12 text-slate-300" /></div>
                <p className="text-slate-500 text-base font-semibold">لا توجد فواتير مستقبلة</p>
                <p className="text-slate-400 text-sm mt-1">ستظهر الفواتير هنا تلقائياً عند إرسال طلب شراء</p>
              </div>
            </div>
          ) : receivedInvoices.map(inv => (
            <div key={inv.id} className="card-elegant overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><FileText className="w-5 h-5" /></div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">فاتورة #{inv.id.substring(0, 12)}</p>
                    <p className="text-xs text-slate-400">{inv.warehouse} • {new Date(inv.date).toLocaleString('en-GB')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700 tabular">{inv.total.toFixed(0)} د.ع</span>
                  {inv.status === 'received' && <span className="badge-warning">جديد</span>}
                  {inv.status === 'accepted' && <span className="badge-success">مقبول</span>}
                  {inv.status === 'rejected' && <span className="badge-danger">مرفوض</span>}
                </div>
              </div>
              {inv.status === 'received' && (
                <div className="p-4">
                  <table className="w-full mb-3">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="table-header text-right p-2">الدواء</th>
                        <th className="table-header text-right p-2">الكمية</th>
                        <th className="table-header text-right p-2">التكلفة</th>
                        <th className="table-header text-right p-2">البيع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.items.map((item: any, i: number) => (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="p-2 text-sm text-slate-700">{item.name}</td>
                          <td className="p-2 text-sm tabular text-center">{item.qty}</td>
                          <td className="p-2 text-sm tabular text-amber-600">{item.cost}</td>
                          <td className="p-2 text-sm tabular text-emerald-600">{item.sell}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex gap-2">
                    <button onClick={() => handleAcceptInvoice(inv)} disabled={loading} className="btn-success flex-1">
                      <Check className="w-4 h-4" /> قبول وتحديث المخزون
                    </button>
                    <button onClick={() => handleRejectInvoice(inv.id)} className="btn-danger">
                      <X className="w-4 h-4" /> رفض
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { Search, Plus } from 'lucide-react';
