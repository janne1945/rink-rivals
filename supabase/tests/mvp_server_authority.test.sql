begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'card_catalog', 'server card catalog exists');
select has_table('public', 'event_definitions', 'event definitions exist');
select has_table('public', 'purchase_receipts', 'immutable purchase receipts exist');
select has_table('public', 'reward_receipts', 'immutable reward receipts exist');
select has_table('public', 'ai_opponents', 'curated server opponents exist');
select is((select count(*)::integer from public.card_catalog), 106, 'all 106 catalog cards are projected server-side');
select is((select count(*)::integer from public.event_definitions), 10, 'all ten recurring events are configured');
select is((select count(*)::integer from public.ai_opponents), 9, 'all mode and difficulty opponents are configured');
select is(
  (select count(*)::integer from public.current_market_offers('2026-07-06 12:00:00+00') where source = 'event_shop'),
  6,
  'an active event exposes all six event cards'
);
select is(
  (select count(*)::integer from public.current_market_offers('2026-07-06 12:00:00+00') where placement = 'spotlight'),
  1,
  'exactly one active event card receives the deterministic spotlight discount'
);
select ok(
  (select bool_and(price = greatest(1, round(regular_price * 0.85)::integer))
   from public.current_market_offers('2026-07-06 12:00:00+00') where placement = 'spotlight'),
  'spotlight price is calculated by the server at 15 percent off'
);

select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'anonymous users cannot read profiles');
select ok(not has_table_privilege('authenticated', 'public.user_cards', 'insert'), 'clients cannot insert owned cards');
select ok(not has_table_privilege('authenticated', 'public.user_cards', 'update'), 'clients cannot change owned quantities');
select ok(not has_table_privilege('authenticated', 'public.lineups', 'insert'), 'clients cannot insert lineups directly');
select ok(not has_table_privilege('authenticated', 'public.lineup_slots', 'insert'), 'clients cannot insert lineup slots directly');
select ok(not has_table_privilege('authenticated', 'public.purchase_receipts', 'insert'), 'clients cannot forge purchase receipts');
select ok(not has_table_privilege('authenticated', 'public.reward_receipts', 'insert'), 'clients cannot forge reward receipts');
select ok(not has_table_privilege('authenticated', 'public.match_tickets', 'insert'), 'clients cannot forge match tickets');
select ok(not has_table_privilege('authenticated', 'public.match_rounds', 'insert'), 'clients cannot forge match rounds');

-- These source contracts guard the serialization boundary itself. A queued
-- mutation must not retain a pre-lock clock value across a UTC/event cutoff.
with source as (
  select pg_get_functiondef('public.purchase_card(text,text)'::regprocedure) as definition
)
select ok(
  position('where profiles.id = requesting_user_id for update;' in definition) > 0
    and position('purchase_time := clock_timestamp();' in definition)
      > position('where profiles.id = requesting_user_id for update;' in definition),
  'purchase availability time is captured after the profile lock'
)
from source;

with source as (
  select pg_get_functiondef('public.claim_rivalry_reward(text,text)'::regprocedure) as definition
)
select ok(
  position('where profiles.id = requesting_user_id for update;' in definition) > 0
    and position('claim_time := clock_timestamp();' in definition)
      > position('where profiles.id = requesting_user_id for update;' in definition),
  'reward acquisition time is captured after the profile lock'
)
from source;

with source as (
  select pg_get_functiondef('public.settle_match(text)'::regprocedure) as definition
)
select ok(
  position('where profiles.id = requesting_user_id for update;' in definition) > 0
    and position('settlement_time := clock_timestamp();' in definition)
      > position('where profiles.id = requesting_user_id for update;' in definition)
    and position('day_key := to_char(' in definition)
      > position('settlement_time := clock_timestamp();' in definition)
    and position('week_key := to_char(' in definition)
      > position('settlement_time := clock_timestamp();' in definition),
  'settlement UTC day and week are derived after the profile lock'
)
from source;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'authority-test@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
set local request.jwt.claim.role = 'authenticated';
select lives_ok(
  $$select public.claim_starter_team('edmonton-oilers')$$,
  'starter team prepares owned cards and an active NHL lineup'
);

