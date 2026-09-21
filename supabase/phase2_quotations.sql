-- Shareef Sons Business Manager: Phase 2 Quotations
-- Run this once in Supabase SQL Editor.

create table if not exists public.ss_quotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quotation_number text not null,
  customer_id uuid not null references public.ss_customers(id) on delete restrict,
  booking_id uuid null,
  event_type text,
  event_date date,
  event_time time,
  venue text,
  guests integer,
  valid_until date,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  advance_required numeric(12,2) not null default 0,
  status text not null default 'Draft' check (status in ('Draft','Sent','Approved','Rejected','Expired')),
  notes text,
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, quotation_number)
);

create index if not exists ss_quotations_user_id_idx on public.ss_quotations(user_id);
create index if not exists ss_quotations_customer_id_idx on public.ss_quotations(customer_id);
create index if not exists ss_quotations_event_date_idx on public.ss_quotations(event_date);

alter table public.ss_quotations enable row level security;

drop policy if exists "ss_quotations_select_own" on public.ss_quotations;
drop policy if exists "ss_quotations_insert_own" on public.ss_quotations;
drop policy if exists "ss_quotations_update_own" on public.ss_quotations;
drop policy if exists "ss_quotations_delete_own" on public.ss_quotations;

create policy "ss_quotations_select_own" on public.ss_quotations for select using (auth.uid() = user_id);
create policy "ss_quotations_insert_own" on public.ss_quotations for insert with check (auth.uid() = user_id);
create policy "ss_quotations_update_own" on public.ss_quotations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ss_quotations_delete_own" on public.ss_quotations for delete using (auth.uid() = user_id);

-- Optional: if you already have a booking table and want a real FK later,
-- add booking_id as a foreign key after confirming the exact booking table name/id type.
