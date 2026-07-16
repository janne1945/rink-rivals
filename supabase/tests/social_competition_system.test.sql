begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(79);

select has_table('public', 'arena_match_tickets', 'Arena tickets exist');
select has_table('public', 'arena_match_rounds', 'Arena round receipts exist');
select has_table('public', 'live_rivalry_rooms', 'Live rooms exist');
select has_table('public', 'live_rivalry_players', 'Live room membership exists');
select has_table('public', 'live_rivalry_choices', 'hidden Live choices exist');
select has_table('public', 'live_rivalry_rounds', 'resolved Live rounds exist');
select has_table('public', 'seasons', 'Season definitions exist');
select has_table('public', 'season_reward_definitions', 'Season rewards exist');
select has_table('public', 'season_xp_receipts', 'Season XP receipts exist');
select has_table('public', 'season_reward_claims', 'Season claims exist');
select has_function('public', 'start_arena_match', array['text', 'text'], 'Arena start RPC exists');
select has_function('public', 'abandon_arena_match', array['text'], 'Arena abandonment RPC exists');
select has_function('public', 'lock_live_rivalry_choice', array['uuid', 'integer', 'text', 'text'], 'Live lock RPC exists');
select has_function('public', 'get_season_locker', array[]::text[], 'Season Locker RPC exists');
select ok((select relrowsecurity from pg_class where oid = 'public.live_rivalry_choices'::regclass), 'hidden choices have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.season_reward_claims'::regclass), 'Season claims have RLS');
select ok(not has_table_privilege('authenticated', 'public.live_rivalry_choices', 'select'), 'clients cannot query hidden choices');
select ok(not has_table_privilege('authenticated', 'public.live_rivalry_rounds', 'insert'), 'clients cannot forge Live results');
select ok(not has_table_privilege('authenticated', 'public.arena_match_tickets', 'insert'), 'clients cannot forge Arena tickets');
select ok(not has_table_privilege('authenticated', 'public.season_xp_receipts', 'insert'), 'clients cannot forge Season XP');
select ok(not has_function_privilege('anon', 'public.create_live_rivalry_room(text, text, uuid)', 'execute'), 'anonymous room creation is blocked');
select is((select count(*)::integer from public.season_reward_definitions where season_id = 'season-zero-2026'), 30, 'Season Zero exposes exactly 30 tiers');
select is((select extract(day from ends_at - starts_at)::integer from public.seasons where id = 'season-zero-2026'), 28, 'Season Zero lasts 28 days');
select is((select count(*)::integer from public.season_reward_definitions where season_id = 'season-zero-2026' and reward_type = 'card' and metadata ->> 'league' = 'NHL'), 1, 'Season includes one NHL milestone card');
select is((select count(*)::integer from public.season_reward_definitions where season_id = 'season-zero-2026' and reward_type = 'card' and metadata ->> 'league' = 'PWHL'), 1, 'Season includes one PWHL milestone card');
select ok(not exists (select 1 from public.season_reward_definitions where metadata ? 'paid' or metadata ? 'premium'), 'Season has no paid reward track metadata');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'live-host@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Live Host"}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'live-guest@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Live Guest"}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'live-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Outsider"}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.claim_starter_team('nhl-edmonton-oilers');
create temporary table host_before on commit drop as
select credits, completed_matches from public.profiles where id = auth.uid();
create temporary table live_fixture on commit drop as
select public.create_live_rivalry_room(
  'live-create-1', 'nhl-circuit',
  (select starter_lineup_id from public.profiles where id = auth.uid())
) as response;
grant select on live_fixture to authenticated;
select is((select response ->> 'status' from live_fixture), 'waiting', 'host creates a waiting Live room');
select is((select length(response ->> 'room_code') from live_fixture), 6, 'room code is short');
select is(public.create_live_rivalry_room(
  'live-create-1', 'nhl-circuit', (select starter_lineup_id from public.profiles where id = auth.uid())
) ->> 'room_id', (select response ->> 'room_id' from live_fixture), 'room creation is idempotent');
select ok(private.can_receive_live_rivalry(
  'live-rivalry:' || (select response ->> 'room_id' from live_fixture), auth.uid()
), 'host can receive private room invalidations');

reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select public.claim_starter_team('nhl-edmonton-oilers');
create temporary table guest_before on commit drop as
select credits, completed_matches from public.profiles where id = auth.uid();
select throws_ok(
  $$select public.abandon_arena_match('missing-arena')$$,
  'P0001', 'A valid Arena ticket is required.',
  'unknown Arena abandonment is rejected'
);
select lives_ok($$select public.start_arena_match('arena-abandon', 'nhl-circuit')$$, 'Arena abandonment fixture starts');
select is(public.abandon_arena_match('arena-abandon') ->> 'status', 'abandoned', 'an open Arena match can be abandoned');
select is(public.abandon_arena_match('arena-abandon') ->> 'status', 'already-abandoned', 'Arena abandonment is idempotent');
reset role;
select is((select status from public.arena_match_tickets where user_id = '22222222-2222-4222-8222-222222222222' and client_match_id = 'arena-abandon'), 'abandoned', 'abandoned Arena match remains as an audit record');
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select lives_ok($$select public.start_arena_match('arena-after-abandon', 'nhl-circuit')$$, 'a new Arena match starts after abandonment');
select is(public.abandon_arena_match('arena-after-abandon') ->> 'status', 'abandoned', 'replacement Arena fixture is released');
select is(public.join_live_rivalry_room(
  (select response ->> 'room_code' from live_fixture), 'live-join-1',
  (select starter_lineup_id from public.profiles where id = auth.uid())
) -> 'opponent' ->> 'display_label', 'Live Host', 'friend joins the private host room');
select is(public.join_live_rivalry_room(
  (select response ->> 'room_code' from live_fixture), 'live-join-1',
  (select starter_lineup_id from public.profiles where id = auth.uid())
) ->> 'room_id', (select response ->> 'room_id' from live_fixture), 'room join is idempotent');

reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is(public.set_live_rivalry_ready(
  (select (response ->> 'room_id')::uuid from live_fixture), true, 'host-ready-1'
) ->> 'status', 'waiting', 'one ready player does not start the match');

reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is(public.set_live_rivalry_ready(
  (select (response ->> 'room_id')::uuid from live_fixture), true, 'guest-ready-1'
) ->> 'status', 'active', 'both ready players start the Live match');

reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
create temporary table host_lock_zero on commit drop as
select public.lock_live_rivalry_choice(
  (select (response ->> 'room_id')::uuid from live_fixture), 0,
  (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LW'),
  'host-round-0'
) as response;
grant select on host_lock_zero to authenticated;
select is((select jsonb_array_length(response -> 'rounds') from host_lock_zero), 0, 'one hidden lock cannot resolve a round');
select is((select response -> 'me' ->> 'locked' from host_lock_zero), 'true', 'host sees only their lock state');
select ok(not ((select response -> 'opponent' from host_lock_zero) ? 'card_id'), 'host response never leaks an opponent card');
select throws_ok(
  format('select * from public.live_rivalry_choices where room_id = %L::uuid', (select response ->> 'room_id' from live_fixture)),
  '42501', null, 'direct hidden-choice reads are rejected'
);

reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is(public.get_live_rivalry_room((select (response ->> 'room_id')::uuid from live_fixture)) -> 'opponent' ->> 'locked', 'true', 'guest sees that the rival locked, not what they chose');
create temporary table guest_lock_zero on commit drop as
select public.lock_live_rivalry_choice(
  (select (response ->> 'room_id')::uuid from live_fixture), 0,
  (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LW'),
  'guest-round-0'
) as response;
grant select on guest_lock_zero to authenticated;
select is((select jsonb_array_length(response -> 'rounds') from guest_lock_zero), 1, 'second hidden lock atomically resolves the round');
select is((select response ->> 'current_round' from guest_lock_zero), '1', 'server advances only after both choices');
select is(public.lock_live_rivalry_choice(
  (select (response ->> 'room_id')::uuid from live_fixture), 0,
  (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LW'),
  'guest-round-0'
) ->> 'current_round', '1', 'duplicate Live lock is idempotent');
select throws_ok(
  format('select public.lock_live_rivalry_choice(%L::uuid, 3, %L, %L)',
    (select response ->> 'room_id' from live_fixture),
    (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'C'),
    'guest-wrong-round'),
  '22023', 'Choice does not match the current Live round.', 'round tampering is rejected'
);

-- Rounds 1-4: the visible categories make C, LD, RW, and G valid in order.
reset role; set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.lock_live_rivalry_choice((select (response ->> 'room_id')::uuid from live_fixture), 1, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'C'), 'host-round-1');
reset role; set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select public.lock_live_rivalry_choice((select (response ->> 'room_id')::uuid from live_fixture), 1, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'C'), 'guest-round-1');
reset role; set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.lock_live_rivalry_choice((select (response ->> 'room_id')::uuid from live_fixture), 2, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LD'), 'host-round-2');
reset role; set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select public.lock_live_rivalry_choice((select (response ->> 'room_id')::uuid from live_fixture), 2, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LD'), 'guest-round-2');
reset role; set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.lock_live_rivalry_choice((select (response ->> 'room_id')::uuid from live_fixture), 3, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'RW'), 'host-round-3');
reset role; set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select public.lock_live_rivalry_choice((select (response ->> 'room_id')::uuid from live_fixture), 3, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'RW'), 'guest-round-3');
reset role; set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.lock_live_rivalry_choice((select (response ->> 'room_id')::uuid from live_fixture), 4, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'G'), 'host-round-4');
reset role; set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
create temporary table live_final on commit drop as
select public.lock_live_rivalry_choice((select (response ->> 'room_id')::uuid from live_fixture), 4, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'G'), 'guest-round-4') as response;
grant select on live_final to authenticated;
select is((select response ->> 'status' from live_final), 'completed', 'five synchronous rounds complete the Live match');
select is((select jsonb_array_length(response -> 'rounds') from live_final), 5, 'Live result contains five immutable reveals');
select is((select response -> 'rewards' ->> 'credits' from live_final), '0', 'Live match returns an explicit zero-Credits guardrail');
select is((select response -> 'rewards' ->> 'season_xp' from live_final), '0', 'Live match returns an explicit zero-XP guardrail');
select is((select credits from public.profiles where id = auth.uid()), (select credits from guest_before), 'Live match does not mutate Credits');
select is((select completed_matches from public.profiles where id = auth.uid()), (select completed_matches from guest_before), 'Live match does not mutate progression matches');
reset role;
select is((select count(*)::integer from public.season_xp_receipts where user_id = auth.uid()), 0, 'Live match creates no XP receipt');

