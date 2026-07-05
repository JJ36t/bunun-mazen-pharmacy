// Scanner Types
export interface ScannerState {
  connected: boolean;
  serverUrl: string;
  port: number;
  localIp: string;
  wsUrl: string;
  mobileUrl: string;
}

export interface PairingInfo {
  token: string;
  url: string;
  qrCode: string;
  expiresIn: number;
}

export interface ConnectedDevice {
  id: string;
  deviceName: string;
  deviceIp: string;
  pairedAt: string;
  lastSeen: string | null;
}

export interface ScanResult {
  status: 'found' | 'global_found' | 'not_found';
  medicineId?: string;
  nameAr?: string;
  price?: number;
  quantity?: number;
  name?: string;
  activeIngredient?: string;
  brandName?: string;
  dosageForm?: string;
  dosageFormAr?: string;
  strength?: string;
  barcode?: string;
  normalized?: string;
  barcodeType?: string;
}

export interface ScanAuditLog {
  id: string;
  deviceName: string;
  deviceIp: string;
  userRole: string;
  barcode: string;
  barcodeType: string;
  scanResult: string;
  matchedMedicine: string;
  createdAt: string;
}

export type BarcodeType = 'EAN13' | 'GTIN13' | 'GTIN14' | 'UPC' | 'NDC10' | 'NDC11' | 'CIP13' | 'INTERNAL' | 'WHO_EML' | 'UNKNOWN';

export interface NormalizedBarcode {
  original: string;
  normalized: string;
  type: BarcodeType;
  isValid: boolean;
}
