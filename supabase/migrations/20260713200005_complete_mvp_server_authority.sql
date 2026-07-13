-- Rink Rivals MVP server-authority boundary.
-- All account mutations in this migration are exposed only through narrowly
-- granted RPCs. Tables remain readable through RLS where the UI needs them,
-- but no browser role can mutate authoritative state directly.

create table public.card_catalog (
  card_id text primary key check (length(btrim(card_id)) between 1 and 200),
  player_id text not null check (length(btrim(player_id)) between 1 and 200),
  league text not null check (league in ('NHL', 'PWHL')),
  eligible_positions text[] not null,
  role text not null check (role in ('skater', 'goalie')),
  overall integer not null check (overall between 1 and 99),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  price integer not null check (price >= 0),
  set_id text not null check (length(btrim(set_id)) between 1 and 100),
  card_type text not null check (length(btrim(card_type)) between 1 and 50),
  is_permanent boolean not null,
  is_reward_only boolean not null default false,
  is_active boolean not null default true,
  available_from timestamptz,
  available_to timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (cardinality(eligible_positions) between 1 and 6),
  check (eligible_positions <@ array['LW', 'C', 'RW', 'LD', 'RD', 'G']::text[]),
  check (
    (role = 'goalie' and eligible_positions = array['G']::text[])
    or (role = 'skater' and not ('G' = any(eligible_positions)))
  ),
  check (available_from is null or available_to is null or available_from < available_to)
);

create index card_catalog_market_idx
  on public.card_catalog (is_active, is_permanent, is_reward_only, set_id, card_id);

create table public.event_definitions (
  id text primary key check (length(btrim(id)) between 1 and 100),
  name text not null check (length(btrim(name)) between 1 and 100),
  description text not null check (length(btrim(description)) between 1 and 500),
  rotation_order integer not null unique check (rotation_order between 0 and 9),
  visual_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(visual_metadata) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

-- BEGIN GENERATED EVENT DEFINITIONS
insert into public.event_definitions (id, name, description, rotation_order, visual_metadata)
select seeded.id, seeded.name, seeded.description, seeded.rotation_order, seeded.visual_metadata
from jsonb_to_recordset($event_definitions$[{"id":"frozen-frights","name":"Frozen Frights","description":"Heavy forechecking, shutdown reads, and fearless crease work.","rotation_order":0,"visual_metadata":{"accentColor":"#9cf06b","surfaceColor":"#18251d","emblem":"ghost-puck","motif":"frosted-scratches","gameplay":{"headlineAttribute":"physicality","supportingAttribute":"defense","tradeoffAttribute":"speed","summary":"Physical and defensive specialists trade some transition speed for pressure."}}},{"id":"signature-series","name":"Signature Series","description":"Recognizable strengths sharpened into distinct player signatures.","rotation_order":1,"visual_metadata":{"accentColor":"#f1d47a","surfaceColor":"#262014","emblem":"signature","motif":"gold-ink","gameplay":{"headlineAttribute":"hockeyIq","supportingAttribute":"passing","tradeoffAttribute":"physicality","summary":"Elite reads and playmaking define each player without a blanket rating boost."}}},{"id":"winter-holidays","name":"Winter Holidays","description":"Creative puck movement and calm sequences built for shared ice.","rotation_order":2,"visual_metadata":{"accentColor":"#e95f68","surfaceColor":"#1e2c33","emblem":"snowflake","motif":"holiday-lights","gameplay":{"headlineAttribute":"passing","supportingAttribute":"puckControl","tradeoffAttribute":"physicality","summary":"Puck movement rises while board-battle strength gives way."}}},{"id":"winter-classic","name":"Winter Classic","description":"Outdoor hockey rewards composure, contact, and one decisive moment.","rotation_order":3,"visual_metadata":{"accentColor":"#d6ede4","surfaceColor":"#263c36","emblem":"outdoor-rink","motif":"snow-lines","gameplay":{"headlineAttribute":"clutch","supportingAttribute":"physicality","tradeoffAttribute":"puckControl","summary":"Big-moment strength comes with less polished possession."}}},{"id":"international-ice","name":"International Ice","description":"Open lanes favor speed, vision, and national-team creativity.","rotation_order":4,"visual_metadata":{"accentColor":"#6db8ff","surfaceColor":"#14263a","emblem":"globe-puck","motif":"latitude-lines","gameplay":{"headlineAttribute":"speed","supportingAttribute":"passing","tradeoffAttribute":"physicality","summary":"Fast, creative profiles thrive in space and sacrifice some contact strength."}}},{"id":"rising-stars","name":"Rising Stars","description":"Fast-developing talent attacks with energy and confident hands.","rotation_order":5,"visual_metadata":{"accentColor":"#dca7ff","surfaceColor":"#251735","emblem":"rising-star","motif":"light-trails","gameplay":{"headlineAttribute":"puckControl","supportingAttribute":"speed","tradeoffAttribute":"defense","summary":"Dynamic creation is balanced by less settled defensive detail."}}},{"id":"playoff-heroes","name":"Playoff Heroes","description":"Pressure-tested cards lean into decisive shifts and defensive detail.","rotation_order":6,"visual_metadata":{"accentColor":"#ff9d55","surfaceColor":"#302019","emblem":"hero-shield","motif":"spotlight-rays","gameplay":{"headlineAttribute":"clutch","supportingAttribute":"defense","tradeoffAttribute":"speed","summary":"Late-game execution and coverage replace some regular-season pace."}}},{"id":"franchise-icons","name":"Franchise Icons","description":"Complete, composed identities built around durable hockey intelligence.","rotation_order":7,"visual_metadata":{"accentColor":"#f2cf70","surfaceColor":"#252116","emblem":"heritage-crest","motif":"banner-stripes","gameplay":{"headlineAttribute":"hockeyIq","supportingAttribute":"consistency","tradeoffAttribute":"speed","summary":"Reliable reads and positioning matter more than raw acceleration."}}},{"id":"record-breakers","name":"Record Breakers","description":"One exceptional skill reaches a peak while the rest of the profile stays honest.","rotation_order":8,"visual_metadata":{"accentColor":"#ffdb4d","surfaceColor":"#2c2711","emblem":"record-burst","motif":"number-grid","gameplay":{"headlineAttribute":"shooting","supportingAttribute":"reflexes","tradeoffAttribute":"defense","summary":"A signature peak is offset elsewhere instead of raising every attribute."}}},{"id":"clutch-performers","name":"Clutch Performers","description":"Close games reward finishing touch, poise, and repeatable late-shift execution.","rotation_order":9,"visual_metadata":{"accentColor":"#ff6b8f","surfaceColor":"#321724","emblem":"final-horn","motif":"score-clock","gameplay":{"headlineAttribute":"clutch","supportingAttribute":"shooting","tradeoffAttribute":"physicality","summary":"Decisive execution improves without turning every card into a power upgrade."}}}]$event_definitions$::jsonb) as seeded(
  id text,
  name text,
  description text,
  rotation_order integer,
  visual_metadata jsonb
);
-- END GENERATED EVENT DEFINITIONS

create table public.purchase_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id text not null check (length(btrim(client_request_id)) between 1 and 200),
  offer_id text not null check (length(btrim(offer_id)) between 1 and 500),
  card_id text not null references public.card_catalog(card_id) on delete restrict,
  price integer not null check (price >= 0),
  source text not null check (source in ('base_market', 'event_shop')),
  event_id text references public.event_definitions(id) on delete restrict,
  purchased_at timestamptz not null default clock_timestamp(),
  unique (user_id, client_request_id),
  check ((source = 'base_market' and event_id is null) or (source = 'event_shop' and event_id is not null))
);

create index purchase_receipts_user_purchased_at_idx
  on public.purchase_receipts (user_id, purchased_at desc);

create table public.rivalry_reward_options (
  card_id text primary key references public.card_catalog(card_id) on delete restrict,
  display_order integer not null unique check (display_order > 0)
);

create table public.reward_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id text not null check (length(btrim(client_request_id)) between 1 and 200),
  source_id text not null check (source_id = 'rivalry-road-card-choice'),
  card_id text not null references public.rivalry_reward_options(card_id) on delete restrict,
  claimed_at timestamptz not null default clock_timestamp(),
  unique (user_id, client_request_id),
  unique (user_id, source_id)
);

create index reward_receipts_user_claimed_at_idx
  on public.reward_receipts (user_id, claimed_at desc);

alter table public.profiles
  add column if not exists starter_lineup_id uuid;

create table public.ai_opponents (
  id text primary key check (length(btrim(id)) between 1 and 200),
  name text not null check (length(btrim(name)) between 1 and 100),
  mode text not null check (mode in ('nhl-circuit', 'pwhl-circuit', 'open-ice')),
  difficulty text not null check (difficulty in ('rookie', 'pro', 'elite')),
  lineup_slots jsonb not null check (jsonb_typeof(lineup_slots) = 'object'),
  unique (mode, difficulty)
);

-- BEGIN GENERATED AI OPPONENTS
insert into public.ai_opponents (id, name, mode, difficulty, lineup_slots)
select seeded.id, seeded.name, seeded.mode, seeded.difficulty, seeded.lineup_slots
from jsonb_to_recordset($ai_opponents$[{"id":"nhl-rookie-north-stars","name":"North Stars","mode":"nhl-circuit","difficulty":"rookie","lineup_slots":{"LW":"nhl-brady-tkachuk-base","C":"nhl-auston-matthews-base","RW":"nhl-mikko-rantanen-base","LD":"nhl-rasmus-dahlin-base","RD":"nhl-evan-bouchard-base","G":"nhl-andrei-vasilevskiy-base"}},{"id":"nhl-pro-harbor-six","name":"Harbor Six","mode":"nhl-circuit","difficulty":"pro","lineup_slots":{"LW":"nhl-artemi-panarin-base","C":"nhl-nathan-mackinnon-base","RW":"nhl-david-pastrnak-base","LD":"nhl-josh-morrissey-base","RD":"nhl-adam-fox-base","G":"nhl-igor-shesterkin-base"}},{"id":"nhl-elite-summit-club","name":"Summit Club","mode":"nhl-circuit","difficulty":"elite","lineup_slots":{"LW":"nhl-kirill-kaprizov-base","C":"nhl-connor-mcdavid-base","RW":"nhl-nikita-kucherov-base","LD":"nhl-quinn-hughes-base","RD":"nhl-cale-makar-base","G":"nhl-andrei-vasilevskiy-base"}},{"id":"pwhl-rookie-lake-lights","name":"Lake Lights","mode":"pwhl-circuit","difficulty":"rookie","lineup_slots":{"LW":"pwhl-emma-maltais-base","C":"pwhl-alex-carpenter-base","RW":"pwhl-daryl-watts-base","LD":"pwhl-ella-shelton-base","RD":"pwhl-sophie-jaques-base","G":"pwhl-kristen-campbell-base"}},{"id":"pwhl-pro-metro-six","name":"Metro Six","mode":"pwhl-circuit","difficulty":"pro","lineup_slots":{"LW":"pwhl-sarah-nurse-base","C":"pwhl-taylor-heise-base","RW":"pwhl-hilary-knight-base","LD":"pwhl-megan-keller-base","RD":"pwhl-renata-fast-base","G":"pwhl-aerin-frankel-base"}},{"id":"pwhl-elite-crown-line","name":"Crown Line","mode":"pwhl-circuit","difficulty":"elite","lineup_slots":{"LW":"pwhl-kendall-coyne-schofield-base","C":"pwhl-marie-philip-poulin-base","RW":"pwhl-natalie-spooner-base","LD":"pwhl-claire-thompson-base","RD":"pwhl-erin-ambrose-base","G":"pwhl-ann-renee-desbiens-base"}},{"id":"open-rookie-cross-ice","name":"Cross Ice Club","mode":"open-ice","difficulty":"rookie","lineup_slots":{"LW":"pwhl-emma-maltais-base","C":"nhl-auston-matthews-base","RW":"pwhl-daryl-watts-base","LD":"nhl-rasmus-dahlin-base","RD":"pwhl-sophie-jaques-base","G":"nhl-andrei-vasilevskiy-base"}},{"id":"open-pro-confluence","name":"Confluence","mode":"open-ice","difficulty":"pro","lineup_slots":{"LW":"nhl-artemi-panarin-base","C":"pwhl-taylor-heise-base","RW":"nhl-david-pastrnak-base","LD":"pwhl-megan-keller-base","RD":"nhl-adam-fox-base","G":"pwhl-aerin-frankel-base"}},{"id":"open-elite-northern-alliance","name":"Northern Alliance","mode":"open-ice","difficulty":"elite","lineup_slots":{"LW":"pwhl-kendall-coyne-schofield-base","C":"nhl-connor-mcdavid-base","RW":"pwhl-natalie-spooner-base","LD":"nhl-quinn-hughes-base","RD":"pwhl-erin-ambrose-base","G":"nhl-connor-hellebuyck-base"}}]$ai_opponents$::jsonb) as seeded(
  id text,
  name text,
  mode text,
  difficulty text,
  lineup_slots jsonb
);
-- END GENERATED AI OPPONENTS

create table public.match_tickets (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_match_id text not null check (length(btrim(client_match_id)) between 1 and 200),
  lineup_id uuid not null,
  lineup_snapshot jsonb not null check (jsonb_typeof(lineup_snapshot) = 'object'),
  mode text not null check (mode in ('nhl-circuit', 'pwhl-circuit', 'open-ice')),
  difficulty text not null check (difficulty in ('rookie', 'pro', 'elite')),
  seed text not null check (length(seed) between 1 and 200),
  opponent_id text not null references public.ai_opponents(id) on delete restrict
    check (length(btrim(opponent_id)) between 1 and 200),
  opponent_snapshot jsonb not null check (jsonb_typeof(opponent_snapshot) = 'object'),
  situations_snapshot jsonb not null check (
    jsonb_typeof(situations_snapshot) = 'array' and jsonb_array_length(situations_snapshot) = 5
  ),
  status text not null default 'open' check (status in ('open', 'settled', 'abandoned')),
  outcome text check (outcome in ('win', 'draw', 'loss')),
  started_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz,
  unique (user_id, client_match_id),
  unique (id, user_id),
  foreign key (lineup_id, user_id)
    references public.lineups(id, user_id) on delete restrict,
  check (
    (status = 'open' and outcome is null and settled_at is null)
    or (status = 'settled' and outcome is not null and settled_at is not null)
    or status = 'abandoned'
  )
);

