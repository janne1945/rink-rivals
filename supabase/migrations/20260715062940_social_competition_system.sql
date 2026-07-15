-- Social Competition foundation
--
-- This migration deliberately keeps the existing asynchronous Ghost Rivalry
-- tables alive for expiring deep links. New synchronous rooms, Rivalry Arena,
-- and the free Season Locker use separate additive contracts.

create table public.seasons (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  check (ends_at = starts_at + interval '28 days')
);

create unique index seasons_active_window_idx on public.seasons (starts_at, ends_at);

create table public.season_reward_definitions (
  season_id text not null references public.seasons(id) on delete cascade,
  tier integer not null check (tier between 1 and 30),
  xp_required integer not null check (xp_required > 0),
  reward_type text not null check (reward_type in ('credits', 'emblem', 'banner', 'title', 'broadcast-sting', 'card')),
  label text not null check (length(btrim(label)) between 1 and 80),
  description text not null default '',
  amount integer check (amount is null or amount > 0),
  card_id text references public.card_catalog(card_id) on delete restrict,
  cosmetic_slug text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  primary key (season_id, tier),
  unique (season_id, xp_required),
  check (
    (reward_type = 'credits' and amount is not null and card_id is null and cosmetic_slug is null)
    or (reward_type = 'card' and amount is null and card_id is not null and cosmetic_slug is null)
    or (reward_type in ('emblem', 'banner', 'title', 'broadcast-sting') and amount is null and card_id is null and cosmetic_slug is not null)
  )
);

create index season_reward_definitions_card_id_idx
  on public.season_reward_definitions (card_id) where card_id is not null;

create table public.user_season_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id text not null references public.seasons(id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  faceoff_matches integer not null default 0 check (faceoff_matches >= 0),
  arena_matches integer not null default 0 check (arena_matches >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, season_id)
);

create index user_season_progress_season_xp_idx
  on public.user_season_progress (season_id, xp desc);

create table public.season_xp_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id text not null references public.seasons(id) on delete cascade,
  source_kind text not null check (source_kind in ('faceoff', 'arena')),
  source_id uuid not null,
  xp integer not null check (xp > 0),
  granted_at timestamptz not null default clock_timestamp(),
  unique (user_id, source_kind, source_id)
);

create index season_xp_receipts_user_granted_at_idx
  on public.season_xp_receipts (user_id, granted_at desc);
create index season_xp_receipts_season_id_idx
  on public.season_xp_receipts (season_id);

create table public.user_cosmetics (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cosmetic_kind text not null check (cosmetic_kind in ('emblem', 'banner', 'title', 'broadcast-sting')),
  cosmetic_slug text not null check (cosmetic_slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  source text not null default 'season-locker',
  unlocked_at timestamptz not null default clock_timestamp(),
  primary key (user_id, cosmetic_kind, cosmetic_slug)
);

create table public.season_reward_claims (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id text not null,
  tier integer not null,
  client_request_id text not null check (length(btrim(client_request_id)) between 1 and 200),
  reward_snapshot jsonb not null check (jsonb_typeof(reward_snapshot) = 'object'),
  claimed_at timestamptz not null default clock_timestamp(),
  unique (user_id, season_id, tier),
  unique (user_id, client_request_id),
  foreign key (season_id, tier)
    references public.season_reward_definitions(season_id, tier) on delete restrict
);

create index season_reward_claims_user_claimed_at_idx
  on public.season_reward_claims (user_id, claimed_at desc);

insert into public.seasons (id, name, description, starts_at, ends_at)
values (
  'season-zero-2026',
  'Season Zero: First Shift',
  'A 28-day, gameplay-only locker. Every reward is visible and guaranteed.',
  timestamptz '2026-07-15 00:00:00+00',
  timestamptz '2026-08-12 00:00:00+00'
);

insert into public.season_reward_definitions
  (season_id, tier, xp_required, reward_type, label, description, amount, card_id, cosmetic_slug, metadata)
values
  ('season-zero-2026', 1, 100, 'credits', 'Opening Faceoff', '150 Rivalry Points.', 150, null, null, '{}'),
  ('season-zero-2026', 2, 200, 'emblem', 'First Shift', 'Season Zero profile emblem.', null, null, 'first-shift', '{"accent":"ice"}'),
  ('season-zero-2026', 3, 300, 'credits', 'Bench Boost', '175 Rivalry Points.', 175, null, null, '{}'),
  ('season-zero-2026', 4, 400, 'banner', 'Blue Line', 'Animated blue-line profile banner.', null, null, 'blue-line', '{"accent":"cyan"}'),
  ('season-zero-2026', 5, 500, 'credits', 'Five Alive', '200 Rivalry Points.', 200, null, null, '{}'),
  ('season-zero-2026', 6, 600, 'title', 'Rink Regular', 'Profile title: Rink Regular.', null, null, 'rink-regular', '{}'),
  ('season-zero-2026', 7, 700, 'credits', 'Lucky Seven', '225 Rivalry Points.', 225, null, null, '{}'),
  ('season-zero-2026', 8, 800, 'broadcast-sting', 'Cold Open', 'Pre-match Cold Open broadcast sting.', null, null, 'cold-open', '{"duration_ms":1200}'),
  ('season-zero-2026', 9, 900, 'credits', 'Top Nine', '250 Rivalry Points.', 250, null, null, '{}'),
  ('season-zero-2026', 10, 1000, 'emblem', 'Ten Games Tall', 'Season milestone emblem.', null, null, 'ten-games-tall', '{"accent":"gold"}'),
  ('season-zero-2026', 11, 1100, 'credits', 'Momentum', '275 Rivalry Points.', 275, null, null, '{}'),
  ('season-zero-2026', 12, 1200, 'banner', 'Northern Lights', 'Northern Lights profile banner.', null, null, 'northern-lights', '{"accent":"aurora"}'),
  ('season-zero-2026', 13, 1300, 'credits', 'Pressure Shift', '300 Rivalry Points.', 300, null, null, '{}'),
  ('season-zero-2026', 14, 1400, 'title', 'The Challenger', 'Profile title: The Challenger.', null, null, 'the-challenger', '{}'),
  ('season-zero-2026', 15, 1500, 'card', 'NHL Seasonal Star', 'Guaranteed Connor McDavid Season reward card.', null, 'nhl-connor-mcdavid-rivalry-2026', null, '{"league":"NHL","featured":true}'),
  ('season-zero-2026', 16, 1600, 'credits', 'Second Period', '325 Rivalry Points.', 325, null, null, '{}'),
  ('season-zero-2026', 17, 1700, 'emblem', 'Clutch Gene', 'Clutch Gene profile emblem.', null, null, 'clutch-gene', '{"accent":"red"}'),
  ('season-zero-2026', 18, 1800, 'credits', 'Breakaway', '350 Rivalry Points.', 350, null, null, '{}'),
  ('season-zero-2026', 19, 1900, 'broadcast-sting', 'Goal Horn Zero', 'Season Zero goal-horn sting.', null, null, 'goal-horn-zero', '{"duration_ms":1600}'),
  ('season-zero-2026', 20, 2000, 'credits', 'Twenty Strong', '375 Rivalry Points.', 375, null, null, '{}'),
  ('season-zero-2026', 21, 2100, 'title', 'Arena Tested', 'Profile title: Arena Tested.', null, null, 'arena-tested', '{}'),
  ('season-zero-2026', 22, 2200, 'credits', 'Deep Run', '400 Rivalry Points.', 400, null, null, '{}'),
  ('season-zero-2026', 23, 2300, 'banner', 'Rivalry Night', 'Rivalry Night profile banner.', null, null, 'rivalry-night', '{"accent":"magenta"}'),
  ('season-zero-2026', 24, 2400, 'credits', 'Final Six', '425 Rivalry Points.', 425, null, null, '{}'),
  ('season-zero-2026', 25, 2500, 'emblem', 'Twenty-Five', 'Elite season milestone emblem.', null, null, 'twenty-five', '{"accent":"platinum"}'),
  ('season-zero-2026', 26, 2600, 'credits', 'Home Stretch', '450 Rivalry Points.', 450, null, null, '{}'),
  ('season-zero-2026', 27, 2700, 'broadcast-sting', 'Final Minute', 'Final Minute broadcast sting.', null, null, 'final-minute', '{"duration_ms":1800}'),
  ('season-zero-2026', 28, 2800, 'credits', 'Four Weeks', '500 Rivalry Points.', 500, null, null, '{}'),
  ('season-zero-2026', 29, 2900, 'title', 'First Shift Legend', 'Profile title: First Shift Legend.', null, null, 'first-shift-legend', '{}'),
  ('season-zero-2026', 30, 3000, 'card', 'PWHL Seasonal Star', 'Guaranteed Marie-Philip Poulin Season reward card.', null, 'pwhl-marie-philip-poulin-rivalry-2026', null, '{"league":"PWHL","featured":true}');

create or replace function public.active_season(at_time timestamptz default clock_timestamp())
returns public.seasons
language sql
stable
security definer
set search_path = ''
as $$
  select seasons.*
  from public.seasons seasons
  where active_season.at_time >= seasons.starts_at
    and active_season.at_time < seasons.ends_at
  order by seasons.starts_at desc
  limit 1;
$$;

revoke all on function public.active_season(timestamptz) from public, anon, authenticated;

create or replace function public.grant_season_xp(
  target_user_id uuid,
  source_kind text,
  source_id uuid,
  xp_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  season public.seasons%rowtype;
  receipt public.season_xp_receipts%rowtype;
  progress public.user_season_progress%rowtype;
begin
  if target_user_id is null or grant_season_xp.source_id is null
    or grant_season_xp.source_kind not in ('faceoff', 'arena')
    or xp_amount is null or xp_amount <= 0 then
    raise exception 'Invalid Season XP grant.' using errcode = '22023';
  end if;
  select * into season from public.active_season(clock_timestamp());
  if not found then
    return jsonb_build_object('status', 'no-active-season', 'xp_granted', 0, 'xp', 0);
  end if;

  select * into receipt from public.season_xp_receipts receipts
  where receipts.user_id = target_user_id
    and receipts.source_kind = grant_season_xp.source_kind
    and receipts.source_id = grant_season_xp.source_id;
  if found then
    select * into progress from public.user_season_progress entries
    where entries.user_id = target_user_id and entries.season_id = receipt.season_id;
    return jsonb_build_object(
      'status', 'already-granted', 'season_id', receipt.season_id,
      'xp_granted', 0, 'source_xp', receipt.xp, 'xp', coalesce(progress.xp, 0)
    );
  end if;

  insert into public.season_xp_receipts (user_id, season_id, source_kind, source_id, xp)
  values (target_user_id, season.id, grant_season_xp.source_kind, grant_season_xp.source_id, xp_amount)
  returning * into receipt;

  insert into public.user_season_progress (user_id, season_id, xp, faceoff_matches, arena_matches)
  values (
    target_user_id, season.id, xp_amount,
    case when grant_season_xp.source_kind = 'faceoff' then 1 else 0 end,
    case when grant_season_xp.source_kind = 'arena' then 1 else 0 end
  )
  on conflict (user_id, season_id) do update set
    xp = user_season_progress.xp + excluded.xp,
    faceoff_matches = user_season_progress.faceoff_matches + excluded.faceoff_matches,
    arena_matches = user_season_progress.arena_matches + excluded.arena_matches,
    updated_at = clock_timestamp()
  returning * into progress;

  return jsonb_build_object(
    'status', 'granted', 'season_id', season.id,
    'xp_granted', receipt.xp, 'xp', progress.xp
  );
end;
$$;

revoke all on function public.grant_season_xp(uuid, text, uuid, integer) from public, anon, authenticated;

create or replace function public.get_season_locker()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  season public.seasons%rowtype;
  progress public.user_season_progress%rowtype;
  rewards jsonb;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select * into season from public.active_season(clock_timestamp());
  if not found then
    select * into season from public.seasons seasons
    order by abs(extract(epoch from (seasons.starts_at - clock_timestamp())))
    limit 1;
  end if;
  if not found then
    return jsonb_build_object('status', 'unavailable', 'server_time', clock_timestamp(), 'rewards', '[]'::jsonb);
  end if;
  select * into progress from public.user_season_progress entries
  where entries.user_id = requesting_user_id and entries.season_id = season.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tier', definitions.tier,
    'xp_required', definitions.xp_required,
    'reward_type', definitions.reward_type,
    'label', definitions.label,
    'description', definitions.description,
    'amount', definitions.amount,
    'card_id', definitions.card_id,
    'cosmetic_slug', definitions.cosmetic_slug,
    'metadata', definitions.metadata,
    'unlocked', coalesce(progress.xp, 0) >= definitions.xp_required,
    'claimed', claims.id is not null,
    'claimed_at', claims.claimed_at
  ) order by definitions.tier), '[]'::jsonb)
  into rewards
  from public.season_reward_definitions definitions
  left join public.season_reward_claims claims
    on claims.user_id = requesting_user_id
    and claims.season_id = definitions.season_id
    and claims.tier = definitions.tier
  where definitions.season_id = season.id;

  return jsonb_build_object(
    'status', case
      when clock_timestamp() < season.starts_at then 'upcoming'
      when clock_timestamp() >= season.ends_at then 'ended'
      else 'active' end,
    'server_time', clock_timestamp(),
    'season', jsonb_build_object(
      'id', season.id, 'name', season.name, 'description', season.description,
      'starts_at', season.starts_at, 'ends_at', season.ends_at
    ),
    'xp', coalesce(progress.xp, 0),
    'faceoff_matches', coalesce(progress.faceoff_matches, 0),
    'arena_matches', coalesce(progress.arena_matches, 0),
    'rewards', rewards
  );
