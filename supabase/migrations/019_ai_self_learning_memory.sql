-- ==============================================================================
-- Migration 019: AI Self-Learning Memory, Learned Knowledge & Interaction Logs
-- ==============================================================================

-- 1. Enable pgvector extension if not already available
create extension if not exists vector;

-- 2. Table: public.ai_learned_knowledge
create table if not exists public.ai_learned_knowledge (
  id uuid primary key default gen_random_uuid(),
  source_ticket_id uuid references public.support_tickets(id) on delete set null,
  applicable_role text not null check (applicable_role in ('customer', 'astrologer', 'both')),
  category text not null default 'general' check (
    category in ('account', 'profile', 'booking', 'consultation', 'leads', 'billing', 'technical', 'general')
  ),
  question_pattern text not null,
  verified_solution text not null,
  keywords text[] default '{}',
  embedding vector(768),
  helpful_count integer not null default 1,
  unhelpful_count integer not null default 0,
  confidence_score numeric(5,4) generated always as (
    ((helpful_count + 1.0) / (helpful_count + unhelpful_count + 2.0))
  ) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Table: public.ai_interaction_logs
create table if not exists public.ai_interaction_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_role text not null check (user_role in ('customer', 'astrologer')),
  query text not null,
  classified_intent text not null,
  classified_category text not null,
  ai_response text not null,
  used_knowledge_ids text[] default '{}',
  learned_knowledge_ids uuid[] default '{}',
  feedback_rating smallint check (feedback_rating in (-1, 1)),
  feedback_comment text,
  escalated_to_ticket boolean not null default false,
  created_at timestamptz not null default now()
);

-- 4. Indexes for performance and vector search
create index if not exists idx_ai_learned_knowledge_role_active
  on public.ai_learned_knowledge (applicable_role, is_active);

create index if not exists idx_ai_learned_knowledge_category
  on public.ai_learned_knowledge (category);

create index if not exists idx_ai_learned_knowledge_source_ticket
  on public.ai_learned_knowledge (source_ticket_id);

create index if not exists idx_ai_interaction_logs_user_id
  on public.ai_interaction_logs (user_id);

create index if not exists idx_ai_interaction_logs_created_at
  on public.ai_interaction_logs (created_at desc);

-- Vector HNSW index for cosine distance similarity
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'ai_learned_knowledge' and indexname = 'idx_ai_learned_knowledge_embedding'
  ) then
    begin
      create index idx_ai_learned_knowledge_embedding
        on public.ai_learned_knowledge using hnsw (embedding vector_cosine_ops);
    exception when others then
      -- Fallback to ivfflat if hnsw is unavailable in older pgvector
      create index if not exists idx_ai_learned_knowledge_embedding
        on public.ai_learned_knowledge using ivfflat (embedding vector_cosine_ops) with (lists = 100);
    end;
  end if;
end $$;

-- 5. RPC: public.match_learned_knowledge
create or replace function public.match_learned_knowledge(
  query_embedding vector(768),
  target_role text,
  match_threshold float default 0.72,
  match_count int default 3
)
returns table (
  id uuid,
  source_ticket_id uuid,
  applicable_role text,
  category text,
  question_pattern text,
  verified_solution text,
  keywords text[],
  helpful_count integer,
  unhelpful_count integer,
  confidence_score numeric,
  similarity float,
  hybrid_rank float
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Validate input parameters
  if query_embedding is null then
    return;
  end if;

  if target_role not in ('customer', 'astrologer') then
    return;
  end if;

  return query
  select
    k.id,
    k.source_ticket_id,
    k.applicable_role,
    k.category,
    k.question_pattern,
    k.verified_solution,
    k.keywords,
    k.helpful_count,
    k.unhelpful_count,
    k.confidence_score,
    (1 - (k.embedding <=> query_embedding))::float as similarity,
    (((1 - (k.embedding <=> query_embedding)) * 0.75) + (k.confidence_score::float * 0.25))::float as hybrid_rank
  from public.ai_learned_knowledge k
  where k.is_active = true
    and (k.applicable_role = target_role or k.applicable_role = 'both')
    and k.confidence_score >= 0.40
    and k.embedding is not null
    and (1 - (k.embedding <=> query_embedding)) >= match_threshold
  order by hybrid_rank desc
  limit match_count;
end;
$$;

-- 6. RPC: public.record_learned_kb_feedback
create or replace function public.record_learned_kb_feedback(
  kb_ids uuid[],
  is_helpful boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if kb_ids is null or array_length(kb_ids, 1) is null then
    return;
  end if;

  if is_helpful then
    update public.ai_learned_knowledge
    set helpful_count = helpful_count + 1,
        updated_at = pg_catalog.now()
    where id = any(kb_ids)
      and is_active = true;
  else
    update public.ai_learned_knowledge
    set unhelpful_count = unhelpful_count + 1,
        updated_at = pg_catalog.now()
    where id = any(kb_ids)
      and is_active = true;
  end if;
end;
$$;

-- 7. Row Level Security (RLS)
alter table public.ai_learned_knowledge enable row level security;
alter table public.ai_interaction_logs enable row level security;

-- Policies: ai_interaction_logs
drop policy if exists "Users can view their own AI interaction logs" on public.ai_interaction_logs;
create policy "Users can view their own AI interaction logs"
  on public.ai_interaction_logs
  for select
  using (user_id = (select auth.uid()));

drop policy if exists "Users can update feedback on their own AI interaction logs" on public.ai_interaction_logs;
create policy "Users can update feedback on their own AI interaction logs"
  on public.ai_interaction_logs
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Service role and admins can manage all AI interaction logs" on public.ai_interaction_logs;
create policy "Service role and admins can manage all AI interaction logs"
  on public.ai_interaction_logs
  for all
  using (
    (select coalesce(role, '') from public.profiles where id = (select auth.uid())) in ('super_admin', 'consultant_admin', 'admin')
  );

-- Policies: ai_learned_knowledge
drop policy if exists "Users can view active learned knowledge" on public.ai_learned_knowledge;
create policy "Users can view active learned knowledge"
  on public.ai_learned_knowledge
  for select
  using (is_active = true);

drop policy if exists "Admins can manage learned knowledge" on public.ai_learned_knowledge;
create policy "Admins can manage learned knowledge"
  on public.ai_learned_knowledge
  for all
  using (
    (select coalesce(role, '') from public.profiles where id = (select auth.uid())) in ('super_admin', 'consultant_admin', 'admin')
  );

