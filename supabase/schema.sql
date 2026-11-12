-- ============================================================
-- SUPABASE SQL SCHEMA: ТЕСТИ ХУДШИНОСӢ (Ҷаннат Абдулоева)
-- Ин кодро дар Supabase -> SQL Editor гузошта "Run" пахш кунед
-- ============================================================

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  respondent_name text not null,
  respondent_age text,
  respondent_gender text,
  respondent_phone text,
  respondent_note text,
  answers jsonb not null,
  answer_code text not null,
  scores jsonb not null,
  dominant_state jsonb not null,
  vulnerable_percentage integer not null default 0,
  resourceful_percentage integer not null default 0,
  difficult_spheres jsonb not null default '[]'::jsonb,
  strong_spheres jsonb not null default '[]'::jsonb
);

create table if not exists public.test_configs (
  id text primary key,
  updated_at timestamptz not null default now(),
  config jsonb not null
);

-- Enable Row Level Security (RLS)
alter table public.submissions enable row level security;
alter table public.test_configs enable row level security;

-- Allow anyone to submit test results (insert) and read test config
create policy "Allow public insert on submissions"
  on public.submissions for insert
  to anon, authenticated
  with check (true);

create policy "Allow public select on submissions"
  on public.submissions for select
  to anon, authenticated
  using (true);

create policy "Allow public delete on submissions"
  on public.submissions for delete
  to anon, authenticated
  using (true);

create policy "Allow public read/write on test_configs"
  on public.test_configs for all
  to anon, authenticated
  using (true)
  with check (true);
