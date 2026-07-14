begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'teams', 'team identities exist');
select has_table('public', 'players', 'player identities exist');
select has_table('public', 'starter_grant_receipts', 'immutable starter receipts exist');
select has_table('public', 'starter_migration_audits', 'legacy starter audit state exists');

select is((select count(*)::integer from public.teams where active), 44, 'all 44 active teams are seeded');
select is((select count(*)::integer from public.teams where active and league = 'NHL'), 32, 'all 32 NHL teams are seeded');
select is((select count(*)::integer from public.teams where active and league = 'PWHL'), 12, 'all 12 PWHL teams are seeded');
select is((select count(*)::integer from public.players), 794, 'all 792 active and two retained player identities are seeded');
select is((select count(*)::integer from public.players where active), 792, 'the active player pool excludes both retained identities');
select is((select count(*)::integer from public.card_catalog), 1178, 'the complete catalog projection is seeded');
select is((select count(*)::integer from public.card_catalog where card_type = 'base'), 792, 'one marketable base card exists per active player');
select is((select count(*)::integer from public.card_catalog where card_type = 'starter'), 264, 'all 44 six-card starter versions exist');
select is((select count(*)::integer from public.card_catalog where card_type = 'event'), 107, 'the launch event pool is complete');
select is((select count(*)::integer from public.card_catalog where card_type = 'reward'), 15, 'ten launch rewards plus five additional retained rewards are classified');
select is((select count(*)::integer from public.card_catalog where legacy_retained), 6, 'all six legacy references are explicitly retained and non-market');
select is((select count(*)::integer from public.starter_team_cards), 264, '44 six-card starter squads are seeded');
select ok(
  not exists (
    select teams.id
    from public.teams teams
    where teams.active and (
      select count(*) from public.starter_team_cards starter where starter.team_id = teams.id
    ) <> 6
  ),
  'every active team has exactly six starter slots'
);

do $$
declare
  verified_market_time timestamptz;
begin
  select candidate.at_time into verified_market_time
  from public.card_catalog catalog
  join public.event_definitions events on events.id = catalog.set_id and events.is_active
  cross join lateral generate_series(
    date_trunc('week', catalog.available_from at time zone 'UTC'),
    least(
      date_trunc('week', (catalog.available_to - interval '1 second') at time zone 'UTC'),
      date_trunc('week', catalog.available_from at time zone 'UTC') + interval '20 weeks'
    ),
    interval '7 days'
  ) weeks(starts_utc)
  cross join lateral (
    select greatest(weeks.starts_utc at time zone 'UTC', catalog.available_from) + interval '1 second' as at_time
  ) candidate
  where catalog.card_type = 'event'
    and catalog.market_availability = 'event-shop'
    and candidate.at_time < catalog.available_to
    and events.rotation_order = (((
      floor(extract(epoch from (weeks.starts_utc - timestamp '2026-01-05 00:00:00')) / 604800)::bigint
      % 10
    ) + 10) % 10)::integer
  order by candidate.at_time, catalog.card_id
  limit 1;

  if verified_market_time is null then
    raise exception 'No in-window event rotation could be selected for the market test.';
  end if;
  perform set_config('test.content_market_time', verified_market_time::text, true);
end;
$$;

select is(
  (
    select count(*)::integer
    from public.current_market_offers(current_setting('test.content_market_time')::timestamptz) offers
    join public.card_catalog catalog on catalog.card_id = offers.card_id
    where catalog.card_type = 'starter'
  ),
  0,
  'starter cards never enter a market offer'
);
select is(
  (
    select count(*)::integer
    from public.current_market_offers(current_setting('test.content_market_time')::timestamptz)
    where source = 'event_shop'
  ),
  6,
  'the chosen in-window rotation exposes exactly six event offers'
);
select ok(
  not exists (
    select 1
    from public.current_market_offers(current_setting('test.content_market_time')::timestamptz) offers
    join public.card_catalog catalog on catalog.card_id = offers.card_id
    where offers.source = 'event_shop'
      and not (
        catalog.card_type = 'event'
        and catalog.market_availability = 'event-shop'
        and catalog.available_from <= current_setting('test.content_market_time')::timestamptz
        and current_setting('test.content_market_time')::timestamptz < catalog.available_to
      )
  ),
  'event offers honor their server-side UTC availability window'
);
select ok(
  not exists (
    select 1
    from public.current_market_offers(current_setting('test.content_market_time')::timestamptz) offers
    join public.card_catalog catalog on catalog.card_id = offers.card_id
    where offers.source = 'event_shop'
      and (
        offers.starts_at is null
        or offers.ends_at is null
        or offers.starts_at < catalog.available_from
        or offers.ends_at > catalog.available_to
        or offers.starts_at >= offers.ends_at
      )
  ),
  'published event offer bounds are clipped to each card availability window'
);
select is(
  (
    select count(*)::integer
    from public.current_market_offers(current_setting('test.content_market_time')::timestamptz) offers
    join public.card_catalog catalog on catalog.card_id = offers.card_id
    where catalog.card_type = 'reward' or catalog.market_availability = 'reward-only'
  ),
  0,
  'reward-only cards never enter a market offer'
);