end;
$$;

create or replace function public.claim_season_reward(
  season_id text,
  tier integer,
  client_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_request_id text := btrim(claim_season_reward.client_request_id);
  season public.seasons%rowtype;
  definition public.season_reward_definitions%rowtype;
  progress public.user_season_progress%rowtype;
  existing public.season_reward_claims%rowtype;
  claimed_time timestamptz := clock_timestamp();
  reward_snapshot jsonb;
  owned_quantity integer;
  credit_balance integer;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if claim_season_reward.season_id is null or claim_season_reward.tier not between 1 and 30
    or normalized_request_id is null or length(normalized_request_id) not between 1 and 200 then
    raise exception 'Invalid Season reward claim.' using errcode = '22023';
  end if;

  perform 1 from public.profiles profiles where profiles.id = requesting_user_id for update;
  if not found then raise exception 'Profile not found.' using errcode = 'P0002'; end if;

  select * into existing from public.season_reward_claims claims
  where claims.user_id = requesting_user_id and claims.client_request_id = normalized_request_id;
  if found then
    if existing.season_id <> claim_season_reward.season_id or existing.tier <> claim_season_reward.tier then
      raise exception 'Reward request id was already used for another tier.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'status', 'already-claimed', 'season_id', existing.season_id, 'tier', existing.tier,
      'reward', existing.reward_snapshot, 'claimed_at', existing.claimed_at,
      'credits', (select profiles.credits from public.profiles profiles where profiles.id = requesting_user_id)
    );
  end if;

  select * into season from public.seasons seasons where seasons.id = claim_season_reward.season_id for share;
  if not found then raise exception 'Season not found.' using errcode = 'P0002'; end if;
  if claimed_time < season.starts_at or claimed_time >= season.ends_at then
    raise exception 'This Season is not active.' using errcode = 'P0001';
  end if;
  select * into definition from public.season_reward_definitions definitions
  where definitions.season_id = season.id and definitions.tier = claim_season_reward.tier for share;
  if not found then raise exception 'Season reward not found.' using errcode = 'P0002'; end if;
  select * into progress from public.user_season_progress entries
  where entries.user_id = requesting_user_id and entries.season_id = season.id for update;
  if not found or progress.xp < definition.xp_required then
    raise exception 'Earn more Season XP to unlock this reward.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.season_reward_claims claims
    where claims.user_id = requesting_user_id and claims.season_id = season.id and claims.tier = definition.tier
  ) then
    raise exception 'This Season reward was already claimed.' using errcode = '23505';
  end if;

  if definition.reward_type = 'credits' then
    update public.profiles profiles set
      credits = profiles.credits + definition.amount,
      updated_at = claimed_time
    where profiles.id = requesting_user_id
    returning profiles.credits into credit_balance;
  elsif definition.reward_type = 'card' then
    insert into public.user_cards (user_id, card_id, quantity, acquired_at)
    values (requesting_user_id, definition.card_id, 1, claimed_time)
    on conflict (user_id, card_id) do update set
      quantity = user_cards.quantity + 1
    returning quantity into owned_quantity;
  else
    insert into public.user_cosmetics (user_id, cosmetic_kind, cosmetic_slug, source, unlocked_at)
    values (requesting_user_id, definition.reward_type, definition.cosmetic_slug, 'season:' || season.id, claimed_time)
    on conflict (user_id, cosmetic_kind, cosmetic_slug) do nothing;
  end if;
  if credit_balance is null then
    select profiles.credits into credit_balance from public.profiles profiles where profiles.id = requesting_user_id;
  end if;

  reward_snapshot := jsonb_build_object(
    'type', definition.reward_type, 'label', definition.label, 'description', definition.description,
    'amount', definition.amount, 'card_id', definition.card_id,
    'cosmetic_slug', definition.cosmetic_slug, 'quantity', owned_quantity,
    'metadata', definition.metadata
  );
  insert into public.season_reward_claims
    (user_id, season_id, tier, client_request_id, reward_snapshot, claimed_at)
  values (requesting_user_id, season.id, definition.tier, normalized_request_id, reward_snapshot, claimed_time);

  return jsonb_build_object(
    'status', 'claimed', 'season_id', season.id, 'tier', definition.tier,
    'reward', reward_snapshot, 'claimed_at', claimed_time, 'credits', credit_balance
  );
end;
$$;

revoke all on function public.get_season_locker() from public, anon;
grant execute on function public.get_season_locker() to authenticated;
revoke all on function public.claim_season_reward(text, integer, text) from public, anon;
grant execute on function public.claim_season_reward(text, integer, text) to authenticated;

alter table public.seasons enable row level security;
alter table public.season_reward_definitions enable row level security;
alter table public.user_season_progress enable row level security;
alter table public.season_xp_receipts enable row level security;
alter table public.user_cosmetics enable row level security;
alter table public.season_reward_claims enable row level security;

revoke all on public.seasons, public.season_reward_definitions, public.user_season_progress,
  public.season_xp_receipts, public.user_cosmetics, public.season_reward_claims from anon, authenticated;

-- Faceoff retains its existing RPC byte-for-byte. An after-insert trigger adds
-- Season XP inside the same settlement transaction without trusting the client.
create or replace function public.award_faceoff_season_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reward_rule_version = 'match-rules-v3-server-rounds' then
    perform public.grant_season_xp(
      new.user_id,
      'faceoff',
      new.id,
      case new.difficulty when 'rookie' then 100 when 'pro' then 130 else 160 end
    );
  end if;
  return new;
end;
$$;

revoke all on function public.award_faceoff_season_xp() from public, anon, authenticated;
create trigger award_faceoff_season_xp_after_insert
after insert on public.matches
for each row execute function public.award_faceoff_season_xp();

-- Rivalry Arena -------------------------------------------------------------

create or replace function public.social_competition_situations()
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_array(
    jsonb_build_object(
      'id', 'skater-speed', 'name', 'Speed',
      'description', 'Higher Speed wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW'), 'attribute', 'speed'),
    jsonb_build_object(
      'id', 'skater-shooting', 'name', 'Shooting',
      'description', 'Higher Shooting wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW'), 'attribute', 'shooting'),
    jsonb_build_object(
      'id', 'skater-defense', 'name', 'Defense',
      'description', 'Higher Defense wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LD', 'RD'), 'attribute', 'defense'),
    jsonb_build_object(
      'id', 'skater-clutch', 'name', 'Clutch',
      'description', 'Higher Clutch wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW', 'LD', 'RD'), 'attribute', 'clutch'),
    jsonb_build_object(
      'id', 'goalie-reflexes', 'name', 'Reflexes',
      'description', 'Higher Reflexes wins this round.', 'role', 'goalie',
      'eligible_slots', jsonb_build_array('G'), 'attribute', 'reflexes')
  );
$$;

revoke all on function public.social_competition_situations() from public, anon, authenticated;

