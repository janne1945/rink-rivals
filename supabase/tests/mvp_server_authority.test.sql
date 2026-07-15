begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'card_catalog', 'server card catalog exists');
select has_table('public', 'event_definitions', 'event definitions exist');
select has_table('public', 'purchase_receipts', 'immutable purchase receipts exist');
select has_table('public', 'reward_receipts', 'immutable reward receipts exist');
select has_table('public', 'ai_opponents', 'curated server opponents exist');
select is(
  (select count(*)::integer from public.card_catalog),
  1178,
  'all 1178 catalog cards are projected server-side'
);
select is(
  (select count(*)::integer from public.card_catalog where legacy_retained),
  6,
  'all six still-referenced legacy cards remain explicitly classified'
);
select is((select count(*)::integer from public.event_definitions), 10, 'all ten recurring events are configured');
select is((select count(*)::integer from public.event_definitions where is_active), 10, 'all ten recurring events remain active');
select is((select count(*)::integer from public.ai_opponents), 9, 'all mode and difficulty opponents are configured');
select is(
  (select count(*)::integer from public.current_market_offers('2026-07-14 12:00:00+00') where source = 'event_shop'),
  6,
  'the launch Signature Series rotation exposes the configured six-card offer window'
);
select is(
  (
    select array_agg(card_id order by card_id)
    from public.current_market_offers('2026-07-14 12:00:00+00')
    where source = 'event_shop'
  ),
  array[
    'nhl-david-pastrnak-signature-series',
    'nhl-jeremy-swayman-signature-series',
    'nhl-rasmus-dahlin-signature-series',
    'pwhl-marie-philip-poulin-signature-series',
    'pwhl-megan-keller-signature-series',
    'pwhl-sophie-jaques-signature-series'
  ]::text[],
  'the six-card event offer window is deterministic for a fixed server time'
);
select ok(
  not exists (
    with event_times as (
      select
        events.id as event_id,
        (
          timestamp '2026-07-13 12:00:00' +
          (
            (((events.rotation_order - 1) % 10 + 10) % 10) +
              occurrences.occurrence_number * 10
          ) * interval '7 days'
        ) at time zone 'UTC' as at_time
      from public.event_definitions events
      cross join generate_series(0, 11) occurrences(occurrence_number)
      where events.is_active
    ), offered as (
      select event_times.event_id, count(distinct offers.card_id)::integer as offered_count
      from event_times
      cross join lateral public.current_market_offers(event_times.at_time) offers
      where offers.source = 'event_shop' and offers.event_id = event_times.event_id
      group by event_times.event_id
    ), pools as (
      select catalog.set_id as event_id, count(*)::integer as pool_count
      from public.card_catalog catalog
      where catalog.card_type = 'event'
        and catalog.market_availability = 'event-shop'
        and catalog.is_active
        and exists (
          select 1
          from event_times
          where event_times.event_id = catalog.set_id
            and catalog.available_from <= event_times.at_time
            and event_times.at_time < catalog.available_to
        )
      group by catalog.set_id
    )
    select 1
    from pools
    left join offered using (event_id)
    where coalesce(offered.offered_count, 0) <> pools.pool_count
  ),
  'every eligible event card appears across recurring six-offer windows'
);
select is(
  (select count(*)::integer from public.current_market_offers('2026-07-14 12:00:00+00') where placement = 'spotlight'),
  1,
  'exactly one active event card receives the deterministic spotlight discount'
);
select ok(
  (select bool_and(price = greatest(1, round(regular_price * 0.85)::integer))
   from public.current_market_offers('2026-07-14 12:00:00+00') where placement = 'spotlight'),
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
  $$select public.claim_starter_team('nhl-edmonton-oilers')$$,
  'starter team prepares owned cards and an active NHL lineup'
);

reset role;
do $$
declare
  base_offer record;
  different_offer_id text;
  expensive_offer_id text;
begin
  select offers.offer_id, offers.card_id, offers.price
    into base_offer
  from public.current_market_offers(clock_timestamp()) offers
  where offers.source = 'base_market'
  order by offers.price, offers.card_id
  limit 1;

  select offers.offer_id into different_offer_id
  from public.current_market_offers(clock_timestamp()) offers
  where offers.source = 'base_market' and offers.card_id <> base_offer.card_id
  order by offers.card_id
  limit 1;

  select offers.offer_id into expensive_offer_id
  from public.current_market_offers(clock_timestamp()) offers
  where offers.source = 'base_market' and offers.price > 1000 - base_offer.price
  order by offers.price desc, offers.card_id
  limit 1;

  perform set_config('test.base_offer', base_offer.offer_id, true);
  perform set_config('test.base_card', base_offer.card_id, true);
  perform set_config('test.base_price', base_offer.price::text, true);
  perform set_config('test.different_base_offer', different_offer_id, true);
  perform set_config('test.expensive_base_offer', expensive_offer_id, true);
end;
$$;
set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
set local request.jwt.claim.role = 'authenticated';

