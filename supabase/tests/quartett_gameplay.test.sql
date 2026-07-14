begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

select has_function('public', 'quartett_situation', array['jsonb'], 'Quartett category normalizer exists');
select has_function('public', 'card_quartett_score', array['text', 'jsonb'], 'visible card score helper exists');
select has_function('public', 'play_match_round', array['text', 'integer', 'text', 'text'], 'authoritative round RPC exists');
select ok(
  not has_function_privilege('authenticated', 'public.card_quartett_score(text, jsonb)', 'execute'),
  'clients cannot call the internal card score helper'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'quartett-test@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
set local request.jwt.claim.role = 'authenticated';

select public.claim_starter_team('nhl-edmonton-oilers');
select public.start_match('quartett-match', 'nhl-circuit', 'rookie');

select is(
  (select jsonb_array_length(situations_snapshot) from public.match_tickets where user_id = auth.uid()),
  5,
  'a match ticket stores exactly five Quartett categories'
);
select is(
  (select count(*)::integer
    from public.match_tickets tickets
    cross join lateral jsonb_array_elements(tickets.situations_snapshot) category
    where tickets.user_id = auth.uid() and category ? 'attribute'),
  5,
  'every round exposes exactly one category attribute'
);
select is(
  (select count(*)::integer
    from public.match_tickets tickets
    cross join lateral jsonb_array_elements(tickets.situations_snapshot) category
    where tickets.user_id = auth.uid() and category ? 'weights'),
  0,
  'no ticket category contains composite weights'
);
select is(
  (select jsonb_agg(category ->> 'id' order by ordinal)
    from public.match_tickets tickets
    cross join lateral jsonb_array_elements(tickets.situations_snapshot) with ordinality entries(category, ordinal)
    where tickets.user_id = auth.uid()),
  '["skater-speed","skater-shooting","skater-defense","skater-clutch","goalie-reflexes"]'::jsonb,
  'the server stores the documented four-skater and one-goalie sequence'
);

select lives_ok(
  $$select public.play_match_round(
    'quartett-match', 0,
    (select card_id from public.lineup_slots
      where lineup_id = (select starter_lineup_id from public.profiles where id = auth.uid()) and slot = 'LW'),
    'quartett-round-0'
  )$$,
  'the visible-value round plays successfully'
);

select ok(
  (select player_score = (transcript -> 'player' ->> 'value')::numeric
      and opponent_score = (transcript -> 'opponent' ->> 'value')::numeric
    from public.match_rounds where user_id = auth.uid()),
  'stored scores equal the visible category values'
);
select ok(
  (select not (transcript -> 'player' ?| array['base', 'variance', 'total'])
      and not (transcript -> 'opponent' ?| array['base', 'variance', 'total'])
    from public.match_rounds where user_id = auth.uid()),
  'the transcript contains no weighted or variance score fields'
);
select ok(
  (select transcript ->> 'tie_breaker' in ('category', 'overall', 'match-seed')
    from public.match_rounds where user_id = auth.uid()),
  'the applied tie-break step is explicit'
);
select ok(
  (select winner in ('player', 'opponent') from public.match_rounds where user_id = auth.uid()),
  'the deterministic tie rule always resolves a round'
);

select * from finish();
rollback;

