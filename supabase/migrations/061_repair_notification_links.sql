-- ============================================================================
-- MIGRATION 061: Repair Legacy Notification Link URLs
-- Fix legacy link_urls pointing to /customer/dashboard for astrologers
-- ============================================================================

-- 1. For astrologer recipients, update any legacy '/customer/dashboard' link_url to '/astrologer/communications'
UPDATE public.customer_notifications cn
SET link_url = '/astrologer/communications'
FROM public.profiles p
WHERE cn.customer_id = p.id
  AND p.role = 'astrologer'
  AND (cn.link_url = '/customer/dashboard' OR cn.link_url IS NULL);

-- 2. For customer recipients, update any '/customer/dashboard' link_url to '/customer/astrologers'
UPDATE public.customer_notifications cn
SET link_url = '/customer/astrologers'
FROM public.profiles p
WHERE cn.customer_id = p.id
  AND p.role = 'customer'
  AND cn.link_url = '/customer/dashboard';
