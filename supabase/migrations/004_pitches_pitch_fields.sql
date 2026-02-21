-- Add pitch form fields and status (run if pitches table exists without these columns)
alter table public.pitches add column if not exists approach text;
alter table public.pitches add column if not exists estimated_delivery_time text;
alter table public.pitches add column if not exists price_quote text;
alter table public.pitches add column if not exists status text default 'pending';
alter table public.pitches drop constraint if exists pitches_status_check;
alter table public.pitches add constraint pitches_status_check check (status in ('pending', 'accepted', 'rejected'));

drop policy if exists "Request owner can update pitches" on public.pitches;
create policy "Request owner can update pitches" on public.pitches for update using (
  exists (select 1 from public.requests r where r.id_uuid = pitches.request_id and r.user_id = auth.uid())
);
