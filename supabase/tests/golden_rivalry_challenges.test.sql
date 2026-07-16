begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(43);

select has_table('public', 'rivalry_challenges', 'rivalry challenges exist');
select has_table('public', 'rivalry_challenge_attempts', 'challenge attempts exist');
select has_table('public', 'rivalry_challenge_rounds', 'challenge round receipts exist');
select has_function('public', 'create_rivalry_challenge', array['text', 'text', 'text'], 'challenge creation RPC exists');
select has_function('public', 'get_public_rivalry_challenge', array['text'], 'public preview RPC exists');
select has_function('public', 'start_rivalry_challenge', array['text', 'text', 'uuid'], 'challenge start RPC exists');
select has_function('public', 'play_rivalry_challenge_round', array['text', 'integer', 'text', 'text'], 'challenge round RPC exists');
select has_function('public', 'settle_rivalry_challenge', array['text'], 'challenge settlement RPC exists');
select has_function('public', 'abandon_rivalry_challenge', array['text'], 'challenge abandonment RPC exists');
select ok((select relrowsecurity from pg_class where oid = 'public.rivalry_challenges'::regclass), 'challenge RLS is enabled');
select ok(not has_table_privilege('authenticated', 'public.rivalry_challenges', 'insert'), 'clients cannot insert challenges');
select ok(not has_table_privilege('authenticated', 'public.rivalry_challenge_rounds', 'insert'), 'clients cannot forge challenge rounds');
select ok(has_function_privilege('anon', 'public.get_public_rivalry_challenge(text)', 'execute'), 'anonymous previews are allowed');
select ok(not has_function_privilege('anon', 'public.start_rivalry_challenge(text, text, uuid)', 'execute'), 'anonymous play is blocked');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ghost-creator@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Ghost Creator"}'::jsonb, now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ghost-challenger@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Ghost Challenger"}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local request.jwt.claim.role = 'authenticated';
select public.claim_starter_team('nhl-edmonton-oilers');
select public.start_match('ghost-source-match', 'nhl-circuit', 'rookie');
select public.play_match_round('ghost-source-match', 0, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LW'), 'ghost-source-round-0');
select public.play_match_round('ghost-source-match', 1, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'C'), 'ghost-source-round-1');
select public.play_match_round('ghost-source-match', 2, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LD'), 'ghost-source-round-2');
select public.play_match_round('ghost-source-match', 3, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'RW'), 'ghost-source-round-3');
select public.play_match_round('ghost-source-match', 4, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'G'), 'ghost-source-round-4');
select public.settle_match('ghost-source-match');

create temporary table challenge_fixture on commit drop as
select public.create_rivalry_challenge('ghost-create-once', 'ghost-source-match', 'ai-match') as response;
grant select on challenge_fixture to anon, authenticated;
select is((select response ->> 'status' from challenge_fixture), 'created', 'a settled match creates a challenge');
select is(public.create_rivalry_challenge('ghost-create-once', 'ghost-source-match', 'ai-match') ->> 'status', 'already-created', 'challenge creation is idempotent');
select is((select jsonb_array_length(ghost_selections_snapshot) from public.rivalry_challenges where creator_user_id = auth.uid()), 5, 'the creator five is snapshotted');
select throws_ok(
  format('select public.start_rivalry_challenge(%L, %L, %L::uuid)', (select response ->> 'slug' from challenge_fixture), 'creator-self-attempt', (select starter_lineup_id from public.profiles where id = auth.uid())),
  'P0001', 'You cannot accept your own Ghost Rivalry.', 'a creator cannot play their own challenge'
);