select ok(not has_function_privilege('anon', 'public.claim_starter_team(text)', 'execute'), 'anon cannot execute starter claim');
select ok(has_function_privilege('authenticated', 'public.claim_starter_team(text)', 'execute'), 'authenticated can execute starter claim');
select ok(not has_function_privilege('authenticated', 'public.current_market_offers(timestamptz)', 'execute'), 'raw market resolver remains internal');
select ok(has_table_privilege('authenticated', 'public.teams', 'select'), 'authenticated clients can read team identities');
select ok(has_table_privilege('authenticated', 'public.players', 'select'), 'authenticated clients can read player identities');
select ok(not has_table_privilege('anon', 'public.teams', 'select'), 'anonymous clients cannot read team identities');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'favorite_team_id', 'update'), 'clients cannot rewrite authoritative team selection directly');
select ok(not has_table_privilege('authenticated', 'public.starter_grant_receipts', 'insert'), 'clients cannot forge starter receipts');
select ok(not has_table_privilege('authenticated', 'public.starter_grant_receipts', 'update'), 'clients cannot rewrite starter receipts');
select ok(not has_table_privilege('authenticated', 'public.starter_grant_receipts', 'delete'), 'clients cannot delete starter receipts');
select ok(not has_table_privilege('authenticated', 'public.starter_migration_audits', 'update'), 'clients cannot resolve legacy audits');

-- Prove that every configured team is claimable without hard-coding IDs in the
-- RPC. Each generated account receives one distinct team inside this rollback.
do $$
declare
  team record;
  generated_user_id uuid;