create table public.arena_match_tickets (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_match_id text not null check (length(btrim(client_match_id)) between 1 and 200),
  lineup_id uuid not null,
  lineup_snapshot jsonb not null check (jsonb_typeof(lineup_snapshot) = 'object'),
  lineup_strength numeric(8,2) not null check (lineup_strength > 0),
  mode text not null check (mode in ('nhl-circuit', 'pwhl-circuit', 'open-ice')),
  seed text not null check (length(seed) between 1 and 200),
  opponent_user_id uuid not null references public.profiles(id) on delete restrict,
  opponent_lineup_id uuid not null,
  opponent_snapshot jsonb not null check (jsonb_typeof(opponent_snapshot) = 'object'),
  opponent_strength numeric(8,2) not null check (opponent_strength > 0),
  opponent_label text not null check (length(btrim(opponent_label)) between 1 and 80),
  situations_snapshot jsonb not null check (
    jsonb_typeof(situations_snapshot) = 'array' and jsonb_array_length(situations_snapshot) = 5
  ),
  status text not null default 'open' check (status in ('open', 'settled', 'abandoned')),
  outcome text check (outcome in ('win', 'draw', 'loss')),
  started_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz,
  unique (user_id, client_match_id),
  unique (id, user_id),
  foreign key (lineup_id, user_id) references public.lineups(id, user_id) on delete restrict,
  foreign key (opponent_lineup_id, opponent_user_id) references public.lineups(id, user_id) on delete restrict,
  check (user_id <> opponent_user_id),
  check (
    (status = 'open' and outcome is null and settled_at is null)
    or (status = 'settled' and outcome is not null and settled_at is not null)
    or status = 'abandoned'
  )
);

create unique index arena_match_tickets_one_open_per_user_idx
  on public.arena_match_tickets (user_id) where status = 'open';
create index arena_match_tickets_user_started_at_idx
  on public.arena_match_tickets (user_id, started_at desc);
create index arena_match_tickets_opponent_user_idx
  on public.arena_match_tickets (opponent_user_id, started_at desc);
create index arena_match_tickets_lineup_id_idx on public.arena_match_tickets (lineup_id);
create index arena_match_tickets_opponent_lineup_id_idx on public.arena_match_tickets (opponent_lineup_id);

create table public.arena_match_rounds (
  ticket_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  round_index integer not null check (round_index between 0 and 4),
  client_request_id text not null check (length(btrim(client_request_id)) between 1 and 200),
  situation_id text not null,
  player_card_id text not null references public.card_catalog(card_id) on delete restrict,
  player_slot text not null check (player_slot in ('LW', 'C', 'RW', 'LD', 'RD', 'G')),
  opponent_card_id text not null references public.card_catalog(card_id) on delete restrict,
  opponent_slot text not null check (opponent_slot in ('LW', 'C', 'RW', 'LD', 'RD', 'G')),
  player_score integer not null check (player_score >= 0),
  opponent_score integer not null check (opponent_score >= 0),
  winner text not null check (winner in ('player', 'opponent')),
  transcript jsonb not null check (jsonb_typeof(transcript) = 'object'),
  played_at timestamptz not null default clock_timestamp(),
  primary key (ticket_id, round_index),
  unique (user_id, client_request_id),
  foreign key (ticket_id, user_id) references public.arena_match_tickets(id, user_id) on delete cascade
);

create index arena_match_rounds_user_played_at_idx
  on public.arena_match_rounds (user_id, played_at desc);
create index arena_match_rounds_player_card_id_idx on public.arena_match_rounds (player_card_id);
create index arena_match_rounds_opponent_card_id_idx on public.arena_match_rounds (opponent_card_id);

alter table public.arena_match_tickets enable row level security;
alter table public.arena_match_rounds enable row level security;
revoke all on public.arena_match_tickets, public.arena_match_rounds from anon, authenticated;

create or replace function public.arena_match_payload(
  requested_ticket_id uuid,
  requested_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  ticket public.arena_match_tickets%rowtype;
  played_rounds jsonb;
begin
  select * into ticket from public.arena_match_tickets tickets
  where tickets.id = requested_ticket_id and tickets.user_id = requesting_user_id;
  if not found then raise exception 'Arena match not found.' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'status', 'already-played',
    'client_match_id', ticket.client_match_id,
    'round_index', rounds.round_index,
    'situation_id', rounds.situation_id,
    'player_card_id', rounds.player_card_id,
    'player_slot', rounds.player_slot,
    'player_score', rounds.player_score,
    'opponent_card_id', rounds.opponent_card_id,
    'opponent_slot', rounds.opponent_slot,
    'opponent_score', rounds.opponent_score,
    'winner', rounds.winner,
    'tie_breaker', rounds.transcript ->> 'tie_breaker',
    'transcript', rounds.transcript
  ) order by rounds.round_index), '[]'::jsonb)
  into played_rounds
  from public.arena_match_rounds rounds where rounds.ticket_id = ticket.id;

  return jsonb_build_object(
    'status', requested_status,
    'client_match_id', ticket.client_match_id,
    'seed', ticket.seed,
    'lineup', ticket.lineup_snapshot,
    'opponent_id', 'arena:' || ticket.opponent_user_id::text,
    -- Arena reveals only cards already played. The caller's known card ids are
    -- a structurally valid client mask for the hidden rival snapshot.
    'opponent', ticket.lineup_snapshot || jsonb_build_object(
      'id', 'arena:' || ticket.opponent_user_id::text,
      'name', ticket.opponent_label
    ),
    'situations', ticket.situations_snapshot,
    'rounds', played_rounds,
    'mode', ticket.mode,
    'difficulty', 'pro',
    'match_source', 'rivalry-arena',
    'lineup_strength', ticket.lineup_strength,
    'opponent_strength', ticket.opponent_strength
  );
end;
$$;

revoke all on function public.arena_match_payload(uuid, text) from public, anon, authenticated;

