-- Golden Rivalry adds shareable, server-authoritative ghost challenges without
-- changing the existing AI match ticket, round, or settlement contracts.

create table public.rivalry_challenges (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[0-9a-f]{32}$'),
  creator_user_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id text not null check (length(btrim(client_request_id)) between 1 and 200),
  source_kind text not null check (source_kind in ('ai-match', 'ghost-challenge')),
  source_ticket_id uuid references public.match_tickets(id) on delete set null,
  source_attempt_id uuid,
  creator_label text not null check (length(btrim(creator_label)) between 1 and 80),
  mode text not null check (mode in ('nhl-circuit', 'pwhl-circuit', 'open-ice')),
  difficulty text not null check (difficulty in ('rookie', 'pro', 'elite')),
  challenge_strength integer not null check (challenge_strength between 0 and 100),
  lineup_snapshot jsonb not null check (jsonb_typeof(lineup_snapshot) = 'object'),
  situations_snapshot jsonb not null check (
    jsonb_typeof(situations_snapshot) = 'array'
    and jsonb_array_length(situations_snapshot) = 5
  ),
  ghost_selections_snapshot jsonb not null check (
    jsonb_typeof(ghost_selections_snapshot) = 'array'
    and jsonb_array_length(ghost_selections_snapshot) = 5
  ),
  seed text not null check (length(seed) between 1 and 200),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  revoked_at timestamptz,
  unique (creator_user_id, client_request_id),
  check (expires_at > created_at),
  check (not (source_ticket_id is not null and source_attempt_id is not null))
);

create unique index rivalry_challenges_source_ticket_idx
  on public.rivalry_challenges (source_ticket_id)
  where source_ticket_id is not null;
create unique index rivalry_challenges_source_attempt_idx
  on public.rivalry_challenges (source_attempt_id)
  where source_attempt_id is not null;
create index rivalry_challenges_creator_created_idx
  on public.rivalry_challenges (creator_user_id, created_at desc);
create index rivalry_challenges_active_expiry_idx
  on public.rivalry_challenges (expires_at)
  where revoked_at is null;

create table public.rivalry_challenge_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  challenge_id uuid not null references public.rivalry_challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_match_id text not null check (length(btrim(client_match_id)) between 1 and 200),
  lineup_id uuid not null,
  lineup_snapshot jsonb not null check (jsonb_typeof(lineup_snapshot) = 'object'),
  seed text not null check (length(seed) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'settled', 'abandoned')),
  outcome text check (outcome in ('win', 'loss')),
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

alter table public.rivalry_challenges
  add constraint rivalry_challenges_source_attempt_fkey
  foreign key (source_attempt_id)
  references public.rivalry_challenge_attempts(id) on delete set null;

create unique index rivalry_challenge_attempts_one_open_idx
  on public.rivalry_challenge_attempts (user_id)
  where status = 'open';
create index rivalry_challenge_attempts_challenge_started_idx
  on public.rivalry_challenge_attempts (challenge_id, started_at desc);
create index rivalry_challenge_attempts_user_started_idx
  on public.rivalry_challenge_attempts (user_id, started_at desc);

create table public.rivalry_challenge_rounds (
  attempt_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  round_index integer not null check (round_index between 0 and 4),
  client_request_id text not null check (length(btrim(client_request_id)) between 1 and 200),
  situation_id text not null,
  player_card_id text not null references public.card_catalog(card_id) on delete restrict,
  player_slot text not null check (player_slot in ('LW', 'C', 'RW', 'LD', 'RD', 'G')),
  ghost_card_id text not null references public.card_catalog(card_id) on delete restrict,
  ghost_slot text not null check (ghost_slot in ('LW', 'C', 'RW', 'LD', 'RD', 'G')),
  player_score integer not null check (player_score between 0 and 100),
  ghost_score integer not null check (ghost_score between 0 and 100),
  winner text not null check (winner in ('player', 'opponent')),
  transcript jsonb not null check (jsonb_typeof(transcript) = 'object'),
  played_at timestamptz not null default clock_timestamp(),
  primary key (attempt_id, round_index),
  unique (user_id, client_request_id),
  foreign key (attempt_id, user_id)
    references public.rivalry_challenge_attempts(id, user_id) on delete cascade
);