reset role;
set local role anon;
select is(public.get_public_rivalry_challenge((select response ->> 'slug' from challenge_fixture)) ->> 'status', 'active', 'anonymous preview exposes active status');
select ok(not (public.get_public_rivalry_challenge((select response ->> 'slug' from challenge_fixture)) ? 'lineup'), 'public preview does not expose the lineup');
select ok(not (public.get_public_rivalry_challenge((select response ->> 'slug' from challenge_fixture)) ? 'ghost_selections'), 'public preview does not expose ghost choices');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set local request.jwt.claim.role = 'authenticated';
select public.claim_starter_team('nhl-edmonton-oilers');
create temporary table challenger_before on commit drop as
select credits, completed_matches from public.profiles where id = auth.uid();
create temporary table inactive_lineup_fixture on commit drop as
select (public.save_lineup(
  null,
  'Inactive challenge test',
  'nhl-circuit',
  (select jsonb_object_agg(slot, card_id) from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()))
) -> 'lineup' ->> 'id')::uuid as id;
grant select on inactive_lineup_fixture to authenticated;
select throws_ok(
  format('select public.start_rivalry_challenge(%L, %L, %L::uuid)', (select response ->> 'slug' from challenge_fixture), 'inactive-lineup-attempt', (select id from inactive_lineup_fixture)),
  'P0001', 'An active lineup for the challenge mode is required.', 'challenge acceptance rejects an inactive lineup'
);
select throws_ok(
  $$select public.abandon_rivalry_challenge('missing-attempt')$$,
  'P0001', 'A valid Ghost Rivalry attempt is required.',
  'unknown challenge abandonment is rejected'
);
select lives_ok(
  format('select public.start_rivalry_challenge(%L, %L, %L::uuid)', (select response ->> 'slug' from challenge_fixture), 'ghost-abandon', (select starter_lineup_id from public.profiles where id = auth.uid())),
  'challenge abandonment fixture starts'
);
select is(public.abandon_rivalry_challenge('ghost-abandon') ->> 'status', 'abandoned', 'an open challenge can be abandoned');
select is(public.abandon_rivalry_challenge('ghost-abandon') ->> 'status', 'already-abandoned', 'challenge abandonment is idempotent');
select is((select status from public.rivalry_challenge_attempts where user_id = auth.uid() and client_match_id = 'ghost-abandon'), 'abandoned', 'abandoned challenge remains as an audit record');
select lives_ok(
  format('select public.start_rivalry_challenge(%L, %L, %L::uuid)', (select response ->> 'slug' from challenge_fixture), 'ghost-after-abandon', (select starter_lineup_id from public.profiles where id = auth.uid())),
  'a new challenge starts after abandonment'
);
select is(public.abandon_rivalry_challenge('ghost-after-abandon') ->> 'status', 'abandoned', 'replacement challenge fixture is released');
create temporary table attempt_fixture on commit drop as
select public.start_rivalry_challenge(
  (select response ->> 'slug' from challenge_fixture),
  'ghost-attempt',
  (select starter_lineup_id from public.profiles where id = auth.uid())
) as response;
grant select on attempt_fixture to authenticated;
select is(
  (select response ->> 'status' from attempt_fixture),
  'started', 'a second account can accept with a matching active lineup'
);
select is(
  (select response -> 'opponent' -> 'slots' from attempt_fixture),
  (select response -> 'lineup' -> 'slots' from attempt_fixture),
  'the start ticket masks the creator lineup with challenger-known card ids'
);
select is(
  public.start_rivalry_challenge((select response ->> 'slug' from challenge_fixture), 'ghost-attempt', (select starter_lineup_id from public.profiles where id = auth.uid())) ->> 'status',
  'already-started', 'challenge start is idempotent'
);
select public.play_rivalry_challenge_round('ghost-attempt', 0, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LW'), 'ghost-attempt-round-0');
select public.play_rivalry_challenge_round('ghost-attempt', 1, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'C'), 'ghost-attempt-round-1');
select public.play_rivalry_challenge_round('ghost-attempt', 2, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LD'), 'ghost-attempt-round-2');
select public.play_rivalry_challenge_round('ghost-attempt', 3, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'RW'), 'ghost-attempt-round-3');
select public.play_rivalry_challenge_round('ghost-attempt', 4, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'G'), 'ghost-attempt-round-4');
select is(public.settle_rivalry_challenge('ghost-attempt') ->> 'status', 'settled', 'five challenge rounds settle');
select is(public.settle_rivalry_challenge('ghost-attempt') ->> 'status', 'already-settled', 'challenge settlement is idempotent');
select is((select count(*)::integer from public.rivalry_challenge_rounds where user_id = auth.uid()), 5, 'five immutable challenge receipts exist');
select is((select credits from public.profiles where id = auth.uid()), (select credits from challenger_before), 'challenge settlement grants no Credits');
select is((select completed_matches from public.profiles where id = auth.uid()), (select completed_matches from challenger_before), 'challenge settlement does not increment progression matches');
select is((select count(*)::integer from public.matches where user_id = auth.uid()), 0, 'challenge settlement creates no economy match');
select is(public.create_rivalry_challenge('ghost-chain-once', 'ghost-attempt', 'ghost-challenge') ->> 'status', 'created', 'a settled challenge can become a new ghost');
select is(jsonb_array_length((select ghost_selections_snapshot from public.rivalry_challenges where creator_user_id = auth.uid())), 5, 'the challenger five is snapshotted for chaining');
select is(jsonb_array_length(public.list_rivalry_challenges() -> 'created'), 1, 'challenge inbox lists only the current account creations');
select is(public.revoke_rivalry_challenge((public.list_rivalry_challenges() -> 'created' -> 0 ->> 'slug')) ->> 'status', 'revoked', 'the creator can revoke a link');
select is(public.get_public_rivalry_challenge((public.list_rivalry_challenges() -> 'created' -> 0 ->> 'slug')) ->> 'status', 'revoked', 'public preview reflects revocation');

select * from finish();
rollback;