create or replace function public.start_arena_match(client_match_id text, mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_match_id text := btrim(start_arena_match.client_match_id);
  requested_mode text := start_arena_match.mode;
  profile public.profiles%rowtype;
  existing public.arena_match_tickets%rowtype;
  player_lineup public.lineups%rowtype;
  player_snapshot jsonb;
  player_strength numeric(8,2);
  opponent_lineup_id uuid;
  opponent_user_id uuid;
  opponent_name text;
  opponent_snapshot jsonb;
  opponent_strength numeric(8,2);
  ticket_seed text;
  created_ticket_id uuid;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200
    or requested_mode not in ('nhl-circuit', 'pwhl-circuit', 'open-ice') then
    raise exception 'Invalid Arena match input.' using errcode = '22023';
  end if;
  select * into profile from public.profiles profiles where profiles.id = requesting_user_id for update;
  if not found or not profile.onboarding_completed then
    raise exception 'Onboarding must be completed before entering the Arena.' using errcode = 'P0001';
  end if;

  select * into existing from public.arena_match_tickets tickets
  where tickets.user_id = requesting_user_id and tickets.client_match_id = normalized_match_id;
  if found then
    if existing.mode <> requested_mode then
      raise exception 'Arena match id was already used for another mode.' using errcode = '22023';
    end if;
    if existing.status <> 'open' then raise exception 'Arena match is no longer active.' using errcode = 'P0001'; end if;
    return public.arena_match_payload(existing.id, 'already-started');
  end if;
  if exists (select 1 from public.arena_match_tickets tickets where tickets.user_id = requesting_user_id and tickets.status = 'open') then
    raise exception 'Another Arena match is already in progress.' using errcode = 'P0001';
  end if;

  select * into player_lineup from public.lineups lineups
  where lineups.user_id = requesting_user_id and lineups.mode = requested_mode and lineups.is_active
  for share;
  if not found then raise exception 'An active lineup is required for this Arena.' using errcode = 'P0001'; end if;
  player_snapshot := public.lineup_as_json(requesting_user_id, player_lineup.id);
  perform public.assert_valid_lineup(requesting_user_id, requested_mode, player_snapshot -> 'slots');
  select round(avg(catalog.overall), 2) into player_strength
  from jsonb_each_text(player_snapshot -> 'slots') supplied(slot, card_id)
  join public.card_catalog catalog on catalog.card_id = supplied.card_id;

  select candidates.lineup_id, candidates.user_id, candidates.opponent_name,
    candidates.lineup_snapshot, candidates.strength
  into opponent_lineup_id, opponent_user_id, opponent_name, opponent_snapshot, opponent_strength
  from (
    select lineups.id as lineup_id, lineups.user_id,
      coalesce(nullif(btrim(profiles.display_name), ''), 'Anonymous Rival') as opponent_name,
      jsonb_build_object(
        'id', lineups.id, 'name', lineups.name, 'mode', lineups.mode,
        'slots', jsonb_object_agg(slots.slot, slots.card_id order by slots.slot)
      ) as lineup_snapshot,
      round(avg(catalog.overall), 2) as strength
    from public.lineups lineups
    join public.profiles profiles on profiles.id = lineups.user_id and profiles.onboarding_completed
    join public.lineup_slots slots on slots.lineup_id = lineups.id and slots.user_id = lineups.user_id
    join public.card_catalog catalog on catalog.card_id = slots.card_id and catalog.is_active
    join public.user_cards owned on owned.user_id = lineups.user_id and owned.card_id = slots.card_id and owned.quantity > 0
    where lineups.user_id <> requesting_user_id and lineups.mode = requested_mode and lineups.is_active
      and slots.slot = any(catalog.eligible_positions)
      and ((slots.slot = 'G' and catalog.role = 'goalie') or (slots.slot <> 'G' and catalog.role = 'skater'))
      and (requested_mode = 'open-ice'
        or catalog.league = case requested_mode when 'nhl-circuit' then 'NHL' else 'PWHL' end)
    group by lineups.id, lineups.user_id, lineups.name, lineups.mode, profiles.display_name
    having count(*) = 6 and count(distinct slots.slot) = 6 and count(distinct slots.card_id) = 6
  ) candidates
  order by abs(candidates.strength - player_strength),
    abs(hashtextextended(normalized_match_id || ':' || candidates.lineup_id::text, 0)),
    candidates.lineup_id
  limit 1;
  if opponent_lineup_id is null then
    raise exception 'No valid real-player lineup is available for this Arena yet.' using errcode = 'P0002';
  end if;

  ticket_seed := extensions.gen_random_uuid()::text;
  insert into public.arena_match_tickets (
    user_id, client_match_id, lineup_id, lineup_snapshot, lineup_strength, mode, seed,
    opponent_user_id, opponent_lineup_id, opponent_snapshot, opponent_strength,
    opponent_label, situations_snapshot
  ) values (
    requesting_user_id, normalized_match_id, player_lineup.id, player_snapshot, player_strength,
    requested_mode, ticket_seed, opponent_user_id, opponent_lineup_id, opponent_snapshot,
    opponent_strength, opponent_name, public.social_competition_situations()
  ) returning id into created_ticket_id;

  return public.arena_match_payload(created_ticket_id, 'started');
end;
$$;

revoke all on function public.start_arena_match(text, text) from public, anon;
grant execute on function public.start_arena_match(text, text) to authenticated;

create or replace function public.play_arena_match_round(
  client_match_id text,
  round_index integer,
  player_card_id text,
  client_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_match_id text := btrim(play_arena_match_round.client_match_id);
  normalized_card_id text := btrim(play_arena_match_round.player_card_id);
  normalized_request_id text := btrim(play_arena_match_round.client_request_id);
  ticket public.arena_match_tickets%rowtype;
  existing_round public.arena_match_rounds%rowtype;
  situation jsonb;
  eligible_slots text[];
  player_slot text;
  opponent_slot text;
  opponent_card_id text;
  player_score jsonb;
  opponent_score jsonb;
  player_value integer;
  opponent_value integer;
  player_overall integer;
  opponent_overall integer;
  round_winner text;
  tie_breaker text;
  rounds_played integer;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200
    or normalized_card_id is null or length(normalized_card_id) not between 1 and 200
    or normalized_request_id is null or length(normalized_request_id) not between 1 and 200
    or play_arena_match_round.round_index is null or play_arena_match_round.round_index not between 0 and 4 then
    raise exception 'Invalid Arena round input.' using errcode = '22023';
  end if;
  perform 1 from public.profiles profiles where profiles.id = requesting_user_id for update;
  select * into ticket from public.arena_match_tickets tickets
  where tickets.user_id = requesting_user_id and tickets.client_match_id = normalized_match_id for update;
  if not found then raise exception 'A valid Arena ticket is required.' using errcode = 'P0001'; end if;

  select * into existing_round from public.arena_match_rounds rounds
  where rounds.user_id = requesting_user_id and rounds.client_request_id = normalized_request_id;
  if found then
    if existing_round.ticket_id <> ticket.id or existing_round.round_index <> play_arena_match_round.round_index
      or existing_round.player_card_id <> normalized_card_id then
      raise exception 'Round request id was already used for different Arena data.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'status', 'already-played', 'client_match_id', normalized_match_id,
      'round_index', existing_round.round_index, 'situation_id', existing_round.situation_id,
      'player_card_id', existing_round.player_card_id, 'player_slot', existing_round.player_slot,
      'player_score', existing_round.player_score, 'opponent_card_id', existing_round.opponent_card_id,
      'opponent_slot', existing_round.opponent_slot, 'opponent_score', existing_round.opponent_score,
      'winner', existing_round.winner, 'tie_breaker', existing_round.transcript ->> 'tie_breaker',
      'transcript', existing_round.transcript
    );
  end if;
  if ticket.status <> 'open' then raise exception 'Arena ticket is not open.' using errcode = 'P0001'; end if;
  select count(*)::integer into rounds_played from public.arena_match_rounds rounds where rounds.ticket_id = ticket.id;
  if rounds_played <> play_arena_match_round.round_index then
    raise exception 'Arena rounds must be played in order.' using errcode = '22023';
  end if;

  situation := ticket.situations_snapshot -> play_arena_match_round.round_index;
  select array_agg(eligible.slot_name) into eligible_slots
  from jsonb_array_elements_text(situation -> 'eligible_slots') eligible(slot_name);
  select supplied.slot into player_slot
  from jsonb_each_text(ticket.lineup_snapshot -> 'slots') supplied(slot, card_id)
  where supplied.card_id = normalized_card_id and supplied.slot = any(eligible_slots)
    and not exists (select 1 from public.arena_match_rounds rounds where rounds.ticket_id = ticket.id and rounds.player_card_id = supplied.card_id)
  order by supplied.slot limit 1;
  if player_slot is null then
    raise exception 'Player card is missing, used, or ineligible for this category.' using errcode = '22023';
  end if;
  player_score := public.card_quartett_score(normalized_card_id, situation);
  if player_score is null then raise exception 'Player card metadata is unavailable.' using errcode = 'P0002'; end if;

  select candidate.slot, candidate.card_id, candidate.score
  into opponent_slot, opponent_card_id, opponent_score
  from (
    select ranked.* from (
      select supplied.slot, supplied.card_id, public.card_quartett_score(supplied.card_id, situation) as score,
        row_number() over (order by
          (public.card_quartett_score(supplied.card_id, situation) ->> 'value')::integer,
          (public.card_quartett_score(supplied.card_id, situation) ->> 'overall')::integer,
          supplied.card_id) as strength_rank,
        count(*) over () as candidate_count
      from jsonb_each_text(ticket.opponent_snapshot -> 'slots') supplied(slot, card_id)
      where supplied.slot = any(eligible_slots)
        and not exists (select 1 from public.arena_match_rounds rounds where rounds.ticket_id = ticket.id and rounds.opponent_card_id = supplied.card_id)
    ) ranked
    where ranked.strength_rank > floor(ranked.candidate_count / 2.0)
    order by abs(hashtextextended(ticket.seed || ':' || play_arena_match_round.round_index::text || ':' || ranked.card_id, 0)), ranked.card_id
    limit 1
  ) candidate;
  if opponent_card_id is null or opponent_score is null then
    raise exception 'Rival lineup has no eligible card for this category.' using errcode = 'P0002';
  end if;

  player_value := (player_score ->> 'value')::integer;
  opponent_value := (opponent_score ->> 'value')::integer;
  player_overall := (player_score ->> 'overall')::integer;
  opponent_overall := (opponent_score ->> 'overall')::integer;
  if player_value <> opponent_value then
    round_winner := case when player_value > opponent_value then 'player' else 'opponent' end;
    tie_breaker := 'category';
  elsif player_overall <> opponent_overall then
    round_winner := case when player_overall > opponent_overall then 'player' else 'opponent' end;
    tie_breaker := 'overall';
  else
    round_winner := case when mod(abs(hashtextextended(ticket.seed || ':round:' || play_arena_match_round.round_index::text || ':tie', 0)), 2) = 0 then 'player' else 'opponent' end;
    tie_breaker := 'match-seed';
  end if;

  insert into public.arena_match_rounds (
    ticket_id, user_id, round_index, client_request_id, situation_id,
    player_card_id, player_slot, opponent_card_id, opponent_slot,
    player_score, opponent_score, winner, transcript
  ) values (
    ticket.id, requesting_user_id, play_arena_match_round.round_index, normalized_request_id,
    situation ->> 'id', normalized_card_id, player_slot, opponent_card_id, opponent_slot,
    player_value, opponent_value, round_winner,
    jsonb_build_object('situation', situation, 'player', player_score, 'opponent', opponent_score, 'tie_breaker', tie_breaker)
  );

  return jsonb_build_object(
    'status', 'played', 'client_match_id', normalized_match_id,
    'round_index', play_arena_match_round.round_index, 'situation_id', situation ->> 'id',
    'player_card_id', normalized_card_id, 'player_slot', player_slot, 'player_score', player_value,
    'opponent_card_id', opponent_card_id, 'opponent_slot', opponent_slot, 'opponent_score', opponent_value,
    'winner', round_winner, 'tie_breaker', tie_breaker,
    'transcript', jsonb_build_object('situation', situation, 'player', player_score, 'opponent', opponent_score, 'tie_breaker', tie_breaker)
  );
end;
$$;

revoke all on function public.play_arena_match_round(text, integer, text, text) from public, anon;
grant execute on function public.play_arena_match_round(text, integer, text, text) to authenticated;

create or replace function public.settle_arena_match(client_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_match_id text := btrim(settle_arena_match.client_match_id);
  ticket public.arena_match_tickets%rowtype;
  existing_match public.matches%rowtype;
  created_match_id uuid;
  settlement_time timestamptz;
  day_key text;
  week_key text;
  spotlight_mode text;
  resolved_outcome text;
  round_count integer;
  player_wins integer;
  opponent_wins integer;
  base_credits integer;
  objective_credits integer := 0;
  rivalry_credits integer := 0;
  total_credits integer;
  profile_credits integer;
  profile_completed_matches integer;
  progress_row public.objective_progress%rowtype;
  road public.rivalry_road_progress%rowtype;
  newly_completed boolean;
  xp_result jsonb;
  rule_version constant text := 'arena-v1-real-lineup';
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200 then
    raise exception 'A valid Arena match id is required.' using errcode = '22023';
  end if;
  perform 1 from public.profiles profiles where profiles.id = requesting_user_id for update;
  if not found then raise exception 'Profile not found.' using errcode = 'P0002'; end if;
  settlement_time := clock_timestamp();
  day_key := to_char(settlement_time at time zone 'UTC', 'YYYY-MM-DD');
  week_key := to_char(date_trunc('week', settlement_time at time zone 'UTC'), 'YYYY-MM-DD');

  select * into existing_match from public.matches matches
  where matches.user_id = requesting_user_id and matches.client_match_id = normalized_match_id;
  if found then
    if existing_match.reward_rule_version <> rule_version then
      raise exception 'Match id belongs to another match source.' using errcode = '22023';
    end if;
    xp_result := public.grant_season_xp(requesting_user_id, 'arena', existing_match.id, 140);
    return jsonb_build_object(
      'status', 'already-settled', 'match_id', existing_match.id,
      'reward_credits', (select rewards.total_credits from public.match_rewards rewards where rewards.match_id = existing_match.id),
      'credits', (select profiles.credits from public.profiles profiles where profiles.id = requesting_user_id),
      'completed_matches', (select profiles.completed_matches from public.profiles profiles where profiles.id = requesting_user_id),
      'season_xp', coalesce((xp_result ->> 'xp')::integer, 0),
      'season_xp_granted', coalesce((xp_result ->> 'xp_granted')::integer, 0)
    );
  end if;

  select * into ticket from public.arena_match_tickets tickets
  where tickets.user_id = requesting_user_id and tickets.client_match_id = normalized_match_id for update;
  if not found then raise exception 'A valid Arena ticket is required.' using errcode = 'P0001'; end if;
  if ticket.status <> 'open' then raise exception 'Arena ticket is not open.' using errcode = 'P0001'; end if;
  select count(*)::integer,
    count(*) filter (where rounds.winner = 'player')::integer,
    count(*) filter (where rounds.winner = 'opponent')::integer
  into round_count, player_wins, opponent_wins
  from public.arena_match_rounds rounds where rounds.ticket_id = ticket.id;
  if round_count <> 5 then raise exception 'All five Arena rounds must be played before settlement.' using errcode = 'P0001'; end if;
  resolved_outcome := case when player_wins > opponent_wins then 'win' when player_wins < opponent_wins then 'loss' else 'draw' end;

  insert into public.matches (user_id, client_match_id, mode, difficulty, outcome, reward_rule_version, completed_at)
  values (requesting_user_id, normalized_match_id, ticket.mode, 'pro', resolved_outcome, rule_version, settlement_time)
  returning id into created_match_id;
  base_credits := case resolved_outcome when 'win' then 180 when 'draw' then 120 else 80 end;
  spotlight_mode := (array['nhl-circuit', 'pwhl-circuit', 'open-ice'])[
    1 + mod((day_key::date - date '1970-01-01'), 3)
  ];

  insert into public.objective_progress
    (user_id, objective_id, period_key, current, target, reward_credits, completed_at)
  values (requesting_user_id, 'daily-match-complete', day_key, 1, 1, 75, settlement_time)
  on conflict (user_id, objective_id, period_key) do update set updated_at = settlement_time
  returning (xmax = 0) into newly_completed;
  if newly_completed then objective_credits := objective_credits + 75; end if;

  if resolved_outcome = 'win' then
    insert into public.objective_progress
      (user_id, objective_id, period_key, current, target, reward_credits, completed_at)
    values (requesting_user_id, 'daily-match-win', day_key, 1, 1, 100, settlement_time)
    on conflict (user_id, objective_id, period_key) do update set updated_at = settlement_time
    returning (xmax = 0) into newly_completed;
    if newly_completed then objective_credits := objective_credits + 100; end if;
  end if;
  if ticket.mode = spotlight_mode then
    insert into public.objective_progress
      (user_id, objective_id, period_key, current, target, reward_credits, completed_at)
    values (requesting_user_id, 'daily-spotlight', day_key, 1, 1, 100, settlement_time)
    on conflict (user_id, objective_id, period_key) do update set updated_at = settlement_time
    returning (xmax = 0) into newly_completed;
    if newly_completed then objective_credits := objective_credits + 100; end if;
  end if;

  insert into public.objective_progress (
    user_id, objective_id, period_key, current, target, completed_modes, completed_at, reward_credits
  ) values (
    requesting_user_id, 'weekly-circuit-tour', week_key, 1, 5, array[ticket.mode], null, 350
  ) on conflict (user_id, objective_id, period_key) do update set
    current = least(5, objective_progress.current + 1),
    completed_modes = (
      select array_agg(distinct mode_name order by mode_name)
      from unnest(objective_progress.completed_modes || array[ticket.mode]) mode_name
    ),
    completed_at = case
      when objective_progress.completed_at is null
        and least(5, objective_progress.current + 1) = 5
        and (select count(distinct mode_name) from unnest(objective_progress.completed_modes || array[ticket.mode]) mode_name) = 3
      then settlement_time else objective_progress.completed_at end,
    updated_at = settlement_time
  returning * into progress_row;
  if progress_row.completed_at = settlement_time then objective_credits := objective_credits + 350; end if;

  insert into public.rivalry_road_progress (user_id) values (requesting_user_id) on conflict (user_id) do nothing;
  select * into road from public.rivalry_road_progress progress where progress.user_id = requesting_user_id for update;
  if road.status = 'in-progress' and (
    (road.current_step_index = 0 and ticket.mode = 'nhl-circuit') or
    (road.current_step_index = 1 and ticket.mode = 'pwhl-circuit') or
    (road.current_step_index = 2 and ticket.mode = 'open-ice' and resolved_outcome = 'win')
  ) then
    if road.current_step_index in (0, 1) then rivalry_credits := 150; end if;
    update public.rivalry_road_progress progress set
      completed_step_ids = progress.completed_step_ids || case road.current_step_index
        when 0 then 'nhl-circuit-complete' when 1 then 'pwhl-circuit-complete' else 'open-ice-pro-win' end,
      current_step_index = road.current_step_index + 1,
      status = case when road.current_step_index = 2 then 'choice-pending' else 'in-progress' end,
      updated_at = settlement_time
    where progress.user_id = requesting_user_id;
  end if;

  total_credits := base_credits + objective_credits + rivalry_credits;
  insert into public.match_rewards (
    match_id, user_id, match_credits, objective_credits, rivalry_credits, rule_version, breakdown
  ) values (
    created_match_id, requesting_user_id, base_credits, objective_credits, rivalry_credits,
    rule_version, jsonb_build_object(
      'match', base_credits, 'objectives', objective_credits, 'rivalry_road', rivalry_credits,
      'source', 'rivalry-arena', 'arena_ticket_id', ticket.id, 'opponent_user_id', ticket.opponent_user_id
    )
  );
  update public.profiles profiles set
    credits = profiles.credits + total_credits,
    completed_matches = profiles.completed_matches + 1,
    updated_at = settlement_time
  where profiles.id = requesting_user_id
  returning profiles.credits, profiles.completed_matches into profile_credits, profile_completed_matches;
  update public.arena_match_tickets tickets set
    status = 'settled', outcome = resolved_outcome, settled_at = settlement_time
  where tickets.id = ticket.id;
  xp_result := public.grant_season_xp(requesting_user_id, 'arena', created_match_id, 140);

  return jsonb_build_object(
    'status', 'settled', 'match_id', created_match_id, 'reward_credits', total_credits,
    'match_credits', base_credits, 'objective_credits', objective_credits,
    'rivalry_credits', rivalry_credits, 'credits', profile_credits,
    'completed_matches', profile_completed_matches,
    'season_xp', coalesce((xp_result ->> 'xp')::integer, 0),
    'season_xp_granted', coalesce((xp_result ->> 'xp_granted')::integer, 0)
  );
end;
$$;

revoke all on function public.settle_arena_match(text) from public, anon;
grant execute on function public.settle_arena_match(text) to authenticated;

-- Live Ghost Challenge ------------------------------------------------------

create table public.live_rivalry_rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_user_id uuid not null references public.profiles(id) on delete restrict,
  host_request_id text not null check (length(btrim(host_request_id)) between 1 and 200),
  mode text not null check (mode in ('nhl-circuit', 'pwhl-circuit', 'open-ice')),
  seed text not null check (length(seed) between 1 and 200),
  situations_snapshot jsonb not null check (
    jsonb_typeof(situations_snapshot) = 'array' and jsonb_array_length(situations_snapshot) = 5
  ),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'completed', 'cancelled', 'expired')),
  current_round integer not null default 0 check (current_round between 0 and 5),
  state_version bigint not null default 1 check (state_version > 0),
  winner_user_id uuid references public.profiles(id) on delete restrict,
  rematch_of uuid references public.live_rivalry_rooms(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  unique (host_user_id, host_request_id),
  check (expires_at > created_at),
  check (
    (status = 'waiting' and started_at is null and completed_at is null and winner_user_id is null)
    or (status = 'active' and started_at is not null and completed_at is null and winner_user_id is null)
    or (status = 'completed' and started_at is not null and completed_at is not null and winner_user_id is not null)
    or (status in ('cancelled', 'expired') and completed_at is not null)
  )
);

