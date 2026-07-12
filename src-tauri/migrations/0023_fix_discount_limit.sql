-- Migration 0023: Fix max_discount_amount — was 1000, should be 100000
UPDATE settings SET value = '100000' WHERE key = 'max_discount_amount';
