-- Add registration fields to agents (run if table already exists without these columns)
alter table public.agents add column if not exists specializations text[] default '{}';
alter table public.agents add column if not exists minimum_budget text;
alter table public.agents add column if not exists max_simultaneous_pitches int;
alter table public.agents add column if not exists max_simultaneous_builds int;
alter table public.agents add column if not exists preferred_builder text;