create index live_rivalry_rooms_host_created_at_idx
  on public.live_rivalry_rooms (host_user_id, created_at desc);
create index live_rivalry_rooms_status_expires_at_idx
  on public.live_rivalry_rooms (status, expires_at);
create index live_rivalry_rooms_rematch_of_idx
  on public.live_rivalry_rooms (rematch_of) where rematch_of is not null;

create table public.live_rivalry_players (
  room_id uuid not null references public.live_rivalry_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('host', 'guest')),
  join_request_id text not null check (length(btrim(join_request_id)) between 1 and 200),
  display_label text not null check (length(btrim(display_label)) between 1 and 80),
  lineup_id uuid not null,
  lineup_snapshot jsonb not null check (jsonb_typeof(lineup_snapshot) = 'object'),
  ready boolean not null default false,
  joined_at timestamptz not null default clock_timestamp(),
  ready_at timestamptz,
  last_seen_at timestamptz not null default clock_timestamp(),
  primary key (room_id, user_id),
  unique (room_id, role),
  unique (user_id, join_request_id),
  foreign key (lineup_id, user_id) references public.lineups(id, user_id) on delete restrict,
  check ((ready and ready_at is not null) or (not ready and ready_at is null))
);

-- One open room per player spans two tables, so the room RPCs enforce it while
-- holding the account lock. This index keeps that membership lookup cheap.
create index live_rivalry_players_user_joined_at_idx
  on public.live_rivalry_players (user_id, joined_at desc);
create index live_rivalry_players_lineup_id_idx on public.live_rivalry_players (lineup_id);

create table public.live_rivalry_choices (
  room_id uuid not null,
  round_index integer not null check (round_index between 0 and 4),
  user_id uuid not null,
  client_request_id text not null check (length(btrim(client_request_id)) between 1 and 200),
  card_id text not null references public.card_catalog(card_id) on delete restrict,
  slot text not null check (slot in ('LW', 'C', 'RW', 'LD', 'RD', 'G')),
  score jsonb not null check (jsonb_typeof(score) = 'object'),
  locked_at timestamptz not null default clock_timestamp(),
  primary key (room_id, round_index, user_id),
  unique (user_id, client_request_id),
  foreign key (room_id, user_id) references public.live_rivalry_players(room_id, user_id) on delete cascade
);

create index live_rivalry_choices_card_id_idx on public.live_rivalry_choices (card_id);

create table public.live_rivalry_rounds (
  room_id uuid not null references public.live_rivalry_rooms(id) on delete cascade,
  round_index integer not null check (round_index between 0 and 4),
  situation_id text not null,
  host_user_id uuid not null,
  host_card_id text not null references public.card_catalog(card_id) on delete restrict,
  host_slot text not null check (host_slot in ('LW', 'C', 'RW', 'LD', 'RD', 'G')),
  host_score integer not null check (host_score >= 0),
  guest_user_id uuid not null,
  guest_card_id text not null references public.card_catalog(card_id) on delete restrict,
  guest_slot text not null check (guest_slot in ('LW', 'C', 'RW', 'LD', 'RD', 'G')),
  guest_score integer not null check (guest_score >= 0),
  winner_user_id uuid not null,
  tie_breaker text not null check (tie_breaker in ('category', 'overall', 'match-seed')),
  transcript jsonb not null check (jsonb_typeof(transcript) = 'object'),
  resolved_at timestamptz not null default clock_timestamp(),
  primary key (room_id, round_index),
  foreign key (room_id, host_user_id) references public.live_rivalry_players(room_id, user_id) on delete cascade,
  foreign key (room_id, guest_user_id) references public.live_rivalry_players(room_id, user_id) on delete cascade,
  check (host_user_id <> guest_user_id),
  check (winner_user_id in (host_user_id, guest_user_id))
);

