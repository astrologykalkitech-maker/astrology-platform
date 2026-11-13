-- Migration 044: Puja Catalog Seed & Verification
-- Ensure canonical authentic Vedic pujas are seeded in the database.

INSERT INTO public.puja_catalog (title, slug, deity, description, benefits, duration_minutes, is_active)
VALUES
  (
    'Navagraha Shanti Havan',
    'navagraha-shanti-havan',
    'Navagrahas (Nine Celestial Regents)',
    'Comprehensive planetary harmonization homam chanted with 9 Vedic mantras to pacify unfavorable planetary transitions.',
    'Dispels Sade Sati afflictions, balances Rahu-Ketu doshas, and brings overall family prosperity.',
    120,
    true
  ),
  (
    'Maha Mrityunjaya Japa & Puja',
    'maha-mrityunjaya-puja',
    'Lord Shiva (Tryambaka)',
    'Sacred chanting of the rejuvenating Maha Mrityunjaya mantra for vitality, recovery from severe illness, and divine longevity.',
    'Protects against sudden setbacks, shields physical health, and invokes profound spiritual fortitude.',
    90,
    true
  ),
  (
    'Lakshmi-Ganesha Prosperity Puja',
    'lakshmi-ganesha-puja',
    'Goddess Mahalakshmi & Lord Ganesha',
    'Consecrated ceremony for removing vocational obstacles, blessing new ventures, and expanding financial abundance.',
    'Clears business bottlenecks, invokes Vighnaharta blessings, and stabilizes auspicious wealth.',
    60,
    true
  ),
  (
    'Rudra Abhishekam',
    'rudra-abhishekam',
    'Lord Shiva',
    'Powerful Vedic ritual involving ritual bathing of the Shiva Lingam with sacred liquids while chanting Sri Rudram.',
    'Purifies negative karmic patterns, bestows peace of mind, and dissolves spiritual stagnation.',
    75,
    true
  ),
  (
    'Saraswati Vidya Prapti Puja',
    'saraswati-vidya-prapti-puja',
    'Goddess Saraswati',
    'Auspicious puja dedicated to the Goddess of learning, wisdom, arts, and intellectual brilliance.',
    'Enhances cognitive focus, academic excellence, memory retention, and creative proficiency.',
    45,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  deity = EXCLUDED.deity,
  description = EXCLUDED.description,
  benefits = EXCLUDED.benefits,
  duration_minutes = EXCLUDED.duration_minutes,
  is_active = EXCLUDED.is_active,
  updated_at = pg_catalog.now();