create index rivalry_challenge_rounds_user_played_idx
  on public.rivalry_challenge_rounds (user_id, played_at desc);

alter table public.rivalry_challenges enable row level security;
alter table public.rivalry_challenge_attempts enable row level security;
alter table public.rivalry_challenge_rounds enable row level security;

create policy rivalry_challenges_select_own
  on public.rivalry_challenges for select to authenticated
  using ((select auth.uid()) = creator_user_id);
create policy rivalry_challenge_attempts_select_own
  on public.rivalry_challenge_attempts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy rivalry_challenge_rounds_select_own
  on public.rivalry_challenge_rounds for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.rivalry_challenges from public, anon, authenticated;
revoke all on table public.rivalry_challenge_attempts from public, anon, authenticated;
revoke all on table public.rivalry_challenge_rounds from public, anon, authenticated;
grant select on table public.rivalry_challenges to authenticated;
grant select on table public.rivalry_challenge_attempts to authenticated;
grant select on table public.rivalry_challenge_rounds to authenticated;

create or replace function public.rivalry_challenge_status(challenge public.rivalry_challenges)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when challenge.revoked_at is not null then 'revoked'
    when challenge.expires_at <= statement_timestamp() then 'expired'
    else 'active'
  end;
$$;

revoke all on function public.rivalry_challenge_status(public.rivalry_challenges)
  from public, anon, authenticated;

