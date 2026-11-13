-- Migration 043: Authorized Missing Platform Features
-- 1. Customer Favorite Astrologers
-- 2. Astrologer Live Broadcasting (LiveKit Rooms)
-- 4. Online Puja Booking & Management
-- 5. User Localization & Multi-Language Preferences

-- 1. Customer Favorite Astrologers
CREATE TABLE IF NOT EXISTS public.customer_favorite_astrologers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT uq_customer_astrologer_favorite UNIQUE (customer_id, astrologer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorite_astrologers_cust 
    ON public.customer_favorite_astrologers(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_favorite_astrologers_astro 
    ON public.customer_favorite_astrologers(astrologer_id);

ALTER TABLE public.customer_favorite_astrologers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can manage their own favorite astrologers"
    ON public.customer_favorite_astrologers
    FOR ALL
    TO authenticated
    USING (customer_id = (select auth.uid()))
    WITH CHECK (customer_id = (select auth.uid()));

CREATE POLICY "Super Admins can view all favorite astrologers"
    ON public.customer_favorite_astrologers
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = (select auth.uid()) 
            AND profiles.role = 'super_admin'
        )
    );

-- 2. Astrologer Live Broadcasting
DO $$ BEGIN
    CREATE TYPE broadcast_status_enum AS ENUM ('scheduled', 'live', 'ended', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.astrologer_live_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    room_name VARCHAR(120) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    topic VARCHAR(100) DEFAULT 'Vedic Astrology',
    status broadcast_status_enum NOT NULL DEFAULT 'scheduled',
    viewer_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON public.astrologer_live_broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_astrologer ON public.astrologer_live_broadcasts(astrologer_id);

ALTER TABLE public.astrologer_live_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view live or scheduled broadcasts"
    ON public.astrologer_live_broadcasts
    FOR SELECT
    TO authenticated
    USING (status IN ('scheduled', 'live', 'ended'));

CREATE POLICY "Astrologers can manage their own broadcasts"
    ON public.astrologer_live_broadcasts
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.astrologer_profiles
            WHERE astrologer_profiles.id = astrologer_live_broadcasts.astrologer_id
            AND astrologer_profiles.user_id = (select auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.astrologer_profiles
            WHERE astrologer_profiles.id = astrologer_live_broadcasts.astrologer_id
            AND astrologer_profiles.user_id = (select auth.uid())
        )
    );

CREATE POLICY "Super Admins can manage all broadcasts"
    ON public.astrologer_live_broadcasts
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role = 'super_admin'
        )
    );

-- 3. Online Puja Booking & Management
CREATE TABLE IF NOT EXISTS public.puja_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    deity VARCHAR(100) NOT NULL,
    description TEXT,
    benefits TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.puja_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active pujas"
    ON public.puja_catalog
    FOR SELECT
    TO authenticated
    USING (is_active = true);

CREATE POLICY "Super Admins can manage puja catalog"
    ON public.puja_catalog
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role = 'super_admin'
        )
    );

DO $$ BEGIN
    CREATE TYPE puja_booking_status_enum AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.puja_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    puja_id UUID NOT NULL REFERENCES public.puja_catalog(id) ON DELETE RESTRICT,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
    preferred_date DATE NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    sankalp_name VARCHAR(255) NOT NULL,
    gotra VARCHAR(100),
    special_instructions TEXT,
    status puja_booking_status_enum NOT NULL DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_puja_bookings_customer ON public.puja_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_puja_bookings_status ON public.puja_bookings(status);

ALTER TABLE public.puja_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can manage their own puja bookings"
    ON public.puja_bookings
    FOR ALL
    TO authenticated
    USING (customer_id = (select auth.uid()))
    WITH CHECK (customer_id = (select auth.uid()));

CREATE POLICY "Super Admins can manage all puja bookings"
    ON public.puja_bookings
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role = 'super_admin'
        )
    );

-- 5. User Localization Preferences
CREATE TABLE IF NOT EXISTS public.user_language_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    locale VARCHAR(10) NOT NULL DEFAULT 'en',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.user_language_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own language preference"
    ON public.user_language_preferences
    FOR ALL
    TO authenticated
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

