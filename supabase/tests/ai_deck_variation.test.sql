begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

select has_function(
  'public',
  'build_ai_opponent_lineup',
  array['text', 'text', 'text', 'text'],
  'server-side AI lineup builder exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.build_ai_opponent_lineup(text, text, text, text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.build_ai_opponent_lineup(text, text, text, text)',
    'execute'
  ),
  'browser roles cannot call the internal lineup builder'
);
select is(
  public.build_ai_opponent_lineup(
    'nhl-rookie-north-stars', 'nhl-circuit', 'rookie', 'same-match-seed'
  ),
  public.build_ai_opponent_lineup(
    'nhl-rookie-north-stars', 'nhl-circuit', 'rookie', 'same-match-seed'
  ),
  'the same opponent and match seed always produce the same deck'
);

create temporary table ai_deck_samples on commit drop as
select
  opponents.id as opponent_id,
  opponents.mode,
  opponents.difficulty,
  samples.seed,
  public.build_ai_opponent_lineup(
    opponents.id,
    opponents.mode,
    opponents.difficulty,
    'sample-seed-' || samples.seed::text
  ) as slots
from public.ai_opponents opponents
cross join generate_series(1, 20) as samples(seed);

select ok(
  not exists (
    select 1
    from ai_deck_samples
    group by opponent_id
    having count(distinct slots::text) < 2
  ),
  'every configured opponent has multiple decks across 20 seeds'
);
select ok(
  (
    select min(deck_count)
    from (
      select mode, count(distinct slots::text) as deck_count
      from ai_deck_samples
      where difficulty = 'rookie'
      group by mode
    ) rookie_counts
  ) > (
    select max(deck_count)
    from (
      select mode, count(distinct slots::text) as deck_count
      from ai_deck_samples
      where difficulty = 'elite'
      group by mode
    ) elite_counts
  ),
  'Rookie exposes more deck variation than Elite'
);
select ok(
  not exists (
    select 1
    from ai_deck_samples samples
    cross join lateral jsonb_each_text(samples.slots) supplied(slot, card_id)
    left join public.card_catalog catalog on catalog.card_id = supplied.card_id
    where catalog.card_id is null
      or not (supplied.slot = any(catalog.eligible_positions))
      or (supplied.slot = 'G' and catalog.role <> 'goalie')
      or (supplied.slot <> 'G' and catalog.role <> 'skater')
  ),
  'all generated cards satisfy their slot and goalie rules'
);
select ok(
  not exists (
    select 1
    from ai_deck_samples samples
    cross join lateral jsonb_each_text(samples.slots) supplied(slot, card_id)
    join public.card_catalog catalog on catalog.card_id = supplied.card_id
    where (samples.mode = 'nhl-circuit' and catalog.league <> 'NHL')
      or (samples.mode = 'pwhl-circuit' and catalog.league <> 'PWHL')
  ),
  'circuit decks stay inside their league'
);
select ok(
  not exists (
    select 1
    from ai_deck_samples samples
    join public.ai_opponents opponents on opponents.id = samples.opponent_id
    cross join lateral jsonb_each_text(samples.slots) supplied(slot, card_id)
    join public.card_catalog catalog on catalog.card_id = supplied.card_id
    join public.card_catalog anchor
      on anchor.card_id = opponents.lineup_slots ->> supplied.slot
    where samples.mode = 'open-ice' and catalog.league <> anchor.league
  ),
  'Open Ice keeps each opponent slot anchored to its intended league mix'
);
select ok(
  not exists (
    select 1
    from (
      select
        samples.opponent_id,
        samples.seed,
        count(distinct catalog.league) as league_count
      from ai_deck_samples samples
      cross join lateral jsonb_each_text(samples.slots) supplied(slot, card_id)
      join public.card_catalog catalog on catalog.card_id = supplied.card_id
      where samples.mode = 'open-ice'
      group by samples.opponent_id, samples.seed
    ) open_decks
    where open_decks.league_count <> 2
  ),
  'every Open Ice deck contains both NHL and PWHL cards'
);
select ok(
  not exists (
    select 1
    from ai_deck_samples samples
    cross join lateral jsonb_each_text(samples.slots) supplied(slot, card_id)
    group by samples.opponent_id, samples.seed
    having count(*) <> 6 or count(distinct supplied.card_id) <> 6
  ),
  'every generated deck contains six unique card versions'
);
select ok(
  not exists (
    select 1
    from ai_deck_samples samples
    cross join lateral jsonb_each_text(samples.slots) supplied(slot, card_id)
    join public.card_catalog catalog on catalog.card_id = supplied.card_id
    group by samples.opponent_id, samples.seed
    having count(distinct catalog.player_id) <> 6
  ),
  'a player cannot appear twice in one generated deck'
);
select ok(
  not exists (
    select 1
    from ai_deck_samples samples
    cross join lateral jsonb_each_text(samples.slots) supplied(slot, card_id)
    join public.card_catalog catalog on catalog.card_id = supplied.card_id
    join public.players roster on roster.id = catalog.player_id
    where not catalog.is_active
      or catalog.legacy_retained
      or catalog.is_reward_only
      or not roster.active
      or roster.source_metadata ->> 'sourceRosterStatus' is distinct from 'active-roster'
      or (
        samples.difficulty = 'rookie'
        and (catalog.card_type <> 'base' or catalog.market_availability <> 'base-market' or catalog.overall not between 68 and 76)
      )
      or (
        samples.difficulty = 'pro'
        and (catalog.card_type <> 'base' or catalog.market_availability <> 'base-market' or catalog.overall not between 77 and 82)
      )
      or (
        samples.difficulty = 'elite'
        and (catalog.card_type <> 'event' or catalog.market_availability <> 'event-shop' or catalog.overall < 87)
      )
  ),
  'generated decks use only their validated difficulty pool'
);
select ok(
  not exists (
    with deck_strengths as (
      select
        samples.mode,
        samples.difficulty,
        samples.seed,
        avg(catalog.overall)::numeric as average_overall
      from ai_deck_samples samples
      cross join lateral jsonb_each_text(samples.slots) supplied(slot, card_id)
      join public.card_catalog catalog on catalog.card_id = supplied.card_id
      group by samples.mode, samples.difficulty, samples.seed
    ), tier_strengths as (
      select mode, difficulty, avg(average_overall) as average_overall
      from deck_strengths
      group by mode, difficulty
    )
    select 1
    from tier_strengths rookie
    join tier_strengths pro on pro.mode = rookie.mode and pro.difficulty = 'pro'
    join tier_strengths elite on elite.mode = rookie.mode and elite.difficulty = 'elite'
    where rookie.difficulty = 'rookie'
      and not (rookie.average_overall < pro.average_overall and pro.average_overall < elite.average_overall)
  ),
  'average deck strength rises from Rookie through Pro to Elite in every mode'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ai-deck-test@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
set local request.jwt.claim.role = 'authenticated';

insert into public.user_cards (user_id, card_id, quantity, acquired_at)
select auth.uid(), starter.card_id, 1, now()
from public.starter_team_cards starter
where starter.team_id = 'nhl-edmonton-oilers';
insert into public.lineups (id, user_id, name, mode, is_active, created_at, updated_at)
values (
  '88888888-8888-4888-8888-888888888888', auth.uid(),
  'AI Deck Test Lineup', 'nhl-circuit', true, now(), now()
);
insert into public.lineup_slots (lineup_id, user_id, slot, card_id)
select '88888888-8888-4888-8888-888888888888', auth.uid(), starter.slot, starter.card_id
from public.starter_team_cards starter
where starter.team_id = 'nhl-edmonton-oilers';
update public.profiles
set favorite_team_id = 'nhl-edmonton-oilers',
    starter_claimed_at = now(),
    starter_lineup_id = '88888888-8888-4888-8888-888888888888',
    onboarding_completed = true,
    credits = 1000,
    updated_at = now()
where id = auth.uid();
select pass('integration fixture has an active valid starter lineup');
create temporary table retry_start on commit drop as
select public.start_match('ai-deck-retry', 'nhl-circuit', 'rookie') as response;
select is(
  public.start_match('ai-deck-retry', 'nhl-circuit', 'rookie') -> 'opponent' -> 'slots',
  (select response -> 'opponent' -> 'slots' from retry_start),
  'retrying the same match start returns the persisted opponent deck'
);
select is(
  public.start_match('ai-deck-reroll', 'nhl-circuit', 'rookie') ->> 'client_match_id',
  'ai-deck-retry',
  'a new client ID still resumes the existing open ticket'
);
select is(
  public.start_match('ai-deck-reroll', 'nhl-circuit', 'rookie') -> 'opponent' -> 'slots',
  (select response -> 'opponent' -> 'slots' from retry_start),
  'anti-reroll resume keeps the original opponent deck'
);

update public.match_tickets
set status = 'abandoned'
where user_id = auth.uid() and client_match_id = 'ai-deck-retry';

create temporary table actual_match_decks (
  client_match_id text primary key,
  match_seed text not null,
  slots jsonb not null
) on commit drop;
do $$
declare
  sample_index integer;
  match_response jsonb;
begin
  for sample_index in 1..20 loop
    match_response := public.start_match(
      'ai-deck-fresh-' || sample_index::text,
      'nhl-circuit',
      'rookie'
    );
    insert into actual_match_decks (client_match_id, match_seed, slots)
    values (
      match_response ->> 'client_match_id',
      match_response ->> 'seed',
      match_response -> 'opponent' -> 'slots'
    );
    update public.match_tickets
    set status = 'abandoned'
    where user_id = auth.uid()
      and client_match_id = match_response ->> 'client_match_id';
  end loop;
end;
$$;
select is(
  (select count(*)::integer from actual_match_decks),
  20,
  'twenty fresh match IDs create twenty fresh server tickets'
);
select ok(
  (select count(distinct slots::text) from actual_match_decks) > 1,
  'twenty fresh matches produce multiple opponent decks'
);

select * from finish();
rollback;
