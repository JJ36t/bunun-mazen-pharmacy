-- ========================================
-- Migration 20240115000000: Demote unverified barcode trust (audit 3.4, P1)
-- ========================================
-- Root cause: 0013 inserted 23 manual barcode entries with verified = TRUE
-- and no evidence link, reviewer, or review date. One of them
-- (0400218349008) even fails the EAN-13 checksum. "Inserted in a SQL file"
-- must not mean "verified".
--
-- Fix: demote every manual verified=TRUE row to FALSE. Future entries get
-- verified=TRUE only through a documented review workflow with an evidence
-- source. Also flag the invalid checksum barcode explicitly via source.
-- ========================================

-- 1) Demote all manually-seeded verified rows (no evidence link exists for them)
UPDATE global_medicines
SET verified = FALSE
WHERE verified = TRUE;

-- 2) Flag the checksum-invalid barcode so it is visibly non-trusted
UPDATE global_medicines
SET source = source || '_bad_checksum',
    verified = FALSE
WHERE barcode = '0400218349008'
  AND source NOT LIKE '%_bad_checksum';
