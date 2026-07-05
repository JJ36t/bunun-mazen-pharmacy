// Mobile Scanner Page
export { MobileScannerModal } from './components/MobileScannerModal';
export { useMobileScanner } from './hooks/useMobileScanner';
export { useMobileScannerStore } from './store/mobileScanner.store';
export { normalizeBarcode, detectBarcodeType, validateEan13 } from './services/barcodeNormalizer';
export { scanBarcodeDirect } from './services/scannerSocket';
