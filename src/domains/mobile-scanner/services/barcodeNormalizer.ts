// Barcode Normalizer Service
import type { NormalizedBarcode, BarcodeType } from '../types/scanner.types';

export function normalizeBarcode(barcode: string): string {
  const cleaned = barcode.replace(/\D/g, '');

  if (cleaned.length === 13) return cleaned;
  if (cleaned.length === 14) return cleaned.substring(1);
  if (cleaned.length === 12) return '0' + cleaned;
  if (cleaned.length === 10 || cleaned.length === 11) return '3' + cleaned;

  return cleaned;
}

export function detectBarcodeType(barcode: string): BarcodeType {
  const cleaned = barcode.replace(/\D/g, '');

  if (cleaned.length === 13) {
    if (cleaned.startsWith('34009')) return 'CIP13';
    if (cleaned.startsWith('200')) return 'INTERNAL';
    if (cleaned.startsWith('999')) return 'WHO_EML';
    if (cleaned.startsWith('3')) return 'NDC10' as any;
    return 'EAN13';
  }
  if (cleaned.length === 14) return 'GTIN14';
  if (cleaned.length === 12) return 'UPC';
  if (cleaned.length === 10 || cleaned.length === 11) return 'NDC10';
  if (barcode.startsWith('BNN')) return 'INTERNAL';

  return 'UNKNOWN';
}

export function validateEan13(barcode: string): boolean {
  if (barcode.length !== 13 || !/^\d{13}$/.test(barcode)) return false;
  const digits = barcode.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return check === digits[12];
}

export function normalize(barcode: string): NormalizedBarcode {
  const normalized = normalizeBarcode(barcode);
  const type = detectBarcodeType(barcode);
  const isValid = type === 'EAN13' || type === 'CIP13' ? validateEan13(barcode) : true;

  return { original: barcode, normalized, type, isValid };
}
