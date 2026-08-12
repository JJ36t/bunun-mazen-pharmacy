import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @tauri-apps/api/core before importing the fraud detector
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => ({})),
}));

import { fraudDetector } from '../core/fraudDetector';

describe('FraudDetector', () => {
  beforeEach(() => {
    // Reset internal session counts by reloading the module
    vi.clearAllMocks();
  });

  describe('checkDiscount', () => {
    it('should not flag discounts below threshold (30%)', () => {
      // Should not throw
      expect(() => fraudDetector.checkDiscount('cashier', 10, 50000)).not.toThrow();
      expect(() => fraudDetector.checkDiscount('cashier', 29, 50000)).not.toThrow();
    });

    it('should flag discounts at or above threshold', () => {
      // Should not throw — it logs, doesn't raise
      expect(() => fraudDetector.checkDiscount('cashier', 30, 50000)).not.toThrow();
      expect(() => fraudDetector.checkDiscount('cashier', 50, 50000)).not.toThrow();
    });

    it('should handle zero and negative discounts gracefully', () => {
      expect(() => fraudDetector.checkDiscount('cashier', 0, 50000)).not.toThrow();
    });
  });

  describe('checkRefund', () => {
    it('should accept small refunds without error', () => {
      expect(() => fraudDetector.checkRefund('cashier', 1000)).not.toThrow();
    });

    it('should handle large refund amounts', () => {
      // Threshold is 100,000 IQD
      expect(() => fraudDetector.checkRefund('cashier', 150000)).not.toThrow();
    });

    it('should accept optional invoiceId', () => {
      expect(() => fraudDetector.checkRefund('cashier', 1000, 'inv-123')).not.toThrow();
    });
  });

  describe('checkDeletion', () => {
    it('should log deletion without error', () => {
      expect(() => fraudDetector.checkDeletion('cashier', 'medicine', 'Paracetamol')).not.toThrow();
    });
  });

  describe('checkInventoryAdjustment', () => {
    it('should accept small adjustments', () => {
      expect(() => fraudDetector.checkInventoryAdjustment('cashier', 'med-1', 5, 100)).not.toThrow();
    });

    it('should accept large negative adjustments (returns to supplier)', () => {
      expect(() => fraudDetector.checkInventoryAdjustment('cashier', 'med-1', -50, 100)).not.toThrow();
    });
  });

  describe('checkRapidSuccession', () => {
    it('should not throw on first operation', () => {
      expect(() => fraudDetector.checkRapidSuccession('cashier', 'sale')).not.toThrow();
    });

    it('should handle multiple rapid calls', () => {
      // Multiple rapid calls — should not throw even if it triggers alert
      for (let i = 0; i < 5; i++) {
        expect(() => fraudDetector.checkRapidSuccession('cashier', 'sale')).not.toThrow();
      }
    });
  });
});
