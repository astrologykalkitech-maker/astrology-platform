-- ============================================================================
-- MIGRATION 067: EXPAND PAYOUT AND REFUND STATUS ENUMS
-- Phase 3 - Stage 3C.1: Non-Destructive Enum Value Additions
--
-- PURPOSE:
-- Safely add missing lifecycle states to public.payout_status_enum and
-- public.refund_status_enum without modifying existing tables or using new
-- enum literals within this transaction block.
--
-- POSTGRESQL TRANSACTION SAFETY:
-- PostgreSQL forbids using newly added enum values inside the same transaction
-- block in which they are added (ALTER TYPE ... ADD VALUE).
-- Therefore, this migration ONLY expands the enum definitions and commits cleanly.
-- Migration 068 can then safely compile DDL, constraints, and RPC functions
-- referencing these committed values.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXPAND public.payout_status_enum
-- Existing values: 'requested', 'processing', 'completed', 'rejected', 'failed'
-- (Note: 'approved' and 'returned' were declared via DO block in 066).
-- Values added/ensured:
--   - 'approved' (maker-checker verified, awaiting dispatch claim)
--   - 'returned' (post-debit bank return confirmed, cash credited back)
--   - 'outcome_unknown' (dispatch attempted, bank outcome pending reconciliation)
-- ----------------------------------------------------------------------------
ALTER TYPE public.payout_status_enum ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.payout_status_enum ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE public.payout_status_enum ADD VALUE IF NOT EXISTS 'outcome_unknown';

-- ----------------------------------------------------------------------------
-- 2. EXPAND public.refund_status_enum
-- Existing values in 040: 'requested', 'approved', 'processed', 'rejected'
-- Values added:
--   - 'processing_gateway' (claim acquired, dispatching to gateway)
--   - 'outcome_unknown' (gateway call timed out or disconnected, pending reconciliation)
-- ----------------------------------------------------------------------------
ALTER TYPE public.refund_status_enum ADD VALUE IF NOT EXISTS 'processing_gateway';
ALTER TYPE public.refund_status_enum ADD VALUE IF NOT EXISTS 'outcome_unknown';