set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select throws_ok(
  format('select public.get_live_rivalry_room(%L::uuid)', (select response ->> 'room_id' from live_fixture)),
  '42501', 'You are not a member of this Live room.', 'foreign-room reads are rejected'
);
select ok(not private.can_receive_live_rivalry('live-rivalry:' || (select response ->> 'room_id' from live_fixture), auth.uid()), 'outsider cannot receive private room invalidations');

-- Rivalry Arena uses the other account's real active lineup, server AI, and
-- the existing transparent five-category scoring contract.
reset role; set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
create temporary table arena_fixture on commit drop as
select public.start_arena_match('arena-match-1', 'nhl-circuit') as response;
grant select on arena_fixture to authenticated;
select is((select response ->> 'status' from arena_fixture), 'started', 'Arena starts against a real lineup');
reset role;
select isnt((select opponent_user_id::text from public.arena_match_tickets where client_match_id = 'arena-match-1'), auth.uid()::text, 'Arena excludes the caller from matchmaking');
select is((select response -> 'opponent' -> 'slots' from arena_fixture), (select response -> 'lineup' -> 'slots' from arena_fixture), 'Arena start masks the rival card identities');
select ok((select abs(lineup_strength - opponent_strength) >= 0 from public.arena_match_tickets where client_match_id = 'arena-match-1'), 'Arena records both lineup strengths');
set local role authenticated;
select public.play_arena_match_round('arena-match-1', 0, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LW'), 'arena-round-0');
select public.play_arena_match_round('arena-match-1', 1, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'C'), 'arena-round-1');
select public.play_arena_match_round('arena-match-1', 2, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LD'), 'arena-round-2');
select public.play_arena_match_round('arena-match-1', 3, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'RW'), 'arena-round-3');
select public.play_arena_match_round('arena-match-1', 4, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'G'), 'arena-round-4');
select is(public.settle_arena_match('arena-match-1') ->> 'status', 'settled', 'Arena settles after five server rounds');
select is(public.settle_arena_match('arena-match-1') ->> 'status', 'already-settled', 'Arena settlement is idempotent');
reset role;
select is((select count(*)::integer from public.arena_match_rounds where user_id = auth.uid()), 5, 'Arena stores five authoritative round receipts');
select is((select count(*)::integer from public.season_xp_receipts where user_id = auth.uid() and source_kind = 'arena'), 1, 'Arena grants Season XP exactly once');
select is((select xp from public.season_xp_receipts where user_id = auth.uid() and source_kind = 'arena'), 140, 'Arena grants the intended XP amount');
select ok((select credits from public.profiles where id = auth.uid()) > (select credits from host_before), 'Arena grants Credits');

