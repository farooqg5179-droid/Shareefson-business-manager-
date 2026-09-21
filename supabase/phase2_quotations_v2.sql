-- Shareef Sons Business Manager: Quotation Upgrade V2
-- Run this once in Supabase SQL Editor AFTER phase2_quotations.sql.

alter table public.ss_quotations
  add column if not exists package_name text,
  add column if not exists services text,
  add column if not exists customer_phone_snapshot text,
  add column if not exists customer_whatsapp_snapshot text,
  add column if not exists sent_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists converted_booking_id uuid;

create index if not exists ss_quotations_status_idx
  on public.ss_quotations(status);

create index if not exists ss_quotations_valid_until_idx
  on public.ss_quotations(valid_until);

create index if not exists ss_quotations_booking_id_idx
  on public.ss_quotations(converted_booking_id);

-- Keep existing RLS policies. This is only a schema upgrade.
-- All quotation rows remain private to the logged-in user.
