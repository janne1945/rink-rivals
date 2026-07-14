begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'user_cards', 'user_cards exists');
select has_table('public', 'lineups', 'lineups exists');
select has_table('public', 'lineup_slots', 'lineup_slots exists');
select has_table('public', 'starter_team_cards', 'starter_team_cards exists');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.user_cards'::regclass), 'user_cards RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.lineups'::regclass), 'lineups RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.lineup_slots'::regclass), 'lineup_slots RLS enabled');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'starter-test@example.com', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Starter Tester"}'::jsonb, now(), now()
);

select is(
  (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Starter Tester',
  'signup trigger creates the profile'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';

select lives_ok(
  $$select public.claim_starter_team('nhl-edmonton-oilers')$$,
  'first starter claim succeeds'
);
select lives_ok(
  $$select public.claim_starter_team('nhl-edmonton-oilers')$$,
  'identical starter claim retry succeeds idempotently'
);
select is((select credits from public.profiles where id = auth.uid()), 1000, 'claim awards 1000 credits');
select is((select count(*)::integer from public.user_cards where user_id = auth.uid()), 6, 'claim creates six cards');
select is((select count(*)::integer from public.lineup_slots where user_id = auth.uid()), 6, 'claim fills six slots');

select * from finish();
rollback;
