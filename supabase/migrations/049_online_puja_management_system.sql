-- ====================================================================
-- MIGRATION 049: COMPLETE ONLINE PUJA BOOKING & FULFILMENT SYSTEM
-- Priest Assignments, Darshan Tokens, Media Evidence, and Devotee Reviews
-- ====================================================================

-- 1. EXTEND PUJA_CATALOG (Images, Dakshina Price, Samagri Details)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'puja_catalog' 
      AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.puja_catalog 
      ADD COLUMN image_url TEXT,
      ADD COLUMN category TEXT NOT NULL DEFAULT 'Vedic Rituals',
      ADD COLUMN base_price INTEGER NOT NULL DEFAULT 2100,
      ADD COLUMN samagri_details TEXT,
      ADD COLUMN preparation_instructions TEXT;
  END IF;
END $$;

-- 2. EXTEND PUJA_BOOKINGS (Priest Assignment, Darshan Room, Evidence, Reviews)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'puja_bookings' 
      AND column_name = 'fulfilment_status'
  ) THEN
    ALTER TABLE public.puja_bookings 
      ADD COLUMN fulfilment_status TEXT NOT NULL DEFAULT 'booking_received' 
        CHECK (fulfilment_status IN ('booking_received', 'awaiting_assignment', 'assigned', 'assignment_accepted', 'scheduled', 'preparation', 'in_progress', 'completed', 'cancelled')),
      ADD COLUMN darshan_room_name TEXT,
      ADD COLUMN darshan_token_expiry TIMESTAMPTZ,
      ADD COLUMN evidence_photos JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN evidence_video_url TEXT,
      ADD COLUMN completion_notes TEXT,
      ADD COLUMN completed_at TIMESTAMPTZ,
      ADD COLUMN verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN verified_at TIMESTAMPTZ,
      ADD COLUMN rating INTEGER CHECK (rating >= 1 AND rating <= 5),
      ADD COLUMN review_feedback TEXT,
      ADD COLUMN review_submitted_at TIMESTAMPTZ,
      ADD COLUMN idempotency_key TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_puja_bookings_fulfilment 
  ON public.puja_bookings (customer_id, fulfilment_status);
CREATE INDEX IF NOT EXISTS idx_puja_bookings_astrologer 
  ON public.puja_bookings (astrologer_id, preferred_date);
CREATE INDEX IF NOT EXISTS idx_puja_bookings_idempotency 
  ON public.puja_bookings (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. PUJA REVIEWS & TESTIMONIALS TABLE
CREATE TABLE IF NOT EXISTS public.puja_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.puja_bookings(id) ON DELETE CASCADE,
    puja_id UUID NOT NULL REFERENCES public.puja_catalog(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT NOT NULL,
    is_approved BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT uq_puja_booking_review UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_puja_reviews_puja 
  ON public.puja_reviews (puja_id, is_approved);

ALTER TABLE public.puja_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view approved puja reviews"
  ON public.puja_reviews
  FOR SELECT
  TO authenticated, anon
  USING (is_approved = true);

CREATE POLICY "Customers can insert their own puja review"
  ON public.puja_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Super Admins can manage all puja reviews"
  ON public.puja_reviews
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 4. PUJA STORAGE BUCKET POLICIES (If storage is available)
-- Creates isolated bucket record if not present
INSERT INTO storage.buckets (id, name, public)
VALUES ('puja-evidence', 'puja-evidence', false)
ON CONFLICT (id) DO NOTHING;

