import type { Medicine } from "../../types";
export const normalizeArabic = (str: string): string => {
  return str
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
};

const enToArMap: { [key: string]: string } = {
  'a': 'ا', 'b': 'ب', 'c': 'ك', 'd': 'د', 'e': 'ي', 'f': 'ف', 'g': 'ج',
  'h': 'ه', 'i': 'ي', 'j': 'ج', 'k': 'ك', 'l': 'ل', 'm': 'م', 'n': 'ن',
  'o': 'و', 'p': 'ب', 'q': 'ق', 'r': 'ر', 's': 'س', 't': 'ت', 'u': 'و',
  'v': 'ف', 'w': 'و', 'x': 'كس', 'y': 'ي', 'z': 'ز'
};

export const transliterate = (str: string): string => {
  let result = '';
  for (const char of str.toLowerCase()) {
    result += enToArMap[char] || char;
  }
  return result;
};

export const levenshtein = (a: string, b: string): number => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

export const searchMedicines = (query: string, items: Medicine[]) => {
  if (!query.trim()) return [];

  const trimmedQuery = query.trim();
  const isBarcode = /^\d+$/.test(trimmedQuery);
  const normalizedQuery = normalizeArabic(query);
  const transliteratedQuery = transliterate(query);

  return items.filter(item => {
    // مطابقة الباركود: تامة أو جزئية
    if (isBarcode && item.barcode) {
      const itemBarcode = String(item.barcode).trim();
      if (itemBarcode === trimmedQuery) return true;
      if (itemBarcode.includes(trimmedQuery)) return true;
      // endsWith فرع ميت (includes يغطيه) — أُزيل
    }

    const normalizedNameAr = normalizeArabic(item.nameAr);
    const normalizedNameEn = item.nameEn ? item.nameEn.toLowerCase() : '';

    if (
      normalizedNameAr.includes(normalizedQuery) ||
      normalizedNameEn.includes(trimmedQuery.toLowerCase()) ||
      normalizedNameAr.includes(transliteratedQuery)
    ) {
      return true;
    }

    // Fuzzy: قارن الاستعلام بكل كلمة في الاسم (tokenization) بدل الاسم الكامل
    // هذا يُحسّن البحث الضبابي بشكل كبير للأسماء متعددة الكلمات
    if (normalizedQuery.length >= 4) {
      const tokens = normalizedNameAr.split(' ').filter(t => t.length >= 3);
      for (const token of tokens) {
        const distance = levenshtein(normalizedQuery, token);
        if (distance <= 2 && distance > 0) return true;
      }
    }

    return false;
  });
};

// ===== فهرسة مسبقة للأسماء (memoization) — تُستخدم عبر searchMedicinesIndexed =====
// تُحسب مرة واحدة لكل قائمة أدوية، ثم تُعاد استخدامها
interface IndexedItem { item: Medicine; normalizedNameAr: string; normalizedNameEn: string; }
const indexCache = new WeakMap<any[], IndexedItem[]>();

const getIndexedItems = (items: Medicine[]): IndexedItem[] => {
  let indexed = indexCache.get(items);
  if (!indexed) {
    indexed = items.map(item => ({
      item,
      normalizedNameAr: normalizeArabic(item.nameAr || ''),
      normalizedNameEn: (item.nameEn || '').toLowerCase(),
    }));
    indexCache.set(items, indexed);
  }
  return indexed;
};

// نسخة مفهرسة من searchMedicines — أسرع 5-10x للقوائم الكبيرة
export const searchMedicinesIndexed = (query: string, items: Medicine[]) => {
  if (!query.trim()) return [];
  const trimmedQuery = query.trim();
  const isBarcode = /^\d+$/.test(trimmedQuery);
  const normalizedQuery = normalizeArabic(query);
  const transliteratedQuery = transliterate(query);
  const indexed = getIndexedItems(items);

  const results: Medicine[] = [];
  for (const { item, normalizedNameAr, normalizedNameEn } of indexed) {
    if (isBarcode && item.barcode) {
      const itemBarcode = String(item.barcode).trim();
      if (itemBarcode === trimmedQuery || itemBarcode.includes(trimmedQuery)) {
        results.push(item);
        continue;
      }
    }
    if (
      normalizedNameAr.includes(normalizedQuery) ||
      normalizedNameEn.includes(trimmedQuery.toLowerCase()) ||
      normalizedNameAr.includes(transliteratedQuery)
    ) {
      results.push(item);
      continue;
    }
    if (normalizedQuery.length >= 4) {
      const tokens = normalizedNameAr.split(' ').filter(t => t.length >= 3);
      for (const token of tokens) {
        const distance = levenshtein(normalizedQuery, token);
        if (distance <= 2 && distance > 0) { results.push(item); break; }
      }
    }
  }
  return results;
};

// ===== أدوات مساعدة لـ EAN-13 =====

// حساب رقم التحقق EAN-13 (نفس خوارزمية GS1 الرسمية)
export const computeEan13CheckDigit = (prefix12: string): number => {
  if (!/^\d{12}$/.test(prefix12)) {
    throw new Error('EAN-13 prefix must be exactly 12 digits');
  }
  let total = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(prefix12[i], 10);
    const weight = i % 2 === 0 ? 1 : 3; // position 1 (index 0) = weight 1
    total += digit * weight;
  }
  return (10 - (total % 10)) % 10;
};

// توليد باركود EAN-13 كامل (13 رقم)
export const generateEan13Barcode = (prefix12: string): string => {
  const checkDigit = computeEan13CheckDigit(prefix12);
  return `${prefix12}${checkDigit}`;
};

// توليد باركود داخلي بالصيغة الموحدة (200 prefix + 9 أرقام تسلسلية)
export const generateInternalEan13 = (sequenceNumber: number): string => {
  const prefix12 = `200${String(sequenceNumber).padStart(9, '0')}`;
  return generateEan13Barcode(prefix12);
};

// التحقق من صحة باركود EAN-13
export const isValidEan13 = (barcode: string): boolean => {
  if (!/^\d{13}$/.test(barcode)) return false;
  const prefix12 = barcode.substring(0, 12);
  const actualCheck = parseInt(barcode[12], 10);
  const expectedCheck = computeEan13CheckDigit(prefix12);
  return actualCheck === expectedCheck;
};