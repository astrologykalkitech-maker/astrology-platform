-- ============================================================================
-- Migration: 037_create_protection_rituals_and_push_notifications.sql
-- Description: Protection rituals, user progress, push subscriptions & logs
-- Author: JyotishSetu Engineering
-- ============================================================================

-- 1. Protection Rituals Catalog
CREATE TABLE IF NOT EXISTS public.protection_rituals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('evil_eye', 'negative_energy', 'spiritual', 'home', 'personal', 'vedic')),
    purpose TEXT NOT NULL,
    description TEXT NOT NULL,
    instructions JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of step strings
    duration_minutes INT NOT NULL DEFAULT 15,
    required_materials JSONB NOT NULL DEFAULT '[]'::jsonb,
    precautions TEXT,
    frequency TEXT NOT NULL DEFAULT 'Daily',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.protection_rituals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.protection_rituals TO authenticated;
GRANT SELECT ON public.protection_rituals TO anon;
GRANT ALL ON public.protection_rituals TO service_role;

DROP POLICY IF EXISTS "Anyone can view active rituals" ON public.protection_rituals;
CREATE POLICY "Anyone can view active rituals" ON public.protection_rituals
    FOR SELECT USING (is_active = true);

-- 2. Customer Saved / Favorite Rituals
CREATE TABLE IF NOT EXISTS public.customer_saved_rituals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ritual_id UUID NOT NULL REFERENCES public.protection_rituals(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(customer_id, ritual_id)
);

ALTER TABLE public.customer_saved_rituals ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.customer_saved_rituals TO authenticated;
GRANT ALL ON public.customer_saved_rituals TO service_role;

DROP POLICY IF EXISTS "Users can manage own saved rituals" ON public.customer_saved_rituals;
CREATE POLICY "Users can manage own saved rituals" ON public.customer_saved_rituals
    FOR ALL TO authenticated USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);

-- 3. Customer Ritual Progress & Completion History
CREATE TABLE IF NOT EXISTS public.customer_ritual_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ritual_id UUID NOT NULL REFERENCES public.protection_rituals(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_ritual_progress_user 
    ON public.customer_ritual_progress(customer_id, completed_at DESC);

ALTER TABLE public.customer_ritual_progress ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.customer_ritual_progress TO authenticated;
GRANT ALL ON public.customer_ritual_progress TO service_role;

DROP POLICY IF EXISTS "Users can manage own ritual progress" ON public.customer_ritual_progress;
CREATE POLICY "Users can manage own ritual progress" ON public.customer_ritual_progress
    FOR ALL TO authenticated USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);

-- 4. User Push Notification Subscriptions (Web Push / VAPID)
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user 
    ON public.user_push_subscriptions(user_id) WHERE is_active = true;

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_subscriptions TO authenticated;
GRANT ALL ON public.user_push_subscriptions TO service_role;

DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions" ON public.user_push_subscriptions
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Outbound External Notification Delivery Log
CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('push', 'email', 'sms', 'in_app')),
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('delivered', 'failed', 'queued', 'skipped')),
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_user 
    ON public.notification_delivery_logs(user_id, created_at DESC);

ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.notification_delivery_logs TO service_role;
GRANT SELECT ON public.notification_delivery_logs TO authenticated;

DROP POLICY IF EXISTS "Users can view own notification logs" ON public.notification_delivery_logs;
CREATE POLICY "Users can view own notification logs" ON public.notification_delivery_logs
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Seed Authentic Vedic Protection Rituals
INSERT INTO public.protection_rituals (title, category, purpose, description, instructions, duration_minutes, required_materials, precautions, frequency)
VALUES 
(
    'Drishti Dosha Nivarana (Evil Eye Cleansing)',
    'evil_eye',
    'Neutralize negative psychic projections and malicious envious gaze (buri nazar).',
    'A revered traditional household ritual practiced across Vedic households using salt, mustard seeds, and dried red chilies.',
    '["Sit comfortably facing North or East.", "Take a fistful of rock salt, yellow mustard seeds, and 3 whole dried red chilies in your right hand.", "Rotate the fist around your body clockwise 7 times while reciting the Gayatri Mantra.", "Cast the mixture into an open flame or flowing water.", "Wash hands and face with cool water."]'::jsonb,
    10,
    '["Rock salt", "Yellow mustard seeds (Sarson)", "Dried red chilies", "Small earthen lamp (Diya)"]'::jsonb,
    'Do not inhale smoke directly when casting into flame.',
    'Weekly on Tuesdays or Saturdays'
),
(
    'Vastu Purusha Griha Shuddhi (Space Purification)',
    'home',
    'Purge stale prana, cleanse household aura, and invite Lakshmi and Ganesha vibrations.',
    'Sacred fumigation ritual utilizing Sambrani (Loban), Guggal resin, and Camphor (Kapur) to consecrate residential spaces.',
    '["Open all windows and doors to let stagnant air exit.", "Light a charcoal briquette in a dhoop burner.", "Sprinkle pure Guggal and Loban resin on the ember.", "Circulate the aromatic smoke through every corner of the house clockwise.", "Conclude at the main entrance while chanting ''Om Namo Bhagavate Vasudevaya''."]'::jsonb,
    15,
    '["Natural Guggal resin", "Pure Loban (Benzoin)", "Camphor tablets", "Brass dhoop burner"]'::jsonb,
    'Ensure children and pets remain in well-ventilated areas.',
    'Twice weekly during evening twilight (Sandhya)'
),
(
    'Maha Mrityunjaya Raksha Kavach (Spiritual Shield)',
    'spiritual',
    'Immunity against chronic ailments, fear of accidents, and planetary malefic distress.',
    'The primordial Shiva life-force mantra that dispels mortal anxiety and infuses the subtle auric body with cosmic light.',
    '["Sit in Padmasana or Sukhasana facing East.", "Light an oil lamp with sesame or ghee.", "Hold a Rudraksha mala with 108 beads.", "Chant 108 times: ''Om Tryambakam Yajamahe Sugandhim Pushtivardhanam Urvarukamiva Bandhanan Mrityor Mukshiya Maamritat''.", "Apply a drop of sanctified water or Vibhuti to your forehead."]'::jsonb,
    20,
    '["108-bead Rudraksha mala", "Pure ghee lamp", "Ganga water or clean water cup", "Clean mat or asana"]'::jsonb,
    'Maintain mental serenity and clear pronunciation.',
    'Daily during morning Brahma Muhurat'
),
(
    'Shani Peeda Shanti (Karmic Friction Protection)',
    'personal',
    'Alleviate heaviness during Saturn Sade Sati, Dhaiya, or retrograde Saturn transits.',
    'A powerful classical pacification ritual offering mustard oil to Shani Dev to reduce karmic friction and promote discipline.',
    '["On Saturday morning or evening, pour pure mustard oil in an iron or earthen bowl.", "Look into the oil to reflect your shadow (Chhaya Daan).", "Add a few black sesame seeds and an iron coin.", "Offer the oil at a Shani temple or donate to someone in need.", "Chant: ''Om Sham Shanaishcharaya Namah'' 21 times."]'::jsonb,
    15,
    '["Pure mustard oil", "Black sesame seeds", "Earthen or iron bowl", "Black cloth or coin"]'::jsonb,
    'Do not consume the oil used for Chhaya Daan.',
    'Saturdays'
)
ON CONFLICT DO NOTHING;