select is(
  public.purchase_card('base-purchase-once', 'base-market:nhl-rasmus-dahlin-base') ->> 'status',
  'purchased',
  'a server-priced permanent card purchase succeeds'
);
select is((select credits from public.profiles where id = auth.uid()), 300, 'base purchase debits the authoritative 700 Credit price');
select is(
  (select quantity from public.user_cards where user_id = auth.uid() and card_id = 'nhl-rasmus-dahlin-base'),
  2,
  'purchasing an owned card increments quantity'
);
select is(
  public.purchase_card('base-purchase-once', 'base-market:nhl-rasmus-dahlin-base') ->> 'status',
  'already-processed',
  'identical purchase retry returns its immutable receipt'
);
select is((select credits from public.profiles where id = auth.uid()), 300, 'purchase retry does not debit twice');
select is((select count(*)::integer from public.purchase_receipts where user_id = auth.uid()), 1, 'purchase retry creates one receipt');
select throws_ok(
  $$select public.purchase_card('base-purchase-once', 'base-market:nhl-artemi-panarin-base')$$,
  '22023', 'Purchase request id was already used for a different offer.',
  'purchase request id cannot be reused for a different offer'
);
select throws_ok(
  $$select public.purchase_card('cannot-afford', 'base-market:nhl-connor-mcdavid-base')$$,
  'P0001', 'Not enough Credits.',
  'purchase with insufficient Credits is rejected atomically'
);
select is((select count(*)::integer from public.purchase_receipts where user_id = auth.uid()), 1, 'failed purchase creates no receipt');
select throws_ok(
  $$select public.purchase_card('expired-event', 'event-shop:frozen-frights:1900-01-01:nhl-brady-tkachuk-frozen-frights')$$,
  'P0001', 'Offer is not available.',
  'stale event offer cannot be purchased'
);

reset role;
update public.profiles set credits = 5000 where id = '77777777-7777-4777-8777-777777777777';
do $$
begin
  perform set_config(
    'test.active_event_offer',
    (select offer_id from public.current_market_offers(clock_timestamp()) where source = 'event_shop' order by offer_id limit 1),
    true
  );
end;
$$;
set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
set local request.jwt.claim.role = 'authenticated';
select is(
  public.purchase_card('active-event-purchase', current_setting('test.active_event_offer')) ->> 'status',
  'purchased',
  'a current event offer can be purchased through the same authoritative RPC'
);
select is(
  (select source from public.purchase_receipts where user_id = auth.uid() and client_request_id = 'active-event-purchase'),
  'event_shop',
  'event purchase receipt records its server-side source'
);

select lives_ok(
  $$select public.save_lineup(
    null::uuid,
    'Validated NHL Six',
    'nhl-circuit',
    '{"LW":"nhl-brady-tkachuk-base","C":"nhl-connor-mcdavid-base","RW":"nhl-mikko-rantanen-base","LD":"nhl-rasmus-dahlin-base","RD":"nhl-evan-bouchard-base","G":"nhl-igor-shesterkin-base"}'::jsonb
  )$$,
  'a complete owned lineup is saved'
);
select is(
  public.save_lineup(
    '99999999-9999-4999-8999-999999999999'::uuid,
    'Idempotent Create',
    'nhl-circuit',
    '{"LW":"nhl-brady-tkachuk-base","C":"nhl-connor-mcdavid-base","RW":"nhl-mikko-rantanen-base","LD":"nhl-rasmus-dahlin-base","RD":"nhl-evan-bouchard-base","G":"nhl-igor-shesterkin-base"}'::jsonb
  ) -> 'lineup' ->> 'id',
  '99999999-9999-4999-8999-999999999999',
  'a supplied client lineup id creates that exact row'
);
select is(
  public.save_lineup(
    '99999999-9999-4999-8999-999999999999'::uuid,
    'Idempotent Create Retry',
    'nhl-circuit',
    '{"LW":"nhl-brady-tkachuk-base","C":"nhl-connor-mcdavid-base","RW":"nhl-mikko-rantanen-base","LD":"nhl-rasmus-dahlin-base","RD":"nhl-evan-bouchard-base","G":"nhl-igor-shesterkin-base"}'::jsonb
  ) -> 'lineup' ->> 'id',
  '99999999-9999-4999-8999-999999999999',
  'retrying the supplied lineup id updates and returns the same row'
);
select is(
  (select count(*)::integer from public.lineups where id = '99999999-9999-4999-8999-999999999999'),
  1,
  'supplied lineup id retry creates exactly one row'
);
select lives_ok(
  $$select public.activate_lineup((select id from public.lineups where user_id = auth.uid() and name = 'Validated NHL Six'))$$,
  'a validated lineup is activated'
);
select is(
  (select count(*)::integer from public.lineups where user_id = auth.uid() and mode = 'nhl-circuit' and is_active),
  1,
  'only one lineup is active for a mode'
);
do $$
begin
  perform set_config(
    'test.user_one_lineup_id',
    (select id::text from public.lineups where user_id = auth.uid() and name = 'Validated NHL Six'),
    true
  );
