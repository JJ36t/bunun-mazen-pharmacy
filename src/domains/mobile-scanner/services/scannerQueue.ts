// Scanner Queue — منع التكرار والـ spam
export class ScannerQueue {
  private queue: string[] = [];
  private processing = false;
  private lastBarcode = '';
  private lastTime = 0;
  private readonly debounceMs = 1500;
  private onProcess: (barcode: string) => void;

  constructor(onProcess: (barcode: string) => void) {
    this.onProcess = onProcess;
  }

  add(barcode: string): boolean {
    const now = Date.now();

    // Debounce — نفس الباركود خلال 1.5 ثانية = مرفوض
    if (barcode === this.lastBarcode && (now - this.lastTime) < this.debounceMs) {
      return false;
    }

    this.lastBarcode = barcode;
    this.lastTime = now;
    this.queue.push(barcode);
    this.process();
    return true;
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const barcode = this.queue.shift();
      if (barcode) {
        this.onProcess(barcode);
      }
    }

    this.processing = false;
  }

  clear() {
    this.queue = [];
    this.lastBarcode = '';
    this.lastTime = 0;
  }
}