create unique index match_tickets_one_open_per_user_idx
  on public.match_tickets (user_id) where status = 'open';
create index match_tickets_user_started_at_idx
  on public.match_tickets (user_id, started_at desc);

create table public.match_rounds (
  ticket_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  round_index integer not null check (round_index between 0 and 4),
  client_request_id text not null check (length(btrim(client_request_id)) between 1 and 200),
  situation_id text not null,
  player_card_id text not null references public.card_catalog(card_id) on delete restrict,
  player_slot text not null check (player_slot in ('LW', 'C', 'RW', 'LD', 'RD', 'G')),
  opponent_card_id text not null references public.card_catalog(card_id) on delete restrict,
  opponent_slot text not null check (opponent_slot in ('LW', 'C', 'RW', 'LD', 'RD', 'G')),
  player_score numeric(8, 2) not null,
  opponent_score numeric(8, 2) not null,
  winner text not null check (winner in ('player', 'opponent', 'tie')),
  transcript jsonb not null check (jsonb_typeof(transcript) = 'object'),
  played_at timestamptz not null default clock_timestamp(),
  primary key (ticket_id, round_index),
  unique (user_id, client_request_id),
  foreign key (ticket_id, user_id)
    references public.match_tickets(id, user_id) on delete cascade
);

create index match_rounds_user_played_at_idx
  on public.match_rounds (user_id, played_at desc);

alter table public.card_catalog enable row level security;
alter table public.event_definitions enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.rivalry_reward_options enable row level security;
alter table public.reward_receipts enable row level security;
alter table public.match_tickets enable row level security;
alter table public.ai_opponents enable row level security;
alter table public.match_rounds enable row level security;

create policy "purchase_receipts_select_own"
  on public.purchase_receipts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "reward_receipts_select_own"
  on public.reward_receipts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "match_tickets_select_own"
  on public.match_tickets for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "match_rounds_select_own"
  on public.match_rounds for select to authenticated
  using ((select auth.uid()) = user_id);

-- Remove every browser write path left by the original permissive policies.
drop policy if exists "user_cards_insert_own" on public.user_cards;
drop policy if exists "user_cards_update_own" on public.user_cards;
drop policy if exists "user_cards_delete_own" on public.user_cards;
drop policy if exists "lineups_insert_own" on public.lineups;
drop policy if exists "lineups_update_own" on public.lineups;
drop policy if exists "lineups_delete_own" on public.lineups;
drop policy if exists "lineup_slots_insert_own" on public.lineup_slots;
drop policy if exists "lineup_slots_update_own" on public.lineup_slots;
drop policy if exists "lineup_slots_delete_own" on public.lineup_slots;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.user_cards from public, anon, authenticated;
revoke all on table public.lineups from public, anon, authenticated;
revoke all on table public.lineup_slots from public, anon, authenticated;
revoke all on table public.starter_team_cards from public, anon, authenticated;
revoke all on table public.matches from public, anon, authenticated;
revoke all on table public.match_rewards from public, anon, authenticated;
revoke all on table public.objective_progress from public, anon, authenticated;
revoke all on table public.rivalry_road_progress from public, anon, authenticated;
revoke all on table public.card_catalog from public, anon, authenticated;
revoke all on table public.event_definitions from public, anon, authenticated;
revoke all on table public.purchase_receipts from public, anon, authenticated;
revoke all on table public.rivalry_reward_options from public, anon, authenticated;
revoke all on table public.reward_receipts from public, anon, authenticated;
revoke all on table public.match_tickets from public, anon, authenticated;
revoke all on table public.ai_opponents from public, anon, authenticated;
revoke all on table public.match_rounds from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.user_cards to authenticated;
grant select on table public.lineups to authenticated;
grant select on table public.lineup_slots to authenticated;
grant select on table public.matches to authenticated;
grant select on table public.match_rewards to authenticated;
grant select on table public.objective_progress to authenticated;
grant select on table public.rivalry_road_progress to authenticated;
grant select on table public.purchase_receipts to authenticated;
grant select on table public.reward_receipts to authenticated;
grant select on table public.match_tickets to authenticated;
grant select on table public.match_rounds to authenticated;

-- The current UTC week selects one of ten events. The cycle repeats every ten
-- weeks, while spotlight placement continues to vary by absolute week index.
create or replace function public.current_market_offers(at_time timestamptz)
returns table (
  offer_id text,
  card_id text,
  source text,
  regular_price integer,
  price integer,
  event_id text,
  placement text,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with market_clock as (
    select
      date_trunc('week', at_time at time zone 'UTC') as starts_utc,
      floor(extract(epoch from (
        date_trunc('week', at_time at time zone 'UTC') - timestamp '2026-01-05 00:00:00'
      )) / 604800)::bigint as week_index
  ), active_event as (
    select events.id, market_clock.starts_utc, market_clock.week_index
    from market_clock
    join public.event_definitions events
      on events.rotation_order = (((market_clock.week_index % 10) + 10) % 10)::integer
    where events.is_active
  ), event_pool as (
    select
      cards.card_id,
      cards.price,
      active_event.id as event_id,
      active_event.starts_utc,
      active_event.week_index,
      row_number() over (order by cards.card_id) as offer_number,
      count(*) over () as offer_count
    from active_event
    join public.card_catalog cards
      on cards.set_id = active_event.id
    where cards.is_active and not cards.is_permanent and not cards.is_reward_only
      and (cards.available_from is null or cards.available_from <= at_time)
      and (cards.available_to is null or at_time < cards.available_to)
  )
  select
    'base-market:' || cards.card_id,
    cards.card_id,
    'base_market'::text,
    cards.price,
    cards.price,
    null::text,
    'standard'::text,
    null::timestamptz,
    null::timestamptz
  from public.card_catalog cards
  where cards.is_active and cards.is_permanent and not cards.is_reward_only
    and (cards.available_from is null or cards.available_from <= at_time)
    and (cards.available_to is null or at_time < cards.available_to)
  union all
  select
    'event-shop:' || event_pool.event_id || ':' ||
      to_char(event_pool.starts_utc, 'YYYY-MM-DD') || ':' || event_pool.card_id,
    event_pool.card_id,
    'event_shop'::text,
    event_pool.price,
    case when event_pool.offer_number = 1 + (
      ((event_pool.week_index % event_pool.offer_count) + event_pool.offer_count) % event_pool.offer_count
    ) then greatest(1, round(event_pool.price * 0.85)::integer) else event_pool.price end,
    event_pool.event_id,
    case when event_pool.offer_number = 1 + (
      ((event_pool.week_index % event_pool.offer_count) + event_pool.offer_count) % event_pool.offer_count
    ) then 'spotlight'::text else 'standard'::text end,
    event_pool.starts_utc at time zone 'UTC',
    (event_pool.starts_utc + interval '7 days') at time zone 'UTC'
  from event_pool;
$$;

revoke all on function public.current_market_offers(timestamptz) from public, anon, authenticated;

create or replace function public.get_market_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  market_time timestamptz := clock_timestamp();
  starts_utc timestamp := date_trunc('week', market_time at time zone 'UTC');
  week_index bigint;
  current_event public.event_definitions%rowtype;
  offers jsonb;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  week_index := floor(extract(epoch from (
    starts_utc - timestamp '2026-01-05 00:00:00'
  )) / 604800)::bigint;

  select * into current_event
  from public.event_definitions events
  where events.rotation_order = (((week_index % 10) + 10) % 10)::integer
    and events.is_active;

  if not found then
    raise exception 'No active event is configured for the current rotation.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'offer_id', market.offer_id,
    'card_id', market.card_id,
    'source', market.source,
    'regular_price', market.regular_price,
    'price', market.price,
    'event_id', market.event_id,
    'placement', market.placement,
    'starts_at', market.starts_at,
    'ends_at', market.ends_at,
    'owned_quantity', coalesce(owned.quantity, 0)
  ) order by market.source, market.placement desc, market.offer_id), '[]'::jsonb)
  into offers
  from public.current_market_offers(market_time) market
  left join public.user_cards owned
    on owned.user_id = requesting_user_id and owned.card_id = market.card_id;

  return jsonb_build_object(
    'server_time', market_time,
    'current_event', jsonb_build_object(
      'id', current_event.id,
      'name', current_event.name,
      'description', current_event.description,
      'starts_at', starts_utc at time zone 'UTC',
      'ends_at', (starts_utc + interval '7 days') at time zone 'UTC',
      'visual_metadata', current_event.visual_metadata
    ),
    'offers', offers
  );
end;
$$;

revoke all on function public.get_market_state() from public, anon;
grant execute on function public.get_market_state() to authenticated;

create or replace function public.purchase_card(client_request_id text, offer_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  purchase_time timestamptz;
  normalized_request_id text := btrim(purchase_card.client_request_id);
  normalized_offer_id text := btrim(purchase_card.offer_id);
  existing_receipt public.purchase_receipts%rowtype;
  resolved_card_id text;
  resolved_source text;
  resolved_price integer;
  resolved_event_id text;
  remaining_credits integer;
  owned_quantity integer;
  receipt_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_request_id is null or length(normalized_request_id) not between 1 and 200 then
    raise exception 'A valid purchase request id is required.' using errcode = '22023';
  end if;
  if normalized_offer_id is null or length(normalized_offer_id) not between 1 and 500 then
    raise exception 'A valid offer id is required.' using errcode = '22023';
  end if;

  perform 1 from public.profiles profiles
    where profiles.id = requesting_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  -- Evaluate availability only after the per-account economy lock is held so
  -- a queued request crossing an event cutoff cannot use a stale timestamp.
  purchase_time := clock_timestamp();

  select * into existing_receipt
  from public.purchase_receipts receipts
  where receipts.user_id = requesting_user_id
    and receipts.client_request_id = normalized_request_id;

  if found then
    if existing_receipt.offer_id <> normalized_offer_id then
      raise exception 'Purchase request id was already used for a different offer.' using errcode = '22023';
    end if;
    select cards.quantity into owned_quantity
      from public.user_cards cards
      where cards.user_id = requesting_user_id and cards.card_id = existing_receipt.card_id;
    return jsonb_build_object(
      'status', 'already-processed',
      'request_id', existing_receipt.client_request_id,
      'offer_id', existing_receipt.offer_id,
      'card_id', existing_receipt.card_id,
      'price', existing_receipt.price,
      'credits', (select profiles.credits from public.profiles profiles where profiles.id = requesting_user_id),
      'quantity', owned_quantity,
      'purchased_at', existing_receipt.purchased_at
    );
  end if;

  select market.card_id, market.source, market.price, market.event_id
    into resolved_card_id, resolved_source, resolved_price, resolved_event_id
  from public.current_market_offers(purchase_time) market
  where market.offer_id = normalized_offer_id;

  if not found then
    raise exception 'Offer is not available.' using errcode = 'P0001';
  end if;

  update public.profiles profiles
  set credits = profiles.credits - resolved_price,
      updated_at = purchase_time
  where profiles.id = requesting_user_id and profiles.credits >= resolved_price
  returning profiles.credits into remaining_credits;
  if not found then
    raise exception 'Not enough Credits.' using errcode = 'P0001';
  end if;

  insert into public.user_cards (user_id, card_id, quantity, acquired_at)
  values (requesting_user_id, resolved_card_id, 1, purchase_time)
  on conflict on constraint user_cards_pkey do update
    set quantity = public.user_cards.quantity + 1
  returning quantity into owned_quantity;

  insert into public.purchase_receipts (
    user_id, client_request_id, offer_id, card_id, price, source, event_id, purchased_at
  ) values (
    requesting_user_id, normalized_request_id, normalized_offer_id, resolved_card_id,
    resolved_price, resolved_source, resolved_event_id, purchase_time
  ) returning id into receipt_id;

  return jsonb_build_object(
    'status', 'purchased',
    'request_id', normalized_request_id,
    'offer_id', normalized_offer_id,
    'card_id', resolved_card_id,
    'price', resolved_price,
    'credits', remaining_credits,
    'quantity', owned_quantity,
    'purchased_at', purchase_time,
    'receipt_id', receipt_id
  );
end;
$$;

revoke all on function public.purchase_card(text, text) from public, anon;
grant execute on function public.purchase_card(text, text) to authenticated;

create or replace function public.assert_valid_lineup(
  requesting_user_id uuid,
  lineup_mode text,
  requested_slots jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  slot_count integer;
begin
  if requesting_user_id is null then
    raise exception 'A lineup owner is required.' using errcode = '22023';
  end if;
  if lineup_mode not in ('nhl-circuit', 'pwhl-circuit', 'open-ice') then
    raise exception 'Invalid lineup mode.' using errcode = '22023';
  end if;
  if requested_slots is null or jsonb_typeof(requested_slots) <> 'object' then
    raise exception 'Lineup slots must be a JSON object.' using errcode = '22023';
  end if;

  select count(*) into slot_count from jsonb_object_keys(requested_slots);
  if slot_count <> 6
    or exists (
      select 1
      from (values ('LW'), ('C'), ('RW'), ('LD'), ('RD'), ('G')) required(slot)
      where not (requested_slots ? required.slot)
    )
    or exists (
      select 1 from jsonb_object_keys(requested_slots) supplied(slot)
      where supplied.slot not in ('LW', 'C', 'RW', 'LD', 'RD', 'G')
    ) then
    raise exception 'A lineup must contain exactly LW, C, RW, LD, RD, and G.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_each_text(requested_slots) supplied(slot, card_id)
    where supplied.card_id is null or btrim(supplied.card_id) = ''
  ) then
    raise exception 'Every lineup slot requires a card.' using errcode = '22023';
  end if;

  if (select count(distinct supplied.card_id) from jsonb_each_text(requested_slots) supplied(slot, card_id)) <> 6 then
    raise exception 'The same card version cannot fill multiple lineup slots.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each_text(requested_slots) supplied(slot, card_id)
    left join public.card_catalog catalog on catalog.card_id = supplied.card_id
    where catalog.card_id is null or not catalog.is_active
  ) then
    raise exception 'Lineup contains an unknown or inactive card.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each_text(requested_slots) supplied(slot, card_id)
    join public.card_catalog catalog on catalog.card_id = supplied.card_id
    where not (supplied.slot = any(catalog.eligible_positions))
      or (supplied.slot = 'G' and catalog.role <> 'goalie')
      or (supplied.slot <> 'G' and catalog.role <> 'skater')
  ) then
    raise exception 'A card is not eligible for its assigned lineup slot.' using errcode = '22023';
  end if;

  if lineup_mode <> 'open-ice' and exists (
    select 1
    from jsonb_each_text(requested_slots) supplied(slot, card_id)
    join public.card_catalog catalog on catalog.card_id = supplied.card_id
    where catalog.league <> case lineup_mode
      when 'nhl-circuit' then 'NHL' else 'PWHL' end
  ) then
    raise exception 'A card does not match the lineup league.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select supplied.card_id, count(*)::integer as required_quantity
      from jsonb_each_text(requested_slots) supplied(slot, card_id)
      group by supplied.card_id
    ) required
    left join public.user_cards owned
      on owned.user_id = requesting_user_id and owned.card_id = required.card_id
    where coalesce(owned.quantity, 0) < required.required_quantity
  ) then
    raise exception 'Lineup contains a card quantity the user does not own.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_valid_lineup(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.lineup_as_json(requesting_user_id uuid, requested_lineup_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', lineups.id,
    'name', lineups.name,
    'mode', lineups.mode,
    'is_active', lineups.is_active,
    'slots', coalesce((
      select jsonb_object_agg(slots.slot, slots.card_id order by slots.slot)
      from public.lineup_slots slots
      where slots.lineup_id = lineups.id and slots.user_id = requesting_user_id
    ), '{}'::jsonb)
  )
  from public.lineups lineups
  where lineups.id = requested_lineup_id and lineups.user_id = requesting_user_id;
