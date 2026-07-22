-- ========================================
-- Migration 0026: Add login_at column to user_sessions
-- ========================================
-- Root cause: main.rs login() INSERT uses 'login_at' column but it was
-- never created in any migration. Original code used 'let _ =' which
-- silently swallowed the error, giving users a token not in DB.
-- Phase 2 Auth Fix propagated the error, exposing the bug.
--
-- Fix: Add the missing column.
-- ========================================

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS login_at TIMESTAMP DEFAULT NOW();

-- Backfill: set login_at = created_at for existing sessions
UPDATE user_sessions SET login_at = created_at WHERE login_at IS NULL;
