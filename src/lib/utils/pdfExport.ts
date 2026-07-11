// ========================================
// PDF Export Utility
// ========================================
// يصدّر التقارير والفواتير كـ PDF عبر print-to-PDF
// يعمل بدون مكتبات خارجية (يستخدم المتصفح)

interface PdfColumn {
  key: string;
  label: string;
  width?: string;
  align?: 'right' | 'left' | 'center';
}

interface PdfOptions {
  title: string;
  subtitle?: string;
  pharmacyName?: string;
  columns: PdfColumn[];
  rows: any[];
  summary?: { label: string; value: string }[];
  orientation?: 'portrait' | 'landscape';
}

/**
 * يفتح نافذة طباعة بتنسيق PDF احترافي
 */
export function exportToPdf(options: PdfOptions): void {
  const {
    title,
    subtitle,
    pharmacyName = 'صيدلية بنين مازن',
    columns,
    rows,
    summary,
    orientation = 'portrait',
  } = options;

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('الرجاء السماح بالنوافذ المنبثقة لتصدير PDF');
    return;
  }

  const now = new Date().toLocaleString('en-GB');
  
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 ${orientation}; margin: 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Cairo', 'Tahoma', sans-serif; color: #1e293b; padding: 20px; }
  .header { text-align: center; margin-bottom: 25px; border-bottom: 3px solid #7e22ce; padding-bottom: 15px; }
  .pharmacy-name { font-size: 22px; font-weight: bold; color: #7e22ce; }
  .report-title { font-size: 18px; font-weight: bold; margin-top: 8px; color: #1e293b; }
  .report-subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
  .report-date { font-size: 11px; color: #94a3b8; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
  thead { background: #7e22ce; color: white; }
  th { padding: 10px 8px; text-align: right; font-weight: 600; border: 1px solid #6b21a8; }
  td { padding: 8px; text-align: right; border: 1px solid #e2e8f0; }
  tbody tr:nth-child(even) { background: #faf5ff; }
  tbody tr:hover { background: #f3e8ff; }
  .summary { margin-top: 25px; padding: 15px; background: #faf5ff; border: 2px solid #e9d5ff; border-radius: 8px; }
  .summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
  .summary-row.total { font-weight: bold; font-size: 16px; border-top: 2px solid #7e22ce; margin-top: 8px; padding-top: 12px; color: #7e22ce; }
  .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  .no-data { text-align: center; padding: 40px; color: #94a3b8; font-style: italic; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    <div class="pharmacy-name">${escapeHtml(pharmacyName)}</div>
    <div class="report-title">${escapeHtml(title)}</div>
    ${subtitle ? `<div class="report-subtitle">${escapeHtml(subtitle)}</div>` : ''}
    <div class="report-date">تاريخ التقرير: ${escapeHtml(now)}</div>
  </div>
  
  ${rows.length === 0 
    ? '<div class="no-data">لا توجد بيانات في هذه الفترة</div>'
    : `<table>
      <thead>
        <tr>
          ${columns.map(c => `<th style="${c.width ? `width:${c.width};` : ''}${c.align ? `text-align:${c.align};` : ''}">${c.label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            ${columns.map(c => `<td style="${c.align ? `text-align:${c.align};` : ''}">${formatValue(row[c.key])}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>`
  }
  
  ${summary && summary.length > 0 ? `
    <div class="summary">
      ${summary.map((s, i) => `
        <div class="summary-row ${i === summary.length - 1 ? 'total' : ''}">
          <span>${escapeHtml(s.label)}</span>
          <span>${escapeHtml(s.value)}</span>
        </div>
      `).join('')}
    </div>
  ` : ''}
  
  <div class="footer">
    تم إنشاء هذا التقرير بواسطة نظام صيدلية بنين مازن - ${escapeHtml(now)}
  </div>
  
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return value.toLocaleString('en-US');
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value).toLocaleString('en-US');
  }
  return escapeHtml(String(value));
}

// دالة تهريب HTML لمنع XSS في تصدير PDF
function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * يصدّر فاتورة واحدة كـ PDF
 */
export function exportInvoiceToPdf(invoice: {
  invoiceNumber: string;
  items: { nameAr: string; quantity: number; price: number }[];
  total: number;
  pharmacyName?: string;
  date?: string;
  cashier?: string;
}): void {
  const { invoiceNumber, items, total, pharmacyName = 'صيدلية بنين مازن', date, cashier } = invoice;
  
  const printWindow = window.open('', '_blank', 'width=600,height=800');
  if (!printWindow) return;
  
  const now = date || new Date().toLocaleString('en-GB');
  
  printWindow.document.open();
  printWindow.document.write(`
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>فاتورة ${invoiceNumber}</title>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: 'Cairo', 'Tahoma', sans-serif; padding: 20px; color: #1e293b; max-width: 600px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 20px; }
  .pharmacy { font-size: 24px; font-weight: bold; color: #7e22ce; }
  .invoice-info { background: #faf5ff; padding: 12px; border-radius: 8px; margin: 15px 0; font-size: 13px; }
  .invoice-info div { display: flex; justify-content: space-between; padding: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th { background: #7e22ce; color: white; padding: 10px; text-align: right; font-size: 12px; }
  td { padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
  .total { background: #faf5ff; padding: 15px; border-radius: 8px; margin-top: 15px; font-size: 18px; font-weight: bold; text-align: center; color: #7e22ce; }
  .footer { text-align: center; margin-top: 25px; font-size: 11px; color: #94a3b8; }
</style>
</head>
<body>
  <div class="header">
    <div class="pharmacy">${escapeHtml(pharmacyName)}</div>
  </div>
  <div class="invoice-info">
    <div><span>رقم الفاتورة:</span><span>${invoiceNumber}</span></div>
    <div><span>التاريخ:</span><span>${escapeHtml(now)}</span></div>
    ${cashier ? `<div><span>الكاشير:</span><span>${cashier}</span></div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>الصنف</th>
        <th style="text-align:center;">الكمية</th>
        <th style="text-align:left;">السعر</th>
        <th style="text-align:left;">الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(i => `
        <tr>
          <td>${i.nameAr}</td>
          <td style="text-align:center;">${i.quantity}</td>
          <td style="text-align:left;">${i.price.toFixed(2)}</td>
          <td style="text-align:left;">${(i.price * i.quantity).toFixed(2)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="total">الإجمالي: ${total.toFixed(2)} د.ع</div>
  <div class="footer">شكراً لزيارتكم - ${escapeHtml(pharmacyName)}</div>
  <script>
    window.onload = function() { setTimeout(() => window.print(), 300); };
  </script>
</body>
</html>
  `);
  printWindow.document.close();
}