create index live_rivalry_rounds_host_card_id_idx on public.live_rivalry_rounds (host_card_id);
create index live_rivalry_rounds_guest_card_id_idx on public.live_rivalry_rounds (guest_card_id);

create table public.live_rivalry_action_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id text not null check (length(btrim(client_request_id)) between 1 and 200),
  room_id uuid not null references public.live_rivalry_rooms(id) on delete cascade,
  action text not null check (action in ('ready', 'leave')),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, client_request_id)
);

create index live_rivalry_action_receipts_room_id_idx on public.live_rivalry_action_receipts (room_id);

alter table public.live_rivalry_rooms enable row level security;
alter table public.live_rivalry_players enable row level security;
alter table public.live_rivalry_choices enable row level security;
alter table public.live_rivalry_rounds enable row level security;
alter table public.live_rivalry_action_receipts enable row level security;
revoke all on public.live_rivalry_rooms, public.live_rivalry_players, public.live_rivalry_choices,
  public.live_rivalry_rounds, public.live_rivalry_action_receipts from anon, authenticated;

create or replace function public.live_rivalry_room_payload(requested_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  room public.live_rivalry_rooms%rowtype;
  me public.live_rivalry_players%rowtype;
  rival public.live_rivalry_players%rowtype;
  rounds jsonb;
  my_wins integer := 0;
  rival_wins integer := 0;
  h2h_my_wins integer := 0;
  h2h_rival_wins integer := 0;
  h2h_matches integer := 0;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into room from public.live_rivalry_rooms rooms where rooms.id = requested_room_id;
  if not found then raise exception 'Live room not found.' using errcode = 'P0002'; end if;
  select * into me from public.live_rivalry_players players
  where players.room_id = room.id and players.user_id = requesting_user_id;
  if not found then raise exception 'You are not a member of this Live room.' using errcode = '42501'; end if;
  select * into rival from public.live_rivalry_players players
  where players.room_id = room.id and players.user_id <> requesting_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'round_index', resolved.round_index,
    'situation_id', resolved.situation_id,
    'player_card_id', case when resolved.host_user_id = requesting_user_id then resolved.host_card_id else resolved.guest_card_id end,
    'player_slot', case when resolved.host_user_id = requesting_user_id then resolved.host_slot else resolved.guest_slot end,
    'player_score', case when resolved.host_user_id = requesting_user_id then resolved.host_score else resolved.guest_score end,
    'opponent_card_id', case when resolved.host_user_id = requesting_user_id then resolved.guest_card_id else resolved.host_card_id end,
    'opponent_slot', case when resolved.host_user_id = requesting_user_id then resolved.guest_slot else resolved.host_slot end,
    'opponent_score', case when resolved.host_user_id = requesting_user_id then resolved.guest_score else resolved.host_score end,
    'winner', case when resolved.winner_user_id = requesting_user_id then 'player' else 'opponent' end,
    'tie_breaker', resolved.tie_breaker,
    'transcript', jsonb_build_object(
      'situation', room.situations_snapshot -> resolved.round_index,
      'player', case when resolved.host_user_id = requesting_user_id
        then resolved.transcript -> 'host' else resolved.transcript -> 'guest' end,
      'opponent', case when resolved.host_user_id = requesting_user_id
        then resolved.transcript -> 'guest' else resolved.transcript -> 'host' end,
      'tie_breaker', resolved.tie_breaker
    ),
    'resolved_at', resolved.resolved_at
  ) order by resolved.round_index), '[]'::jsonb),
    count(*) filter (where resolved.winner_user_id = requesting_user_id)::integer,
    count(*) filter (where resolved.winner_user_id <> requesting_user_id)::integer
  into rounds, my_wins, rival_wins
  from public.live_rivalry_rounds resolved where resolved.room_id = room.id;

  if rival.user_id is not null then
    select count(*)::integer,
      count(*) filter (where history.winner_user_id = requesting_user_id)::integer,
      count(*) filter (where history.winner_user_id = rival.user_id)::integer
    into h2h_matches, h2h_my_wins, h2h_rival_wins
    from public.live_rivalry_rooms history
    where history.status = 'completed'
      and exists (select 1 from public.live_rivalry_players p where p.room_id = history.id and p.user_id = requesting_user_id)
      and exists (select 1 from public.live_rivalry_players p where p.room_id = history.id and p.user_id = rival.user_id);
  end if;

  return jsonb_build_object(
    'server_time', clock_timestamp(),
    'room_id', room.id,
    'room_code', room.room_code,
    'topic', 'live-rivalry:' || room.id::text,
    'status', room.status,
    'state_version', room.state_version,
    'mode', room.mode,
    'current_round', room.current_round,
    'situations', room.situations_snapshot,
    'created_at', room.created_at,
    'started_at', room.started_at,
    'completed_at', room.completed_at,
    'expires_at', room.expires_at,
    'rematch_of', room.rematch_of,
    'me', jsonb_build_object(
      'user_id', me.user_id, 'role', me.role, 'display_label', me.display_label,
      'lineup_id', me.lineup_id, 'lineup_name', me.lineup_snapshot ->> 'name',
      'lineup', me.lineup_snapshot, 'ready', me.ready,
      'locked', exists (
        select 1 from public.live_rivalry_choices choices
        where choices.room_id = room.id and choices.round_index = room.current_round and choices.user_id = me.user_id
      )
    ),
    'opponent', case when rival.user_id is null then null else jsonb_build_object(
      'user_id', rival.user_id, 'role', rival.role, 'display_label', rival.display_label,
      'lineup_id', rival.lineup_id, 'lineup_name', rival.lineup_snapshot ->> 'name',
      'ready', rival.ready,
      'online', rival.last_seen_at > clock_timestamp() - interval '45 seconds',
      'locked', exists (
        select 1 from public.live_rivalry_choices choices
        where choices.room_id = room.id and choices.round_index = room.current_round and choices.user_id = rival.user_id
      )
    ) end,
    'rounds', rounds,
    'result', case when room.status = 'completed' then jsonb_build_object(
      'outcome', case when room.winner_user_id = requesting_user_id then 'win' else 'loss' end,
      'player_wins', my_wins, 'opponent_wins', rival_wins,
      'winner_user_id', room.winner_user_id
    ) else null end,
    'head_to_head', jsonb_build_object(
      'matches', h2h_matches, 'player_wins', h2h_my_wins, 'opponent_wins', h2h_rival_wins
    ),
    'rewards', jsonb_build_object('credits', 0, 'season_xp', 0, 'cards', 0, 'objectives', 0)
  );
end;
$$;

revoke all on function public.live_rivalry_room_payload(uuid) from public, anon, authenticated;

create or replace function public.notify_live_rivalry_room(requested_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  version bigint;
begin
  select rooms.state_version into version from public.live_rivalry_rooms rooms where rooms.id = requested_room_id;
  perform realtime.send(
    jsonb_build_object('room_id', requested_room_id, 'state_version', version),
    'room_updated', 'live-rivalry:' || requested_room_id::text, true
  );
end;
$$;

revoke all on function public.notify_live_rivalry_room(uuid) from public, anon, authenticated;

create or replace function public.next_live_rivalry_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  attempt integer := 0;
begin
  loop
    attempt := attempt + 1;
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1), '')
    into candidate from generate_series(1, 6);
    exit when not exists (select 1 from public.live_rivalry_rooms rooms where rooms.room_code = candidate);
    if attempt >= 50 then raise exception 'A room code could not be allocated.' using errcode = 'P0001'; end if;
  end loop;
  return candidate;
end;
$$;

revoke all on function public.next_live_rivalry_code() from public, anon, authenticated;