select is(
  public.purchase_card('base-purchase-once', current_setting('test.base_offer')) ->> 'status',
  'purchased',
  'a server-priced permanent card purchase succeeds'
);
select is(
  (select credits from public.profiles where id = auth.uid()),
  1000 - current_setting('test.base_price')::integer,
  'base purchase debits the authoritative catalog price'
);
select is(
  (select quantity from public.user_cards where user_id = auth.uid() and card_id = current_setting('test.base_card')),
  1,
  'purchasing an unowned base card grants one copy'
);
select is(
  public.purchase_card('base-purchase-once', current_setting('test.base_offer')) ->> 'status',
  'already-processed',
  'identical purchase retry returns its immutable receipt'
);
select is(
  (select credits from public.profiles where id = auth.uid()),
  1000 - current_setting('test.base_price')::integer,
  'purchase retry does not debit twice'
);
select is((select count(*)::integer from public.purchase_receipts where user_id = auth.uid()), 1, 'purchase retry creates one receipt');
select throws_ok(
  $$select public.purchase_card('base-purchase-once', current_setting('test.different_base_offer'))$$,
  '22023', 'Purchase request id was already used for a different offer.',
  'purchase request id cannot be reused for a different offer'
);
do $$
begin
  perform set_config('test.insufficient_credits_rejected', 'false', true);
  begin
    perform public.purchase_card('cannot-afford', current_setting('test.expensive_base_offer'));
  exception
    when sqlstate 'P0001' then
      if sqlerrm is distinct from 'Not enough Credits.' then
        raise;
      end if;
      perform set_config('test.insufficient_credits_rejected', 'true', true);
  end;
end;
$$;
select is(
  current_setting('test.insufficient_credits_rejected'),
  'true',
  'purchase with insufficient Credits is rejected atomically'
);
select is((select count(*)::integer from public.purchase_receipts where user_id = auth.uid()), 1, 'failed purchase creates no receipt');
select throws_ok(
  $$select public.purchase_card('expired-event', 'event-shop:frozen-frights:1900-01-01:nhl-brady-tkachuk-frozen-frights')$$,
  'P0001', 'Offer is not available.',
  'stale event offer cannot be purchased'
);

reset role;
do $$
declare
  active_offer record;
begin
  select offers.offer_id, offers.price into active_offer
  from public.current_market_offers(clock_timestamp()) offers
  where offers.source = 'event_shop'
  order by offers.offer_id
  limit 1;

  if active_offer.offer_id is null then
    raise exception 'No active Event Shop offer is available for the purchase test.';
  end if;

  perform set_config('test.active_event_offer', active_offer.offer_id, true);
  update public.profiles
  set credits = active_offer.price
  where id = '77777777-7777-4777-8777-777777777777';
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

reset role;
do $$
begin
  perform set_config(
    'test.nhl_lineup',
    (
      select jsonb_object_agg(slots.slot, slots.card_id order by slots.slot)::text
      from public.lineup_slots slots
      where slots.lineup_id = (
        select profiles.starter_lineup_id
        from public.profiles profiles
        where profiles.id = '77777777-7777-4777-8777-777777777777'
      )
    ),
    true
  );
  perform set_config(
    'test.unowned_nhl_lw',
    (
      select catalog.card_id
      from public.card_catalog catalog
      left join public.user_cards owned
        on owned.user_id = '77777777-7777-4777-8777-777777777777'
       and owned.card_id = catalog.card_id
      where catalog.league = 'NHL'
        and catalog.is_active
        and 'LW' = any(catalog.eligible_positions)
        and owned.card_id is null
      order by catalog.card_id
      limit 1
    ),
    true
  );
end;
$$;
set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
set local request.jwt.claim.role = 'authenticated';

select lives_ok(
  $$select public.save_lineup(
    null::uuid,
    'Validated NHL Six',
    'nhl-circuit',
    current_setting('test.nhl_lineup')::jsonb
  )$$,
  'a complete owned lineup is saved'
);
select is(
  public.save_lineup(
    '99999999-9999-4999-8999-999999999999'::uuid,
    'Idempotent Create',
    'nhl-circuit',
    current_setting('test.nhl_lineup')::jsonb
  ) -> 'lineup' ->> 'id',
  '99999999-9999-4999-8999-999999999999',
  'a supplied client lineup id creates that exact row'
);
select is(
  public.save_lineup(
    '99999999-9999-4999-8999-999999999999'::uuid,
    'Idempotent Create Retry',
    'nhl-circuit',
    current_setting('test.nhl_lineup')::jsonb
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
    current_setting('test.nhl_lineup')::jsonb
  )$$,
  '22023', 'A card does not match the lineup league.',
  'lineup with the wrong league is rejected'
);
select throws_ok(
  $$select public.save_lineup(
    null::uuid, 'Missing Goalie', 'nhl-circuit',
    current_setting('test.nhl_lineup')::jsonb - 'G'
  )$$,
  '22023', 'A lineup must contain exactly LW, C, RW, LD, RD, and G.',
  'lineup with a missing slot is rejected'
);
select throws_ok(
  $$select public.save_lineup(
    null::uuid, 'Unowned Card', 'nhl-circuit',
    jsonb_set(
      current_setting('test.nhl_lineup')::jsonb,
      '{LW}',
      to_jsonb(current_setting('test.unowned_nhl_lw'))
    )
  )$$,
  '42501', 'Lineup contains a card quantity the user does not own.',
  'lineup with an unowned card is rejected'
);
select throws_ok(
  $$select public.save_lineup(
    null::uuid, 'Duplicate Card', 'nhl-circuit',
    jsonb_set(
      current_setting('test.nhl_lineup')::jsonb,
      '{RW}',
      current_setting('test.nhl_lineup')::jsonb -> 'C'
    )
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
    current_setting('test.nhl_lineup')::jsonb
  )$$,
  '42501', 'Lineup id belongs to another user.',
  'a supplied lineup id owned by another user is rejected explicitly'
);

select * from finish();
rollback;