$$;

revoke all on function public.lineup_as_json(uuid, uuid) from public, anon, authenticated;

create or replace function public.save_lineup(
  lineup_id uuid,
  name text,
  mode text,
  slots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  requested_name text := btrim(save_lineup.name);
  requested_mode text := save_lineup.mode;
  requested_slots jsonb := save_lineup.slots;
  saved_lineup_id uuid;
  existing_owner_id uuid;
  existing_mode text;
  existing_active boolean;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if requested_name is null or length(requested_name) not between 1 and 80 then
    raise exception 'Lineup name must contain between 1 and 80 characters.' using errcode = '22023';
  end if;

  perform 1 from public.profiles profiles
    where profiles.id = requesting_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  if save_lineup.lineup_id is null then
    perform public.assert_valid_lineup(requesting_user_id, requested_mode, requested_slots);
    insert into public.lineups (user_id, name, mode, is_active)
    values (requesting_user_id, requested_name, requested_mode, false)
    returning id into saved_lineup_id;
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(save_lineup.lineup_id::text, 0)
    );
    select lineups.user_id, lineups.mode, lineups.is_active
      into existing_owner_id, existing_mode, existing_active
    from public.lineups lineups
    where lineups.id = save_lineup.lineup_id
    for update;
    if not found then
      perform public.assert_valid_lineup(requesting_user_id, requested_mode, requested_slots);
      insert into public.lineups (id, user_id, name, mode, is_active)
      values (save_lineup.lineup_id, requesting_user_id, requested_name, requested_mode, false)
      returning id into saved_lineup_id;
    elsif existing_owner_id <> requesting_user_id then
      raise exception 'Lineup id belongs to another user.' using errcode = '42501';
    else
      perform public.assert_valid_lineup(requesting_user_id, requested_mode, requested_slots);
      if exists (
        select 1 from public.match_tickets tickets
        where tickets.user_id = requesting_user_id
          and tickets.status = 'open'
          and tickets.lineup_id = save_lineup.lineup_id
      ) then
        raise exception 'An active match must be completed before its lineup can change.' using errcode = 'P0001';
      end if;
      saved_lineup_id := save_lineup.lineup_id;
      update public.lineups lineups
      set name = requested_name,
          mode = requested_mode,
          is_active = case when existing_mode = requested_mode then existing_active else false end,
          updated_at = clock_timestamp()
      where lineups.id = saved_lineup_id and lineups.user_id = requesting_user_id;
    end if;
  end if;

  delete from public.lineup_slots lineup_slots
  where lineup_slots.lineup_id = saved_lineup_id
    and lineup_slots.user_id = requesting_user_id;

  insert into public.lineup_slots (lineup_id, user_id, slot, card_id)
  select saved_lineup_id, requesting_user_id, supplied.slot, supplied.card_id
  from jsonb_each_text(requested_slots) supplied(slot, card_id);

  return jsonb_build_object(
    'status', 'saved',
    'lineup', public.lineup_as_json(requesting_user_id, saved_lineup_id)
  );
end;
$$;