create or replace function public.create_rivalry_challenge(
  client_request_id text,
  source_client_match_id text,
  source_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_request_id text := btrim(create_rivalry_challenge.client_request_id);
  normalized_source_id text := btrim(create_rivalry_challenge.source_client_match_id);
  requested_source_kind text := create_rivalry_challenge.source_kind;
  profile public.profiles%rowtype;
  source_ticket public.match_tickets%rowtype;
  source_attempt public.rivalry_challenge_attempts%rowtype;
  parent_challenge public.rivalry_challenges%rowtype;
  existing_challenge public.rivalry_challenges%rowtype;
  challenge_id uuid;
  challenge_slug text;
  challenge_mode text;
  challenge_difficulty text;
  challenge_lineup jsonb;
  challenge_situations jsonb;
  ghost_selections jsonb;
  strength integer;
  challenge_expires_at timestamptz;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_request_id is null or length(normalized_request_id) not between 1 and 200 then
    raise exception 'A valid challenge request id is required.' using errcode = '22023';
  end if;
  if normalized_source_id is null or length(normalized_source_id) not between 1 and 200 then
    raise exception 'A valid source match id is required.' using errcode = '22023';
  end if;
  if requested_source_kind not in ('ai-match', 'ghost-challenge') then
    raise exception 'Invalid challenge source.' using errcode = '22023';
  end if;

  select * into profile from public.profiles profiles
  where profiles.id = requesting_user_id for update;
  if not found or not profile.onboarding_completed then
    raise exception 'Onboarding must be completed before creating a challenge.' using errcode = 'P0001';
  end if;

  if requested_source_kind = 'ai-match' then
    select * into source_ticket from public.match_tickets tickets
    where tickets.user_id = requesting_user_id
      and tickets.client_match_id = normalized_source_id
    for share;
    if not found or source_ticket.status <> 'settled' then
      raise exception 'A settled AI match is required to create a challenge.' using errcode = 'P0001';
    end if;
    challenge_mode := source_ticket.mode;
    challenge_difficulty := source_ticket.difficulty;
    challenge_lineup := source_ticket.lineup_snapshot;
    challenge_situations := source_ticket.situations_snapshot;
    select coalesce(jsonb_agg(jsonb_build_object(
      'round_index', rounds.round_index,
      'card_id', rounds.player_card_id,
      'slot', rounds.player_slot
    ) order by rounds.round_index), '[]'::jsonb)
    into ghost_selections
    from public.match_rounds rounds
    where rounds.ticket_id = source_ticket.id and rounds.user_id = requesting_user_id;
  else
    select * into source_attempt from public.rivalry_challenge_attempts attempts
    where attempts.user_id = requesting_user_id
      and attempts.client_match_id = normalized_source_id
    for share;
    if not found or source_attempt.status <> 'settled' then
      raise exception 'A settled Ghost Rivalry is required to create a challenge.' using errcode = 'P0001';
    end if;
    select * into parent_challenge from public.rivalry_challenges challenges
    where challenges.id = source_attempt.challenge_id;
    challenge_mode := parent_challenge.mode;
    challenge_difficulty := parent_challenge.difficulty;
    challenge_lineup := source_attempt.lineup_snapshot;
    challenge_situations := parent_challenge.situations_snapshot;
    select coalesce(jsonb_agg(jsonb_build_object(
      'round_index', rounds.round_index,
      'card_id', rounds.player_card_id,
      'slot', rounds.player_slot
    ) order by rounds.round_index), '[]'::jsonb)
    into ghost_selections
    from public.rivalry_challenge_rounds rounds
    where rounds.attempt_id = source_attempt.id and rounds.user_id = requesting_user_id;
  end if;

  if jsonb_array_length(ghost_selections) <> 5 then
    raise exception 'All five server rounds are required to create a challenge.' using errcode = 'P0001';
  end if;

  select coalesce(round(avg(catalog.overall)), 0)::integer into strength
  from jsonb_each_text(challenge_lineup -> 'slots') supplied(slot, card_id)
  join public.card_catalog catalog on catalog.card_id = supplied.card_id and catalog.is_active;
  if strength = 0 then
    raise exception 'Challenge lineup metadata is unavailable.' using errcode = 'P0002';
  end if;

  select * into existing_challenge from public.rivalry_challenges challenges
  where challenges.creator_user_id = requesting_user_id
    and challenges.client_request_id = normalized_request_id;
  if found then
    if existing_challenge.source_kind <> requested_source_kind
      or (requested_source_kind = 'ai-match' and existing_challenge.source_ticket_id <> source_ticket.id)
      or (requested_source_kind = 'ghost-challenge' and existing_challenge.source_attempt_id <> source_attempt.id) then
      raise exception 'Challenge request id was already used for different source data.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'status', 'already-created',
      'challenge_id', existing_challenge.id,
      'slug', existing_challenge.slug,
      'expires_at', existing_challenge.expires_at,
      'challenge_status', public.rivalry_challenge_status(existing_challenge)
    );
  end if;

  select * into existing_challenge from public.rivalry_challenges challenges
  where challenges.creator_user_id = requesting_user_id
    and (
      (requested_source_kind = 'ai-match' and challenges.source_ticket_id = source_ticket.id)
      or (requested_source_kind = 'ghost-challenge' and challenges.source_attempt_id = source_attempt.id)
    );
  if found then
    return jsonb_build_object(
      'status', 'already-created',
      'challenge_id', existing_challenge.id,
      'slug', existing_challenge.slug,
      'expires_at', existing_challenge.expires_at,
      'challenge_status', public.rivalry_challenge_status(existing_challenge)
    );
  end if;

  challenge_id := extensions.gen_random_uuid();
  challenge_slug := replace(extensions.gen_random_uuid()::text, '-', '');
  insert into public.rivalry_challenges (
    id, slug, creator_user_id, client_request_id, source_kind,
    source_ticket_id, source_attempt_id, creator_label, mode, difficulty,
    challenge_strength, lineup_snapshot, situations_snapshot,
    ghost_selections_snapshot, seed
  ) values (
    challenge_id, challenge_slug, requesting_user_id, normalized_request_id,
    requested_source_kind,
    case when requested_source_kind = 'ai-match' then source_ticket.id end,
    case when requested_source_kind = 'ghost-challenge' then source_attempt.id end,
    coalesce(nullif(btrim(profile.display_name), ''), 'A Rival'),
    challenge_mode, challenge_difficulty, strength, challenge_lineup,
    challenge_situations, ghost_selections, extensions.gen_random_uuid()::text
  )
  returning expires_at into challenge_expires_at;

  return jsonb_build_object(
    'status', 'created',
    'challenge_id', challenge_id,
    'slug', challenge_slug,
    'expires_at', challenge_expires_at,
    'challenge_status', 'active'
  );
