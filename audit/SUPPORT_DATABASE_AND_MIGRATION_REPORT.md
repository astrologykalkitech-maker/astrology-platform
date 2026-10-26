# Support Database and Migration Report — JyotishSetu Platform

**Generated:** October 26, 2026  
**Auditor:** Principal Database Architect  
**Migration Reference:** `supabase/migrations/017_ai_support_and_tickets.sql`  
**Status:** SCHEMA MIGRATION READY & COMPATIBLE

---

## 1. Schema Specifications for Support System

### 1.1 `public.support_tickets`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Stable unique identifier |
| `ticket_number` | `TEXT` | `UNIQUE NOT NULL` | Readable identifier (e.g., `TICK-1001`) generated via sequence |
| `user_id` | `UUID` | `NOT NULL REFERENCES profiles(id) ON DELETE CASCADE` | Ticket creator identity |
| `user_role` | `TEXT` | `CHECK (user_role IN ('customer', 'astrologer'))` | Origin role |
| `user_name` | `TEXT` | `NOT NULL DEFAULT 'User'` | Display name of creator |
| `user_email` | `TEXT` | `NULL` | Creator contact email |
| `subject` | `TEXT` | `NOT NULL` | Summary subject line |
| `category` | `TEXT` | `CHECK (category IN ('account', 'profile', 'booking', 'consultation', 'leads', 'billing', 'technical', 'general'))` | Inferred or selected category |
| `status` | `TEXT` | `CHECK (status IN ('new', 'open', 'waiting_for_user', 'waiting_for_support', 'escalated', 'resolved', 'closed'))` | Lifecycle state |
| `priority` | `TEXT` | `CHECK (priority IN ('low', 'medium', 'high', 'urgent'))` | Priority tier |
| `assigned_to` | `UUID` | `REFERENCES profiles(id) ON DELETE SET NULL` | Assigned staff member |
| `escalation_reason` | `TEXT` | `NULL` | AI or user reason for escalation |
| `ai_summary` | `TEXT` | `NULL` | Auto-generated internal AI summary |
| `resolution_notes` | `TEXT` | `NULL` | Closing remarks by staff |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Last update timestamp |
| `resolved_at` | `TIMESTAMPTZ` | `NULL` | Resolution timestamp |

### 1.2 `public.support_messages`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Message identifier |
| `ticket_id` | `UUID` | `NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE` | Associated ticket |
| `sender_id` | `UUID` | `REFERENCES profiles(id) ON DELETE SET NULL` | Sender account |
| `sender_role` | `TEXT` | `CHECK (sender_role IN ('customer', 'astrologer', 'ai', 'admin', 'system'))` | Role avatar discriminator |
| `sender_name` | `TEXT` | `NOT NULL` | Display name of sender |
| `message` | `TEXT` | `NOT NULL` | Message body |
| `is_internal` | `BOOLEAN` | `NOT NULL DEFAULT false` | Private administrative note flag |
| `metadata` | `JSONB` | `DEFAULT '{}'::jsonb` | Model tokens, category tags |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Sent timestamp |

### 1.3 `public.support_ticket_events`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Event identifier |
| `ticket_id` | `UUID` | `NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE` | Target ticket |
| `actor_id` | `UUID` | `REFERENCES profiles(id) ON DELETE SET NULL` | Performing user/admin |
| `actor_role` | `TEXT` | `NOT NULL` | Actor role |
| `action` | `TEXT` | `NOT NULL` | Action type (`created`, `escalated`, `admin_reply`, `status_changed`) |
| `details` | `JSONB` | `DEFAULT '{}'::jsonb` | State changes & snippets |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Event timestamp |

---

## 2. Performance Indexes

```sql
CREATE INDEX idx_support_tickets_user_id ON public.support_tickets (user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets (status);
CREATE INDEX idx_support_tickets_priority ON public.support_tickets (priority);
CREATE INDEX idx_support_tickets_created_at ON public.support_tickets (created_at DESC);
CREATE INDEX idx_support_messages_ticket_id ON public.support_messages (ticket_id, created_at ASC);
CREATE INDEX idx_support_ticket_events_ticket_id ON public.support_ticket_events (ticket_id, created_at ASC);
```
