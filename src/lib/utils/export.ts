import { invoke } from '@tauri-apps/api/core';

// أداة تصدير تعتمد على توليد جدول HTML ليقوم Excel بقراءته في خلايا مفصولة ومرتبة
export const exportToCSV = async (filename: string, headers: string[], rows: any[]) => {
  // بناء هيكل HTML يفهمه Excel
  let htmlContent = `
    <meta charset="UTF-8">
    <table border="1" style="border-collapse: collapse; font-family: 'Cairo', sans-serif; width: 100%;">
      <thead>
        <tr style="background-color: #1e40af; color: white; font-weight: bold;">
  `;
  
  // إضافة العناوين (Headers)
  headers.forEach(h => {
    htmlContent += `<th style="padding: 8px;">${h}</th>`;
  });
  
  htmlContent += `</tr></thead><tbody>`;
  
  // إضافة الصفوف (Rows)
  rows.forEach(row => {
    htmlContent += `<tr>`;
    row.forEach((cell: any) => {
      htmlContent += `<td style="padding: 8px; text-align: center;">${cell ?? ''}</td>`;
    });
    htmlContent += `</tr>`;
  });
  
  htmlContent += `</tbody></table>`;

  try {
    // استدعاء أمر Rust لحفظ الملف بصيغة xls
    const savedPath = await invoke<string>('save_csv_file', { 
      filename: `${filename}.xls`, 
      content: htmlContent 
    });
    alert(`تم تصدير الملف بنجاح إلى سطح المكتب:\n${savedPath}`);
  } catch (e) {
    alert('فشل تصدير الملف: ' + e);
  }
};