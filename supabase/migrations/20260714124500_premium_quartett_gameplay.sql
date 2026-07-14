-- Premium Quartett keeps the existing ticket/round/settlement authority while
-- replacing composite situation scores with one visible card attribute.

create or replace function public.quartett_situation(situation jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case situation ->> 'id'
    when 'transition-rush' then jsonb_build_object(
      'id', 'skater-speed', 'name', 'Speed',
      'description', 'Higher Speed wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW'), 'attribute', 'speed')
    when 'cycle-pressure' then jsonb_build_object(
      'id', 'skater-shooting', 'name', 'Shooting',
      'description', 'Higher Shooting wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW'), 'attribute', 'shooting')
    when 'blue-line-command' then jsonb_build_object(
      'id', 'skater-defense', 'name', 'Defense',
      'description', 'Higher Defense wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LD', 'RD'), 'attribute', 'defense')
    when 'late-game-shift' then jsonb_build_object(
      'id', 'skater-clutch', 'name', 'Clutch',
      'description', 'Higher Clutch wins this round.', 'role', 'skater',
      'eligible_slots', jsonb_build_array('LW', 'C', 'RW', 'LD', 'RD'), 'attribute', 'clutch')
    when 'crease-under-fire' then jsonb_build_object(
      'id', 'goalie-reflexes', 'name', 'Reflexes',
      'description', 'Higher Reflexes wins this round.', 'role', 'goalie',
      'eligible_slots', jsonb_build_array('G'), 'attribute', 'reflexes')
    else situation
  end;
$$;

revoke all on function public.quartett_situation(jsonb) from public, anon, authenticated;

create or replace function public.normalize_quartett_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select coalesce(jsonb_agg(public.quartett_situation(value) order by ordinal), '[]'::jsonb)
    into new.situations_snapshot
  from jsonb_array_elements(new.situations_snapshot) with ordinality entries(value, ordinal);
  return new;
end;
$$;

revoke all on function public.normalize_quartett_ticket() from public, anon, authenticated;

drop trigger if exists normalize_quartett_ticket_before_write on public.match_tickets;
create trigger normalize_quartett_ticket_before_write
before insert or update of situations_snapshot on public.match_tickets
for each row execute function public.normalize_quartett_ticket();

-- Upgrade resumable tickets in place so an interrupted match cannot reroll into
-- the new rules. Existing round receipts are rewritten only while the ticket is
-- still open; settled match history and rewards are untouched.
update public.match_tickets tickets
set situations_snapshot = normalized.situations
from (
  select source.id,
    jsonb_agg(public.quartett_situation(entry.value) order by entry.ordinal) as situations
  from public.match_tickets source
  cross join lateral jsonb_array_elements(source.situations_snapshot)
    with ordinality entry(value, ordinal)
  where source.status = 'open'
  group by source.id
) normalized
where tickets.id = normalized.id;

create or replace function public.card_quartett_score(requested_card_id text, situation jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'value', (catalog.attributes ->> (situation ->> 'attribute'))::integer,
    'overall', catalog.overall
  )
  from public.card_catalog catalog
  where catalog.card_id = requested_card_id
    and catalog.is_active
    and catalog.attributes ? (situation ->> 'attribute');
$$;

revoke all on function public.card_quartett_score(text, jsonb) from public, anon, authenticated;

with upgraded as (
  select rounds.ticket_id, rounds.round_index,
    public.quartett_situation(tickets.situations_snapshot -> rounds.round_index) as situation,
    public.card_quartett_score(
      rounds.player_card_id,
      public.quartett_situation(tickets.situations_snapshot -> rounds.round_index)
    ) as player_score,
    public.card_quartett_score(
      rounds.opponent_card_id,
      public.quartett_situation(tickets.situations_snapshot -> rounds.round_index)
    ) as opponent_score,
    tickets.seed
  from public.match_rounds rounds
  join public.match_tickets tickets on tickets.id = rounds.ticket_id
  where tickets.status = 'open'
), resolved as (
  select upgraded.*,
    case
      when (player_score ->> 'value')::integer <> (opponent_score ->> 'value')::integer
        then case when (player_score ->> 'value')::integer > (opponent_score ->> 'value')::integer then 'player' else 'opponent' end
      when (player_score ->> 'overall')::integer <> (opponent_score ->> 'overall')::integer
        then case when (player_score ->> 'overall')::integer > (opponent_score ->> 'overall')::integer then 'player' else 'opponent' end
      when mod(abs(hashtextextended(seed || ':round:' || round_index::text || ':tie', 0)), 2) = 0
        then 'player'
      else 'opponent'
    end as winner,
    case
      when (player_score ->> 'value')::integer <> (opponent_score ->> 'value')::integer then 'category'
      when (player_score ->> 'overall')::integer <> (opponent_score ->> 'overall')::integer then 'overall'
      else 'match-seed'
    end as tie_breaker
  from upgraded
)
update public.match_rounds rounds
set situation_id = resolved.situation ->> 'id',
    player_score = (resolved.player_score ->> 'value')::integer,
    opponent_score = (resolved.opponent_score ->> 'value')::integer,
    winner = resolved.winner,
    transcript = jsonb_build_object(
      'situation', resolved.situation,
      'player', resolved.player_score,
      'opponent', resolved.opponent_score,
      'tie_breaker', resolved.tie_breaker
    )
