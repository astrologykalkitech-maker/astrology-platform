const fs = require('fs');

const consolidated = fs.readFileSync('supabase/CONSOLIDATED_SETUP.sql', 'utf-8');
const tables = [
  'account_deletion_requests', 'admin_audit_logs', 'admin_permissions', 'ai_interaction_logs',
  'ai_learned_knowledge', 'astrologer_availability_rules', 'astrologer_credentials', 'astrologer_customer_notes',
  'astrologer_interviews', 'astrologer_live_broadcasts', 'astrologer_payout_beneficiaries', 'astrologer_probations',
  'astrologer_profiles', 'astrologer_ritual_recommendations', 'astrologer_saved_rituals', 'astrologer_subscriptions',
  'astrologer_time_off', 'astrologer_verification_documents', 'astrologer_verification_stages', 'astrologer_wallets',
  'audit_logs', 'avatars', 'broadcast_comments', 'broadcast_moderation_reports', 'broadcast_participants',
  'chat_abuse_reports', 'commission_ledger', 'commission_settings', 'commission_settlements', 'consultant_balance_summaries',
  'consultant_settlements', 'consultation_billing_sessions', 'consultation_meetings', 'consultation_messages',
  'consultation_raw_webhook_events', 'consultation_reminders', 'consultation_reviews', 'consultation_summaries',
  'consultation_waiting_room', 'conversations', 'customer_astrologer_follows', 'customer_bookings',
  'customer_favorite_astrologers', 'customer_notifications', 'customer_numerology_reports', 'customer_panchang_preferences',
  'customer_referral_claims', 'customer_referral_profiles', 'customer_ritual_progress', 'customer_ritual_schedules',
  'customer_saved_horoscopes', 'customer_saved_rituals', 'customer_wallets', 'direct_consultation_payments',
  'direct_messages', 'financial_accounts', 'jyotish_pay_verifications', 'kundli_milans', 'kundlis',
  'lead_assignment_history', 'lead_assignments', 'lead_internal_notes', 'leads', 'meeting_chat_messages',
  'notification_deliveries', 'notification_delivery_logs', 'payment_intents', 'payment_orders', 'payment_plans',
  'payment_receipts', 'payments', 'platform_settings', 'privacy_consents', 'profiles', 'protection_rituals',
  'puja_bookings', 'puja_catalog', 'puja_reviews', 'qr_payment_sessions', 'reconciliation_logs', 'refund_requests',
  'subscription_audit_logs', 'support_messages', 'support_ticket_events', 'support_tickets', 'user_language_preferences',
  'user_notification_settings', 'user_push_subscriptions', 'voice_calls'
];

const rpcs = [
  'accrue_platform_commission_atomic', 'accrue_verified_booking_commissions', 'admin_approve_astrologer_with_sync',
  'admin_hard_delete_user_account', 'admin_set_consultant_permissions', 'book_astrologer_consultation',
  'capture_wallet_reservation_atomic', 'claim_customer_referral_reward', 'claim_payment_settlement',
  'claim_payment_webhook_event', 'complete_astrologer_consultation_atomic', 'complete_payment_settlement',
  'complete_payment_webhook_event', 'create_booking_for_customer', 'credit_astrologer_wallet_atomic',
  'credit_customer_wallet_atomic', 'debit_astrologer_wallet_atomic', 'fail_payment_settlement',
  'fail_payment_webhook_event', 'hold_wallet_reservation_atomic', 'match_learned_knowledge',
  'pay_consultation_via_wallet_atomic', 'perform_atomic_lead_assignment', 'post_atomic_financial_journal',
  'process_customer_refund_atomic', 'record_learned_kb_feedback', 'record_legacy_consultant_settlement_atomic',
  'refresh_consultant_balance_summary', 'release_consultation_escrow_atomic', 'release_wallet_reservation_atomic',
  'review_commission_settlement', 'review_direct_consultation_payment', 'review_jyotish_pay_utr',
  'review_wallet_recharge_order_atomic', 'settle_consultation_billing_atomic', 'submit_consultation_review',
  'submit_customer_enquiry', 'submit_direct_consultation_payment', 'submit_jyotish_pay_utr',
  'swap_astrologer_payout_beneficiary_atomic', 'update_customer_profile'
];

const missingTables = [];
tables.forEach(t => {
  const tableRegex = new RegExp(`create\\s+table\\s+(public\\.)?${t}\\b|create\\s+table\\s+if\\s+not\\s+exists\\s+(public\\.)?${t}\\b`, 'i');
  if (!tableRegex.test(consolidated)) {
    missingTables.push(t);
  }
});

const missingRpcs = [];
rpcs.forEach(r => {
  const rpcRegex = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?${r}\\b`, 'i');
  if (!rpcRegex.test(consolidated)) {
    missingRpcs.push(r);
  }
});

console.log('Missing tables from CONSOLIDATED_SETUP:', missingTables);
console.log('Missing RPCs from CONSOLIDATED_SETUP:', missingRpcs);
