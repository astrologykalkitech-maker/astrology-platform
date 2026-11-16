-- Migration 058: Enable Realtime publications for core operational tables
-- Fixes notification sound failures for bookings, lead assignments, notifications, and video consultation meetings.

ALTER TABLE IF EXISTS public.customer_bookings REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.puja_bookings REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.customer_notifications REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.lead_assignments REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.consultation_meetings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'customer_bookings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_bookings;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'puja_bookings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.puja_bookings;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'customer_notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'lead_assignments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_assignments;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'consultation_meetings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.consultation_meetings;
    END IF;
  END IF;
END $$;
