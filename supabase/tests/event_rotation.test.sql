begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

select has_function(
  'public',
  'resolve_event_rotation_slot',
  array['timestamp with time zone'],
  'the server exposes one internal event-slot resolver'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.resolve_event_rotation_slot(timestamptz)',
    'execute'
  ),
  'authenticated clients cannot call the internal event-slot resolver'
);
select is(
  (select count(*)::integer from public.event_definitions),
  10,
  'all ten event definitions remain present'
);
select is(
  (select count(*)::integer from public.event_definitions where is_active),
  10,
  'all ten event definitions remain active'
);

select is(
  public.resolve_event_rotation_slot('2026-07-14 12:00:00+00'),
  1,
  'the launch week resolves to the Signature Series slot'
);
select is(
  (
    select events.id
    from public.event_definitions events
    where events.rotation_order = public.resolve_event_rotation_slot('2026-07-14 12:00:00+00')
  ),
  'signature-series',
  'Signature Series is the deterministic current launch event'
);
select is(
  (
    select events.id
    from public.event_definitions events
    where events.rotation_order = public.resolve_event_rotation_slot('2026-07-19 23:59:59.999999+00')
  ),
  'signature-series',
  'Signature Series remains active until the UTC week boundary'
);
select is(
  (
    select events.id
    from public.event_definitions events
    where events.rotation_order = public.resolve_event_rotation_slot('2026-07-20 00:00:00+00')
  ),
  'winter-holidays',
  'the following UTC slot advances to Winter Holidays'
);

with sampled_cycle as (
  select
    weeks.week_offset,
    events.id as event_id
  from generate_series(0, 9) weeks(week_offset)
  join public.event_definitions events
    on events.rotation_order = public.resolve_event_rotation_slot(
      '2026-07-13 12:00:00+00'::timestamptz + weeks.week_offset * interval '7 days'
    )
)
select is(
  (select array_agg(event_id order by week_offset) from sampled_cycle),
  array[
    'signature-series',
    'winter-holidays',
    'winter-classic',
    'international-ice',
    'rising-stars',
    'playoff-heroes',
    'franchise-icons',
    'record-breakers',
    'clutch-performers',
    'frozen-frights'
  ]::text[],
  'the complete ten-week event cycle follows Signature Series in order'
);

with sampled_cycle as (
  select events.id as event_id
  from generate_series(0, 9) weeks(week_offset)
  join public.event_definitions events
    on events.rotation_order = public.resolve_event_rotation_slot(
      '2026-07-13 12:00:00+00'::timestamptz + weeks.week_offset * interval '7 days'
    )
)
select is(
  (select count(distinct event_id)::integer from sampled_cycle),
  10,
  'the complete cycle visits every event exactly once'
);
select is(
  (
    select events.id
    from public.event_definitions events
    where events.rotation_order = public.resolve_event_rotation_slot('2026-09-21 12:00:00+00')
  ),
  'signature-series',
  'the eleventh week starts the next cycle at Signature Series'
);

select is(
  (
    select count(distinct offers.event_id)::integer
    from public.current_market_offers('2026-07-14 12:00:00+00') offers
    where offers.source = 'event_shop'
  ),
  1,
  'the launch market contains offers from exactly one event'
);
select is(
  (
    select min(offers.event_id)
    from public.current_market_offers('2026-07-14 12:00:00+00') offers
    where offers.source = 'event_shop'
  ),
  'signature-series',
  'the launch market offers use Signature Series'
);
select ok(
  not exists (
    with sampled_cycle as (
      select
        weeks.week_offset,
        events.id as expected_event_id,
        '2026-07-13 12:00:00+00'::timestamptz +
          weeks.week_offset * interval '7 days' as at_time
      from generate_series(0, 9) weeks(week_offset)
      join public.event_definitions events
        on events.rotation_order = public.resolve_event_rotation_slot(
          '2026-07-13 12:00:00+00'::timestamptz + weeks.week_offset * interval '7 days'
        )
    )
    select 1
    from sampled_cycle
    cross join lateral public.current_market_offers(sampled_cycle.at_time) offers
    where offers.source = 'event_shop'
    group by sampled_cycle.week_offset, sampled_cycle.expected_event_id
    having count(*) <> 6
      or count(distinct offers.event_id) <> 1
      or min(offers.event_id) <> sampled_cycle.expected_event_id
  ),
  'every week in the full cycle exposes six offers from only its resolved event'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '99999999-9999-4999-8999-999999999999',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'event-rotation-test@example.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

set local role authenticated;
set local request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';
set local request.jwt.claim.role = 'authenticated';
select lives_ok(
  $$select set_config('test.event_rotation_market_state', public.get_market_state()::text, true)$$,
  'an authenticated test user can load the server market state'
);
reset role;

select is(
  current_setting('test.event_rotation_market_state')::jsonb #>> '{current_event,id}',
  (
    select events.id
    from public.event_definitions events
    where events.rotation_order = public.resolve_event_rotation_slot(
      (current_setting('test.event_rotation_market_state')::jsonb ->> 'server_time')::timestamptz
    )
  ),
  'authenticated get_market_state returns the event resolved at its server time'
);
select ok(
  not exists (
    select 1
    from jsonb_array_elements(
      current_setting('test.event_rotation_market_state')::jsonb -> 'offers'
    ) offers(offer)
    where offer ->> 'source' = 'event_shop'
      and offer ->> 'event_id' <>
        current_setting('test.event_rotation_market_state')::jsonb #>> '{current_event,id}'
  ),
  'authenticated market metadata and event offers cannot diverge'
);

select * from finish();
rollback;
