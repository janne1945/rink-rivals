-- Build a deterministic opponent deck once for each fresh server match seed.
-- Existing ticket snapshots remain immutable, preserving retry and resume behavior.

create or replace function public.build_ai_opponent_lineup(
  opponent_id text,
  mode text,
  difficulty text,
  match_seed text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_variable
declare
  configured_opponent public.ai_opponents%rowtype;
  slot_order constant text[] := array['LW', 'C', 'RW', 'LD', 'RD', 'G'];
  slot_index integer;
  current_slot text;
  target_league text;
  variant_count integer;
  variant_index integer;
  selection_seed text;
  selected_card public.card_catalog%rowtype;
  selected_slots jsonb := '{}'::jsonb;
  used_card_ids text[] := array[]::text[];
  used_player_ids text[] := array[]::text[];
begin
  if build_ai_opponent_lineup.opponent_id is null
    or btrim(build_ai_opponent_lineup.opponent_id) = ''
    or build_ai_opponent_lineup.match_seed is null
    or btrim(build_ai_opponent_lineup.match_seed) = ''
    or build_ai_opponent_lineup.mode is null
    or build_ai_opponent_lineup.mode not in ('nhl-circuit', 'pwhl-circuit', 'open-ice')
    or build_ai_opponent_lineup.difficulty is null
    or build_ai_opponent_lineup.difficulty not in ('rookie', 'pro', 'elite') then
    raise exception 'Valid opponent, mode, difficulty, and match seed are required.' using errcode = '22023';
  end if;

  select * into configured_opponent
  from public.ai_opponents opponents
  where opponents.id = build_ai_opponent_lineup.opponent_id;
  if not found
    or configured_opponent.mode <> build_ai_opponent_lineup.mode
    or configured_opponent.difficulty <> build_ai_opponent_lineup.difficulty then
    raise exception 'Configured server opponent does not match this match.' using errcode = 'P0002';
  end if;

  -- Rookie deliberately has the broadest variant space; Elite is narrower and
  -- more predictable without becoming a single fixed deck.
  variant_count := case build_ai_opponent_lineup.difficulty
    when 'rookie' then 16
    when 'pro' then 8
    else 3
  end;
  variant_index := get_byte(
    decode(md5(
      build_ai_opponent_lineup.match_seed || ':'
      || build_ai_opponent_lineup.opponent_id || ':'
      || build_ai_opponent_lineup.difficulty
    ), 'hex'),
    0
  ) % variant_count;
  selection_seed := build_ai_opponent_lineup.opponent_id || ':'
    || build_ai_opponent_lineup.difficulty || ':variant:' || variant_index::text;

  for slot_index in 1..cardinality(slot_order) loop
    current_slot := slot_order[slot_index];

    if build_ai_opponent_lineup.mode = 'open-ice' then
      select anchor.league into target_league
      from public.card_catalog anchor
      where anchor.card_id = configured_opponent.lineup_slots ->> current_slot;
      if not found then
        raise exception 'Open Ice opponent is missing a valid league anchor for slot %.', current_slot
          using errcode = 'P0002';
      end if;
    else
      target_league := case build_ai_opponent_lineup.mode
        when 'nhl-circuit' then 'NHL'
        else 'PWHL'
      end;
    end if;

    select catalog.* into selected_card
    from public.card_catalog catalog
    join public.players roster
      on roster.id = catalog.player_id
     and roster.active
     and roster.source_metadata ->> 'sourceRosterStatus' = 'active-roster'
    where catalog.is_active
      and not catalog.legacy_retained
      and not catalog.is_reward_only
      and catalog.league = target_league
      and current_slot = any(catalog.eligible_positions)
      and (
        (current_slot = 'G' and catalog.role = 'goalie')
        or (current_slot <> 'G' and catalog.role = 'skater')
      )
      and not (catalog.card_id = any(used_card_ids))
      and not (catalog.player_id = any(used_player_ids))
      and (
        (
          build_ai_opponent_lineup.difficulty = 'rookie'
          and catalog.card_type = 'base'
          and catalog.market_availability = 'base-market'
          and catalog.overall between 68 and 76
        )
        or (
          build_ai_opponent_lineup.difficulty = 'pro'
          and catalog.card_type = 'base'
          and catalog.market_availability = 'base-market'
          and catalog.overall between 77 and 82
        )
        or (
          build_ai_opponent_lineup.difficulty = 'elite'
          and catalog.card_type = 'event'
          and catalog.market_availability = 'event-shop'
          and catalog.overall >= 87
        )
      )
    order by md5(selection_seed || ':' || current_slot || ':' || catalog.card_id), catalog.card_id
    limit 1;

    if not found then
      raise exception 'No valid % card is available for server opponent %.', current_slot, configured_opponent.id
        using errcode = 'P0002';
    end if;

    selected_slots := selected_slots || jsonb_build_object(current_slot, selected_card.card_id);
    used_card_ids := array_append(used_card_ids, selected_card.card_id);
    used_player_ids := array_append(used_player_ids, selected_card.player_id);
  end loop;

  if (select count(*) from jsonb_object_keys(selected_slots)) <> 6
    or (select count(distinct supplied.card_id) from jsonb_each_text(selected_slots) supplied(slot, card_id)) <> 6
    or (
      select count(distinct catalog.player_id)
      from jsonb_each_text(selected_slots) supplied(slot, card_id)
      join public.card_catalog catalog on catalog.card_id = supplied.card_id
    ) <> 6 then
    raise exception 'Generated server opponent lineup is incomplete or contains duplicates.' using errcode = 'P0002';
  end if;

  return selected_slots;
end;
$$;

revoke all on function public.build_ai_opponent_lineup(text, text, text, text)
  from public, anon, authenticated;

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
  opponent_lineup_slots jsonb;
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
  opponent_lineup_slots := public.build_ai_opponent_lineup(
    selected_opponent_id,
    requested_mode,
    requested_difficulty,
    ticket_seed
  );
  if (select count(*) from jsonb_object_keys(opponent_lineup_slots)) <> 6
    or (select count(distinct supplied.card_id) from jsonb_each_text(opponent_lineup_slots) supplied(slot, card_id)) <> 6
    or (
      select count(distinct catalog.player_id)
      from jsonb_each_text(opponent_lineup_slots) supplied(slot, card_id)
      join public.card_catalog catalog on catalog.card_id = supplied.card_id
    ) <> 6
    or exists (
      select 1
      from jsonb_each_text(opponent_lineup_slots) supplied(slot, card_id)
      left join public.card_catalog catalog on catalog.card_id = supplied.card_id
      left join public.players roster on roster.id = catalog.player_id
      where catalog.card_id is null or not catalog.is_active or catalog.legacy_retained
        or catalog.is_reward_only or roster.id is null or not roster.active
        or roster.source_metadata ->> 'sourceRosterStatus' is distinct from 'active-roster'
        or not (supplied.slot = any(catalog.eligible_positions))
        or (supplied.slot = 'G' and catalog.role <> 'goalie')
        or (supplied.slot <> 'G' and catalog.role <> 'skater')
        or (requested_mode = 'nhl-circuit' and catalog.league <> 'NHL')
        or (requested_mode = 'pwhl-circuit' and catalog.league <> 'PWHL')
        or (
          requested_difficulty = 'rookie'
          and (catalog.card_type <> 'base' or catalog.market_availability <> 'base-market' or catalog.overall not between 68 and 76)
        )
        or (
          requested_difficulty = 'pro'
          and (catalog.card_type <> 'base' or catalog.market_availability <> 'base-market' or catalog.overall not between 77 and 82)
        )
        or (
          requested_difficulty = 'elite'
          and (catalog.card_type <> 'event' or catalog.market_availability <> 'event-shop' or catalog.overall < 87)
        )
    )
    or (
      requested_mode = 'open-ice'
      and (
        select count(distinct catalog.league)
        from jsonb_each_text(opponent_lineup_slots) supplied(slot, card_id)
        join public.card_catalog catalog on catalog.card_id = supplied.card_id
      ) <> 2
    ) then
    raise exception 'Generated server opponent has an invalid lineup.' using errcode = 'P0002';
  end if;

  situations := jsonb_build_array(
    jsonb_build_object(
      'id', 'skater-speed', 'name', 'Speed',
      'description', 'Higher Speed wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW'),
      'attribute', 'speed'
    ),
    jsonb_build_object(
      'id', 'skater-shooting', 'name', 'Shooting',
      'description', 'Higher Shooting wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW'),
      'attribute', 'shooting'
    ),
    jsonb_build_object(
      'id', 'skater-defense', 'name', 'Defense',
      'description', 'Higher Defense wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LD', 'RD'),
      'attribute', 'defense'
    ),
    jsonb_build_object(
      'id', 'skater-clutch', 'name', 'Clutch',
      'description', 'Higher Clutch wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW', 'LD', 'RD'),
      'attribute', 'clutch'
    ),
    jsonb_build_object(
      'id', 'goalie-reflexes', 'name', 'Reflexes',
      'description', 'Higher Reflexes wins this round.', 'role', 'goalie',
      'eligible_slots', jsonb_build_array('G'),
      'attribute', 'reflexes'
    )
  );

  insert into public.match_tickets (
    user_id, client_match_id, lineup_id, lineup_snapshot, mode, difficulty,
    seed, opponent_id, opponent_snapshot, situations_snapshot, status
  ) values (
    requesting_user_id, normalized_match_id, active_lineup.id,
    jsonb_build_object('id', active_lineup.id, 'name', active_lineup.name, 'mode', active_lineup.mode, 'slots', lineup_slots),
    requested_mode, requested_difficulty, ticket_seed, selected_opponent_id,
    jsonb_build_object('id', opponent.id, 'name', opponent.name, 'mode', opponent.mode, 'slots', opponent_lineup_slots),
    situations, 'open'
  );

  return jsonb_build_object(
    'status', 'started',
    'client_match_id', normalized_match_id,
    'seed', ticket_seed,
    'lineup', jsonb_build_object('id', active_lineup.id, 'name', active_lineup.name, 'mode', active_lineup.mode, 'slots', lineup_slots),
    'opponent_id', selected_opponent_id,
    'opponent', jsonb_build_object('id', opponent.id, 'name', opponent.name, 'mode', opponent.mode, 'slots', opponent_lineup_slots),
    'situations', situations,
    'rounds', '[]'::jsonb,
    'mode', requested_mode,
    'difficulty', requested_difficulty
  );
end;
$$;

revoke all on function public.start_match(text, text, text) from public, anon;
grant execute on function public.start_match(text, text, text) to authenticated;
