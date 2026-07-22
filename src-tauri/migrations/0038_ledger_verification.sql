-- ========================================
-- Migration 0038: Add ledger verification function
-- ========================================
-- Root cause: ledger_entries could have unbalanced transactions
-- (SUM(debit) != SUM(credit) per transaction_id) if a partial
-- failure occurred before Phase 6 transaction fix.
--
-- Fix: Add function to detect unbalanced transactions and
-- function to verify trial balance integrity.
-- ========================================

-- Function: find unbalanced transactions (debit != credit)
CREATE OR REPLACE FUNCTION find_unbalanced_transactions() RETURNS TABLE (
    transaction_id UUID,
    total_debit DECIMAL(15,2),
    total_credit DECIMAL(15,2),
    difference DECIMAL(15,2)
) AS $$
SELECT transaction_id,
       SUM(debit_amount) AS total_debit,
       SUM(credit_amount) AS total_credit,
       SUM(debit_amount) - SUM(credit_amount) AS difference
FROM ledger_entries
GROUP BY transaction_id
HAVING SUM(debit_amount) != SUM(credit_amount);
$$ LANGUAGE sql STABLE;

-- Function: verify trial balance (total debit == total credit)
CREATE OR REPLACE FUNCTION verify_trial_balance() RETURNS TABLE (
    total_debit DECIMAL(15,2),
    total_credit DECIMAL(15,2),
    is_balanced BOOLEAN
) AS $$
SELECT
    COALESCE(SUM(debit_amount), 0) AS total_debit,
    COALESCE(SUM(credit_amount), 0) AS total_credit,
    (COALESCE(SUM(debit_amount), 0) = COALESCE(SUM(credit_amount), 0)) AS is_balanced
FROM ledger_entries;
$$ LANGUAGE sql STABLE;

-- Function: verify account balances match entry sums
CREATE OR REPLACE FUNCTION verify_account_balances() RETURNS TABLE (
    account_code VARCHAR,
    account_name VARCHAR,
    stored_balance DECIMAL(15,2),
    computed_balance DECIMAL(15,2),
    difference DECIMAL(15,2)
) AS $$
SELECT la.account_code, la.account_name, la.balance,
       COALESCE(SUM(le.debit_amount - le.credit_amount), 0) AS computed_balance,
       la.balance - COALESCE(SUM(le.debit_amount - le.credit_amount), 0) AS difference
FROM ledger_accounts la
LEFT JOIN ledger_entries le ON le.account_id = la.id
GROUP BY la.account_code, la.account_name, la.balance
HAVING la.balance != COALESCE(SUM(le.debit_amount - le.credit_amount), 0);
$$ LANGUAGE sql STABLE;