-- Faceoff is wired to the same free Locker through a server trigger.
set local role authenticated;
select public.start_match('season-faceoff-1', 'nhl-circuit', 'rookie');
select public.play_match_round('season-faceoff-1', 0, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LW'), 'season-faceoff-round-0');
select public.play_match_round('season-faceoff-1', 1, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'C'), 'season-faceoff-round-1');
select public.play_match_round('season-faceoff-1', 2, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LD'), 'season-faceoff-round-2');
select public.play_match_round('season-faceoff-1', 3, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'RW'), 'season-faceoff-round-3');
select public.play_match_round('season-faceoff-1', 4, (select card_id from public.lineup_slots where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'G'), 'season-faceoff-round-4');
select public.settle_match('season-faceoff-1');
reset role;
select is((select count(*)::integer from public.season_xp_receipts where user_id = auth.uid() and source_kind = 'faceoff'), 1, 'Faceoff grants one XP receipt');
select is((select xp from public.season_xp_receipts where user_id = auth.uid() and source_kind = 'faceoff'), 100, 'Rookie Faceoff grants 100 XP');
set local role authenticated;
select is(public.get_season_locker() ->> 'xp', '240', 'Locker totals Faceoff and Arena XP');
select is(jsonb_array_length(public.get_season_locker() -> 'rewards'), 30, 'Locker exposes all rewards to the account');
create temporary table credits_before_claim on commit drop as select credits from public.profiles where id = auth.uid();
grant select on credits_before_claim to authenticated;
select is(public.claim_season_reward('season-zero-2026', 1, 'season-claim-1') ->> 'status', 'claimed', 'unlocked Season reward can be claimed');
select is(public.claim_season_reward('season-zero-2026', 1, 'season-claim-1') ->> 'status', 'already-claimed', 'Season claim retry is idempotent');
select is((select credits from public.profiles where id = auth.uid()), (select credits from credits_before_claim) + 150, 'Season Credits are granted exactly once');
select throws_ok(
  $$select public.claim_season_reward('season-zero-2026', 30, 'season-claim-locked')$$,
  'P0001', 'Earn more Season XP to unlock this reward.', 'locked Season tiers cannot be claimed early'
);

-- The lobby and reconnect deadlines are server-owned. A delayed second ready
-- cannot revive a stale lobby, and the next heartbeat returns a closed room.
create temporary table expired_live_fixture on commit drop as
select public.create_live_rivalry_room(
  'live-expiry-create', 'nhl-circuit',
  (select starter_lineup_id from public.profiles where id = auth.uid())
) as response;
grant select on expired_live_fixture to authenticated;
select public.set_live_rivalry_ready(
  (select (response ->> 'room_id')::uuid from expired_live_fixture), true, 'live-expiry-host-ready'
);
reset role; set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select public.join_live_rivalry_room(
  (select response ->> 'room_code' from expired_live_fixture), 'live-expiry-join',
  (select starter_lineup_id from public.profiles where id = auth.uid())
);
reset role;
update public.live_rivalry_rooms set
  created_at = clock_timestamp() - interval '2 hours',
  expires_at = clock_timestamp() - interval '1 hour'
where id = (select (response ->> 'room_id')::uuid from expired_live_fixture);
set local role authenticated; set local request.jwt.claim.role = 'authenticated'; set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select throws_ok(
  format('select public.set_live_rivalry_ready(%L::uuid, true, %L)',
    (select response ->> 'room_id' from expired_live_fixture), 'live-expiry-guest-ready'),
  'P0001', 'This Live room has expired.', 'an expired lobby cannot start from a delayed ready request'
);
select is(
  public.get_live_rivalry_room((select (response ->> 'room_id')::uuid from expired_live_fixture)) ->> 'status',
  'expired', 'heartbeat cleanup closes an expired Live room'
);

select * from finish();
rollback;