from resolved
where rounds.ticket_id = resolved.ticket_id
  and rounds.round_index = resolved.round_index;

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
      'tie_breaker', existing_round.transcript ->> 'tie_breaker',
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

  situation := public.quartett_situation(ticket.situations_snapshot -> play_match_round.round_index);
  select array_agg(eligible.slot_name) into eligible_slots
  from jsonb_array_elements_text(situation -> 'eligible_slots') as eligible(slot_name);

  select supplied.slot into selected_player_slot
  from jsonb_each_text(ticket.lineup_snapshot -> 'slots') supplied(slot, card_id)
  where supplied.card_id = normalized_card_id
    and supplied.slot = any(eligible_slots)
    and not exists (
      select 1 from public.match_rounds rounds
      where rounds.ticket_id = ticket.id and rounds.player_card_id = supplied.card_id
    )
  order by supplied.slot
  limit 1;
  if selected_player_slot is null then
    raise exception 'Player card is missing, already used, or ineligible for this situation.' using errcode = '22023';
  end if;

  player_score := public.card_quartett_score(normalized_card_id, situation);
  if player_score is null then
    raise exception 'Player card metadata is unavailable.' using errcode = 'P0002';
  end if;

  select candidate.slot, candidate.card_id, candidate.score
    into selected_opponent_slot, selected_opponent_card_id, opponent_score
  from (
    select ranked.*
    from (
      select supplied.slot, supplied.card_id,
        public.card_quartett_score(supplied.card_id, situation) as score,
        row_number() over (order by
          (public.card_quartett_score(supplied.card_id, situation) ->> 'value')::integer,
          (public.card_quartett_score(supplied.card_id, situation) ->> 'overall')::integer,
          supplied.card_id) as strength_rank,
        count(*) over () as candidate_count
      from jsonb_each_text(ticket.opponent_snapshot -> 'slots') supplied(slot, card_id)
      where supplied.slot = any(eligible_slots)
        and not exists (
          select 1 from public.match_rounds rounds
          where rounds.ticket_id = ticket.id and rounds.opponent_card_id = supplied.card_id
        )
    ) ranked
    where ticket.difficulty = 'elite'
      or (ticket.difficulty = 'rookie' and ranked.strength_rank <= ceil(ranked.candidate_count / 2.0))
      or (ticket.difficulty = 'pro' and ranked.strength_rank > floor(ranked.candidate_count / 2.0))
    order by
      case when ticket.difficulty = 'elite' then ranked.strength_rank end desc,
      case when ticket.difficulty <> 'elite' then
        abs(hashtextextended(ticket.seed || ':' || play_match_round.round_index::text || ':' || ranked.card_id, 0)::numeric)
      end,
      ranked.card_id
    limit 1
  ) candidate;
  if selected_opponent_card_id is null or opponent_score is null then
    raise exception 'Server opponent has no eligible card for this situation.' using errcode = 'P0002';
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
    round_winner := case
      when mod(abs(hashtextextended(ticket.seed || ':round:' || play_match_round.round_index::text || ':tie', 0)), 2) = 0
        then 'player' else 'opponent' end;
    tie_breaker := 'match-seed';
  end if;

  insert into public.match_rounds (
    ticket_id, user_id, round_index, client_request_id, situation_id,
    player_card_id, player_slot, opponent_card_id, opponent_slot,
    player_score, opponent_score, winner, transcript
  ) values (
    ticket.id, requesting_user_id, play_match_round.round_index, normalized_request_id,
    situation ->> 'id', normalized_card_id, selected_player_slot,
    selected_opponent_card_id, selected_opponent_slot,
    player_value, opponent_value, round_winner,
    jsonb_build_object(
      'situation', situation,
      'player', player_score,
      'opponent', opponent_score,
      'tie_breaker', tie_breaker
    )
  );

  return jsonb_build_object(
    'status', 'played',
    'client_match_id', normalized_match_id,
    'round_index', play_match_round.round_index,
    'situation_id', situation ->> 'id',
    'player_card_id', normalized_card_id,
    'player_slot', selected_player_slot,
    'player_score', player_value,
    'opponent_card_id', selected_opponent_card_id,
    'opponent_slot', selected_opponent_slot,
    'opponent_score', opponent_value,
    'winner', round_winner,
    'tie_breaker', tie_breaker,
    'transcript', jsonb_build_object(
      'situation', situation,
      'player', player_score,
      'opponent', opponent_score,
      'tie_breaker', tie_breaker
    )
  );
end;
$$;

revoke all on function public.play_match_round(text, integer, text, text) from public, anon;
grant execute on function public.play_match_round(text, integer, text, text) to authenticated;
