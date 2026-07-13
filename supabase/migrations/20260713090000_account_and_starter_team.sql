create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  credits integer not null default 0 check (credits >= 0),
  favorite_team_id text,
  onboarding_completed boolean not null default false,
  starter_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_starter_state_consistent check (
    (favorite_team_id is null and starter_claimed_at is null)
    or (favorite_team_id is not null and starter_claimed_at is not null)
  )
);

create table if not exists public.user_cards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id text not null,
  quantity integer not null default 1 check (quantity > 0),
  acquired_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table if not exists public.lineups (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  mode text not null check (mode in ('nhl-circuit', 'pwhl-circuit', 'open-ice')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index lineups_one_active_per_mode
  on public.lineups (user_id, mode)
  where is_active;

create table if not exists public.lineup_slots (
  lineup_id uuid not null,
  user_id uuid not null,
  slot text not null check (slot in ('LW', 'C', 'RW', 'LD', 'RD', 'G')),
  card_id text not null,
  created_at timestamptz not null default now(),
  primary key (lineup_id, slot),
  unique (lineup_id, card_id),
  foreign key (lineup_id, user_id)
    references public.lineups (id, user_id) on delete cascade,
  foreign key (user_id, card_id)
    references public.user_cards (user_id, card_id) on delete restrict
);

create table if not exists public.starter_team_cards (
  team_id text not null,
  slot text not null check (slot in ('LW', 'C', 'RW', 'LD', 'RD', 'G')),
  card_id text not null,
  primary key (team_id, slot),
  unique (team_id, card_id)
);

insert into public.starter_team_cards (team_id, slot, card_id) values
  ('edmonton-oilers', 'LW', 'nhl-brady-tkachuk-base'),
  ('edmonton-oilers', 'C',  'nhl-connor-mcdavid-base'),
  ('edmonton-oilers', 'RW', 'nhl-mikko-rantanen-base'),
  ('edmonton-oilers', 'LD', 'nhl-rasmus-dahlin-base'),
  ('edmonton-oilers', 'RD', 'nhl-evan-bouchard-base'),
  ('edmonton-oilers', 'G',  'nhl-igor-shesterkin-base')
on conflict (team_id, slot) do update set card_id = excluded.card_id;

alter table public.profiles add column if not exists favorite_team_id text;
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists starter_claimed_at timestamptz;

alter table public.lineup_slots add column if not exists user_id uuid;
update public.lineup_slots slots
set user_id = lineups.user_id
from public.lineups lineups
where lineups.id = slots.lineup_id and slots.user_id is null;
alter table public.lineup_slots alter column user_id set not null;

alter table public.lineups drop constraint if exists lineups_mode_check;
alter table public.lineups add constraint lineups_mode_check
  check (mode in ('nhl-circuit', 'pwhl-circuit', 'open-ice'));

create unique index if not exists lineups_id_user_id_key
  on public.lineups (id, user_id);
create unique index if not exists lineup_slots_lineup_card_key
  on public.lineup_slots (lineup_id, card_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lineup_slots_lineup_user_fkey') then
    alter table public.lineup_slots add constraint lineup_slots_lineup_user_fkey
      foreign key (lineup_id, user_id) references public.lineups (id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lineup_slots_user_card_fkey') then
    alter table public.lineup_slots add constraint lineup_slots_user_card_fkey
      foreign key (user_id, card_id) references public.user_cards (user_id, card_id) on delete restrict;
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.user_cards enable row level security;
alter table public.lineups enable row level security;
alter table public.lineup_slots enable row level security;
alter table public.starter_team_cards enable row level security;

drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can delete own cards" on public.user_cards;
drop policy if exists "Users can insert own cards" on public.user_cards;
drop policy if exists "Users can read own cards" on public.user_cards;
drop policy if exists "Users can update own cards" on public.user_cards;
drop policy if exists "Users can delete own lineups" on public.lineups;
drop policy if exists "Users can insert own lineups" on public.lineups;
drop policy if exists "Users can read own lineups" on public.lineups;
drop policy if exists "Users can update own lineups" on public.lineups;
drop policy if exists "Users can delete own lineup slots" on public.lineup_slots;
drop policy if exists "Users can insert own lineup slots" on public.lineup_slots;
drop policy if exists "Users can read own lineup slots" on public.lineup_slots;
drop policy if exists "Users can update own lineup slots" on public.lineup_slots;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "user_cards_select_own"
  on public.user_cards for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "user_cards_insert_own"
  on public.user_cards for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "user_cards_update_own"
  on public.user_cards for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "user_cards_delete_own"
  on public.user_cards for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "lineups_select_own"
  on public.lineups for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "lineups_insert_own"
  on public.lineups for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "lineups_update_own"
  on public.lineups for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "lineups_delete_own"
  on public.lineups for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "lineup_slots_select_own"
  on public.lineup_slots for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "lineup_slots_insert_own"
  on public.lineup_slots for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "lineup_slots_update_own"
  on public.lineup_slots for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "lineup_slots_delete_own"
  on public.lineup_slots for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "starter_team_cards_read_authenticated"
  on public.starter_team_cards for select to authenticated
  using (true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger lineups_set_updated_at
  before update on public.lineups
  for each row execute function public.set_updated_at();

create or replace function public.claim_starter_team(selected_team_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_lineup_id uuid;
  starter_card_count integer;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required to claim a starter team.';
  end if;

  if selected_team_id is null or btrim(selected_team_id) = '' then
    raise exception using errcode = '22023', message = 'A starter team id is required.';
  end if;

  select count(*) into starter_card_count
  from public.starter_team_cards
  where team_id = selected_team_id;

  if starter_card_count <> 6 or exists (
    select required.slot
    from (values ('LW'), ('C'), ('RW'), ('LD'), ('RD'), ('G')) as required(slot)
    where not exists (
      select 1 from public.starter_team_cards starter
      where starter.team_id = selected_team_id and starter.slot = required.slot
    )
  ) then
    raise exception using errcode = '22023', message = 'Unknown or incomplete starter team.';
  end if;

  perform 1 from public.profiles where id = current_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found.';
  end if;

  update public.profiles
  set favorite_team_id = claim_starter_team.selected_team_id,
      starter_claimed_at = now(),
      onboarding_completed = true,
      credits = 1000
  where id = current_user_id
    and starter_claimed_at is null
    and profiles.favorite_team_id is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'Starter team has already been claimed.';
  end if;

  insert into public.user_cards (user_id, card_id, quantity)
  select current_user_id, card_id, 1
  from public.starter_team_cards
  where team_id = selected_team_id;

  insert into public.lineups (user_id, name, mode, is_active)
  values (current_user_id, 'Edmonton Oilers Starter', 'nhl-circuit', true)
  returning id into created_lineup_id;

  insert into public.lineup_slots (lineup_id, user_id, slot, card_id)
  select created_lineup_id, current_user_id, slot, card_id
  from public.starter_team_cards
  where team_id = selected_team_id;

  return created_lineup_id;
end;
$$;

revoke all on function public.claim_starter_team(text) from public, anon;
grant execute on function public.claim_starter_team(text) to authenticated;

revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
