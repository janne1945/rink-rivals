begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(22);

select has_table('public', 'matches', 'matches exists');
select has_table('public', 'match_rewards', 'match_rewards exists');
select has_table('public', 'objective_progress', 'objective_progress exists');
select has_table('public', 'rivalry_road_progress', 'rivalry_road_progress exists');
select has_function('public', 'settle_match', array['text', 'text', 'text', 'text'], 'settle_match exists');

select ok((select relrowsecurity from pg_class where oid = 'public.matches'::regclass), 'matches RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.match_rewards'::regclass), 'match rewards RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.objective_progress'::regclass), 'objectives RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.rivalry_road_progress'::regclass), 'Rivalry Road RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.matches', 'insert'), 'clients cannot insert matches');
select ok(not has_table_privilege('authenticated', 'public.match_rewards', 'insert'), 'clients cannot insert rewards');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'match-test@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
set local request.jwt.claim.role = 'authenticated';

select lives_ok(
  $$select public.settle_match('match-once', 'nhl-circuit', 'rookie', 'win')$$,
  'first settlement succeeds'
);
select lives_ok(
  $$select public.settle_match('match-once', 'nhl-circuit', 'rookie', 'win')$$,
  'identical retry succeeds idempotently'
);
select throws_ok(
  $$select public.settle_match('match-once', 'nhl-circuit', 'elite', 'win')$$,
  '22023', 'Match id was already settled with different match data.',
  'same id with changed payload is rejected'
);
select is((select credits from public.profiles where id = auth.uid()), 445, 'controlled rules award exactly 445 credits');
select is((select completed_matches from public.profiles where id = auth.uid()), 1, 'completed match increments once');
select is((select count(*)::integer from public.matches where user_id = auth.uid()), 1, 'one match row exists');
select is((select count(*)::integer from public.match_rewards where user_id = auth.uid()), 1, 'one reward row exists');
select is((select count(*)::integer from public.objective_progress where user_id = auth.uid()), 3, 'daily and weekly progress are written');
select is((select current_step_index from public.rivalry_road_progress where user_id = auth.uid()), 1, 'Rivalry Road advances atomically');

reset role;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'other-match-test@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
select is((select count(*)::integer from public.matches), 0, 'another user cannot read the first user matches');
select is((select count(*)::integer from public.objective_progress), 0, 'another user cannot read the first user progress');

select * from finish();
rollback;
