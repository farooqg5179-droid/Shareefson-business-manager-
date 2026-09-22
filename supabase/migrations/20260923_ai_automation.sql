-- Shareef Sons AI Automation
-- New tables only. This file does not alter existing business tables.

create table if not exists public.ss_ai_automation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_text text not null,
  action text,
  status text not null default 'planned',
  plan jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ss_ai_automation_logs enable row level security;

create policy "Users can read own AI automation logs"
on public.ss_ai_automation_logs
for select
using (auth.uid() = user_id);

create policy "Users can insert own AI automation logs"
on public.ss_ai_automation_logs
for insert
with check (auth.uid() = user_id);

create index if not exists ss_ai_automation_logs_user_created_idx
on public.ss_ai_automation_logs(user_id, created_at desc);