begin
  for team in select id from public.teams where active order by id loop
    generated_user_id := extensions.gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      generated_user_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', generated_user_id::text || '@all-teams.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    );
    perform set_config('request.jwt.claim.sub', generated_user_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform public.claim_starter_team(team.id);
  end loop;
end;
$$;

select is(
  (select count(distinct team_id)::integer from public.starter_grant_receipts),
  44,
  'all 44 teams can be selected by a new account'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'content-claim-one@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'content-claim-other@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'content-legacy@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

do $$
begin
  perform set_config('test.content_nhl_team', (
    select id from public.teams where active and league = 'NHL' order by id limit 1
  ), true);
  perform set_config('test.content_pwhl_team', (
    select id from public.teams where active and league = 'PWHL' order by id limit 1
  ), true);
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local request.jwt.claim.role = 'authenticated';

select lives_ok(
  format('select public.claim_starter_team(%L)', current_setting('test.content_nhl_team')),
  'first new-account starter claim succeeds'
);
do $$
begin
  perform set_config('test.content_first_lineup', (
    select lineup_id::text from public.starter_grant_receipts where user_id = auth.uid()
  ), true);
end;
$$;
select is(
  public.claim_starter_team(current_setting('test.content_nhl_team'))::text,
  current_setting('test.content_first_lineup'),
  'same-team retry returns the original lineup'
);
select is((select credits from public.profiles where id = auth.uid()), 1000, 'retry grants Credits exactly once');
select is((select count(*)::integer from public.user_cards where user_id = auth.uid()), 6, 'retry leaves exactly six starter cards');
select is((select count(*)::integer from public.lineups where user_id = auth.uid()), 1, 'retry creates no second lineup');
select is((select count(*)::integer from public.starter_grant_receipts where user_id = auth.uid()), 1, 'retry creates one immutable receipt');
select is(
  (select jsonb_array_length(card_snapshot) from public.starter_grant_receipts where user_id = auth.uid()),
  6,
  'receipt snapshots all six granted card versions'
);
select throws_ok(
  format('select public.claim_starter_team(%L)', current_setting('test.content_pwhl_team')),
  'P0001', 'A different starter team has already been claimed.',
  'a claimed account cannot switch teams or receive another grant'
);

reset role;
select is((select credits from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1000, 'failed team switch leaves Credits unchanged');
select is((select count(*)::integer from public.starter_grant_receipts where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1, 'failed team switch leaves one receipt');

set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set local request.jwt.claim.role = 'authenticated';
select is((select count(*)::integer from public.starter_grant_receipts), 0, 'RLS hides another account receipt');
select is((select count(*)::integer from public.user_cards), 0, 'RLS hides another account collection');
select throws_ok(
  $$select public.claim_starter_team('not-a-real-team')$$,
  '22023', 'Unknown starter team.',
  'an invalid team id is rejected atomically'
);

reset role;
do $$
declare
  legacy_lineup_id uuid;
  legacy_card_id text;
  legacy_opponent_id text;
begin
  select card_id into legacy_card_id
  from public.card_catalog
  where card_type = 'base' and market_availability = 'base-market'
  order by card_id
  limit 1;

  insert into public.user_cards (user_id, card_id, quantity)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', legacy_card_id, 3);

  insert into public.lineups (user_id, name, mode, is_active)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Preserved Legacy Lineup', 'nhl-circuit', true)
  returning id into legacy_lineup_id;

  update public.profiles
  set favorite_team_id = current_setting('test.content_nhl_team'),
      starter_claimed_at = clock_timestamp() - interval '1 day',
      starter_lineup_id = legacy_lineup_id,
      onboarding_completed = true,
      credits = 2222
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  select id into legacy_opponent_id
  from public.ai_opponents
  where mode = 'nhl-circuit'
  order by difficulty, id
  limit 1;

  insert into public.match_tickets (
    user_id, client_match_id, lineup_id, lineup_snapshot, mode, difficulty,
    seed, opponent_id, opponent_snapshot, situations_snapshot
  ) values (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'legacy-open-ticket', legacy_lineup_id,
    '{"slots":{}}'::jsonb, 'nhl-circuit', 'rookie', 'legacy-seed', legacy_opponent_id,
    '{"slots":{}}'::jsonb, '[{"id":"1"},{"id":"2"},{"id":"3"},{"id":"4"},{"id":"5"}]'::jsonb
  );

  perform set_config('test.content_legacy_lineup', legacy_lineup_id::text, true);
  perform set_config('test.content_legacy_card', legacy_card_id, true);
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set local request.jwt.claim.role = 'authenticated';
select is(
  public.claim_starter_team(current_setting('test.content_nhl_team'))::text,
  current_setting('test.content_legacy_lineup'),
  'same-team legacy retry returns the preserved lineup without a new grant'
);
select is((select credits from public.profiles where id = auth.uid()), 2222, 'legacy retry grants no second Credits');
select is(
  (select quantity from public.user_cards where user_id = auth.uid() and card_id = current_setting('test.content_legacy_card')),
  3,
  'legacy ownership quantity remains untouched'
);
select is((select count(*)::integer from public.starter_grant_receipts where user_id = auth.uid()), 0, 'ambiguous legacy grant is not backfilled as proven provenance');
select is((select state from public.starter_migration_audits where user_id = auth.uid()), 'manual-review', 'legacy account is queued for manual review');
select is(
  (select jsonb_array_length(open_ticket_snapshot) from public.starter_migration_audits where user_id = auth.uid()),
  1,
  'legacy audit records the open match ticket'
);
select is((select count(*)::integer from public.match_tickets where user_id = auth.uid() and status = 'open'), 1, 'legacy open ticket remains untouched');
select throws_ok(
  format('select public.claim_starter_team(%L)', current_setting('test.content_pwhl_team')),
  'P0001', 'Legacy starter claim requires manual review.',
  'legacy account cannot self-migrate to a different team'
);
select is((select credits from public.profiles where id = auth.uid()), 2222, 'failed legacy migration leaves Credits unchanged');
select is(
  (select quantity from public.user_cards where user_id = auth.uid() and card_id = current_setting('test.content_legacy_card')),
  3,
  'failed legacy migration still preserves legitimate ownership'
);

select * from finish();
rollback;
