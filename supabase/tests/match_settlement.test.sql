begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(49);

select has_table('public', 'matches', 'matches exists');
select has_table('public', 'match_rewards', 'match rewards exists');
select has_table('public', 'objective_progress', 'objective progress exists');
select has_table('public', 'rivalry_road_progress', 'Rivalry Road progress exists');
select has_table('public', 'match_tickets', 'server match tickets exist');
select has_table('public', 'match_rounds', 'immutable server rounds exist');
select has_function('public', 'start_match', array['text', 'text', 'text'], 'start_match exists');
select has_function('public', 'play_match_round', array['text', 'integer', 'text', 'text'], 'play_match_round exists');
select has_function('public', 'settle_match', array['text'], 'one-argument settle_match exists');
select hasnt_function(
  'public', 'settle_match', array['text', 'text', 'text', 'text'],
  'client-authored settlement function was removed'
);

select ok((select relrowsecurity from pg_class where oid = 'public.matches'::regclass), 'matches RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.match_rewards'::regclass), 'match rewards RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.objective_progress'::regclass), 'objectives RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.rivalry_road_progress'::regclass), 'Rivalry Road RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.match_tickets'::regclass), 'match tickets RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.match_rounds'::regclass), 'match rounds RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.matches', 'insert'), 'clients cannot insert matches');
select ok(not has_table_privilege('authenticated', 'public.match_rounds', 'insert'), 'clients cannot insert match rounds');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'match-test@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
set local request.jwt.claim.role = 'authenticated';

select lives_ok(
  $$select public.claim_starter_team('nhl-edmonton-oilers')$$,
  'starter claim prepares an active, valid lineup'
);
select throws_ok(
  $$select public.settle_match('forged-without-ticket')$$,
  'P0001', 'A valid server-issued match ticket is required.',
  'settlement without a server ticket is rejected'
);
select lives_ok(
  $$select public.start_match('match-once', 'nhl-circuit', 'rookie')$$,
  'server starts a valid match'
);
select is(
  public.start_match('match-once', 'nhl-circuit', 'rookie') -> 'lineup' ->> 'id',
  (select starter_lineup_id::text from public.profiles where id = auth.uid()),
  'match start returns the immutable player lineup snapshot'
);
select lives_ok(
  $$select public.start_match('match-once', 'nhl-circuit', 'rookie')$$,
  'identical start retry is idempotent'
);
select throws_ok(
  $$select public.start_match('match-once', 'nhl-circuit', 'elite')$$,
  '22023', 'Match id was already started with different match data.',
  'same match id cannot change difficulty'
);
select throws_ok(
  $$select public.settle_match('match-once')$$,
  'P0001', 'All five server rounds must be played before settlement.',
  'an incomplete server match cannot settle'
);

select lives_ok(
  $$select public.play_match_round(
    'match-once', 0,
    (select card_id from public.lineup_slots
      where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LW'),
    'round-0'
  )$$,
  'first forward round succeeds'
);
select lives_ok(
  $$select public.play_match_round(
    'match-once', 0,
    (select card_id from public.lineup_slots
      where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LW'),
    'round-0'
  )$$,
  'identical round request is idempotent'
);
select is(
  public.start_match('reroll-attempt', 'nhl-circuit', 'rookie') ->> 'client_match_id',
  'match-once',
  'a new client id resumes the existing open ticket instead of rerolling its seed'
);
select is(
  jsonb_array_length(public.start_match('reroll-attempt', 'nhl-circuit', 'rookie') -> 'rounds'),
  1,
  'resumed match returns its played rounds for client hydration'
);
select is((select count(*)::integer from public.match_tickets where user_id = auth.uid()), 1, 'reroll attempt creates no second ticket');
select throws_ok(
  $$select public.start_match('tier-reroll-attempt', 'nhl-circuit', 'pro')$$,
  'P0001', 'An active match with different match data must be completed first.',
  'an open ticket blocks a mode or difficulty reroll'
);
select throws_ok(
  $$select public.play_match_round(
    'match-once', 0,
    (select card_id from public.lineup_slots
      where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'C'),
    'round-0'
  )$$,
  '22023', 'Round request id was already used for different round data.',
  'round request id cannot be reused with changed data'
);
select throws_ok(
  $$select public.play_match_round(
    'match-once', 2,
    (select card_id from public.lineup_slots
      where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LD'),
    'round-out-of-order'
  )$$,
  '22023', 'Rounds must be played in order.',
  'rounds cannot be skipped'
);
select lives_ok(
  $$select public.play_match_round(
    'match-once', 1,
    (select card_id from public.lineup_slots
      where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'C'),
    'round-1'
  )$$,
  'second forward round succeeds'
);
select lives_ok(
  $$select public.play_match_round(
    'match-once', 2,
    (select card_id from public.lineup_slots
      where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LD'),
    'round-2'
  )$$,
  'defense round succeeds'
);
select lives_ok(
  $$select public.play_match_round(
    'match-once', 3,
    (select card_id from public.lineup_slots
      where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'RW'),
    'round-3'
  )$$,
  'open skater round succeeds'
);
select lives_ok(
  $$select public.play_match_round(
    'match-once', 4,
    (select card_id from public.lineup_slots
      where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'G'),
    'round-4'
  )$$,
  'goalie round succeeds'
);
select lives_ok(
  $$select public.settle_match('match-once')$$,
  'five immutable rounds settle successfully'
);
select lives_ok(
  $$select public.settle_match('match-once')$$,
  'identical settlement retry is idempotent'
);

select is((select completed_matches from public.profiles where id = auth.uid()), 1, 'completed match increments once');
select is((select count(*)::integer from public.matches where user_id = auth.uid()), 1, 'one match row exists');
select is((select count(*)::integer from public.match_rewards where user_id = auth.uid()), 1, 'one reward row exists');
select is((select count(*)::integer from public.match_rounds where user_id = auth.uid()), 5, 'five immutable round receipts exist');
select is((select status from public.match_tickets where user_id = auth.uid()), 'settled', 'ticket is settled');
select ok((select credits > 1000 from public.profiles where id = auth.uid()), 'server-derived reward increases Credits');
select is(
  (select current_step_index from public.rivalry_road_progress where user_id = auth.uid()),
  1,
  'Rivalry Road advances atomically from a valid NHL match'
);

reset role;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'other-match-test@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
set local request.jwt.claim.role = 'authenticated';
select is((select count(*)::integer from public.matches), 0, 'another user cannot read the first user matches');
select is((select count(*)::integer from public.objective_progress), 0, 'another user cannot read the first user progress');
select is((select count(*)::integer from public.match_tickets), 0, 'another user cannot read the first user ticket');

select * from finish();
rollback;