end;
$$;
select throws_ok(
  $$select public.save_lineup(
    null::uuid, 'Wrong League', 'pwhl-circuit',
    '{"LW":"nhl-brady-tkachuk-base","C":"nhl-connor-mcdavid-base","RW":"nhl-mikko-rantanen-base","LD":"nhl-rasmus-dahlin-base","RD":"nhl-evan-bouchard-base","G":"nhl-igor-shesterkin-base"}'::jsonb
  )$$,
  '22023', 'A card does not match the lineup league.',
  'lineup with the wrong league is rejected'
);
select throws_ok(
  $$select public.save_lineup(
    null::uuid, 'Missing Goalie', 'nhl-circuit',
    '{"LW":"nhl-brady-tkachuk-base","C":"nhl-connor-mcdavid-base","RW":"nhl-mikko-rantanen-base","LD":"nhl-rasmus-dahlin-base","RD":"nhl-evan-bouchard-base"}'::jsonb
  )$$,
  '22023', 'A lineup must contain exactly LW, C, RW, LD, RD, and G.',
  'lineup with a missing slot is rejected'
);
select throws_ok(
  $$select public.save_lineup(
    null::uuid, 'Unowned Card', 'nhl-circuit',
    '{"LW":"nhl-kirill-kaprizov-base","C":"nhl-connor-mcdavid-base","RW":"nhl-mikko-rantanen-base","LD":"nhl-rasmus-dahlin-base","RD":"nhl-evan-bouchard-base","G":"nhl-igor-shesterkin-base"}'::jsonb
  )$$,
  '42501', 'Lineup contains a card quantity the user does not own.',
  'lineup with an unowned card is rejected'
);
select throws_ok(
  $$select public.save_lineup(
    null::uuid, 'Duplicate Card', 'nhl-circuit',
    '{"LW":"nhl-brady-tkachuk-base","C":"nhl-connor-mcdavid-base","RW":"nhl-connor-mcdavid-base","LD":"nhl-rasmus-dahlin-base","RD":"nhl-evan-bouchard-base","G":"nhl-igor-shesterkin-base"}'::jsonb
  )$$,
  '22023', 'The same card version cannot fill multiple lineup slots.',
  'lineup cannot reuse one card version'
);

reset role;
insert into public.rivalry_road_progress (
  user_id, current_step_index, completed_step_ids, status
) values (
  '77777777-7777-4777-8777-777777777777', 3,
  array['nhl-circuit-complete', 'pwhl-circuit-complete', 'open-ice-pro-win'],
  'choice-pending'
);
set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
set local request.jwt.claim.role = 'authenticated';
select is(
  public.claim_rivalry_reward('rivalry-choice-once', 'nhl-kirill-kaprizov-rivalry-2026') ->> 'status',
  'claimed',
  'unlocked Rivalry Road card is claimed'
);
select is(
  public.claim_rivalry_reward('rivalry-choice-once', 'nhl-kirill-kaprizov-rivalry-2026') ->> 'status',
  'already-claimed',
  'identical reward retry is idempotent'
);
select is((select count(*)::integer from public.reward_receipts where user_id = auth.uid()), 1, 'reward retry creates one immutable receipt');
select is(
  (select selected_card_id from public.rivalry_road_progress where user_id = auth.uid()),
  'nhl-kirill-kaprizov-rivalry-2026',
  'Rivalry Road stores the permanent card choice'
);
select throws_ok(
  $$select public.claim_rivalry_reward('different-choice', 'pwhl-kendall-coyne-schofield-rivalry-2026')$$,
  'P0001', 'Rivalry Road reward has already been claimed.',
  'a completed Rivalry Road choice cannot be changed'
);

reset role;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '88888888-8888-4888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'authority-other@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
set local role authenticated;
set local request.jwt.claim.sub = '88888888-8888-4888-8888-888888888888';
set local request.jwt.claim.role = 'authenticated';
select is((select count(*)::integer from public.user_cards), 0, 'another user cannot read the first user collection');
select is((select count(*)::integer from public.lineups), 0, 'another user cannot read the first user lineups');
select is((select count(*)::integer from public.purchase_receipts), 0, 'another user cannot read the first user purchases');
select is((select count(*)::integer from public.reward_receipts), 0, 'another user cannot read the first user reward receipts');
select throws_ok(
  $$select public.activate_lineup(current_setting('test.user_one_lineup_id')::uuid)$$,
  'P0002', 'Lineup not found.',
  'another user cannot activate a foreign lineup'
);
select throws_ok(
  $$select public.save_lineup(
    current_setting('test.user_one_lineup_id')::uuid,
    'Foreign Rewrite',
    'nhl-circuit',
    '{"LW":"nhl-brady-tkachuk-base","C":"nhl-connor-mcdavid-base","RW":"nhl-mikko-rantanen-base","LD":"nhl-rasmus-dahlin-base","RD":"nhl-evan-bouchard-base","G":"nhl-igor-shesterkin-base"}'::jsonb
  )$$,
  '42501', 'Lineup id belongs to another user.',
  'a supplied lineup id owned by another user is rejected explicitly'
);

select * from finish();
rollback;