end;
$$;

create or replace function public.get_public_rivalry_challenge(challenge_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  normalized_slug text := lower(btrim(get_public_rivalry_challenge.challenge_slug));
  challenge public.rivalry_challenges%rowtype;
  current_status text;
begin
  if normalized_slug is null or normalized_slug !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('status', 'missing');
  end if;
  select * into challenge from public.rivalry_challenges challenges
  where challenges.slug = normalized_slug;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  current_status := public.rivalry_challenge_status(challenge);
  return jsonb_build_object(
    'status', current_status,
    'slug', challenge.slug,
    'creator_label', challenge.creator_label,
    'mode', challenge.mode,
    'difficulty', challenge.difficulty,
    'challenge_strength', challenge.challenge_strength,
    'created_at', challenge.created_at,
    'expires_at', challenge.expires_at
  );
end;
$$;

create or replace function public.start_rivalry_challenge(
  challenge_slug text,
  client_match_id text,
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
  normalized_slug text := lower(btrim(start_rivalry_challenge.challenge_slug));
  normalized_match_id text := btrim(start_rivalry_challenge.client_match_id);
  profile public.profiles%rowtype;
  challenge public.rivalry_challenges%rowtype;
  player_lineup public.lineups%rowtype;
  lineup_snapshot jsonb;
  existing_attempt public.rivalry_challenge_attempts%rowtype;
  attempt_seed text;
  played_rounds jsonb;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_slug is null or normalized_slug !~ '^[0-9a-f]{32}$' then
    raise exception 'A valid challenge slug is required.' using errcode = '22023';
  end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200 then
    raise exception 'A valid client match id is required.' using errcode = '22023';
  end if;
  if start_rivalry_challenge.lineup_id is null then
    raise exception 'A lineup is required.' using errcode = '22023';
  end if;

  select * into profile from public.profiles profiles
  where profiles.id = requesting_user_id for update;
  if not found or not profile.onboarding_completed then
    raise exception 'Onboarding must be completed before accepting a challenge.' using errcode = 'P0001';
  end if;
  select * into challenge from public.rivalry_challenges challenges
  where challenges.slug = normalized_slug for share;
  if not found then
    raise exception 'Challenge not found.' using errcode = 'P0002';
  end if;
  if public.rivalry_challenge_status(challenge) <> 'active' then
    raise exception 'Challenge is no longer active.' using errcode = 'P0001';
  end if;
  if challenge.creator_user_id = requesting_user_id then
    raise exception 'You cannot accept your own Ghost Rivalry.' using errcode = 'P0001';
  end if;

  select * into existing_attempt from public.rivalry_challenge_attempts attempts
  where attempts.user_id = requesting_user_id
    and attempts.client_match_id = normalized_match_id;
  if found then
    if existing_attempt.challenge_id <> challenge.id
      or existing_attempt.lineup_id <> start_rivalry_challenge.lineup_id then
      raise exception 'Challenge match id was already used for different data.' using errcode = '22023';
    end if;
    if existing_attempt.status <> 'open' then
      raise exception 'Challenge match id is no longer active.' using errcode = 'P0001';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'status', 'already-played',
      'client_match_id', existing_attempt.client_match_id,
      'round_index', rounds.round_index,
      'situation_id', rounds.situation_id,
      'player_card_id', rounds.player_card_id,
      'player_slot', rounds.player_slot,
      'player_score', rounds.player_score,
      'opponent_card_id', rounds.ghost_card_id,
      'opponent_slot', rounds.ghost_slot,
      'opponent_score', rounds.ghost_score,
      'winner', rounds.winner,
      'tie_breaker', rounds.transcript ->> 'tie_breaker',
      'transcript', rounds.transcript
    ) order by rounds.round_index), '[]'::jsonb)
    into played_rounds
    from public.rivalry_challenge_rounds rounds
    where rounds.attempt_id = existing_attempt.id;
    return jsonb_build_object(
      'status', 'already-started',
      'client_match_id', existing_attempt.client_match_id,
      'seed', existing_attempt.seed,
      'lineup', existing_attempt.lineup_snapshot,
      'opponent_id', 'challenge:' || challenge.id::text,
      -- The challenge lineup is server-only until each authoritative reveal.
      -- Reuse the challenger's already-known slots as a structurally valid mask.
      'opponent', existing_attempt.lineup_snapshot || jsonb_build_object(
        'id', 'challenge:' || challenge.id::text,
        'name', challenge.creator_label || '''s Ghost'
      ),
      'situations', challenge.situations_snapshot,
      'rounds', played_rounds,
      'mode', challenge.mode,
      'difficulty', challenge.difficulty
    );
  end if;

  if exists (
    select 1 from public.rivalry_challenge_attempts attempts
    where attempts.user_id = requesting_user_id and attempts.status = 'open'
  ) then
    raise exception 'Another Ghost Rivalry is already in progress.' using errcode = 'P0001';
  end if;

  select * into player_lineup from public.lineups lineups
  where lineups.id = start_rivalry_challenge.lineup_id
    and lineups.user_id = requesting_user_id
  for share;
  if not found or player_lineup.mode <> challenge.mode or not player_lineup.is_active then
    raise exception 'An active lineup for the challenge mode is required.' using errcode = 'P0001';
  end if;
  lineup_snapshot := public.lineup_as_json(requesting_user_id, player_lineup.id);
  perform public.assert_valid_lineup(requesting_user_id, challenge.mode, lineup_snapshot -> 'slots');
  attempt_seed := extensions.gen_random_uuid()::text;

  insert into public.rivalry_challenge_attempts (
    challenge_id, user_id, client_match_id, lineup_id, lineup_snapshot, seed
  ) values (
    challenge.id, requesting_user_id, normalized_match_id,
    player_lineup.id, lineup_snapshot, attempt_seed
  );

  return jsonb_build_object(
    'status', 'started',
    'client_match_id', normalized_match_id,
    'seed', attempt_seed,
    'lineup', lineup_snapshot,
    'opponent_id', 'challenge:' || challenge.id::text,
    -- Never ship the creator's lineup snapshot before reveal. The client gets
    -- its own known slots as a mask and receives ghost identities round by round.
    'opponent', lineup_snapshot || jsonb_build_object(
      'id', 'challenge:' || challenge.id::text,
      'name', challenge.creator_label || '''s Ghost'
    ),
    'situations', challenge.situations_snapshot,
    'rounds', '[]'::jsonb,
    'mode', challenge.mode,
    'difficulty', challenge.difficulty
  );