create or replace function public.create_live_rivalry_room(
  client_request_id text,
  mode text,
  lineup_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_request_id text := btrim(create_live_rivalry_room.client_request_id);
  requested_mode text := create_live_rivalry_room.mode;
  profile public.profiles%rowtype;
  selected_lineup public.lineups%rowtype;
  lineup_snapshot jsonb;
  existing public.live_rivalry_rooms%rowtype;
  created_room_id uuid;
  created_code text;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if normalized_request_id is null or length(normalized_request_id) not between 1 and 200
    or requested_mode not in ('nhl-circuit', 'pwhl-circuit', 'open-ice')
    or create_live_rivalry_room.lineup_id is null then
    raise exception 'Invalid Live room input.' using errcode = '22023';
  end if;
  select * into profile from public.profiles profiles where profiles.id = requesting_user_id for update;
  if not found or not profile.onboarding_completed then
    raise exception 'Onboarding must be completed before creating a Live room.' using errcode = 'P0001';
  end if;
  select * into existing from public.live_rivalry_rooms rooms
  where rooms.host_user_id = requesting_user_id and rooms.host_request_id = normalized_request_id;
  if found then
    if existing.mode <> requested_mode then
      raise exception 'Room request id was already used for another mode.' using errcode = '22023';
    end if;
    return public.live_rivalry_room_payload(existing.id);
  end if;
  if exists (
    select 1 from public.live_rivalry_players players
    join public.live_rivalry_rooms rooms on rooms.id = players.room_id
    where players.user_id = requesting_user_id and rooms.status in ('waiting', 'active')
  ) then
    raise exception 'You already have an open Live room. Reconnect to it first.' using errcode = 'P0001';
  end if;
  select * into selected_lineup from public.lineups lineups
  where lineups.id = create_live_rivalry_room.lineup_id and lineups.user_id = requesting_user_id for share;
  if not found or selected_lineup.mode <> requested_mode then
    raise exception 'Choose a lineup that matches the Live room mode.' using errcode = 'P0001';
  end if;
  lineup_snapshot := public.lineup_as_json(requesting_user_id, selected_lineup.id);
  perform public.assert_valid_lineup(requesting_user_id, requested_mode, lineup_snapshot -> 'slots');
  created_code := public.next_live_rivalry_code();
  insert into public.live_rivalry_rooms (
    room_code, host_user_id, host_request_id, mode, seed, situations_snapshot, expires_at
  ) values (
    created_code, requesting_user_id, normalized_request_id, requested_mode,
    extensions.gen_random_uuid()::text, public.social_competition_situations(),
    clock_timestamp() + interval '15 minutes'
  ) returning id into created_room_id;
  insert into public.live_rivalry_players (
    room_id, user_id, role, join_request_id, display_label, lineup_id, lineup_snapshot
  ) values (
    created_room_id, requesting_user_id, 'host', normalized_request_id,
    coalesce(nullif(btrim(profile.display_name), ''), 'Host Rival'), selected_lineup.id, lineup_snapshot
  );
  return public.live_rivalry_room_payload(created_room_id);
end;
$$;

revoke all on function public.create_live_rivalry_room(text, text, uuid) from public, anon;
grant execute on function public.create_live_rivalry_room(text, text, uuid) to authenticated;

create or replace function public.join_live_rivalry_room(
  room_code text,
  client_request_id text,
  lineup_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_code text := upper(regexp_replace(btrim(join_live_rivalry_room.room_code), '[^A-Za-z0-9]', '', 'g'));
  normalized_request_id text := btrim(join_live_rivalry_room.client_request_id);
  profile public.profiles%rowtype;
  room public.live_rivalry_rooms%rowtype;
  selected_lineup public.lineups%rowtype;
  lineup_snapshot jsonb;
  existing_player public.live_rivalry_players%rowtype;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if normalized_code !~ '^[A-HJ-NP-Z2-9]{6}$'
    or normalized_request_id is null or length(normalized_request_id) not between 1 and 200
    or join_live_rivalry_room.lineup_id is null then
    raise exception 'Enter a valid six-character room code and lineup.' using errcode = '22023';
  end if;
  select * into profile from public.profiles profiles where profiles.id = requesting_user_id for update;
  if not found or not profile.onboarding_completed then
    raise exception 'Onboarding must be completed before joining a Live room.' using errcode = 'P0001';
  end if;
  select * into room from public.live_rivalry_rooms rooms where rooms.room_code = normalized_code for update;
  if not found then raise exception 'Live room not found.' using errcode = 'P0002'; end if;
  if room.status = 'waiting' and room.expires_at <= clock_timestamp() then
    update public.live_rivalry_rooms rooms set status = 'expired', completed_at = clock_timestamp(), state_version = state_version + 1
    where rooms.id = room.id;
    raise exception 'This Live room has expired.' using errcode = 'P0001';
  end if;
  select * into existing_player from public.live_rivalry_players players
  where players.room_id = room.id and players.user_id = requesting_user_id;
  if found then return public.live_rivalry_room_payload(room.id); end if;
  if room.host_user_id = requesting_user_id then raise exception 'You are already the host of this room.' using errcode = 'P0001'; end if;
  if room.status <> 'waiting' then raise exception 'This Live room is no longer joinable.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.live_rivalry_players players where players.room_id = room.id and players.role = 'guest') then
    raise exception 'This Live room already has two players.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.live_rivalry_players players
    join public.live_rivalry_rooms rooms on rooms.id = players.room_id
    where players.user_id = requesting_user_id and rooms.status in ('waiting', 'active')
  ) then
    raise exception 'You already have an open Live room. Reconnect to it first.' using errcode = 'P0001';
  end if;
  select * into selected_lineup from public.lineups lineups
  where lineups.id = join_live_rivalry_room.lineup_id and lineups.user_id = requesting_user_id for share;
  if not found or selected_lineup.mode <> room.mode then
    raise exception 'Choose a lineup that matches the host room mode.' using errcode = 'P0001';
  end if;
  lineup_snapshot := public.lineup_as_json(requesting_user_id, selected_lineup.id);
  perform public.assert_valid_lineup(requesting_user_id, room.mode, lineup_snapshot -> 'slots');
  insert into public.live_rivalry_players (
    room_id, user_id, role, join_request_id, display_label, lineup_id, lineup_snapshot
  ) values (
    room.id, requesting_user_id, 'guest', normalized_request_id,
    coalesce(nullif(btrim(profile.display_name), ''), 'Guest Rival'), selected_lineup.id, lineup_snapshot
  );
  update public.live_rivalry_rooms rooms set state_version = state_version + 1 where rooms.id = room.id;
  perform public.notify_live_rivalry_room(room.id);
  return public.live_rivalry_room_payload(room.id);
end;
$$;

revoke all on function public.join_live_rivalry_room(text, text, uuid) from public, anon;
grant execute on function public.join_live_rivalry_room(text, text, uuid) to authenticated;

create or replace function public.get_live_rivalry_room(room_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  resolved_room_id uuid := get_live_rivalry_room.room_id;
  room public.live_rivalry_rooms%rowtype;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if resolved_room_id is null then
    select players.room_id into resolved_room_id
    from public.live_rivalry_players players
    join public.live_rivalry_rooms rooms on rooms.id = players.room_id
    where players.user_id = requesting_user_id and rooms.status in ('waiting', 'active')
    order by players.joined_at desc limit 1;
    if resolved_room_id is null then return jsonb_build_object('status', 'none'); end if;
  end if;
  select * into room from public.live_rivalry_rooms rooms where rooms.id = resolved_room_id for update;
  if not found then raise exception 'Live room not found.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.live_rivalry_players players where players.room_id = room.id and players.user_id = requesting_user_id) then
    raise exception 'You are not a member of this Live room.' using errcode = '42501';
  end if;
  if room.status = 'waiting' and room.expires_at <= clock_timestamp() then
    update public.live_rivalry_rooms rooms set status = 'expired', completed_at = clock_timestamp(), state_version = state_version + 1
    where rooms.id = room.id;
  end if;
  update public.live_rivalry_players players set last_seen_at = clock_timestamp()
  where players.room_id = room.id and players.user_id = requesting_user_id;
  return public.live_rivalry_room_payload(room.id);
end;
$$;

revoke all on function public.get_live_rivalry_room(uuid) from public, anon;
grant execute on function public.get_live_rivalry_room(uuid) to authenticated;

create or replace function public.set_live_rivalry_ready(
  room_id uuid,
  ready boolean,
  client_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_request_id text := btrim(set_live_rivalry_ready.client_request_id);
  room public.live_rivalry_rooms%rowtype;
  receipt public.live_rivalry_action_receipts%rowtype;
  participant_count integer;
  ready_count integer;
  payload jsonb := jsonb_build_object('ready', set_live_rivalry_ready.ready);
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if set_live_rivalry_ready.room_id is null or set_live_rivalry_ready.ready is null
    or normalized_request_id is null or length(normalized_request_id) not between 1 and 200 then
    raise exception 'Invalid ready request.' using errcode = '22023';
  end if;
  perform 1 from public.profiles profiles where profiles.id = requesting_user_id for update;
  select * into room from public.live_rivalry_rooms rooms where rooms.id = set_live_rivalry_ready.room_id for update;
  if not found then raise exception 'Live room not found.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.live_rivalry_players players where players.room_id = room.id and players.user_id = requesting_user_id) then
    raise exception 'You are not a member of this Live room.' using errcode = '42501';
  end if;
  select * into receipt from public.live_rivalry_action_receipts receipts
  where receipts.user_id = requesting_user_id and receipts.client_request_id = normalized_request_id;
  if found then
    if receipt.room_id <> room.id or receipt.action <> 'ready' or receipt.request_payload <> payload then
      raise exception 'Ready request id was already used for different data.' using errcode = '22023';
    end if;
    return public.live_rivalry_room_payload(room.id);
  end if;
  if room.status <> 'waiting' then raise exception 'Ready state can only change before puck drop.' using errcode = 'P0001'; end if;
  update public.live_rivalry_players players set
    ready = set_live_rivalry_ready.ready,
    ready_at = case when set_live_rivalry_ready.ready then clock_timestamp() else null end,
    last_seen_at = clock_timestamp()
  where players.room_id = room.id and players.user_id = requesting_user_id;
  insert into public.live_rivalry_action_receipts (user_id, client_request_id, room_id, action, request_payload)
  values (requesting_user_id, normalized_request_id, room.id, 'ready', payload);
  select count(*)::integer, count(*) filter (where players.ready)::integer
  into participant_count, ready_count from public.live_rivalry_players players where players.room_id = room.id;
  update public.live_rivalry_rooms rooms set
    status = case when participant_count = 2 and ready_count = 2 then 'active' else rooms.status end,
    started_at = case when participant_count = 2 and ready_count = 2 then clock_timestamp() else rooms.started_at end,
    expires_at = case when participant_count = 2 and ready_count = 2 then clock_timestamp() + interval '24 hours' else rooms.expires_at end,
    state_version = state_version + 1
  where rooms.id = room.id;
  perform public.notify_live_rivalry_room(room.id);
  return public.live_rivalry_room_payload(room.id);
end;
$$;

revoke all on function public.set_live_rivalry_ready(uuid, boolean, text) from public, anon;
grant execute on function public.set_live_rivalry_ready(uuid, boolean, text) to authenticated;

create or replace function public.lock_live_rivalry_choice(
  room_id uuid,
  round_index integer,
  card_id text,
  client_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_card_id text := btrim(lock_live_rivalry_choice.card_id);
  normalized_request_id text := btrim(lock_live_rivalry_choice.client_request_id);
  room public.live_rivalry_rooms%rowtype;
  player public.live_rivalry_players%rowtype;
  existing_choice public.live_rivalry_choices%rowtype;
  situation jsonb;
  eligible_slots text[];
  selected_slot text;
  selected_score jsonb;
  choice_count integer;
  host_choice public.live_rivalry_choices%rowtype;
  guest_choice public.live_rivalry_choices%rowtype;
  host_user_id uuid;
  guest_user_id uuid;
  host_value integer;
  guest_value integer;
  host_overall integer;
  guest_overall integer;
  resolved_winner uuid;
  tie_breaker text;
  host_wins integer;
  guest_wins integer;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if lock_live_rivalry_choice.room_id is null
    or lock_live_rivalry_choice.round_index is null or lock_live_rivalry_choice.round_index not between 0 and 4
    or normalized_card_id is null or length(normalized_card_id) not between 1 and 200
    or normalized_request_id is null or length(normalized_request_id) not between 1 and 200 then
    raise exception 'Invalid Live choice input.' using errcode = '22023';
  end if;
  perform 1 from public.profiles profiles where profiles.id = requesting_user_id for update;
  select * into room from public.live_rivalry_rooms rooms where rooms.id = lock_live_rivalry_choice.room_id for update;
  if not found then raise exception 'Live room not found.' using errcode = 'P0002'; end if;
  select * into player from public.live_rivalry_players players
  where players.room_id = room.id and players.user_id = requesting_user_id;
  if not found then raise exception 'You are not a member of this Live room.' using errcode = '42501'; end if;
  select * into existing_choice from public.live_rivalry_choices choices
  where choices.user_id = requesting_user_id and choices.client_request_id = normalized_request_id;
  if found then
    if existing_choice.room_id <> room.id or existing_choice.round_index <> lock_live_rivalry_choice.round_index
      or existing_choice.card_id <> normalized_card_id then
      raise exception 'Choice request id was already used for different data.' using errcode = '22023';
    end if;
    return public.live_rivalry_room_payload(room.id);
  end if;
  if room.status <> 'active' then raise exception 'Live match is not active.' using errcode = 'P0001'; end if;
  if room.expires_at <= clock_timestamp() then raise exception 'Live match reconnect window expired.' using errcode = 'P0001'; end if;
  if room.current_round <> lock_live_rivalry_choice.round_index then
    raise exception 'Choice does not match the current Live round.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.live_rivalry_choices choices
    where choices.room_id = room.id and choices.round_index = room.current_round and choices.user_id = requesting_user_id
  ) then
    raise exception 'Your choice for this round is already locked.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.live_rivalry_choices choices
    where choices.room_id = room.id and choices.user_id = requesting_user_id and choices.card_id = normalized_card_id
  ) then
    raise exception 'That card was already used in this Live match.' using errcode = '22023';
  end if;

  situation := room.situations_snapshot -> room.current_round;
  select array_agg(eligible.slot_name) into eligible_slots
  from jsonb_array_elements_text(situation -> 'eligible_slots') eligible(slot_name);
  select supplied.slot into selected_slot
  from jsonb_each_text(player.lineup_snapshot -> 'slots') supplied(slot, supplied_card_id)
  where supplied.supplied_card_id = normalized_card_id and supplied.slot = any(eligible_slots)
  order by supplied.slot limit 1;
  if selected_slot is null then
    raise exception 'Card is missing from your snapshot or ineligible for this category.' using errcode = '22023';
  end if;
  selected_score := public.card_quartett_score(normalized_card_id, situation);
  if selected_score is null then raise exception 'Card metadata is unavailable.' using errcode = 'P0002'; end if;
  insert into public.live_rivalry_choices (
    room_id, round_index, user_id, client_request_id, card_id, slot, score
  ) values (
    room.id, room.current_round, requesting_user_id, normalized_request_id,
    normalized_card_id, selected_slot, selected_score
  );
  update public.live_rivalry_players players set last_seen_at = clock_timestamp()
  where players.room_id = room.id and players.user_id = requesting_user_id;
  select count(*)::integer into choice_count from public.live_rivalry_choices choices
  where choices.room_id = room.id and choices.round_index = room.current_round;

  if choice_count = 2 then
    select choices.* into host_choice from public.live_rivalry_choices choices
    join public.live_rivalry_players players on players.room_id = choices.room_id and players.user_id = choices.user_id
    where choices.room_id = room.id and choices.round_index = room.current_round and players.role = 'host';
    select choices.* into guest_choice from public.live_rivalry_choices choices
    join public.live_rivalry_players players on players.room_id = choices.room_id and players.user_id = choices.user_id
    where choices.room_id = room.id and choices.round_index = room.current_round and players.role = 'guest';
    if host_choice.user_id is null or guest_choice.user_id is null then
      raise exception 'Both Live roles must lock before resolution.' using errcode = 'P0002';
    end if;
    host_user_id := host_choice.user_id;
    guest_user_id := guest_choice.user_id;
    host_value := (host_choice.score ->> 'value')::integer;
    guest_value := (guest_choice.score ->> 'value')::integer;
    host_overall := (host_choice.score ->> 'overall')::integer;
    guest_overall := (guest_choice.score ->> 'overall')::integer;
    if host_value <> guest_value then
      resolved_winner := case when host_value > guest_value then host_user_id else guest_user_id end;
      tie_breaker := 'category';
    elsif host_overall <> guest_overall then
      resolved_winner := case when host_overall > guest_overall then host_user_id else guest_user_id end;
      tie_breaker := 'overall';
    else
      resolved_winner := case when mod(abs(hashtextextended(room.seed || ':round:' || room.current_round::text || ':tie', 0)), 2) = 0 then host_user_id else guest_user_id end;
      tie_breaker := 'match-seed';
    end if;
    insert into public.live_rivalry_rounds (
      room_id, round_index, situation_id,
      host_user_id, host_card_id, host_slot, host_score,
      guest_user_id, guest_card_id, guest_slot, guest_score,
      winner_user_id, tie_breaker, transcript
    ) values (
      room.id, room.current_round, situation ->> 'id',
      host_user_id, host_choice.card_id, host_choice.slot, host_value,
      guest_user_id, guest_choice.card_id, guest_choice.slot, guest_value,
      resolved_winner, tie_breaker,
      jsonb_build_object('situation', situation, 'host', host_choice.score, 'guest', guest_choice.score, 'tie_breaker', tie_breaker)
    );
    if room.current_round = 4 then
      select count(*) filter (where rounds.winner_user_id = host_user_id)::integer,
        count(*) filter (where rounds.winner_user_id = guest_user_id)::integer
      into host_wins, guest_wins from public.live_rivalry_rounds rounds where rounds.room_id = room.id;
      update public.live_rivalry_rooms rooms set
        status = 'completed', current_round = 5,
        winner_user_id = case when host_wins > guest_wins then host_user_id else guest_user_id end,
        completed_at = clock_timestamp(), state_version = state_version + 1
      where rooms.id = room.id;
    else
      update public.live_rivalry_rooms rooms set
        current_round = current_round + 1, state_version = state_version + 1
      where rooms.id = room.id;
    end if;
  else
    update public.live_rivalry_rooms rooms set state_version = state_version + 1 where rooms.id = room.id;
  end if;
  perform public.notify_live_rivalry_room(room.id);
  return public.live_rivalry_room_payload(room.id);
end;
$$;

revoke all on function public.lock_live_rivalry_choice(uuid, integer, text, text) from public, anon;
grant execute on function public.lock_live_rivalry_choice(uuid, integer, text, text) to authenticated;

create or replace function public.leave_live_rivalry_room(room_id uuid, client_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_request_id text := btrim(leave_live_rivalry_room.client_request_id);
  room public.live_rivalry_rooms%rowtype;
  receipt public.live_rivalry_action_receipts%rowtype;
  other_user_id uuid;
  payload jsonb := '{}'::jsonb;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if leave_live_rivalry_room.room_id is null
    or normalized_request_id is null or length(normalized_request_id) not between 1 and 200 then
    raise exception 'Invalid leave request.' using errcode = '22023';
  end if;
  perform 1 from public.profiles profiles where profiles.id = requesting_user_id for update;
  select * into room from public.live_rivalry_rooms rooms where rooms.id = leave_live_rivalry_room.room_id for update;
  if not found then raise exception 'Live room not found.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.live_rivalry_players players where players.room_id = room.id and players.user_id = requesting_user_id) then
    raise exception 'You are not a member of this Live room.' using errcode = '42501';
  end if;
  select * into receipt from public.live_rivalry_action_receipts receipts
  where receipts.user_id = requesting_user_id and receipts.client_request_id = normalized_request_id;
  if found then
    if receipt.room_id <> room.id or receipt.action <> 'leave' then
      raise exception 'Leave request id was already used for different data.' using errcode = '22023';
    end if;
    return public.live_rivalry_room_payload(room.id);
  end if;
  insert into public.live_rivalry_action_receipts (user_id, client_request_id, room_id, action, request_payload)
  values (requesting_user_id, normalized_request_id, room.id, 'leave', payload);
  if room.status = 'waiting' then
    update public.live_rivalry_rooms rooms set
      status = 'cancelled', completed_at = clock_timestamp(), state_version = state_version + 1
    where rooms.id = room.id;
  elsif room.status = 'active' then
    select players.user_id into other_user_id from public.live_rivalry_players players
    where players.room_id = room.id and players.user_id <> requesting_user_id;
    if other_user_id is null then raise exception 'A Live forfeit requires an opponent.' using errcode = 'P0002'; end if;
    update public.live_rivalry_rooms rooms set
      status = 'completed', winner_user_id = other_user_id,
      completed_at = clock_timestamp(), state_version = state_version + 1
    where rooms.id = room.id;
  end if;
  perform public.notify_live_rivalry_room(room.id);
  return public.live_rivalry_room_payload(room.id);
end;
$$;

revoke all on function public.leave_live_rivalry_room(uuid, text) from public, anon;
grant execute on function public.leave_live_rivalry_room(uuid, text) to authenticated;

create or replace function public.create_live_rivalry_rematch(
  previous_room_id uuid,
  client_request_id text,
  lineup_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  previous public.live_rivalry_rooms%rowtype;
  created jsonb;
  created_room_id uuid;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into previous from public.live_rivalry_rooms rooms where rooms.id = previous_room_id;
  if not found or previous.status <> 'completed' then
    raise exception 'A completed Live match is required for a rematch.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.live_rivalry_players players where players.room_id = previous.id and players.user_id = requesting_user_id) then
    raise exception 'You were not part of this Live match.' using errcode = '42501';
  end if;
  created := public.create_live_rivalry_room(client_request_id, previous.mode, lineup_id);
  created_room_id := (created ->> 'room_id')::uuid;
  update public.live_rivalry_rooms rooms set rematch_of = previous.id, state_version = state_version + 1
  where rooms.id = created_room_id;
  return public.live_rivalry_room_payload(created_room_id);
end;
$$;

revoke all on function public.create_live_rivalry_rematch(uuid, text, uuid) from public, anon;
grant execute on function public.create_live_rivalry_rematch(uuid, text, uuid) to authenticated;

-- Private Realtime Broadcast authorization. Clients can receive only the tiny
-- room/version invalidation event for a room they belong to; choice rows never
-- enter the realtime payload and no client broadcast policy is granted.
create or replace function public.can_receive_live_rivalry(topic text, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null
    and topic ~ '^live-rivalry:[0-9a-f-]{36}$'
    and exists (
      select 1 from public.live_rivalry_players players
      where players.user_id = target_user_id
        and players.room_id::text = substr(topic, length('live-rivalry:') + 1)
    );
$$;

revoke all on function public.can_receive_live_rivalry(text, uuid) from public, anon;
grant execute on function public.can_receive_live_rivalry(text, uuid) to authenticated;

drop policy if exists "live_rivalry_members_receive" on realtime.messages;
create policy "live_rivalry_members_receive"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and private
  and public.can_receive_live_rivalry(realtime.topic(), (select auth.uid()))
);
