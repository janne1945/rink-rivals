-- The production project already had lineup_slots before the account schema
-- migration was introduced. CREATE TABLE IF NOT EXISTS therefore did not add
-- this column, although claim_starter_team now writes it explicitly.
alter table public.lineup_slots
  add column if not exists created_at timestamptz;

update public.lineup_slots
set created_at = clock_timestamp()
where created_at is null;

alter table public.lineup_slots
  alter column created_at set default clock_timestamp(),
  alter column created_at set not null;