revoke all on function public.save_lineup(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_lineup(uuid, text, text, jsonb) to authenticated;

create or replace function public.activate_lineup(lineup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  requested_mode text;
  requested_slots jsonb;
  open_match_lineup_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if activate_lineup.lineup_id is null then
    raise exception 'A lineup id is required.' using errcode = '22023';
  end if;

  perform 1 from public.profiles profiles
    where profiles.id = requesting_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  select lineups.mode into requested_mode
  from public.lineups lineups
  where lineups.id = activate_lineup.lineup_id and lineups.user_id = requesting_user_id
  for update;
  if not found then
    raise exception 'Lineup not found.' using errcode = 'P0002';
  end if;

  select tickets.lineup_id into open_match_lineup_id
  from public.match_tickets tickets
  where tickets.user_id = requesting_user_id and tickets.status = 'open'
  for update;
  if found and open_match_lineup_id <> activate_lineup.lineup_id then
    raise exception 'An active match must be completed before another lineup can be activated.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_object_agg(lineup_slots.slot, lineup_slots.card_id), '{}'::jsonb)
    into requested_slots
  from public.lineup_slots lineup_slots
  where lineup_slots.lineup_id = activate_lineup.lineup_id
    and lineup_slots.user_id = requesting_user_id;

  perform public.assert_valid_lineup(requesting_user_id, requested_mode, requested_slots);

  update public.lineups lineups
  set is_active = false, updated_at = clock_timestamp()
  where lineups.user_id = requesting_user_id
    and lineups.mode = requested_mode
    and lineups.is_active;

  update public.lineups lineups
  set is_active = true, updated_at = clock_timestamp()
  where lineups.id = activate_lineup.lineup_id and lineups.user_id = requesting_user_id;

  return jsonb_build_object(
    'status', 'activated',
    'lineup', public.lineup_as_json(requesting_user_id, activate_lineup.lineup_id)
  );
end;
$$;

revoke all on function public.activate_lineup(uuid) from public, anon;
grant execute on function public.activate_lineup(uuid) to authenticated;

create or replace function public.claim_rivalry_reward(client_request_id text, card_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  claim_time timestamptz;
  normalized_request_id text := btrim(claim_rivalry_reward.client_request_id);
  normalized_card_id text := btrim(claim_rivalry_reward.card_id);
  existing_receipt public.reward_receipts%rowtype;
  source_receipt public.reward_receipts%rowtype;
  road public.rivalry_road_progress%rowtype;
  owned_quantity integer;
  receipt_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_request_id is null or length(normalized_request_id) not between 1 and 200 then
    raise exception 'A valid reward request id is required.' using errcode = '22023';
  end if;
  if normalized_card_id is null or length(normalized_card_id) not between 1 and 200 then
    raise exception 'A valid reward card id is required.' using errcode = '22023';
  end if;

  perform 1 from public.profiles profiles
    where profiles.id = requesting_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  -- Stamp the reward mutation after serialization so acquisition and receipt
  -- ordering reflects when this account actually became eligible to proceed.
  claim_time := clock_timestamp();

  select * into existing_receipt
  from public.reward_receipts receipts
  where receipts.user_id = requesting_user_id
    and receipts.client_request_id = normalized_request_id;
  if found then
    if existing_receipt.card_id <> normalized_card_id then
      raise exception 'Reward request id was already used for a different card.' using errcode = '22023';
    end if;
    select cards.quantity into owned_quantity from public.user_cards cards
      where cards.user_id = requesting_user_id and cards.card_id = existing_receipt.card_id;
    return jsonb_build_object(
      'status', 'already-claimed',
      'request_id', existing_receipt.client_request_id,
      'card_id', existing_receipt.card_id,
      'quantity', owned_quantity,
      'claimed_at', existing_receipt.claimed_at
    );
  end if;

  select * into source_receipt
  from public.reward_receipts receipts
  where receipts.user_id = requesting_user_id
    and receipts.source_id = 'rivalry-road-card-choice';
  if found then
    if source_receipt.card_id <> normalized_card_id then
      raise exception 'Rivalry Road reward has already been claimed.' using errcode = 'P0001';
    end if;
    select cards.quantity into owned_quantity from public.user_cards cards
      where cards.user_id = requesting_user_id and cards.card_id = source_receipt.card_id;
    return jsonb_build_object(
      'status', 'already-claimed',
      'request_id', source_receipt.client_request_id,
      'card_id', source_receipt.card_id,
      'quantity', owned_quantity,
      'claimed_at', source_receipt.claimed_at
    );
  end if;

  if not exists (
    select 1 from public.rivalry_reward_options options
    where options.card_id = normalized_card_id
  ) then
    raise exception 'Card is not an allowed Rivalry Road reward.' using errcode = '22023';
  end if;

  select * into road from public.rivalry_road_progress progress
  where progress.user_id = requesting_user_id for update;
  if not found or road.status <> 'choice-pending' or road.current_step_index <> 3
    or not (array['nhl-circuit-complete', 'pwhl-circuit-complete', 'open-ice-pro-win']::text[]
      <@ road.completed_step_ids) then
    raise exception 'Rivalry Road reward is not unlocked.' using errcode = 'P0001';
  end if;

  insert into public.user_cards (user_id, card_id, quantity, acquired_at)
  values (requesting_user_id, normalized_card_id, 1, claim_time)
  on conflict on constraint user_cards_pkey do update
    set quantity = public.user_cards.quantity + 1
  returning quantity into owned_quantity;

  insert into public.reward_receipts (
    user_id, client_request_id, source_id, card_id, claimed_at
  ) values (
    requesting_user_id, normalized_request_id, 'rivalry-road-card-choice',
    normalized_card_id, claim_time
  ) returning id into receipt_id;

  update public.rivalry_road_progress progress
  set status = 'complete', selected_card_id = normalized_card_id, updated_at = claim_time
  where progress.user_id = requesting_user_id;

  return jsonb_build_object(
    'status', 'claimed',
    'request_id', normalized_request_id,
    'card_id', normalized_card_id,
    'quantity', owned_quantity,
    'claimed_at', claim_time,
    'receipt_id', receipt_id
  );
end;
$$;

revoke all on function public.claim_rivalry_reward(text, text) from public, anon;
grant execute on function public.claim_rivalry_reward(text, text) to authenticated;

-- Retry-safe starter claim. A retry for the same team returns the original
-- lineup; trying to change the starter selection remains an error.
create or replace function public.claim_starter_team(selected_team_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_team_id text := btrim(claim_starter_team.selected_team_id);
  profile public.profiles%rowtype;
  created_lineup_id uuid;
  starter_card_count integer;
begin
  if requesting_user_id is null then
    raise exception using errcode = '42501',
      message = 'Authentication required to claim a starter team.';
  end if;
  if normalized_team_id is null or normalized_team_id = '' then
    raise exception using errcode = '22023', message = 'A starter team id is required.';
  end if;

  select count(*) into starter_card_count
  from public.starter_team_cards starter
  join public.card_catalog catalog on catalog.card_id = starter.card_id and catalog.is_active
  where starter.team_id = normalized_team_id;

  if starter_card_count <> 6 or exists (
    select required.slot
    from (values ('LW'), ('C'), ('RW'), ('LD'), ('RD'), ('G')) required(slot)
    where not exists (
      select 1 from public.starter_team_cards starter
      join public.card_catalog catalog
        on catalog.card_id = starter.card_id
        and required.slot = any(catalog.eligible_positions)
      where starter.team_id = normalized_team_id and starter.slot = required.slot
    )
  ) then
    raise exception using errcode = '22023', message = 'Unknown or incomplete starter team.';
  end if;

  select * into profile from public.profiles profiles
  where profiles.id = requesting_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found.';
  end if;

  if profile.starter_claimed_at is not null then
    if profile.favorite_team_id <> normalized_team_id then
      raise exception using errcode = 'P0001', message = 'A different starter team has already been claimed.';
    end if;
    if profile.starter_lineup_id is not null and exists (
      select 1 from public.lineups lineups
      where lineups.id = profile.starter_lineup_id and lineups.user_id = requesting_user_id
    ) then
      return profile.starter_lineup_id;
    end if;

    select lineups.id into created_lineup_id
    from public.lineups lineups
    where lineups.user_id = requesting_user_id and lineups.mode = 'nhl-circuit'
    order by lineups.created_at, lineups.id
    limit 1;
    if created_lineup_id is null then
      raise exception using errcode = 'P0002', message = 'Claimed starter lineup could not be found.';
    end if;
    update public.profiles profiles set starter_lineup_id = created_lineup_id
      where profiles.id = requesting_user_id;
    return created_lineup_id;
  end if;

  insert into public.user_cards (user_id, card_id, quantity)
  select requesting_user_id, starter.card_id, 1
  from public.starter_team_cards starter
  where starter.team_id = normalized_team_id
  on conflict on constraint user_cards_pkey do update
    set quantity = greatest(public.user_cards.quantity, 1);

  update public.lineups lineups
  set is_active = false, updated_at = clock_timestamp()
  where lineups.user_id = requesting_user_id
    and lineups.mode = 'nhl-circuit'
    and lineups.is_active;

  insert into public.lineups (user_id, name, mode, is_active)
  values (requesting_user_id, 'Edmonton Oilers Starter', 'nhl-circuit', true)
  returning id into created_lineup_id;

  insert into public.lineup_slots (lineup_id, user_id, slot, card_id)
  select created_lineup_id, requesting_user_id, starter.slot, starter.card_id
  from public.starter_team_cards starter
  where starter.team_id = normalized_team_id;

  update public.profiles profiles
  set favorite_team_id = normalized_team_id,
      starter_claimed_at = clock_timestamp(),
      starter_lineup_id = created_lineup_id,
      onboarding_completed = true,
      credits = 1000,
      updated_at = clock_timestamp()
  where profiles.id = requesting_user_id;

  return created_lineup_id;
end;
$$;

revoke all on function public.claim_starter_team(text) from public, anon;
grant execute on function public.claim_starter_team(text) to authenticated;

create or replace function public.start_match(
  client_match_id text,
  mode text,
  difficulty text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_match_id text := btrim(start_match.client_match_id);
  requested_mode text := start_match.mode;
  requested_difficulty text := start_match.difficulty;
  profile public.profiles%rowtype;
  existing_ticket public.match_tickets%rowtype;
  active_lineup public.lineups%rowtype;
  opponent public.ai_opponents%rowtype;
  lineup_slots jsonb;
  collection_score integer;
  required_score integer;
  ticket_seed text;
  selected_opponent_id text;
  situations jsonb;
  played_rounds jsonb;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200 then
    raise exception 'A valid client match id is required.' using errcode = '22023';
  end if;
  if requested_mode not in ('nhl-circuit', 'pwhl-circuit', 'open-ice') then
    raise exception 'Invalid match mode.' using errcode = '22023';
  end if;
  if requested_difficulty not in ('rookie', 'pro', 'elite') then
    raise exception 'Invalid match difficulty.' using errcode = '22023';
  end if;

  select * into profile from public.profiles profiles
  where profiles.id = requesting_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  if not profile.onboarding_completed then
    raise exception 'Onboarding must be completed before starting a match.' using errcode = 'P0001';
  end if;

  select * into existing_ticket from public.match_tickets tickets
  where tickets.user_id = requesting_user_id
    and tickets.client_match_id = normalized_match_id;
  if found then
    if existing_ticket.mode <> requested_mode or existing_ticket.difficulty <> requested_difficulty then
      raise exception 'Match id was already started with different match data.' using errcode = '22023';
    end if;
    if existing_ticket.status <> 'open' then
      raise exception 'Match id is no longer active.' using errcode = 'P0001';
    end if;
  else
    select * into existing_ticket from public.match_tickets tickets
    where tickets.user_id = requesting_user_id and tickets.status = 'open'
    for update;
    if found and (
      existing_ticket.mode <> requested_mode
      or existing_ticket.difficulty <> requested_difficulty
    ) then
      raise exception 'An active match with different match data must be completed first.' using errcode = 'P0001';
    end if;
  end if;

  if existing_ticket.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'status', 'already-played',
      'client_match_id', existing_ticket.client_match_id,
      'round_index', rounds.round_index,
      'situation_id', rounds.situation_id,
      'player_card_id', rounds.player_card_id,
      'player_slot', rounds.player_slot,
      'player_score', rounds.player_score,
      'opponent_card_id', rounds.opponent_card_id,
      'opponent_slot', rounds.opponent_slot,
      'opponent_score', rounds.opponent_score,
      'winner', rounds.winner,
      'transcript', rounds.transcript
    ) order by rounds.round_index), '[]'::jsonb)
    into played_rounds
    from public.match_rounds rounds
    where rounds.ticket_id = existing_ticket.id and rounds.user_id = requesting_user_id;

    return jsonb_build_object(
      'status', 'already-started',
      'client_match_id', existing_ticket.client_match_id,
      'seed', existing_ticket.seed,
      'lineup', existing_ticket.lineup_snapshot,
      'opponent_id', existing_ticket.opponent_id,
      'opponent', existing_ticket.opponent_snapshot,
      'situations', existing_ticket.situations_snapshot,
      'rounds', played_rounds,
      'mode', existing_ticket.mode,
      'difficulty', existing_ticket.difficulty
    );
  end if;

  select * into active_lineup from public.lineups lineups
  where lineups.user_id = requesting_user_id
    and lineups.mode = requested_mode
    and lineups.is_active
  for update;
  if not found then
    raise exception 'An active lineup is required for this mode.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_object_agg(slots.slot, slots.card_id), '{}'::jsonb)
    into lineup_slots
  from public.lineup_slots slots
  where slots.lineup_id = active_lineup.id and slots.user_id = requesting_user_id;
  perform public.assert_valid_lineup(requesting_user_id, requested_mode, lineup_slots);

  select coalesce(sum(
    100 + greatest(0, catalog.overall - 60) * 2
      + case when catalog.card_type <> 'base' then 50 else 0 end
  ), 0)::integer into collection_score
  from public.user_cards owned
  join public.card_catalog catalog on catalog.card_id = owned.card_id and catalog.is_active
  where owned.user_id = requesting_user_id and owned.quantity > 0;

  required_score := case requested_difficulty when 'rookie' then 0 when 'pro' then 1500 else 3500 end;
  if collection_score < required_score then
    raise exception 'Requested difficulty is not unlocked.' using errcode = 'P0001';
  end if;

  select * into opponent from public.ai_opponents opponents
  where opponents.mode = requested_mode and opponents.difficulty = requested_difficulty;
  if not found then
    raise exception 'No server opponent is configured for this match.' using errcode = 'P0002';
  end if;
  if (select count(*) from jsonb_object_keys(opponent.lineup_slots)) <> 6
    or (select count(distinct supplied.card_id) from jsonb_each_text(opponent.lineup_slots) supplied(slot, card_id)) <> 6
    or exists (
      select 1
      from jsonb_each_text(opponent.lineup_slots) supplied(slot, card_id)
      left join public.card_catalog catalog on catalog.card_id = supplied.card_id
      where catalog.card_id is null or not catalog.is_active
        or not (supplied.slot = any(catalog.eligible_positions))
        or (requested_mode = 'nhl-circuit' and catalog.league <> 'NHL')
        or (requested_mode = 'pwhl-circuit' and catalog.league <> 'PWHL')
    ) then
    raise exception 'Configured server opponent has an invalid lineup.' using errcode = 'P0002';
  end if;

  ticket_seed := extensions.gen_random_uuid()::text;
  selected_opponent_id := opponent.id;
  situations := jsonb_build_array(
    jsonb_build_object(
      'id', 'transition-rush', 'name', 'Transition Rush',
      'description', 'Attack with pace and finish off the rush.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW'),
      'weights', jsonb_build_object('speed', 0.30, 'shooting', 0.30, 'puckControl', 0.20, 'hockeyIq', 0.10, 'clutch', 0.10)
    ),
    jsonb_build_object(
      'id', 'cycle-pressure', 'name', 'Cycle Pressure',
      'description', 'Hold possession and create through sustained pressure.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW'),
      'weights', jsonb_build_object('passing', 0.25, 'puckControl', 0.30, 'physicality', 0.15, 'hockeyIq', 0.20, 'clutch', 0.10)
    ),
    jsonb_build_object(
      'id', 'blue-line-command', 'name', 'Blue Line Command',
      'description', 'Control the point with a complete defender.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LD', 'RD'),
      'weights', jsonb_build_object('defense', 0.30, 'passing', 0.20, 'shooting', 0.15, 'physicality', 0.15, 'hockeyIq', 0.20)
    ),
    jsonb_build_object(
      'id', 'late-game-shift', 'name', 'Late Game Shift',
      'description', 'Make the decisive play under late-game pressure.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW', 'LD', 'RD'),
      'weights', jsonb_build_object('clutch', 0.30, 'hockeyIq', 0.25, 'speed', 0.15, 'puckControl', 0.15, 'defense', 0.15)
    ),
    jsonb_build_object(
      'id', 'crease-under-fire', 'name', 'Crease Under Fire',
      'description', 'Own the crease during a final barrage.', 'role', 'goalie',
      'eligible_slots', jsonb_build_array('G'),
      'weights', jsonb_build_object('reflexes', 0.20, 'positioning', 0.20, 'glove', 0.10, 'blocker', 0.10, 'reboundControl', 0.15, 'consistency', 0.15, 'clutch', 0.10)
    )
  );

  insert into public.match_tickets (
    user_id, client_match_id, lineup_id, lineup_snapshot, mode, difficulty,
    seed, opponent_id, opponent_snapshot, situations_snapshot, status
  ) values (
    requesting_user_id, normalized_match_id, active_lineup.id,
    jsonb_build_object('id', active_lineup.id, 'name', active_lineup.name, 'mode', active_lineup.mode, 'slots', lineup_slots),
    requested_mode, requested_difficulty, ticket_seed, selected_opponent_id,
    jsonb_build_object('id', opponent.id, 'name', opponent.name, 'mode', opponent.mode, 'slots', opponent.lineup_slots),
    situations, 'open'
  );

  return jsonb_build_object(
    'status', 'started',
    'client_match_id', normalized_match_id,
    'seed', ticket_seed,
    'lineup', jsonb_build_object('id', active_lineup.id, 'name', active_lineup.name, 'mode', active_lineup.mode, 'slots', lineup_slots),
    'opponent_id', selected_opponent_id,
    'opponent', jsonb_build_object('id', opponent.id, 'name', opponent.name, 'mode', opponent.mode, 'slots', opponent.lineup_slots),
    'situations', situations,
    'rounds', '[]'::jsonb,
    'mode', requested_mode,
    'difficulty', requested_difficulty
  );
end;
$$;

revoke all on function public.start_match(text, text, text) from public, anon;
grant execute on function public.start_match(text, text, text) to authenticated;