end;
$$;

create or replace function public.play_rivalry_challenge_round(
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
  normalized_match_id text := btrim(play_rivalry_challenge_round.client_match_id);
  normalized_card_id text := btrim(play_rivalry_challenge_round.player_card_id);
  normalized_request_id text := btrim(play_rivalry_challenge_round.client_request_id);
  attempt public.rivalry_challenge_attempts%rowtype;
  challenge public.rivalry_challenges%rowtype;
  existing_round public.rivalry_challenge_rounds%rowtype;
  situation jsonb;
  ghost_selection jsonb;
  eligible_slots text[];
  player_slot text;
  ghost_slot text;
  ghost_card_id text;
  player_score jsonb;
  ghost_score jsonb;
  player_value integer;
  ghost_value integer;
  player_overall integer;
  ghost_overall integer;
  round_winner text;
  tie_breaker text;
  rounds_played integer;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200
    or normalized_card_id is null or length(normalized_card_id) not between 1 and 200
    or normalized_request_id is null or length(normalized_request_id) not between 1 and 200
    or play_rivalry_challenge_round.round_index is null
    or play_rivalry_challenge_round.round_index not between 0 and 4 then
    raise exception 'Invalid challenge round input.' using errcode = '22023';
  end if;

  perform 1 from public.profiles profiles
  where profiles.id = requesting_user_id for update;
  select * into attempt from public.rivalry_challenge_attempts attempts
  where attempts.user_id = requesting_user_id
    and attempts.client_match_id = normalized_match_id
  for update;
  if not found then
    raise exception 'A valid Ghost Rivalry attempt is required.' using errcode = 'P0001';
  end if;
  select * into challenge from public.rivalry_challenges challenges
  where challenges.id = attempt.challenge_id;

  select * into existing_round from public.rivalry_challenge_rounds rounds
  where rounds.user_id = requesting_user_id
    and rounds.client_request_id = normalized_request_id;
  if found then
    if existing_round.attempt_id <> attempt.id
      or existing_round.round_index <> play_rivalry_challenge_round.round_index
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
      'opponent_card_id', existing_round.ghost_card_id,
      'opponent_slot', existing_round.ghost_slot,
      'opponent_score', existing_round.ghost_score,
      'winner', existing_round.winner,
      'tie_breaker', existing_round.transcript ->> 'tie_breaker',
      'transcript', existing_round.transcript
    );
  end if;
  if attempt.status <> 'open' then
    raise exception 'Ghost Rivalry attempt is not open.' using errcode = 'P0001';
  end if;
  select count(*)::integer into rounds_played
  from public.rivalry_challenge_rounds rounds where rounds.attempt_id = attempt.id;
  if rounds_played <> play_rivalry_challenge_round.round_index then
    raise exception 'Rounds must be played in order.' using errcode = '22023';
  end if;

  situation := public.quartett_situation(challenge.situations_snapshot -> play_rivalry_challenge_round.round_index);
  select array_agg(eligible.slot_name) into eligible_slots
  from jsonb_array_elements_text(situation -> 'eligible_slots') eligible(slot_name);
  select supplied.slot into player_slot
  from jsonb_each_text(attempt.lineup_snapshot -> 'slots') supplied(slot, card_id)
  where supplied.card_id = normalized_card_id
    and supplied.slot = any(eligible_slots)
    and not exists (
      select 1 from public.rivalry_challenge_rounds rounds
      where rounds.attempt_id = attempt.id and rounds.player_card_id = supplied.card_id
    )
  order by supplied.slot limit 1;
  if player_slot is null then
    raise exception 'Player card is missing, already used, or ineligible for this situation.' using errcode = '22023';
  end if;

  ghost_selection := challenge.ghost_selections_snapshot -> play_rivalry_challenge_round.round_index;
  ghost_card_id := ghost_selection ->> 'card_id';
  ghost_slot := ghost_selection ->> 'slot';
  if ghost_card_id is null or ghost_slot is null or not (ghost_slot = any(eligible_slots)) then
    raise exception 'Ghost selection metadata is invalid.' using errcode = 'P0002';
  end if;
  player_score := public.card_quartett_score(normalized_card_id, situation);
  ghost_score := public.card_quartett_score(ghost_card_id, situation);
  if player_score is null or ghost_score is null then
    raise exception 'Challenge card metadata is unavailable.' using errcode = 'P0002';
  end if;

  player_value := (player_score ->> 'value')::integer;
  ghost_value := (ghost_score ->> 'value')::integer;
  player_overall := (player_score ->> 'overall')::integer;
  ghost_overall := (ghost_score ->> 'overall')::integer;
  if player_value <> ghost_value then
    round_winner := case when player_value > ghost_value then 'player' else 'opponent' end;
    tie_breaker := 'category';
  elsif player_overall <> ghost_overall then
    round_winner := case when player_overall > ghost_overall then 'player' else 'opponent' end;
    tie_breaker := 'overall';
  else
    round_winner := case
      when mod(hashtextextended(attempt.seed || ':round:' || play_rivalry_challenge_round.round_index::text || ':tie', 0), 2) = 0
        then 'player' else 'opponent' end;
    tie_breaker := 'match-seed';
  end if;

  insert into public.rivalry_challenge_rounds (
    attempt_id, user_id, round_index, client_request_id, situation_id,
    player_card_id, player_slot, ghost_card_id, ghost_slot,
    player_score, ghost_score, winner, transcript
  ) values (
    attempt.id, requesting_user_id, play_rivalry_challenge_round.round_index,
    normalized_request_id, situation ->> 'id', normalized_card_id, player_slot,
    ghost_card_id, ghost_slot, player_value, ghost_value, round_winner,
    jsonb_build_object(
      'situation', situation,
      'player', player_score,
      'opponent', ghost_score,
      'tie_breaker', tie_breaker
    )
  );

  return jsonb_build_object(
    'status', 'played',
    'client_match_id', normalized_match_id,
    'round_index', play_rivalry_challenge_round.round_index,
    'situation_id', situation ->> 'id',
    'player_card_id', normalized_card_id,
    'player_slot', player_slot,
    'player_score', player_value,
    'opponent_card_id', ghost_card_id,
    'opponent_slot', ghost_slot,
    'opponent_score', ghost_value,
    'winner', round_winner,
    'tie_breaker', tie_breaker,
    'transcript', jsonb_build_object(
      'situation', situation,
      'player', player_score,
      'opponent', ghost_score,
      'tie_breaker', tie_breaker
    )
  );
