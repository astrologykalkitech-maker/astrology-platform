-- ============================================================================
-- Migration: 038_performance_composite_indexes.sql
-- Description: Composite and covering indexes for production read paths
-- Author: JyotishSetu Engineering
-- ============================================================================

-- 1. Kundlis & Kundli Milans customer lookup & chronological sort
CREATE INDEX IF NOT EXISTS idx_kundlis_customer_created 
  ON public.kundlis(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kundli_milans_customer_created 
  ON public.kundli_milans(customer_id, created_at DESC);

-- 2. Customer Bookings frequent status & scheduling filters
CREATE INDEX IF NOT EXISTS idx_customer_bookings_cust_status 
  ON public.customer_bookings(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_customer_bookings_astro_sched 
  ON public.customer_bookings(astrologer_id, scheduled_at DESC);

-- 3. Protection Rituals & User Saved status
CREATE INDEX IF NOT EXISTS idx_protection_rituals_cat_active 
  ON public.protection_rituals(category, is_active);

CREATE INDEX IF NOT EXISTS idx_customer_saved_rituals_lookup 
  ON public.customer_saved_rituals(customer_id, ritual_id);

-- 4. User Notifications unread queries
CREATE INDEX IF NOT EXISTS idx_customer_notifications_unread 
  ON public.customer_notifications(customer_id, is_read, created_at DESC);

-- 5. Consultation Messages conversation thread ordering
CREATE INDEX IF NOT EXISTS idx_consultation_messages_lead_created 
  ON public.consultation_messages(lead_id, created_at ASC);
