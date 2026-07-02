// ========================================
// Sample Plugin: WhatsApp Integration (مثال)
// ========================================
// plugin جاهز للمستقبل - غير مفعّل افتراضياً

import { PharmacyPlugin } from '../lib/core/pluginRegistry';
import { MessageCircle, Send } from 'lucide-react';
import { useState } from 'react';

function WhatsAppDashboard() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  
  const handleSend = () => {
    if (!phone || !message) return;
    // في المستقبل: تكامل فعلي مع WhatsApp API
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50">
      <div className="mb-6">
        <h1 className="section-title">تكامل WhatsApp</h1>
        <p className="section-subtitle">إرسال الفواتير والتذكيرات للزبائن</p>
      </div>
      
      <div className="card-elegant p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">إرسال رسالة</h3>
            <p className="text-xs text-slate-400">رسالة جديدة عبر WhatsApp</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="label">رقم الهاتف (مع رمز الدولة)</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9647712345678"
              className="input tabular"
            />
          </div>
          <div>
            <label className="label">الرسالة</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="مرحباً، فاتورتك من صيدلية بنين مازن..."
              className="input min-h-[120px] resize-none"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!phone || !message}
            className="btn-success w-full"
          >
            <Send className="w-4 h-4" />
            إرسال عبر WhatsApp
          </button>
        </div>
        
        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-800">
            <strong>ملاحظة:</strong> التكامل الكامل (إرسال تلقائي بعد كل بيع) يتطلب WhatsApp Business API.
          </p>
        </div>
      </div>
    </div>
  );
}

export const whatsappPlugin: PharmacyPlugin = {
  name: 'whatsapp-integration',
  version: '1.0.0',
  displayName: 'تكامل WhatsApp',
  description: 'إرسال الفواتير والتذكيرات للزبائن عبر WhatsApp',
  icon: MessageCircle,
  author: 'Bunun Mazen Pharmacy',
  
  dashboard: WhatsAppDashboard,
  navLabel: 'WhatsApp',
  navOrder: 110,
  
  async onLoad() {
    console.log('[Plugin:WhatsApp] Loaded');
  },
  
  async onInvoiceCreated(invoice: any) {
    // في المستقبل: إرسال الفاتورة تلقائياً
    console.log('[Plugin:WhatsApp] Invoice created - could send to customer:', invoice);
  },
  
  configSchema: {
    autoSend: {
      type: 'boolean',
      label: 'إرسال تلقائي بعد كل بيع',
      default: false,
    },
    template: {
      type: 'string',
      label: 'قالب الرسالة',
      default: 'شكراً لزيارتكم صيدلية بنين مازن. إجمالي فاتورتك: {total} د.ع',
    },
  },
};