create or replace function public.card_situation_score(requested_card_id text, situation jsonb)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(sum(
    coalesce((catalog.attributes ->> weights.attribute_name)::numeric, 0)
      * (weights.attribute_weight #>> '{}')::numeric
  ), 2)
  from public.card_catalog catalog
  cross join lateral jsonb_each(situation -> 'weights')
    weights(attribute_name, attribute_weight)
  where catalog.card_id = requested_card_id and catalog.is_active;
$$;

revoke all on function public.card_situation_score(text, jsonb) from public, anon, authenticated;

create or replace function public.play_match_round(
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
  normalized_match_id text := btrim(play_match_round.client_match_id);
  normalized_card_id text := btrim(play_match_round.player_card_id);
  normalized_request_id text := btrim(play_match_round.client_request_id);
  ticket public.match_tickets%rowtype;
  existing_round public.match_rounds%rowtype;
  situation jsonb;
  eligible_slots text[];
  selected_player_slot text;
  selected_opponent_slot text;
  selected_opponent_card_id text;
  player_base_score numeric;
  opponent_base_score numeric;
  player_variance numeric;
  opponent_variance numeric;
  final_player_score numeric;
  final_opponent_score numeric;
  round_winner text;
  rounds_played integer;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200 then
    raise exception 'A valid client match id is required.' using errcode = '22023';
  end if;
  if play_match_round.round_index is null or play_match_round.round_index not between 0 and 4 then
    raise exception 'Round index must be between 0 and 4.' using errcode = '22023';
  end if;
  if normalized_card_id is null or length(normalized_card_id) not between 1 and 200 then
    raise exception 'A valid player card id is required.' using errcode = '22023';
  end if;
  if normalized_request_id is null or length(normalized_request_id) not between 1 and 200 then
    raise exception 'A valid round request id is required.' using errcode = '22023';
  end if;

  perform 1 from public.profiles profiles
  where profiles.id = requesting_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  select * into ticket from public.match_tickets tickets
  where tickets.user_id = requesting_user_id
    and tickets.client_match_id = normalized_match_id
  for update;
  if not found then
    raise exception 'A valid server-issued match ticket is required.' using errcode = 'P0001';
  end if;

  select * into existing_round from public.match_rounds rounds
  where rounds.user_id = requesting_user_id
    and rounds.client_request_id = normalized_request_id;
  if found then
    if existing_round.ticket_id <> ticket.id
      or existing_round.round_index <> play_match_round.round_index
      or existing_round.player_card_id <> normalized_card_id then
      raise exception 'Round request id was already used for different round data.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'status', 'already-played',
      'client_match_id', normalized_match_id,
      'round_index', existing_round.round_index,
      'situation_id', existing_round.situation_id,
      'player_card_id', existing_round.player_card_id,
      'player_slot', existing_round.player_slot,
      'player_score', existing_round.player_score,
      'opponent_card_id', existing_round.opponent_card_id,
      'opponent_slot', existing_round.opponent_slot,
      'opponent_score', existing_round.opponent_score,
      'winner', existing_round.winner,
      'transcript', existing_round.transcript
    );
  end if;

  if ticket.status <> 'open' then
    raise exception 'Match ticket is not open.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.match_rounds rounds
    where rounds.ticket_id = ticket.id and rounds.round_index = play_match_round.round_index
  ) then
    raise exception 'Round has already been played.' using errcode = 'P0001';
  end if;
  select count(*)::integer into rounds_played
  from public.match_rounds rounds where rounds.ticket_id = ticket.id;
  if rounds_played <> play_match_round.round_index then
    raise exception 'Rounds must be played in order.' using errcode = '22023';
  end if;

  situation := ticket.situations_snapshot -> play_match_round.round_index;
  select array_agg(eligible.slot_name) into eligible_slots
  from jsonb_array_elements_text(situation -> 'eligible_slots') as eligible(slot_name);

  select supplied.slot into selected_player_slot
  from jsonb_each_text(ticket.lineup_snapshot -> 'slots') supplied(slot, card_id)
  where supplied.card_id = normalized_card_id
    and supplied.slot = any(eligible_slots)
    and not exists (
      select 1 from public.match_rounds rounds
      where rounds.ticket_id = ticket.id and rounds.player_slot = supplied.slot
    )
  order by supplied.slot
  limit 1;
  if selected_player_slot is null then
    raise exception 'Player card is missing, already used, or ineligible for this situation.' using errcode = '22023';
  end if;

  player_base_score := public.card_situation_score(normalized_card_id, situation);
  if player_base_score is null then
    raise exception 'Player card metadata is unavailable.' using errcode = 'P0002';
  end if;

  select candidate.slot, candidate.card_id, candidate.base_score
    into selected_opponent_slot, selected_opponent_card_id, opponent_base_score
  from (
    select supplied.slot, supplied.card_id,
      public.card_situation_score(supplied.card_id, situation) as base_score
    from jsonb_each_text(ticket.opponent_snapshot -> 'slots') supplied(slot, card_id)
    where supplied.slot = any(eligible_slots)
      and not exists (
        select 1 from public.match_rounds rounds
        where rounds.ticket_id = ticket.id and rounds.opponent_slot = supplied.slot
      )
  ) candidate
  order by
    case when ticket.difficulty = 'rookie' then candidate.base_score end asc,
    case when ticket.difficulty = 'elite' then candidate.base_score end desc,
    case when ticket.difficulty = 'pro' then
      abs(hashtextextended(ticket.seed || ':' || play_match_round.round_index::text || ':' || candidate.card_id, 0)::numeric)
    end asc,
    candidate.card_id
  limit 1;
  if selected_opponent_card_id is null then
    raise exception 'Server opponent has no eligible card for this situation.' using errcode = 'P0002';
  end if;

  player_variance := (
    mod(abs(hashtextextended(ticket.seed || ':round:' || play_match_round.round_index::text || ':player:' || normalized_card_id, 0)::numeric), 501) - 250
  ) / 100;
  opponent_variance := (
    mod(abs(hashtextextended(ticket.seed || ':round:' || play_match_round.round_index::text || ':opponent:' || selected_opponent_card_id, 0)::numeric),
      case ticket.difficulty when 'rookie' then 601 when 'pro' then 501 else 401 end)
    - case ticket.difficulty when 'rookie' then 300 when 'pro' then 250 else 200 end
  ) / 100;
  final_player_score := round(player_base_score + player_variance, 2);
  final_opponent_score := round(opponent_base_score + opponent_variance, 2);
  round_winner := case
    when final_player_score > final_opponent_score then 'player'
    when final_player_score < final_opponent_score then 'opponent'
    else 'tie' end;

  insert into public.match_rounds (
    ticket_id, user_id, round_index, client_request_id, situation_id,
    player_card_id, player_slot, opponent_card_id, opponent_slot,
    player_score, opponent_score, winner, transcript
  ) values (
    ticket.id, requesting_user_id, play_match_round.round_index, normalized_request_id,
    situation ->> 'id', normalized_card_id, selected_player_slot,
    selected_opponent_card_id, selected_opponent_slot,
    final_player_score, final_opponent_score, round_winner,
    jsonb_build_object(
      'situation', situation,
      'player', jsonb_build_object('base', player_base_score, 'variance', player_variance, 'total', final_player_score),
      'opponent', jsonb_build_object('base', opponent_base_score, 'variance', opponent_variance, 'total', final_opponent_score)
    )
  );

  return jsonb_build_object(
    'status', 'played',
    'client_match_id', normalized_match_id,
    'round_index', play_match_round.round_index,
    'situation_id', situation ->> 'id',
    'player_card_id', normalized_card_id,
    'player_slot', selected_player_slot,
    'player_score', final_player_score,
    'opponent_card_id', selected_opponent_card_id,
    'opponent_slot', selected_opponent_slot,
    'opponent_score', final_opponent_score,
    'winner', round_winner,
    'transcript', jsonb_build_object(
      'situation', situation,
      'player', jsonb_build_object('base', player_base_score, 'variance', player_variance, 'total', final_player_score),
      'opponent', jsonb_build_object('base', opponent_base_score, 'variance', opponent_variance, 'total', final_opponent_score)
    )
  );
end;
$$;

revoke all on function public.play_match_round(text, integer, text, text) from public, anon;
grant execute on function public.play_match_round(text, integer, text, text) to authenticated;

-- Settlement accepts only a match id and derives the outcome from the five
-- immutable server-scored rounds. No client-provided mode, tier, or outcome is
-- trusted after this point.
drop function if exists public.settle_match(text, text, text, text);

