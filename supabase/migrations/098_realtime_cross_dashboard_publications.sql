-- ============================================================================
-- MIGRATION 098: Cross-Dashboard Realtime Publications
-- Ensures financial, wallet, payout, review, and support tables are published
-- to `supabase_realtime` with REPLICA IDENTITY FULL for simultaneous 3-portal
-- (Customer, Astrologer, Super Admin) live synchronization.
-- ============================================================================

DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'astrologer_payouts',
    'astrologer_wallet_transactions',
    'commission_settlements',
    'customer_wallets',
    'wallet_transactions',
    'payment_orders',
    'consultation_reviews',
    'support_tickets',
    'support_messages'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = v_table
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_table);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END IF;
  END LOOP;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;
