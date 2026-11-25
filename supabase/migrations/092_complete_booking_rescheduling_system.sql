-- ==============================================================================
-- Migration: 092_complete_booking_rescheduling_system.sql
-- Description: Concurrency-safe atomic booking rescheduling with audit trail,
--              reschedule count, original slot history, and advisory lock RPC.
-- ==============================================================================

-- 1. Extend customer_bookings with rescheduling columns
ALTER TABLE public.customer_bookings
  ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_rescheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_rescheduled_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reschedule_reason TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Audit/tracking table for detailed rescheduling log
CREATE TABLE IF NOT EXISTS public.customer_booking_reschedule_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.customer_bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
  previous_scheduled_at TIMESTAMPTZ NOT NULL,
  new_scheduled_at TIMESTAMPTZ NOT NULL,
  previous_duration_minutes INTEGER NOT NULL,
  new_duration_minutes INTEGER NOT NULL,
  reason TEXT,
  rescheduled_by UUID NOT NULL REFERENCES public.profiles(id),
  rescheduled_by_role TEXT NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lookup by booking and astrologer
CREATE INDEX IF NOT EXISTS idx_booking_reschedule_logs_booking
  ON public.customer_booking_reschedule_logs(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_reschedule_logs_customer
  ON public.customer_booking_reschedule_logs(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_reschedule_logs_astrologer
  ON public.customer_booking_reschedule_logs(astrologer_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.customer_booking_reschedule_logs ENABLE ROW LEVEL SECURITY;

-- Customer can view own reschedule logs
CREATE POLICY "Customers can view own booking reschedule logs"
  ON public.customer_booking_reschedule_logs
  FOR SELECT
  TO authenticated
  USING (
    customer_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.astrologer_profiles ap
      WHERE ap.id = astrologer_id AND ap.user_id = (SELECT auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin', 'super_admin')
    )
  );

-- 3. Atomic, Concurrency-Safe RPC for Rescheduling
CREATE OR REPLACE FUNCTION public.reschedule_customer_consultation_booking(
  p_booking_id UUID,
  p_new_scheduled_at TIMESTAMPTZ,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.customer_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_booking public.customer_bookings;
  v_astro_status TEXT;
  v_new_end TIMESTAMPTZ;
  v_overlap_count INTEGER;
  v_updated_booking public.customer_bookings;
  v_history_entry JSONB;
BEGIN
  -- 1. Validate caller authentication
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to reschedule a booking.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Verify caller role
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Load & Lock booking row FOR UPDATE
  SELECT * INTO v_booking
  FROM public.customer_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found.'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Verify ownership / authorization
  IF v_caller_role = 'customer' AND v_booking.customer_id <> v_caller_id THEN
    RAISE EXCEPTION 'You are not authorized to reschedule this booking.'
      USING ERRCODE = '42501';
  ELSIF v_caller_role = 'astrologer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.astrologer_profiles ap
      WHERE ap.id = v_booking.astrologer_id AND ap.user_id = v_caller_id
    ) THEN
      RAISE EXCEPTION 'You are not authorized to reschedule this booking.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF v_caller_role NOT IN ('customer', 'astrologer', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to reschedule.'
      USING ERRCODE = '42501';
  END IF;

  -- 5. Verify booking status eligibility
  IF v_booking.status IN ('completed', 'no_show') THEN
    RAISE EXCEPTION 'Cannot reschedule a completed or no-show consultation.'
      USING ERRCODE = '22000';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot reschedule a cancelled consultation.'
      USING ERRCODE = '22000';
  END IF;

  -- 6. Validate new time slot is in the future (minimum 10 minutes from now)
  IF p_new_scheduled_at <= (pg_catalog.now() + interval '10 minutes') THEN
    RAISE EXCEPTION 'New appointment slot must be scheduled at least 10 minutes in advance.'
      USING ERRCODE = '22000';
  END IF;

  -- Prevent rescheduling to the exact same slot
  IF v_booking.scheduled_at = p_new_scheduled_at THEN
    RAISE EXCEPTION 'The requested appointment slot is identical to the current slot.'
      USING ERRCODE = '22000';
  END IF;

  -- 7. Verify astrologer is actively approved
  SELECT approval_status INTO v_astro_status
  FROM public.astrologer_profiles
  WHERE id = v_booking.astrologer_id;

  IF v_astro_status IS NULL OR v_astro_status <> 'approved' THEN
    RAISE EXCEPTION 'The assigned astrologer is currently unavailable for bookings.'
      USING ERRCODE = 'P0002';
  END IF;

  v_new_end := p_new_scheduled_at + (v_booking.duration_minutes || ' minutes')::interval;

  -- 8. Acquire transactional advisory lock per astrologer to serialize concurrent slot bookings
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_booking.astrologer_id::text)
  );

  -- 9. Check for slot overlaps with other active bookings for the same astrologer (excluding this booking)
  SELECT count(*) INTO v_overlap_count
  FROM public.customer_bookings
  WHERE astrologer_id = v_booking.astrologer_id
    AND id <> v_booking.id
    AND status IN ('pending', 'confirmed')
    AND (
      (scheduled_at, scheduled_at + (duration_minutes || ' minutes')::interval)
      OVERLAPS
      (p_new_scheduled_at, v_new_end)
    );

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'The selected time slot is already booked. Please choose another available slot.'
      USING ERRCODE = '23505';
  END IF;

  -- 10. Build history entry
  v_history_entry := jsonb_build_object(
    'rescheduled_at', pg_catalog.now(),
    'rescheduled_by', v_caller_id,
    'rescheduled_by_role', v_caller_role,
    'previous_scheduled_at', v_booking.scheduled_at,
    'new_scheduled_at', p_new_scheduled_at,
    'reason', coalesce(trim(p_reason), 'No reason provided')
  );

  -- 11. Atomic Update of customer_bookings
  UPDATE public.customer_bookings
  SET
    original_scheduled_at = coalesce(v_booking.original_scheduled_at, v_booking.scheduled_at),
    scheduled_at = p_new_scheduled_at,
    reschedule_count = coalesce(v_booking.reschedule_count, 0) + 1,
    last_rescheduled_at = pg_catalog.now(),
    last_rescheduled_by = v_caller_id,
    reschedule_reason = coalesce(nullif(trim(p_reason), ''), v_booking.reschedule_reason),
    reschedule_history = coalesce(v_booking.reschedule_history, '[]'::jsonb) || v_history_entry,
    updated_at = pg_catalog.now()
  WHERE id = v_booking.id
  RETURNING * INTO v_updated_booking;

  -- 12. Insert immutable audit log
  INSERT INTO public.customer_booking_reschedule_logs (
    booking_id,
    customer_id,
    astrologer_id,
    previous_scheduled_at,
    new_scheduled_at,
    previous_duration_minutes,
    new_duration_minutes,
    reason,
    rescheduled_by,
    rescheduled_by_role,
    created_at
  ) VALUES (
    v_booking.id,
    v_booking.customer_id,
    v_booking.astrologer_id,
    v_booking.scheduled_at,
    p_new_scheduled_at,
    v_booking.duration_minutes,
    v_booking.duration_minutes,
    coalesce(nullif(trim(p_reason), ''), 'Rescheduled via portal'),
    v_caller_id,
    v_caller_role,
    pg_catalog.now()
  );

  RETURN v_updated_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_customer_consultation_booking(UUID, TIMESTAMPTZ, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.reschedule_customer_consultation_booking(UUID, TIMESTAMPTZ, TEXT) TO authenticated, service_role;