create or replace function public.settle_match(client_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_match_id text := btrim(settle_match.client_match_id);
  requested_mode text;
  requested_difficulty text;
  requested_outcome text;
  settlement_time timestamptz;
  day_key text;
  week_key text;
  ticket public.match_tickets%rowtype;
  spotlight_mode text;
  created_match_id uuid;
  existing_match public.matches%rowtype;
  base_credits integer;
  objective_credits integer := 0;
  rivalry_credits integer := 0;
  total_credits integer;
  profile_credits integer;
  profile_completed_matches integer;
  progress_row public.objective_progress%rowtype;
  road public.rivalry_road_progress%rowtype;
  newly_completed boolean;
  played_round_count integer;
  player_round_wins integer;
  opponent_round_wins integer;
  rule_version constant text := 'match-rules-v3-server-rounds';
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200 then
    raise exception 'A valid client match id is required.' using errcode = '22023';
  end if;

  -- Serializes every economy mutation for one account, making retries and
  -- concurrent settlement attempts deterministic.
  perform 1 from public.profiles profiles
  where profiles.id = requesting_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  -- Attribute UTC periods from the instant after the account economy lock is
  -- acquired; queued settlements may cross a daily or weekly cutoff.
  settlement_time := clock_timestamp();
  day_key := to_char(settlement_time at time zone 'UTC', 'YYYY-MM-DD');
  week_key := to_char(
    date_trunc('week', settlement_time at time zone 'UTC'), 'YYYY-MM-DD'
  );

  select * into existing_match
  from public.matches matches
  where matches.user_id = requesting_user_id
    and matches.client_match_id = normalized_match_id;
  if found then
    return jsonb_build_object(
      'status', 'already-settled',
      'match_id', existing_match.id,
      'reward_credits', (select rewards.total_credits from public.match_rewards rewards where rewards.match_id = existing_match.id),
      'credits', (select profiles.credits from public.profiles profiles where profiles.id = requesting_user_id),
      'completed_matches', (select profiles.completed_matches from public.profiles profiles where profiles.id = requesting_user_id)
    );
  end if;

  select * into ticket
  from public.match_tickets tickets
  where tickets.user_id = requesting_user_id
    and tickets.client_match_id = normalized_match_id
  for update;
  if not found then
    raise exception 'A valid server-issued match ticket is required.' using errcode = 'P0001';
  end if;
  if ticket.status <> 'open' then
    raise exception 'Match ticket is not open.' using errcode = 'P0001';
  end if;

  select count(*)::integer,
    count(*) filter (where rounds.winner = 'player')::integer,
    count(*) filter (where rounds.winner = 'opponent')::integer
    into played_round_count, player_round_wins, opponent_round_wins
  from public.match_rounds rounds
  where rounds.ticket_id = ticket.id and rounds.user_id = requesting_user_id;
  if played_round_count <> 5 then
    raise exception 'All five server rounds must be played before settlement.' using errcode = 'P0001';
  end if;

  requested_mode := ticket.mode;
  requested_difficulty := ticket.difficulty;
  requested_outcome := case
    when player_round_wins > opponent_round_wins then 'win'
    when player_round_wins < opponent_round_wins then 'loss'
    else 'draw' end;

  insert into public.matches (
    user_id, client_match_id, mode, difficulty, outcome, reward_rule_version, completed_at
  ) values (
    requesting_user_id, normalized_match_id, requested_mode, requested_difficulty,
    requested_outcome, rule_version, settlement_time
  ) returning id into created_match_id;

  base_credits := case requested_difficulty
    when 'rookie' then case requested_outcome when 'win' then 120 when 'draw' then 90 else 60 end
    when 'pro' then case requested_outcome when 'win' then 180 when 'draw' then 120 else 80 end
    when 'elite' then case requested_outcome when 'win' then 260 when 'draw' then 160 else 100 end
  end;
  spotlight_mode := (array['nhl-circuit', 'pwhl-circuit', 'open-ice'])[
    1 + mod((day_key::date - date '1970-01-01'), 3)
  ];

  insert into public.objective_progress
    (user_id, objective_id, period_key, current, target, reward_credits, completed_at)
  values
    (requesting_user_id, 'daily-match-complete', day_key, 1, 1, 75, settlement_time)
  on conflict (user_id, objective_id, period_key) do update
    set updated_at = settlement_time
  returning (xmax = 0) into newly_completed;
  if newly_completed then objective_credits := objective_credits + 75; end if;

  if requested_outcome = 'win' then
    insert into public.objective_progress
      (user_id, objective_id, period_key, current, target, reward_credits, completed_at)
    values
      (requesting_user_id, 'daily-match-win', day_key, 1, 1, 100, settlement_time)
    on conflict (user_id, objective_id, period_key) do update
      set updated_at = settlement_time
    returning (xmax = 0) into newly_completed;
    if newly_completed then objective_credits := objective_credits + 100; end if;
  end if;

  if requested_mode = spotlight_mode then
    insert into public.objective_progress
      (user_id, objective_id, period_key, current, target, reward_credits, completed_at)
    values
      (requesting_user_id, 'daily-spotlight', day_key, 1, 1, 100, settlement_time)
    on conflict (user_id, objective_id, period_key) do update
      set updated_at = settlement_time
    returning (xmax = 0) into newly_completed;
    if newly_completed then objective_credits := objective_credits + 100; end if;
  end if;

  insert into public.objective_progress (
    user_id, objective_id, period_key, current, target, completed_modes,
    completed_at, reward_credits
  ) values (
    requesting_user_id, 'weekly-circuit-tour', week_key, 1, 5,
    array[requested_mode], null, 350
  )
  on conflict (user_id, objective_id, period_key) do update set
    current = least(5, objective_progress.current + 1),
    completed_modes = (
      select array_agg(distinct mode_name order by mode_name)
      from unnest(objective_progress.completed_modes || array[requested_mode]) mode_name
    ),
    completed_at = case
      when objective_progress.completed_at is null
        and least(5, objective_progress.current + 1) = 5
        and (select count(distinct mode_name) from unnest(objective_progress.completed_modes || array[requested_mode]) mode_name) = 3
      then settlement_time else objective_progress.completed_at end,
    updated_at = settlement_time
  returning * into progress_row;
  if progress_row.completed_at = settlement_time then
    objective_credits := objective_credits + 350;
  end if;

  insert into public.rivalry_road_progress (user_id)
  values (requesting_user_id)
  on conflict (user_id) do nothing;
  select * into road from public.rivalry_road_progress progress
  where progress.user_id = requesting_user_id for update;

  if road.status = 'in-progress' and (
    (road.current_step_index = 0 and requested_mode = 'nhl-circuit') or
    (road.current_step_index = 1 and requested_mode = 'pwhl-circuit') or
    (road.current_step_index = 2 and requested_mode = 'open-ice'
      and requested_outcome = 'win' and requested_difficulty in ('pro', 'elite'))
  ) then
    if road.current_step_index in (0, 1) then rivalry_credits := 150; end if;
    update public.rivalry_road_progress progress set
      completed_step_ids = progress.completed_step_ids || case road.current_step_index
        when 0 then 'nhl-circuit-complete'
        when 1 then 'pwhl-circuit-complete'
        else 'open-ice-pro-win'
      end,
      current_step_index = road.current_step_index + 1,
      status = case when road.current_step_index = 2 then 'choice-pending' else 'in-progress' end,
      updated_at = settlement_time
    where progress.user_id = requesting_user_id;
  end if;

  total_credits := base_credits + objective_credits + rivalry_credits;
  insert into public.match_rewards (
    match_id, user_id, match_credits, objective_credits, rivalry_credits,
    rule_version, breakdown
  ) values (
    created_match_id, requesting_user_id, base_credits, objective_credits, rivalry_credits,
    rule_version, jsonb_build_object(
      'match', base_credits, 'objectives', objective_credits,
      'rivalry_road', rivalry_credits, 'ticket_id', ticket.id
    )
  );

  update public.profiles profiles set
    credits = profiles.credits + total_credits,
    completed_matches = profiles.completed_matches + 1,
    updated_at = settlement_time
  where profiles.id = requesting_user_id
  returning profiles.credits, profiles.completed_matches
    into profile_credits, profile_completed_matches;

  update public.match_tickets tickets
  set status = 'settled', outcome = requested_outcome, settled_at = settlement_time
  where tickets.id = ticket.id and tickets.user_id = requesting_user_id;

  return jsonb_build_object(
    'status', 'settled',
    'match_id', created_match_id,
    'reward_credits', total_credits,
    'match_credits', base_credits,
    'objective_credits', objective_credits,
    'rivalry_credits', rivalry_credits,
    'credits', profile_credits,
    'completed_matches', profile_completed_matches
  );
end;
$$;

revoke all on function public.settle_match(text) from public, anon;
grant execute on function public.settle_match(text) to authenticated;

-- BEGIN GENERATED CARD CATALOG
insert into public.card_catalog (card_id, player_id, league, eligible_positions, role, overall, attributes, price, set_id, card_type, is_permanent, is_reward_only, is_active, available_from, available_to)
select seeded.card_id, seeded.player_id, seeded.league, seeded.eligible_positions, seeded.role, seeded.overall, seeded.attributes, seeded.price, seeded.set_id, seeded.card_type, seeded.is_permanent, seeded.is_reward_only, seeded.is_active, seeded.available_from, seeded.available_to
from jsonb_to_recordset($card_catalog$[{"card_id":"nhl-kirill-kaprizov-base","player_id":"nhl-kirill-kaprizov","league":"NHL","eligible_positions":["LW"],"role":"skater","overall":93,"attributes":{"speed":95,"shooting":94,"passing":91,"puckControl":95,"defense":84,"physicality":84,"hockeyIq":94,"clutch":92},"price":1075,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-artemi-panarin-base","player_id":"nhl-artemi-panarin","league":"NHL","eligible_positions":["LW"],"role":"skater","overall":92,"attributes":{"speed":91,"shooting":92,"passing":96,"puckControl":95,"defense":81,"physicality":72,"hockeyIq":95,"clutch":91},"price":950,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-brady-tkachuk-base","player_id":"nhl-brady-tkachuk","league":"NHL","eligible_positions":["LW"],"role":"skater","overall":91,"attributes":{"speed":86,"shooting":91,"passing":85,"puckControl":88,"defense":86,"physicality":97,"hockeyIq":89,"clutch":93},"price":825,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-connor-mcdavid-base","player_id":"nhl-connor-mcdavid","league":"NHL","eligible_positions":["C"],"role":"skater","overall":96,"attributes":{"speed":99,"shooting":95,"passing":98,"puckControl":99,"defense":86,"physicality":82,"hockeyIq":98,"clutch":97},"price":1450,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-nathan-mackinnon-base","player_id":"nhl-nathan-mackinnon","league":"NHL","eligible_positions":["C"],"role":"skater","overall":95,"attributes":{"speed":97,"shooting":96,"passing":94,"puckControl":96,"defense":86,"physicality":94,"hockeyIq":96,"clutch":96},"price":1325,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-auston-matthews-base","player_id":"nhl-auston-matthews","league":"NHL","eligible_positions":["C"],"role":"skater","overall":94,"attributes":{"speed":91,"shooting":99,"passing":90,"puckControl":94,"defense":92,"physicality":88,"hockeyIq":96,"clutch":95},"price":1200,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-nikita-kucherov-base","player_id":"nhl-nikita-kucherov","league":"NHL","eligible_positions":["RW"],"role":"skater","overall":95,"attributes":{"speed":93,"shooting":96,"passing":99,"puckControl":98,"defense":82,"physicality":76,"hockeyIq":99,"clutch":96},"price":1325,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-david-pastrnak-base","player_id":"nhl-david-pastrnak","league":"NHL","eligible_positions":["RW"],"role":"skater","overall":94,"attributes":{"speed":92,"shooting":98,"passing":92,"puckControl":96,"defense":80,"physicality":80,"hockeyIq":95,"clutch":95},"price":1200,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-mikko-rantanen-base","player_id":"nhl-mikko-rantanen","league":"NHL","eligible_positions":["RW"],"role":"skater","overall":93,"attributes":{"speed":89,"shooting":95,"passing":93,"puckControl":94,"defense":85,"physicality":92,"hockeyIq":94,"clutch":94},"price":1075,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-quinn-hughes-base","player_id":"nhl-quinn-hughes","league":"NHL","eligible_positions":["LD"],"role":"skater","overall":94,"attributes":{"speed":96,"shooting":88,"passing":98,"puckControl":98,"defense":92,"physicality":79,"hockeyIq":98,"clutch":93},"price":1200,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-rasmus-dahlin-base","player_id":"nhl-rasmus-dahlin","league":"NHL","eligible_positions":["LD"],"role":"skater","overall":90,"attributes":{"speed":89,"shooting":88,"passing":91,"puckControl":91,"defense":93,"physicality":91,"hockeyIq":92,"clutch":89},"price":700,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-josh-morrissey-base","player_id":"nhl-josh-morrissey","league":"NHL","eligible_positions":["LD"],"role":"skater","overall":91,"attributes":{"speed":91,"shooting":86,"passing":93,"puckControl":91,"defense":93,"physicality":87,"hockeyIq":94,"clutch":91},"price":825,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-cale-makar-base","player_id":"nhl-cale-makar","league":"NHL","eligible_positions":["RD"],"role":"skater","overall":95,"attributes":{"speed":97,"shooting":92,"passing":97,"puckControl":98,"defense":94,"physicality":86,"hockeyIq":98,"clutch":96},"price":1325,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-adam-fox-base","player_id":"nhl-adam-fox","league":"NHL","eligible_positions":["RD"],"role":"skater","overall":93,"attributes":{"speed":90,"shooting":85,"passing":97,"puckControl":95,"defense":95,"physicality":82,"hockeyIq":98,"clutch":92},"price":1075,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-evan-bouchard-base","player_id":"nhl-evan-bouchard","league":"NHL","eligible_positions":["RD"],"role":"skater","overall":92,"attributes":{"speed":87,"shooting":96,"passing":94,"puckControl":90,"defense":89,"physicality":91,"hockeyIq":92,"clutch":94},"price":950,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-connor-hellebuyck-base","player_id":"nhl-connor-hellebuyck","league":"NHL","eligible_positions":["G"],"role":"goalie","overall":96,"attributes":{"reflexes":96,"positioning":99,"glove":96,"blocker":96,"reboundControl":97,"puckHandling":88,"consistency":99,"clutch":97},"price":1450,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-igor-shesterkin-base","player_id":"nhl-igor-shesterkin","league":"NHL","eligible_positions":["G"],"role":"goalie","overall":94,"attributes":{"reflexes":98,"positioning":94,"glove":97,"blocker":95,"reboundControl":93,"puckHandling":94,"consistency":93,"clutch":95},"price":1200,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-andrei-vasilevskiy-base","player_id":"nhl-andrei-vasilevskiy","league":"NHL","eligible_positions":["G"],"role":"goalie","overall":93,"attributes":{"reflexes":95,"positioning":94,"glove":94,"blocker":95,"reboundControl":93,"puckHandling":89,"consistency":92,"clutch":97},"price":1075,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-sarah-nurse-base","player_id":"pwhl-sarah-nurse","league":"PWHL","eligible_positions":["LW"],"role":"skater","overall":91,"attributes":{"speed":93,"shooting":91,"passing":92,"puckControl":93,"defense":85,"physicality":84,"hockeyIq":92,"clutch":92},"price":825,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-kendall-coyne-schofield-base","player_id":"pwhl-kendall-coyne-schofield","league":"PWHL","eligible_positions":["LW"],"role":"skater","overall":93,"attributes":{"speed":99,"shooting":92,"passing":93,"puckControl":96,"defense":85,"physicality":76,"hockeyIq":94,"clutch":94},"price":1075,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-emma-maltais-base","player_id":"pwhl-emma-maltais","league":"PWHL","eligible_positions":["LW"],"role":"skater","overall":90,"attributes":{"speed":92,"shooting":86,"passing":90,"puckControl":91,"defense":88,"physicality":86,"hockeyIq":92,"clutch":89},"price":700,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-marie-philip-poulin-base","player_id":"pwhl-marie-philip-poulin","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":96,"attributes":{"speed":93,"shooting":97,"passing":97,"puckControl":98,"defense":92,"physicality":89,"hockeyIq":99,"clutch":99},"price":1450,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-taylor-heise-base","player_id":"pwhl-taylor-heise","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":94,"attributes":{"speed":96,"shooting":95,"passing":96,"puckControl":98,"defense":84,"physicality":84,"hockeyIq":95,"clutch":94},"price":1200,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-alex-carpenter-base","player_id":"pwhl-alex-carpenter","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":93,"attributes":{"speed":91,"shooting":95,"passing":96,"puckControl":95,"defense":86,"physicality":79,"hockeyIq":97,"clutch":95},"price":1075,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-hilary-knight-base","player_id":"pwhl-hilary-knight","league":"PWHL","eligible_positions":["RW"],"role":"skater","overall":94,"attributes":{"speed":90,"shooting":98,"passing":91,"puckControl":94,"defense":83,"physicality":95,"hockeyIq":95,"clutch":97},"price":1200,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-natalie-spooner-base","player_id":"pwhl-natalie-spooner","league":"PWHL","eligible_positions":["RW"],"role":"skater","overall":95,"attributes":{"speed":92,"shooting":99,"passing":90,"puckControl":95,"defense":82,"physicality":93,"hockeyIq":96,"clutch":96},"price":1325,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-daryl-watts-base","player_id":"pwhl-daryl-watts","league":"PWHL","eligible_positions":["RW"],"role":"skater","overall":92,"attributes":{"speed":92,"shooting":94,"passing":96,"puckControl":97,"defense":78,"physicality":75,"hockeyIq":95,"clutch":93},"price":950,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-megan-keller-base","player_id":"pwhl-megan-keller","league":"PWHL","eligible_positions":["LD"],"role":"skater","overall":92,"attributes":{"speed":90,"shooting":88,"passing":94,"puckControl":91,"defense":94,"physicality":92,"hockeyIq":95,"clutch":92},"price":950,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-ella-shelton-base","player_id":"pwhl-ella-shelton","league":"PWHL","eligible_positions":["LD"],"role":"skater","overall":91,"attributes":{"speed":91,"shooting":90,"passing":94,"puckControl":93,"defense":89,"physicality":82,"hockeyIq":94,"clutch":91},"price":825,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-claire-thompson-base","player_id":"pwhl-claire-thompson","league":"PWHL","eligible_positions":["LD"],"role":"skater","overall":93,"attributes":{"speed":94,"shooting":91,"passing":97,"puckControl":95,"defense":92,"physicality":82,"hockeyIq":97,"clutch":93},"price":1075,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-erin-ambrose-base","player_id":"pwhl-erin-ambrose","league":"PWHL","eligible_positions":["RD"],"role":"skater","overall":94,"attributes":{"speed":91,"shooting":92,"passing":98,"puckControl":96,"defense":93,"physicality":83,"hockeyIq":98,"clutch":95},"price":1200,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-renata-fast-base","player_id":"pwhl-renata-fast","league":"PWHL","eligible_positions":["RD"],"role":"skater","overall":92,"attributes":{"speed":92,"shooting":82,"passing":90,"puckControl":89,"defense":96,"physicality":92,"hockeyIq":96,"clutch":92},"price":950,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-sophie-jaques-base","player_id":"pwhl-sophie-jaques","league":"PWHL","eligible_positions":["RD"],"role":"skater","overall":91,"attributes":{"speed":89,"shooting":95,"passing":91,"puckControl":90,"defense":88,"physicality":86,"hockeyIq":92,"clutch":91},"price":825,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-aerin-frankel-base","player_id":"pwhl-aerin-frankel","league":"PWHL","eligible_positions":["G"],"role":"goalie","overall":94,"attributes":{"reflexes":98,"positioning":94,"glove":97,"blocker":95,"reboundControl":93,"puckHandling":89,"consistency":95,"clutch":96},"price":1200,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-ann-renee-desbiens-base","player_id":"pwhl-ann-renee-desbiens","league":"PWHL","eligible_positions":["G"],"role":"goalie","overall":95,"attributes":{"reflexes":96,"positioning":98,"glove":96,"blocker":96,"reboundControl":97,"puckHandling":88,"consistency":97,"clutch":99},"price":1325,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"pwhl-kristen-campbell-base","player_id":"pwhl-kristen-campbell","league":"PWHL","eligible_positions":["G"],"role":"goalie","overall":93,"attributes":{"reflexes":94,"positioning":96,"glove":93,"blocker":94,"reboundControl":95,"puckHandling":90,"consistency":96,"clutch":93},"price":1075,"set_id":"base-2026","card_type":"base","is_permanent":true,"is_reward_only":false,"is_active":true,"available_from":null,"available_to":null},{"card_id":"nhl-brady-tkachuk-frozen-frights","player_id":"nhl-brady-tkachuk","league":"NHL","eligible_positions":["LW"],"role":"skater","overall":90,"attributes":{"speed":82,"shooting":91,"passing":85,"puckControl":86,"defense":91,"physicality":99,"hockeyIq":89,"clutch":93},"price":1900,"set_id":"frozen-frights","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-rasmus-dahlin-frozen-frights","player_id":"nhl-rasmus-dahlin","league":"NHL","eligible_positions":["LD"],"role":"skater","overall":90,"attributes":{"speed":85,"shooting":88,"passing":91,"puckControl":89,"defense":98,"physicality":97,"hockeyIq":92,"clutch":89},"price":1950,"set_id":"frozen-frights","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-igor-shesterkin-frozen-frights","player_id":"nhl-igor-shesterkin","league":"NHL","eligible_positions":["G"],"role":"goalie","overall":93,"attributes":{"reflexes":96,"positioning":99,"glove":97,"blocker":95,"reboundControl":93,"puckHandling":89,"consistency":98,"clutch":95},"price":2100,"set_id":"frozen-frights","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-emma-maltais-frozen-frights","player_id":"pwhl-emma-maltais","league":"PWHL","eligible_positions":["LW"],"role":"skater","overall":90,"attributes":{"speed":88,"shooting":86,"passing":90,"puckControl":89,"defense":93,"physicality":92,"hockeyIq":92,"clutch":89},"price":1850,"set_id":"frozen-frights","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-renata-fast-frozen-frights","player_id":"pwhl-renata-fast","league":"PWHL","eligible_positions":["RD"],"role":"skater","overall":91,"attributes":{"speed":88,"shooting":82,"passing":90,"puckControl":87,"defense":99,"physicality":98,"hockeyIq":96,"clutch":92},"price":1950,"set_id":"frozen-frights","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-kristen-campbell-frozen-frights","player_id":"pwhl-kristen-campbell","league":"PWHL","eligible_positions":["G"],"role":"goalie","overall":93,"attributes":{"reflexes":92,"positioning":99,"glove":93,"blocker":94,"reboundControl":95,"puckHandling":85,"consistency":99,"clutch":93},"price":2050,"set_id":"frozen-frights","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-connor-mcdavid-signature-series","player_id":"nhl-connor-mcdavid","league":"NHL","eligible_positions":["C"],"role":"skater","overall":96,"attributes":{"speed":99,"shooting":95,"passing":99,"puckControl":99,"defense":84,"physicality":79,"hockeyIq":99,"clutch":97},"price":2350,"set_id":"signature-series","card_type":"signature","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-david-pastrnak-signature-series","player_id":"nhl-david-pastrnak","league":"NHL","eligible_positions":["RW"],"role":"skater","overall":95,"attributes":{"speed":92,"shooting":98,"passing":96,"puckControl":96,"defense":78,"physicality":77,"hockeyIq":99,"clutch":95},"price":2250,"set_id":"signature-series","card_type":"signature","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-cale-makar-signature-series","player_id":"nhl-cale-makar","league":"NHL","eligible_positions":["RD"],"role":"skater","overall":95,"attributes":{"speed":97,"shooting":92,"passing":99,"puckControl":98,"defense":92,"physicality":83,"hockeyIq":99,"clutch":96},"price":2300,"set_id":"signature-series","card_type":"signature","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-marie-philip-poulin-signature-series","player_id":"pwhl-marie-philip-poulin","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":97,"attributes":{"speed":93,"shooting":97,"passing":99,"puckControl":98,"defense":90,"physicality":86,"hockeyIq":99,"clutch":99},"price":2350,"set_id":"signature-series","card_type":"signature","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-hilary-knight-signature-series","player_id":"pwhl-hilary-knight","league":"PWHL","eligible_positions":["RW"],"role":"skater","overall":94,"attributes":{"speed":90,"shooting":98,"passing":95,"puckControl":94,"defense":81,"physicality":92,"hockeyIq":99,"clutch":97},"price":2250,"set_id":"signature-series","card_type":"signature","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-erin-ambrose-signature-series","player_id":"pwhl-erin-ambrose","league":"PWHL","eligible_positions":["RD"],"role":"skater","overall":95,"attributes":{"speed":91,"shooting":92,"passing":99,"puckControl":96,"defense":91,"physicality":80,"hockeyIq":99,"clutch":95},"price":2300,"set_id":"signature-series","card_type":"signature","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-artemi-panarin-winter-holidays","player_id":"nhl-artemi-panarin","league":"NHL","eligible_positions":["LW"],"role":"skater","overall":92,"attributes":{"speed":91,"shooting":92,"passing":99,"puckControl":99,"defense":79,"physicality":68,"hockeyIq":95,"clutch":91},"price":2050,"set_id":"winter-holidays","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-josh-morrissey-winter-holidays","player_id":"nhl-josh-morrissey","league":"NHL","eligible_positions":["LD"],"role":"skater","overall":90,"attributes":{"speed":91,"shooting":86,"passing":99,"puckControl":95,"defense":91,"physicality":83,"hockeyIq":94,"clutch":91},"price":1950,"set_id":"winter-holidays","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-andrei-vasilevskiy-winter-holidays","player_id":"nhl-andrei-vasilevskiy","league":"NHL","eligible_positions":["G"],"role":"goalie","overall":94,"attributes":{"reflexes":95,"positioning":92,"glove":94,"blocker":92,"reboundControl":97,"puckHandling":95,"consistency":92,"clutch":97},"price":2150,"set_id":"winter-holidays","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-sarah-nurse-winter-holidays","player_id":"pwhl-sarah-nurse","league":"PWHL","eligible_positions":["LW"],"role":"skater","overall":91,"attributes":{"speed":93,"shooting":91,"passing":98,"puckControl":97,"defense":83,"physicality":80,"hockeyIq":92,"clutch":92},"price":1950,"set_id":"winter-holidays","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-ella-shelton-winter-holidays","player_id":"pwhl-ella-shelton","league":"PWHL","eligible_positions":["LD"],"role":"skater","overall":90,"attributes":{"speed":91,"shooting":90,"passing":99,"puckControl":97,"defense":87,"physicality":78,"hockeyIq":94,"clutch":91},"price":1900,"set_id":"winter-holidays","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-aerin-frankel-winter-holidays","player_id":"pwhl-aerin-frankel","league":"PWHL","eligible_positions":["G"],"role":"goalie","overall":95,"attributes":{"reflexes":98,"positioning":92,"glove":97,"blocker":92,"reboundControl":97,"puckHandling":95,"consistency":95,"clutch":96},"price":2150,"set_id":"winter-holidays","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-nathan-mackinnon-winter-classic","player_id":"nhl-nathan-mackinnon","league":"NHL","eligible_positions":["C"],"role":"skater","overall":96,"attributes":{"speed":97,"shooting":96,"passing":92,"puckControl":92,"defense":86,"physicality":99,"hockeyIq":96,"clutch":99},"price":2250,"set_id":"winter-classic","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-mikko-rantanen-winter-classic","player_id":"nhl-mikko-rantanen","league":"NHL","eligible_positions":["RW"],"role":"skater","overall":93,"attributes":{"speed":89,"shooting":95,"passing":91,"puckControl":90,"defense":85,"physicality":97,"hockeyIq":94,"clutch":99},"price":2100,"set_id":"winter-classic","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-evan-bouchard-winter-classic","player_id":"nhl-evan-bouchard","league":"NHL","eligible_positions":["RD"],"role":"skater","overall":91,"attributes":{"speed":87,"shooting":96,"passing":92,"puckControl":86,"defense":89,"physicality":96,"hockeyIq":92,"clutch":99},"price":2050,"set_id":"winter-classic","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-taylor-heise-winter-classic","player_id":"pwhl-taylor-heise","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":95,"attributes":{"speed":96,"shooting":95,"passing":94,"puckControl":94,"defense":84,"physicality":89,"hockeyIq":95,"clutch":99},"price":2200,"set_id":"winter-classic","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-natalie-spooner-winter-classic","player_id":"pwhl-natalie-spooner","league":"PWHL","eligible_positions":["RW"],"role":"skater","overall":95,"attributes":{"speed":92,"shooting":99,"passing":88,"puckControl":91,"defense":82,"physicality":98,"hockeyIq":96,"clutch":99},"price":2200,"set_id":"winter-classic","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-sophie-jaques-winter-classic","player_id":"pwhl-sophie-jaques","league":"PWHL","eligible_positions":["RD"],"role":"skater","overall":90,"attributes":{"speed":89,"shooting":95,"passing":89,"puckControl":86,"defense":88,"physicality":91,"hockeyIq":92,"clutch":96},"price":2000,"set_id":"winter-classic","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-kirill-kaprizov-international-ice","player_id":"nhl-kirill-kaprizov","league":"NHL","eligible_positions":["LW"],"role":"skater","overall":93,"attributes":{"speed":99,"shooting":94,"passing":96,"puckControl":95,"defense":82,"physicality":79,"hockeyIq":94,"clutch":92},"price":2150,"set_id":"international-ice","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-nikita-kucherov-international-ice","player_id":"nhl-nikita-kucherov","league":"NHL","eligible_positions":["RW"],"role":"skater","overall":96,"attributes":{"speed":98,"shooting":96,"passing":99,"puckControl":98,"defense":80,"physicality":71,"hockeyIq":99,"clutch":96},"price":2250,"set_id":"international-ice","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-quinn-hughes-international-ice","player_id":"nhl-quinn-hughes","league":"NHL","eligible_positions":["LD"],"role":"skater","overall":94,"attributes":{"speed":99,"shooting":88,"passing":99,"puckControl":98,"defense":90,"physicality":74,"hockeyIq":98,"clutch":93},"price":2200,"set_id":"international-ice","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-kendall-coyne-schofield-international-ice","player_id":"pwhl-kendall-coyne-schofield","league":"PWHL","eligible_positions":["LW"],"role":"skater","overall":92,"attributes":{"speed":99,"shooting":92,"passing":98,"puckControl":96,"defense":83,"physicality":71,"hockeyIq":94,"clutch":94},"price":2100,"set_id":"international-ice","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-alex-carpenter-international-ice","player_id":"pwhl-alex-carpenter","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":93,"attributes":{"speed":96,"shooting":95,"passing":99,"puckControl":95,"defense":84,"physicality":74,"hockeyIq":97,"clutch":95},"price":2050,"set_id":"international-ice","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-claire-thompson-international-ice","player_id":"pwhl-claire-thompson","league":"PWHL","eligible_positions":["LD"],"role":"skater","overall":94,"attributes":{"speed":99,"shooting":91,"passing":99,"puckControl":95,"defense":90,"physicality":77,"hockeyIq":97,"clutch":93},"price":2200,"set_id":"international-ice","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-auston-matthews-rising-stars","player_id":"nhl-auston-matthews","league":"NHL","eligible_positions":["C"],"role":"skater","overall":93,"attributes":{"speed":95,"shooting":99,"passing":90,"puckControl":99,"defense":88,"physicality":88,"hockeyIq":94,"clutch":95},"price":2100,"set_id":"rising-stars","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-josh-morrissey-rising-stars","player_id":"nhl-josh-morrissey","league":"NHL","eligible_positions":["LD"],"role":"skater","overall":91,"attributes":{"speed":95,"shooting":86,"passing":93,"puckControl":97,"defense":89,"physicality":87,"hockeyIq":92,"clutch":91},"price":1900,"set_id":"rising-stars","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-evan-bouchard-rising-stars","player_id":"nhl-evan-bouchard","league":"NHL","eligible_positions":["RD"],"role":"skater","overall":93,"attributes":{"speed":91,"shooting":96,"passing":94,"puckControl":96,"defense":85,"physicality":91,"hockeyIq":90,"clutch":94},"price":2050,"set_id":"rising-stars","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-taylor-heise-rising-stars","player_id":"pwhl-taylor-heise","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":93,"attributes":{"speed":99,"shooting":95,"passing":96,"puckControl":99,"defense":80,"physicality":84,"hockeyIq":93,"clutch":94},"price":2050,"set_id":"rising-stars","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-daryl-watts-rising-stars","player_id":"pwhl-daryl-watts","league":"PWHL","eligible_positions":["RW"],"role":"skater","overall":92,"attributes":{"speed":96,"shooting":94,"passing":96,"puckControl":99,"defense":74,"physicality":75,"hockeyIq":93,"clutch":93},"price":1900,"set_id":"rising-stars","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-ella-shelton-rising-stars","player_id":"pwhl-ella-shelton","league":"PWHL","eligible_positions":["LD"],"role":"skater","overall":92,"attributes":{"speed":95,"shooting":90,"passing":94,"puckControl":99,"defense":85,"physicality":82,"hockeyIq":92,"clutch":91},"price":1850,"set_id":"rising-stars","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-connor-mcdavid-playoff-heroes","player_id":"nhl-connor-mcdavid","league":"NHL","eligible_positions":["C"],"role":"skater","overall":97,"attributes":{"speed":96,"shooting":95,"passing":98,"puckControl":96,"defense":90,"physicality":82,"hockeyIq":98,"clutch":99},"price":2400,"set_id":"playoff-heroes","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-mikko-rantanen-playoff-heroes","player_id":"nhl-mikko-rantanen","league":"NHL","eligible_positions":["RW"],"role":"skater","overall":93,"attributes":{"speed":86,"shooting":95,"passing":93,"puckControl":91,"defense":89,"physicality":92,"hockeyIq":94,"clutch":99},"price":2200,"set_id":"playoff-heroes","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-connor-hellebuyck-playoff-heroes","player_id":"nhl-connor-hellebuyck","league":"NHL","eligible_positions":["G"],"role":"goalie","overall":97,"attributes":{"reflexes":94,"positioning":99,"glove":96,"blocker":96,"reboundControl":97,"puckHandling":83,"consistency":99,"clutch":99},"price":2400,"set_id":"playoff-heroes","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-marie-philip-poulin-playoff-heroes","player_id":"pwhl-marie-philip-poulin","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":95,"attributes":{"speed":90,"shooting":97,"passing":97,"puckControl":95,"defense":96,"physicality":89,"hockeyIq":99,"clutch":99},"price":2300,"set_id":"playoff-heroes","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-hilary-knight-playoff-heroes","player_id":"pwhl-hilary-knight","league":"PWHL","eligible_positions":["RW"],"role":"skater","overall":94,"attributes":{"speed":87,"shooting":98,"passing":91,"puckControl":91,"defense":87,"physicality":95,"hockeyIq":95,"clutch":99},"price":2200,"set_id":"playoff-heroes","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-ann-renee-desbiens-playoff-heroes","player_id":"pwhl-ann-renee-desbiens","league":"PWHL","eligible_positions":["G"],"role":"goalie","overall":94,"attributes":{"reflexes":94,"positioning":99,"glove":96,"blocker":96,"reboundControl":97,"puckHandling":83,"consistency":97,"clutch":99},"price":2300,"set_id":"playoff-heroes","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-artemi-panarin-franchise-icons","player_id":"nhl-artemi-panarin","league":"NHL","eligible_positions":["LW"],"role":"skater","overall":92,"attributes":{"speed":87,"shooting":90,"passing":99,"puckControl":95,"defense":81,"physicality":72,"hockeyIq":99,"clutch":91},"price":2250,"set_id":"franchise-icons","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-auston-matthews-franchise-icons","player_id":"nhl-auston-matthews","league":"NHL","eligible_positions":["C"],"role":"skater","overall":94,"attributes":{"speed":87,"shooting":97,"passing":93,"puckControl":94,"defense":92,"physicality":88,"hockeyIq":99,"clutch":95},"price":2350,"set_id":"franchise-icons","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-adam-fox-franchise-icons","player_id":"nhl-adam-fox","league":"NHL","eligible_positions":["RD"],"role":"skater","overall":93,"attributes":{"speed":86,"shooting":83,"passing":99,"puckControl":95,"defense":95,"physicality":82,"hockeyIq":99,"clutch":92},"price":2250,"set_id":"franchise-icons","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-sarah-nurse-franchise-icons","player_id":"pwhl-sarah-nurse","league":"PWHL","eligible_positions":["LW"],"role":"skater","overall":91,"attributes":{"speed":89,"shooting":89,"passing":95,"puckControl":93,"defense":85,"physicality":84,"hockeyIq":98,"clutch":92},"price":2200,"set_id":"franchise-icons","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-alex-carpenter-franchise-icons","player_id":"pwhl-alex-carpenter","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":93,"attributes":{"speed":87,"shooting":93,"passing":99,"puckControl":95,"defense":86,"physicality":79,"hockeyIq":99,"clutch":95},"price":2250,"set_id":"franchise-icons","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-megan-keller-franchise-icons","player_id":"pwhl-megan-keller","league":"PWHL","eligible_positions":["LD"],"role":"skater","overall":92,"attributes":{"speed":86,"shooting":86,"passing":97,"puckControl":91,"defense":94,"physicality":92,"hockeyIq":99,"clutch":92},"price":2250,"set_id":"franchise-icons","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-nikita-kucherov-record-breakers","player_id":"nhl-nikita-kucherov","league":"NHL","eligible_positions":["RW"],"role":"skater","overall":96,"attributes":{"speed":96,"shooting":99,"passing":99,"puckControl":98,"defense":77,"physicality":73,"hockeyIq":99,"clutch":96},"price":2350,"set_id":"record-breakers","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-david-pastrnak-record-breakers","player_id":"nhl-david-pastrnak","league":"NHL","eligible_positions":["RW"],"role":"skater","overall":93,"attributes":{"speed":95,"shooting":99,"passing":92,"puckControl":96,"defense":75,"physicality":77,"hockeyIq":95,"clutch":95},"price":2200,"set_id":"record-breakers","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-connor-hellebuyck-record-breakers","player_id":"nhl-connor-hellebuyck","league":"NHL","eligible_positions":["G"],"role":"goalie","overall":96,"attributes":{"reflexes":99,"positioning":99,"glove":99,"blocker":96,"reboundControl":93,"puckHandling":88,"consistency":96,"clutch":97},"price":2400,"set_id":"record-breakers","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-natalie-spooner-record-breakers","player_id":"pwhl-natalie-spooner","league":"PWHL","eligible_positions":["RW"],"role":"skater","overall":96,"attributes":{"speed":95,"shooting":99,"passing":90,"puckControl":95,"defense":77,"physicality":90,"hockeyIq":96,"clutch":96},"price":2300,"set_id":"record-breakers","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-kendall-coyne-schofield-record-breakers","player_id":"pwhl-kendall-coyne-schofield","league":"PWHL","eligible_positions":["LW"],"role":"skater","overall":92,"attributes":{"speed":99,"shooting":99,"passing":93,"puckControl":96,"defense":80,"physicality":73,"hockeyIq":94,"clutch":94},"price":2150,"set_id":"record-breakers","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-aerin-frankel-record-breakers","player_id":"pwhl-aerin-frankel","league":"PWHL","eligible_positions":["G"],"role":"goalie","overall":94,"attributes":{"reflexes":99,"positioning":94,"glove":99,"blocker":95,"reboundControl":89,"puckHandling":89,"consistency":92,"clutch":96},"price":2250,"set_id":"record-breakers","card_type":"elite","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-kirill-kaprizov-clutch-performers","player_id":"nhl-kirill-kaprizov","league":"NHL","eligible_positions":["LW"],"role":"skater","overall":93,"attributes":{"speed":93,"shooting":98,"passing":91,"puckControl":95,"defense":84,"physicality":80,"hockeyIq":94,"clutch":99},"price":2200,"set_id":"clutch-performers","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-nathan-mackinnon-clutch-performers","player_id":"nhl-nathan-mackinnon","league":"NHL","eligible_positions":["C"],"role":"skater","overall":96,"attributes":{"speed":95,"shooting":99,"passing":94,"puckControl":96,"defense":86,"physicality":90,"hockeyIq":96,"clutch":99},"price":2350,"set_id":"clutch-performers","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-cale-makar-clutch-performers","player_id":"nhl-cale-makar","league":"NHL","eligible_positions":["RD"],"role":"skater","overall":94,"attributes":{"speed":95,"shooting":96,"passing":97,"puckControl":98,"defense":94,"physicality":82,"hockeyIq":98,"clutch":99},"price":2250,"set_id":"clutch-performers","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-marie-philip-poulin-clutch-performers","player_id":"pwhl-marie-philip-poulin","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":96,"attributes":{"speed":91,"shooting":99,"passing":97,"puckControl":98,"defense":92,"physicality":85,"hockeyIq":99,"clutch":99},"price":2350,"set_id":"clutch-performers","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-erin-ambrose-clutch-performers","player_id":"pwhl-erin-ambrose","league":"PWHL","eligible_positions":["RD"],"role":"skater","overall":95,"attributes":{"speed":89,"shooting":96,"passing":98,"puckControl":96,"defense":93,"physicality":79,"hockeyIq":98,"clutch":99},"price":2250,"set_id":"clutch-performers","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"pwhl-ann-renee-desbiens-clutch-performers","player_id":"pwhl-ann-renee-desbiens","league":"PWHL","eligible_positions":["G"],"role":"goalie","overall":94,"attributes":{"reflexes":96,"positioning":99,"glove":96,"blocker":94,"reboundControl":97,"puckHandling":84,"consistency":97,"clutch":99},"price":2250,"set_id":"clutch-performers","card_type":"featured","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z"},{"card_id":"nhl-connor-mcdavid-rivalry-2026","player_id":"nhl-connor-mcdavid","league":"NHL","eligible_positions":["C"],"role":"skater","overall":97,"attributes":{"speed":99,"shooting":96,"passing":98,"puckControl":99,"defense":85,"physicality":84,"hockeyIq":99,"clutch":99},"price":2500,"set_id":"rivalry-series-2026","card_type":"featured","is_permanent":false,"is_reward_only":true,"is_active":true,"available_from":"2026-07-01T00:00:00.000Z","available_to":"2027-07-01T00:00:00.000Z"},{"card_id":"nhl-quinn-hughes-rivalry-2026","player_id":"nhl-quinn-hughes","league":"NHL","eligible_positions":["LD"],"role":"skater","overall":95,"attributes":{"speed":97,"shooting":89,"passing":99,"puckControl":99,"defense":92,"physicality":77,"hockeyIq":99,"clutch":95},"price":2250,"set_id":"rivalry-series-2026","card_type":"featured","is_permanent":false,"is_reward_only":true,"is_active":true,"available_from":"2026-07-01T00:00:00.000Z","available_to":"2027-07-01T00:00:00.000Z"},{"card_id":"nhl-david-pastrnak-rivalry-2026","player_id":"nhl-david-pastrnak","league":"NHL","eligible_positions":["RW"],"role":"skater","overall":95,"attributes":{"speed":93,"shooting":99,"passing":93,"puckControl":97,"defense":79,"physicality":81,"hockeyIq":96,"clutch":97},"price":2250,"set_id":"rivalry-series-2026","card_type":"featured","is_permanent":false,"is_reward_only":true,"is_active":true,"available_from":"2026-07-01T00:00:00.000Z","available_to":"2027-07-01T00:00:00.000Z"},{"card_id":"nhl-connor-hellebuyck-rivalry-2026","player_id":"nhl-connor-hellebuyck","league":"NHL","eligible_positions":["G"],"role":"goalie","overall":97,"attributes":{"reflexes":97,"positioning":99,"glove":97,"blocker":97,"reboundControl":98,"puckHandling":89,"consistency":99,"clutch":99},"price":2500,"set_id":"rivalry-series-2026","card_type":"featured","is_permanent":false,"is_reward_only":true,"is_active":true,"available_from":"2026-07-01T00:00:00.000Z","available_to":"2027-07-01T00:00:00.000Z"},{"card_id":"nhl-kirill-kaprizov-rivalry-2026","player_id":"nhl-kirill-kaprizov","league":"NHL","eligible_positions":["LW"],"role":"skater","overall":94,"attributes":{"speed":97,"shooting":95,"passing":92,"puckControl":97,"defense":81,"physicality":83,"hockeyIq":95,"clutch":95},"price":2125,"set_id":"rivalry-series-2026","card_type":"featured","is_permanent":false,"is_reward_only":true,"is_active":true,"available_from":"2026-07-01T00:00:00.000Z","available_to":"2027-07-01T00:00:00.000Z"},{"card_id":"pwhl-marie-philip-poulin-rivalry-2026","player_id":"pwhl-marie-philip-poulin","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":97,"attributes":{"speed":94,"shooting":98,"passing":97,"puckControl":98,"defense":95,"physicality":92,"hockeyIq":99,"clutch":99},"price":2500,"set_id":"rivalry-series-2026","card_type":"featured","is_permanent":false,"is_reward_only":true,"is_active":true,"available_from":"2026-07-01T00:00:00.000Z","available_to":"2027-07-01T00:00:00.000Z"},{"card_id":"pwhl-hilary-knight-rivalry-2026","player_id":"pwhl-hilary-knight","league":"PWHL","eligible_positions":["RW"],"role":"skater","overall":95,"attributes":{"speed":91,"shooting":98,"passing":91,"puckControl":94,"defense":88,"physicality":98,"hockeyIq":96,"clutch":99},"price":2250,"set_id":"rivalry-series-2026","card_type":"featured","is_permanent":false,"is_reward_only":true,"is_active":true,"available_from":"2026-07-01T00:00:00.000Z","available_to":"2027-07-01T00:00:00.000Z"},{"card_id":"pwhl-megan-keller-rivalry-2026","player_id":"pwhl-megan-keller","league":"PWHL","eligible_positions":["LD"],"role":"skater","overall":94,"attributes":{"speed":91,"shooting":89,"passing":94,"puckControl":92,"defense":97,"physicality":96,"hockeyIq":96,"clutch":94},"price":2125,"set_id":"rivalry-series-2026","card_type":"featured","is_permanent":false,"is_reward_only":true,"is_active":true,"available_from":"2026-07-01T00:00:00.000Z","available_to":"2027-07-01T00:00:00.000Z"},{"card_id":"pwhl-ann-renee-desbiens-rivalry-2026","player_id":"pwhl-ann-renee-desbiens","league":"PWHL","eligible_positions":["G"],"role":"goalie","overall":97,"attributes":{"reflexes":97,"positioning":99,"glove":97,"blocker":97,"reboundControl":98,"puckHandling":89,"consistency":99,"clutch":99},"price":2500,"set_id":"rivalry-series-2026","card_type":"featured","is_permanent":false,"is_reward_only":true,"is_active":true,"available_from":"2026-07-01T00:00:00.000Z","available_to":"2027-07-01T00:00:00.000Z"},{"card_id":"pwhl-kendall-coyne-schofield-rivalry-2026","player_id":"pwhl-kendall-coyne-schofield","league":"PWHL","eligible_positions":["LW"],"role":"skater","overall":94,"attributes":{"speed":99,"shooting":92,"passing":93,"puckControl":97,"defense":89,"physicality":80,"hockeyIq":95,"clutch":96},"price":2125,"set_id":"rivalry-series-2026","card_type":"featured","is_permanent":false,"is_reward_only":true,"is_active":true,"available_from":"2026-07-01T00:00:00.000Z","available_to":"2027-07-01T00:00:00.000Z"}]$card_catalog$::jsonb) as seeded(
  card_id text,
  player_id text,
  league text,
  eligible_positions text[],
  role text,
  overall integer,
  attributes jsonb,
  price integer,
  set_id text,
  card_type text,
  is_permanent boolean,
  is_reward_only boolean,
  is_active boolean,
  available_from timestamptz,
  available_to timestamptz
);
-- END GENERATED CARD CATALOG

insert into public.rivalry_reward_options (card_id, display_order) values
  ('nhl-kirill-kaprizov-rivalry-2026', 1),
  ('pwhl-kendall-coyne-schofield-rivalry-2026', 2);

update public.profiles profiles
set starter_lineup_id = (
  select lineups.id
  from public.lineups lineups
  where lineups.user_id = profiles.id and lineups.mode = 'nhl-circuit'
  order by lineups.created_at, lineups.id
  limit 1
)
where profiles.starter_claimed_at is not null
  and profiles.starter_lineup_id is null;

alter table public.profiles
  add constraint profiles_starter_lineup_user_fkey
  foreign key (starter_lineup_id, id)
  references public.lineups(id, user_id)
  deferrable initially deferred
  not valid;

alter table public.user_cards
  add constraint user_cards_catalog_card_fkey
  foreign key (card_id) references public.card_catalog(card_id)
  not valid;

alter table public.starter_team_cards
  add constraint starter_team_cards_catalog_card_fkey
  foreign key (card_id) references public.card_catalog(card_id)
  not valid;

alter table public.profiles validate constraint profiles_starter_lineup_user_fkey;
alter table public.user_cards validate constraint user_cards_catalog_card_fkey;
alter table public.starter_team_cards validate constraint starter_team_cards_catalog_card_fkey;
