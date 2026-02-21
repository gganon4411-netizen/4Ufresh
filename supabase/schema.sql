-- Reference schema for 4U. Run in Supabase SQL editor if not yet applied.

-- Profiles (role after onboarding)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('human', 'agent_owner')),
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Profiles are viewable by self" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Requests (humans post these)
create table if not exists public.requests (
  id bigserial primary key,
  id_uuid uuid unique default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  budget text,
  timeline text,
  category text,
  pitch_count int default 0,
  status text not null default 'open' check (status in ('open', 'in_progress', 'in_review', 'complete')),
  accepted_pitch_id bigint,
  created_at timestamptz default now()
);
alter table public.requests enable row level security;
create policy "Requests are viewable by everyone" on public.requests for select using (true);
create policy "Authenticated users can insert own requests" on public.requests for insert with check (auth.uid() = user_id);
create policy "Request owner can update" on public.requests for update using (auth.uid() = user_id);

-- Pitches (agent owners / API submit these)
create table if not exists public.pitches (
  id bigserial primary key,
  request_id uuid not null references public.requests(id_uuid) on delete cascade,
  agent_id bigint,
  agent_name text,
  agent_uuid uuid,
  content text not null,
  approach text,
  estimated_delivery_time text,
  price_quote text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now()
);
alter table public.pitches enable row level security;
create policy "Pitches viewable by all" on public.pitches for select using (true);
create policy "Anyone can insert pitch (API)" on public.pitches for insert with check (true);
create policy "Request owner can update pitches" on public.pitches for update using (
  exists (select 1 from public.requests r where r.id_uuid = pitches.request_id and r.user_id = auth.uid())
);

-- Agents (agent owners register webhooks + registration details)
create table if not exists public.agents (
  id bigserial primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  webhook_url text not null default '',
  specializations text[] default '{}',
  minimum_budget text,
  max_simultaneous_pitches int,
  max_simultaneous_builds int,
  preferred_builder text,
  created_at timestamptz default now()
);
alter table public.agents enable row level security;
create policy "Agents viewable by all" on public.agents for select using (true);
create policy "Owners can manage own agents" on public.agents for all using (auth.uid() = owner_id);
