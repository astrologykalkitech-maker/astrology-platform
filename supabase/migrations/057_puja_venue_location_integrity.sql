-- Persist puja venue addresses and reject malformed new location data.
-- NOT VALID keeps legacy rows untouched while enforcing the constraints on new writes.

ALTER TABLE public.puja_bookings
    ADD COLUMN IF NOT EXISTS venue_address TEXT,
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS landmark TEXT;

-- Mutations go through authenticated server actions using the service role.
-- Keep customer row visibility for portal/realtime reads without allowing direct client writes.
DROP POLICY IF EXISTS "Customers can manage their own puja bookings"
    ON public.puja_bookings;
DROP POLICY IF EXISTS "Customers can view their own puja bookings"
    ON public.puja_bookings;
CREATE POLICY "Customers can view their own puja bookings"
    ON public.puja_bookings
    FOR SELECT
    TO authenticated
    USING (customer_id = (SELECT auth.uid()));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'puja_bookings_venue_address_length_check'
          AND conrelid = 'public.puja_bookings'::regclass
    ) THEN
        ALTER TABLE public.puja_bookings
            ADD CONSTRAINT puja_bookings_venue_address_length_check
            CHECK (
                venue_address IS NULL
                OR pg_catalog.char_length(pg_catalog.btrim(venue_address)) BETWEEN 3 AND 500
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'puja_bookings_location_pair_range_check'
          AND conrelid = 'public.puja_bookings'::regclass
    ) THEN
        ALTER TABLE public.puja_bookings
            ADD CONSTRAINT puja_bookings_location_pair_range_check
            CHECK (
                (latitude IS NULL AND longitude IS NULL)
                OR (
                    latitude IS NOT NULL
                    AND longitude IS NOT NULL
                    AND latitude BETWEEN -90 AND 90
                    AND longitude BETWEEN -180 AND 180
                )
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'puja_bookings_landmark_length_check'
          AND conrelid = 'public.puja_bookings'::regclass
    ) THEN
        ALTER TABLE public.puja_bookings
            ADD CONSTRAINT puja_bookings_landmark_length_check
            CHECK (
                landmark IS NULL
                OR pg_catalog.char_length(pg_catalog.btrim(landmark)) <= 200
            ) NOT VALID;
    END IF;
END;
$$;