end;
$$;

create or replace function public.settle_rivalry_challenge(client_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_match_id text := btrim(settle_rivalry_challenge.client_match_id);
  attempt public.rivalry_challenge_attempts%rowtype;
  player_wins integer;
  ghost_wins integer;
  resolved_outcome text;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200 then
    raise exception 'A valid client match id is required.' using errcode = '22023';
  end if;
  perform 1 from public.profiles profiles
  where profiles.id = requesting_user_id for update;
  select * into attempt from public.rivalry_challenge_attempts attempts
  where attempts.user_id = requesting_user_id
    and attempts.client_match_id = normalized_match_id
  for update;
  if not found then
    raise exception 'A valid Ghost Rivalry attempt is required.' using errcode = 'P0001';
  end if;
  select count(*) filter (where rounds.winner = 'player')::integer,
    count(*) filter (where rounds.winner = 'opponent')::integer
    into player_wins, ghost_wins
  from public.rivalry_challenge_rounds rounds
  where rounds.attempt_id = attempt.id;
  if player_wins + ghost_wins <> 5 then
    raise exception 'All five challenge rounds must be played before settlement.' using errcode = 'P0001';
  end if;
  resolved_outcome := case when player_wins > ghost_wins then 'win' else 'loss' end;
  if attempt.status = 'settled' then
    return jsonb_build_object(
      'status', 'already-settled',
      'challenge_id', attempt.challenge_id,
      'attempt_id', attempt.id,
      'outcome', attempt.outcome,
      'player_wins', player_wins,
      'ghost_wins', ghost_wins
    );
  end if;
  if attempt.status <> 'open' then
    raise exception 'Ghost Rivalry attempt is not open.' using errcode = 'P0001';
  end if;
  update public.rivalry_challenge_attempts attempts
  set status = 'settled', outcome = resolved_outcome, settled_at = clock_timestamp()
  where attempts.id = attempt.id;
  return jsonb_build_object(
    'status', 'settled',
    'challenge_id', attempt.challenge_id,
    'attempt_id', attempt.id,
    'outcome', resolved_outcome,
    'player_wins', player_wins,
    'ghost_wins', ghost_wins
  );
end;
$$;

create or replace function public.revoke_rivalry_challenge(challenge_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_slug text := lower(btrim(revoke_rivalry_challenge.challenge_slug));
  challenge public.rivalry_challenges%rowtype;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  perform 1 from public.profiles profiles
  where profiles.id = requesting_user_id for update;
  select * into challenge from public.rivalry_challenges challenges
  where challenges.creator_user_id = requesting_user_id
    and challenges.slug = normalized_slug
  for update;
  if not found then
    raise exception 'Challenge not found.' using errcode = 'P0002';
  end if;
  if challenge.revoked_at is null then
    update public.rivalry_challenges challenges
    set revoked_at = clock_timestamp()
    where challenges.id = challenge.id;
  end if;
  return jsonb_build_object(
    'status', case when challenge.revoked_at is null then 'revoked' else 'already-revoked' end,
    'slug', challenge.slug
  );
end;
$$;

create or replace function public.list_rivalry_challenges()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  created_challenges jsonb;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', challenges.slug,
    'creator_label', challenges.creator_label,
    'mode', challenges.mode,
    'difficulty', challenges.difficulty,
    'challenge_strength', challenges.challenge_strength,
    'status', public.rivalry_challenge_status(challenges),
    'created_at', challenges.created_at,
    'expires_at', challenges.expires_at,
    'attempts', (select count(*) from public.rivalry_challenge_attempts attempts where attempts.challenge_id = challenges.id),
    'completed', (select count(*) from public.rivalry_challenge_attempts attempts where attempts.challenge_id = challenges.id and attempts.status = 'settled'),
    'ghost_defenses', (select count(*) from public.rivalry_challenge_attempts attempts where attempts.challenge_id = challenges.id and attempts.outcome = 'loss'),
    'challenger_wins', (select count(*) from public.rivalry_challenge_attempts attempts where attempts.challenge_id = challenges.id and attempts.outcome = 'win')
  ) order by challenges.created_at desc), '[]'::jsonb)
  into created_challenges
  from public.rivalry_challenges challenges
  where challenges.creator_user_id = requesting_user_id;
  return jsonb_build_object('created', created_challenges);
end;
$$;

revoke all on function public.create_rivalry_challenge(text, text, text) from public, anon, authenticated;
revoke all on function public.get_public_rivalry_challenge(text) from public, anon, authenticated;
revoke all on function public.start_rivalry_challenge(text, text, uuid) from public, anon, authenticated;
revoke all on function public.play_rivalry_challenge_round(text, integer, text, text) from public, anon, authenticated;
revoke all on function public.settle_rivalry_challenge(text) from public, anon, authenticated;
revoke all on function public.revoke_rivalry_challenge(text) from public, anon, authenticated;
revoke all on function public.list_rivalry_challenges() from public, anon, authenticated;

grant execute on function public.get_public_rivalry_challenge(text) to anon, authenticated;
grant execute on function public.create_rivalry_challenge(text, text, text) to authenticated;
grant execute on function public.start_rivalry_challenge(text, text, uuid) to authenticated;
grant execute on function public.play_rivalry_challenge_round(text, integer, text, text) to authenticated;
grant execute on function public.settle_rivalry_challenge(text) to authenticated;
grant execute on function public.revoke_rivalry_challenge(text) to authenticated;
grant execute on function public.list_rivalry_challenges() to authenticated;
