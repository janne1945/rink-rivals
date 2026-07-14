-- Signature Series launches in the UTC week beginning 2026-07-13. Event
-- definitions and their active state remain unchanged; only the recurring slot
-- calculation moves to the new launch phase.
create or replace function public.resolve_event_rotation_slot(at_time timestamptz)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  with rotation_clock as (
    select floor(extract(epoch from (
      date_trunc('week', at_time at time zone 'UTC') - timestamp '2026-07-13 00:00:00'
    )) / 604800)::bigint as launch_week_index
  )
  select ((((launch_week_index + 1) % 10) + 10) % 10)::integer
  from rotation_clock;
$$;

revoke all on function public.resolve_event_rotation_slot(timestamptz)
  from public, anon, authenticated;

-- Keep the original market week index for deck occurrence and spotlight
-- placement. That preserves offer selection and discount cadence while the
-- event identity follows the new launch rotation.
create or replace function public.current_market_offers(at_time timestamptz)
returns table (
  offer_id text,
  card_id text,
  source text,
  regular_price integer,
  price integer,
  event_id text,
  placement text,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with market_clock as (
    select
      date_trunc('week', at_time at time zone 'UTC') as starts_utc,
      floor(extract(epoch from (
        date_trunc('week', at_time at time zone 'UTC') - timestamp '2026-01-05 00:00:00'
      )) / 604800)::bigint as week_index
  ), active_event as (
    select
      events.id,
      market_clock.starts_utc,
      market_clock.week_index,
      floor(market_clock.week_index::numeric / 10)::bigint as occurrence_index
    from market_clock
    join public.event_definitions events
      on events.rotation_order = public.resolve_event_rotation_slot(at_time)
    where events.is_active
  ), eligible_event_pool as (
    select
      cards.card_id,
      cards.price,
      cards.available_from,
      cards.available_to,
      active_event.id as event_id,
      active_event.starts_utc,
      active_event.week_index,
      active_event.occurrence_index
    from active_event
    join public.card_catalog cards on cards.set_id = active_event.id
    where cards.is_active
      and cards.card_type = 'event'
      and cards.market_availability = 'event-shop'
      and not cards.is_permanent
      and not cards.is_reward_only
      and cards.available_from <= at_time
      and at_time < cards.available_to
  ), ranked_event_pool as (
    select
      eligible_event_pool.*,
      row_number() over (
        partition by eligible_event_pool.event_id
        order by md5(
          'rink-rivals:' || eligible_event_pool.event_id || ':v1:' ||
            eligible_event_pool.card_id
        ), eligible_event_pool.card_id
      ) - 1 as deck_index,
      count(*) over (partition by eligible_event_pool.event_id) as pool_count
    from eligible_event_pool
  ), event_pool as (
    select
      ranked_event_pool.*,
      rotated.selection_index + 1 as offer_number,
      least(6::bigint, ranked_event_pool.pool_count) as offer_count
    from ranked_event_pool
    cross join lateral (
      select (
        ranked_event_pool.deck_index - (
          (
            (ranked_event_pool.occurrence_index * 6) % ranked_event_pool.pool_count +
              ranked_event_pool.pool_count
          ) % ranked_event_pool.pool_count
        ) + ranked_event_pool.pool_count
      ) % ranked_event_pool.pool_count as selection_index
    ) rotated
    where rotated.selection_index < least(6::bigint, ranked_event_pool.pool_count)
  )
  select
    'base-market:' || cards.card_id,
    cards.card_id,
    'base_market'::text,
    cards.price,
    cards.price,
    null::text,
    'standard'::text,
    null::timestamptz,
    null::timestamptz
  from public.card_catalog cards
  where cards.is_active
    and cards.card_type = 'base'
    and cards.market_availability = 'base-market'
    and cards.is_permanent
    and not cards.is_reward_only
    and cards.available_from is null
    and cards.available_to is null
  union all
  select
    'event-shop:' || event_pool.event_id || ':' ||
      to_char(event_pool.starts_utc, 'YYYY-MM-DD') || ':' || event_pool.card_id,
    event_pool.card_id,
    'event_shop'::text,
    event_pool.price,
    case when event_pool.offer_number = 1 + (
      ((event_pool.week_index % event_pool.offer_count) + event_pool.offer_count) % event_pool.offer_count
    ) then greatest(1, round(event_pool.price * 0.85)::integer) else event_pool.price end,
    event_pool.event_id,
    case when event_pool.offer_number = 1 + (
      ((event_pool.week_index % event_pool.offer_count) + event_pool.offer_count) % event_pool.offer_count
    ) then 'spotlight'::text else 'standard'::text end,
    greatest(
      event_pool.starts_utc at time zone 'UTC',
      event_pool.available_from
    ),
    least(
      (event_pool.starts_utc + interval '7 days') at time zone 'UTC',
      event_pool.available_to
    )
  from event_pool;
$$;

revoke all on function public.current_market_offers(timestamptz)
  from public, anon, authenticated;

create or replace function public.get_market_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  market_time timestamptz := clock_timestamp();
  starts_utc timestamp := date_trunc('week', market_time at time zone 'UTC');
  current_event public.event_definitions%rowtype;
  offers jsonb;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into current_event
  from public.event_definitions events
  where events.rotation_order = public.resolve_event_rotation_slot(market_time)
    and events.is_active;

  if not found then
    raise exception 'No active event is configured for the current rotation.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'offer_id', market.offer_id,
    'card_id', market.card_id,
    'source', market.source,
    'regular_price', market.regular_price,
    'price', market.price,
    'event_id', market.event_id,
    'placement', market.placement,
    'starts_at', market.starts_at,
    'ends_at', market.ends_at,
    'owned_quantity', coalesce(owned.quantity, 0)
  ) order by market.source, market.placement desc, market.offer_id), '[]'::jsonb)
  into offers
  from public.current_market_offers(market_time) market
  left join public.user_cards owned
    on owned.user_id = requesting_user_id and owned.card_id = market.card_id;

  return jsonb_build_object(
    'server_time', market_time,
    'current_event', jsonb_build_object(
      'id', current_event.id,
      'name', current_event.name,
      'description', current_event.description,
      'starts_at', starts_utc at time zone 'UTC',
      'ends_at', (starts_utc + interval '7 days') at time zone 'UTC',
      'visual_metadata', current_event.visual_metadata
    ),
    'offers', offers
  );
end;
$$;

revoke all on function public.get_market_state() from public, anon;
grant execute on function public.get_market_state() to authenticated;
