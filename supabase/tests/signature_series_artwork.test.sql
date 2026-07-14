begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- The correction is intentionally narrow: nine approved artworks are live and
-- the previous Hilary Knight row remains as one closed historical CardVersion.
select is(
  (select count(*)::integer from public.card_catalog where set_id = 'signature-series'),
  10,
  'Signature Series retains exactly ten catalog rows'
);
select is(
  (
    select count(*)::integer
    from public.card_catalog cards
    where cards.set_id = 'signature-series'
      and cards.available_from <= '2026-07-14 12:00:00+00'::timestamptz
      and '2026-07-14 12:00:00+00'::timestamptz < cards.available_to
  ),
  9,
  'exactly nine approved Signature artworks are available during launch week'
);
select is(
  (
    select array_agg(cards.card_id order by cards.card_id)
    from public.card_catalog cards
    where cards.set_id = 'signature-series'
      and cards.available_from <= '2026-07-14 12:00:00+00'::timestamptz
      and '2026-07-14 12:00:00+00'::timestamptz < cards.available_to
  ),
  array[
    'nhl-cale-makar-signature-series',
    'nhl-connor-mcdavid-signature-series',
    'nhl-david-pastrnak-signature-series',
    'nhl-jeremy-swayman-signature-series',
    'nhl-rasmus-dahlin-signature-series',
    'pwhl-marie-philip-poulin-signature-series',
    'pwhl-megan-keller-signature-series',
    'pwhl-raygan-kirk-signature-series',
    'pwhl-sophie-jaques-signature-series'
  ]::text[],
  'the launch Signature pool contains exactly the nine artwork-backed CardVersions'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_object(
        'cardId', cards.card_id,
        'availableTo', cards.available_to,
        'treatment', cards.visual_metadata ->> 'treatment'
      ) order by cards.card_id
    )
    from public.card_catalog cards
    where cards.set_id = 'signature-series'
      and not (
        cards.available_from <= '2026-07-14 12:00:00+00'::timestamptz
        and '2026-07-14 12:00:00+00'::timestamptz < cards.available_to
      )
  ),
  jsonb_build_array(jsonb_build_object(
    'cardId', 'pwhl-hilary-knight-signature-series',
    'availableTo', '2026-07-13 00:00:00+00'::timestamptz,
    'treatment', 'neutral-placeholder'
  )),
  'Hilary Knight is the only retained historical Signature row and is closed before launch'
);

-- This is the audited artwork-to-CardVersion ledger. It deliberately includes
-- both the five visible artwork labels and every derived in-game attribute so
-- a drift in either source or mapping fails one deterministic assertion.
select is(
  (
    select jsonb_agg(
      jsonb_build_object(
        'cardId', cards.card_id,
        'playerId', cards.player_id,
        'position', cards.eligible_positions,
        'role', cards.role,
        'overall', cards.overall,
        'artworkAttributes', cards.visual_metadata -> 'artworkAttributes',
        'attributes', cards.attributes,
        'price', cards.price,
        'imageReference', cards.image_reference
      ) order by cards.card_id
    )
    from public.card_catalog cards
    where cards.set_id = 'signature-series'
      and cards.visual_metadata ->> 'treatment' = 'approved-local-asset'
  ),
  $expected_signature_matrix$[
    {
      "cardId":"nhl-cale-makar-signature-series",
      "playerId":"nhl-cale-makar",
      "position":["RD"],
      "role":"skater",
      "overall":95,
      "artworkAttributes":{"SPD":97,"SHT":92,"PLY":96,"DEF":97,"CLT":95},
      "attributes":{"speed":97,"shooting":92,"passing":96,"puckControl":96,"defense":97,"physicality":97,"hockeyIq":96,"clutch":95},
      "price":23000,
      "imageReference":"player-asset:nhl-cale-makar/event/nhl-cale-makar-signature-series"
    },
    {
      "cardId":"nhl-connor-mcdavid-signature-series",
      "playerId":"nhl-connor-mcdavid",
      "position":["C"],
      "role":"skater",
      "overall":96,
      "artworkAttributes":{"SPD":99,"SHT":95,"PLY":98,"DEF":86,"CLT":97},
      "attributes":{"speed":99,"shooting":95,"passing":98,"puckControl":98,"defense":86,"physicality":86,"hockeyIq":98,"clutch":97},
      "price":24500,
      "imageReference":"player-asset:nhl-connor-mcdavid/event/nhl-connor-mcdavid-signature-series"
    },
    {
      "cardId":"nhl-david-pastrnak-signature-series",
      "playerId":"nhl-david-pastrnak",
      "position":["RW"],
      "role":"skater",
      "overall":94,
      "artworkAttributes":{"SPD":93,"SHT":95,"PLY":94,"DEF":86,"CLT":92},
      "attributes":{"speed":93,"shooting":95,"passing":94,"puckControl":94,"defense":86,"physicality":86,"hockeyIq":94,"clutch":92},
      "price":21500,
      "imageReference":"player-asset:nhl-david-pastrnak/event/nhl-david-pastrnak-signature-series"
    },
    {
      "cardId":"nhl-jeremy-swayman-signature-series",
      "playerId":"nhl-jeremy-swayman",
      "position":["G"],
      "role":"goalie",
      "overall":92,
      "artworkAttributes":{"HGH":93,"LOW":92,"QCK":93,"POS":91,"RBC":91},
      "attributes":{"reflexes":93,"positioning":91,"glove":93,"blocker":92,"reboundControl":91,"puckHandling":91,"consistency":91,"clutch":91},
      "price":18500,
      "imageReference":"player-asset:nhl-jeremy-swayman/event/nhl-jeremy-swayman-signature-series"
    },
    {
      "cardId":"nhl-rasmus-dahlin-signature-series",
      "playerId":"nhl-rasmus-dahlin",
      "position":["RD"],
      "role":"skater",
      "overall":93,
      "artworkAttributes":{"SPD":92,"SHT":91,"PLY":93,"DEF":94,"CLT":93},
      "attributes":{"speed":92,"shooting":91,"passing":93,"puckControl":93,"defense":94,"physicality":94,"hockeyIq":93,"clutch":93},
      "price":20000,
      "imageReference":"player-asset:nhl-rasmus-dahlin/event/nhl-rasmus-dahlin-signature-series"
    },
    {
      "cardId":"pwhl-marie-philip-poulin-signature-series",
      "playerId":"pwhl-marie-philip-poulin",
      "position":["C"],
      "role":"skater",
      "overall":96,
      "artworkAttributes":{"SPD":94,"SHT":93,"PLY":96,"DEF":92,"CLT":95},
      "attributes":{"speed":94,"shooting":93,"passing":96,"puckControl":96,"defense":92,"physicality":92,"hockeyIq":96,"clutch":95},
      "price":24500,
      "imageReference":"player-asset:pwhl-marie-philip-poulin/event/pwhl-marie-philip-poulin-signature-series"
    },
    {
      "cardId":"pwhl-megan-keller-signature-series",
      "playerId":"pwhl-megan-keller",
      "position":["RD"],
      "role":"skater",
      "overall":94,
      "artworkAttributes":{"SPD":92,"SHT":88,"PLY":91,"DEF":95,"CLT":93},
      "attributes":{"speed":92,"shooting":88,"passing":91,"puckControl":91,"defense":95,"physicality":95,"hockeyIq":91,"clutch":93},
      "price":21500,
      "imageReference":"player-asset:pwhl-megan-keller/event/pwhl-megan-keller-signature-series"
    },
    {
      "cardId":"pwhl-raygan-kirk-signature-series",
      "playerId":"pwhl-raygan-kirk",
      "position":["G"],
      "role":"goalie",
      "overall":92,
      "artworkAttributes":{"HGH":91,"LOW":92,"QCK":92,"POS":93,"RBC":90},
      "attributes":{"reflexes":92,"positioning":93,"glove":91,"blocker":92,"reboundControl":90,"puckHandling":90,"consistency":93,"clutch":93},
      "price":18500,
      "imageReference":"player-asset:pwhl-raygan-kirk/event/pwhl-raygan-kirk-signature-series"
    },
    {
      "cardId":"pwhl-sophie-jaques-signature-series",
      "playerId":"pwhl-sophie-jaques",
      "position":["RD"],
      "role":"skater",
      "overall":93,
      "artworkAttributes":{"SPD":91,"SHT":87,"PLY":93,"DEF":94,"CLT":92},
      "attributes":{"speed":91,"shooting":87,"passing":93,"puckControl":93,"defense":94,"physicality":94,"hockeyIq":93,"clutch":92},
      "price":20000,
      "imageReference":"player-asset:pwhl-sophie-jaques/event/pwhl-sophie-jaques-signature-series"
    }
  ]$expected_signature_matrix$::jsonb,
  'every approved artwork has the exact player, position, OVR, visible values, mapped attributes, CardVersion ID, reference, and price'
);

select ok(
  not exists (
    select 1
    from public.card_catalog cards
    where cards.set_id = 'signature-series'
      and cards.visual_metadata ->> 'treatment' = 'approved-local-asset'
      and (
        cards.card_id <> cards.player_id || '-signature-series'
        or cards.image_reference <> 'player-asset:' || cards.player_id || '/event/' || cards.card_id
        or cards.overall <> (cards.visual_metadata ->> 'artworkOverall')::integer
        or cards.price <> 6500 + (cards.overall - 84) * 1500
      )
  ),
  'approved Signature IDs, asset references, artwork OVRs, and derived prices cannot diverge'
);
select ok(
  not exists (
    select cards.image_reference
    from public.card_catalog cards
    where cards.set_id = 'signature-series'
      and cards.visual_metadata ->> 'treatment' = 'approved-local-asset'
    group by cards.image_reference
    having count(*) <> 1
  ),
  'each approved Signature artwork reference belongs to exactly one CardVersion'
);
select is(
  (
    select count(*)::integer
    from public.card_catalog cards
    where cards.set_id = 'signature-series'
      and cards.visual_metadata ->> 'treatment' = 'approved-local-asset'
      and cards.role = 'goalie'
      and cards.eligible_positions = array['G']::text[]
  ),
  2,
  'both goalie artworks remain goalie CardVersions with only G eligibility'
);
select ok(
  not exists (
    select 1
    from public.card_catalog cards
    where cards.set_id = 'signature-series'
      and cards.visual_metadata ->> 'treatment' = 'approved-local-asset'
      and (
        (
          cards.role = 'skater'
          and (
            (cards.attributes ->> 'speed')::integer <> (cards.visual_metadata #>> '{artworkAttributes,SPD}')::integer
            or (cards.attributes ->> 'shooting')::integer <> (cards.visual_metadata #>> '{artworkAttributes,SHT}')::integer
            or (cards.attributes ->> 'passing')::integer <> (cards.visual_metadata #>> '{artworkAttributes,PLY}')::integer
            or (cards.attributes ->> 'puckControl')::integer <> (cards.visual_metadata #>> '{artworkAttributes,PLY}')::integer
            or (cards.attributes ->> 'defense')::integer <> (cards.visual_metadata #>> '{artworkAttributes,DEF}')::integer
            or (cards.attributes ->> 'physicality')::integer <> (cards.visual_metadata #>> '{artworkAttributes,DEF}')::integer
            or (cards.attributes ->> 'hockeyIq')::integer <> (cards.visual_metadata #>> '{artworkAttributes,PLY}')::integer
            or (cards.attributes ->> 'clutch')::integer <> (cards.visual_metadata #>> '{artworkAttributes,CLT}')::integer
          )
        )
        or (
          cards.role = 'goalie'
          and (
            (cards.attributes ->> 'reflexes')::integer <> (cards.visual_metadata #>> '{artworkAttributes,QCK}')::integer
            or (cards.attributes ->> 'positioning')::integer <> (cards.visual_metadata #>> '{artworkAttributes,POS}')::integer
            or (cards.attributes ->> 'glove')::integer <> (cards.visual_metadata #>> '{artworkAttributes,HGH}')::integer
            or (cards.attributes ->> 'blocker')::integer <> (cards.visual_metadata #>> '{artworkAttributes,LOW}')::integer
            or (cards.attributes ->> 'reboundControl')::integer <> (cards.visual_metadata #>> '{artworkAttributes,RBC}')::integer
            or (cards.attributes ->> 'puckHandling')::integer <> (cards.visual_metadata #>> '{artworkAttributes,RBC}')::integer
            or (cards.attributes ->> 'consistency')::integer <> (cards.visual_metadata #>> '{artworkAttributes,POS}')::integer
            or (cards.attributes ->> 'clutch')::integer <> (cards.visual_metadata #>> '{artworkAttributes,POS}')::integer
          )
        )
      )
  ),
  'all skater and goalie gameplay attributes follow the documented artwork mapping'
);
select has_check(
  'public',
  'card_catalog',
  'the database has a check constraint for catalog integrity'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraints
    where constraints.conrelid = 'public.card_catalog'::regclass
      and constraints.conname = 'card_catalog_signature_artwork_contract_check'
      and constraints.contype = 'c'
  ),
  'the named approved Signature artwork contract exists'
);
select ok(
  (
    select constraints.convalidated
    from pg_catalog.pg_constraint constraints
    where constraints.conrelid = 'public.card_catalog'::regclass
      and constraints.conname = 'card_catalog_signature_artwork_contract_check'
  ),
  'the Signature artwork contract is validated against existing catalog rows'
);

-- Fixed launch timestamps exercise the rotation independently of the test run
-- date. The recurrence proves deck rotation eventually exposes all nine assets.
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
  (
    select events.id
    from public.event_definitions events
    where events.rotation_order = public.resolve_event_rotation_slot('2026-07-14 12:00:00+00')
  ),
  'signature-series',
  'the launch slot resolves to Signature Series'
);
select is(
  (
    select events.id
    from public.event_definitions events
    where events.rotation_order = public.resolve_event_rotation_slot('2026-07-20 12:00:00+00')
  ),
  'winter-holidays',
  'the following weekly slot advances to Winter Holidays'
);
with sampled_cycle as (
  select
    weeks.week_offset,
    events.id as event_id
  from generate_series(0, 9) weeks(week_offset)
  join public.event_definitions events
    on events.rotation_order = public.resolve_event_rotation_slot(
      '2026-07-14 12:00:00+00'::timestamptz + weeks.week_offset * interval '7 days'
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
  'the complete ten-event cycle remains deterministic after the catalog correction'
);
select is(
  (
    select count(*)::integer
    from public.current_market_offers('2026-07-14 12:00:00+00') offers
    where offers.source = 'event_shop'
  ),
  6,
  'the launch Signature market contains exactly six offers'
);
select is(
  (
    select array_agg(offers.card_id order by offers.card_id)
    from public.current_market_offers('2026-07-14 12:00:00+00') offers
    where offers.source = 'event_shop'
  ),
  array[
    'nhl-david-pastrnak-signature-series',
    'nhl-jeremy-swayman-signature-series',
    'nhl-rasmus-dahlin-signature-series',
    'pwhl-marie-philip-poulin-signature-series',
    'pwhl-megan-keller-signature-series',
    'pwhl-sophie-jaques-signature-series'
  ]::text[],
  'the launch Signature offer set is deterministic and contains only audited artwork cards'
);
select is(
  (
    select count(distinct offers.card_id)::integer
    from public.current_market_offers('2026-07-14 12:00:00+00') offers
    where offers.source = 'event_shop'
  ),
  6,
  'the launch Signature market contains six unique CardVersions'
);
select is(
  (
    select count(*)::integer
    from public.current_market_offers('2026-07-14 12:00:00+00') offers
    where offers.source = 'event_shop' and offers.placement = 'spotlight'
  ),
  1,
  'the launch Signature market has exactly one spotlight offer'
);
select ok(
  not exists (
    select 1
    from public.current_market_offers('2026-07-14 12:00:00+00') offers
    join public.card_catalog cards on cards.card_id = offers.card_id
    where offers.source = 'event_shop'
      and (
        offers.event_id <> 'signature-series'
        or cards.visual_metadata ->> 'treatment' <> 'approved-local-asset'
        or cards.image_reference <> 'player-asset:' || cards.player_id || '/event/' || cards.card_id
      )
  ),
  'every launch Signature offer uses its approved direct asset reference'
);
select ok(
  not exists (
    select 1
    from public.current_market_offers('2026-07-14 12:00:00+00') offers
    join public.card_catalog cards on cards.card_id = offers.card_id
    where offers.source = 'event_shop'
      and (
        offers.regular_price <> cards.price
        or (
          offers.placement = 'spotlight'
          and offers.price <> greatest(1, round(cards.price * 0.85)::integer)
        )
        or (offers.placement <> 'spotlight' and offers.price <> cards.price)
      )
  ),
  'Signature offers preserve the catalog price and apply only the existing spotlight discount'
);
select is(
  (
    select count(distinct offers.card_id)::integer
    from (values
      ('2026-07-14 12:00:00+00'::timestamptz),
      ('2026-09-21 12:00:00+00'::timestamptz)
    ) sampled_signature_weeks(at_time)
    cross join lateral public.current_market_offers(sampled_signature_weeks.at_time) offers
    where offers.source = 'event_shop'
      and offers.event_id = 'signature-series'
  ),
  9,
  'the launch and following Signature occurrence expose all nine approved artworks'
);
select ok(
  not exists (
    select 1
    from (values
      ('2026-07-14 12:00:00+00'::timestamptz),
      ('2026-09-21 12:00:00+00'::timestamptz)
    ) sampled_signature_weeks(at_time)
    cross join lateral public.current_market_offers(sampled_signature_weeks.at_time) offers
    join public.card_catalog cards on cards.card_id = offers.card_id
    where offers.source = 'event_shop'
      and (
        offers.event_id <> 'signature-series'
        or cards.visual_metadata ->> 'treatment' <> 'approved-local-asset'
      )
  ),
  'both sampled Signature occurrences contain only approved artwork cards'
);

-- Exercise the real authenticated RPC and its RLS-aware ownership join. The
-- first assertion is stable for all dates; the second is the deployment-week
-- guarantee and remains non-vacuous while this launch migration is deployed.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '98989898-9898-4989-8989-989898989898',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'signature-artwork-test@example.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

set local role authenticated;
set local request.jwt.claim.sub = '98989898-9898-4989-8989-989898989898';
set local request.jwt.claim.role = 'authenticated';
select lives_ok(
  $$select set_config('test.signature_market_state', public.get_market_state()::text, true)$$,
  'an authenticated test user can load the Signature launch market state'
);
reset role;

select is(
  current_setting('test.signature_market_state')::jsonb #>> '{current_event,id}',
  (
    select events.id
    from public.event_definitions events
    where events.rotation_order = public.resolve_event_rotation_slot(
      (current_setting('test.signature_market_state')::jsonb ->> 'server_time')::timestamptz
    )
  ),
  'authenticated get_market_state returns the event resolved for its own server time'
);
select ok(
  (
    (current_setting('test.signature_market_state')::jsonb ->> 'server_time')::timestamptz
      < '2026-07-13 00:00:00+00'::timestamptz
    or (current_setting('test.signature_market_state')::jsonb ->> 'server_time')::timestamptz
      >= '2026-07-20 00:00:00+00'::timestamptz
    or (
      current_setting('test.signature_market_state')::jsonb #>> '{current_event,id}' = 'signature-series'
      and (
        select count(*)
        from jsonb_array_elements(
          current_setting('test.signature_market_state')::jsonb -> 'offers'
        ) offers(offer)
        where offer ->> 'source' = 'event_shop'
          and offer ->> 'event_id' = 'signature-series'
      ) = 6
      and (
        select count(distinct offer ->> 'card_id')
        from jsonb_array_elements(
          current_setting('test.signature_market_state')::jsonb -> 'offers'
        ) offers(offer)
        where offer ->> 'source' = 'event_shop'
      ) = 6
      and (
        select count(*)
        from jsonb_array_elements(
          current_setting('test.signature_market_state')::jsonb -> 'offers'
        ) offers(offer)
        where offer ->> 'source' = 'event_shop'
          and offer ->> 'placement' = 'spotlight'
      ) = 1
    )
  ),
  'during deployment week authenticated get_market_state returns six unique Signature offers and one spotlight'
);
select ok(
  not exists (
    select 1
    from jsonb_array_elements(
      current_setting('test.signature_market_state')::jsonb -> 'offers'
    ) offers(offer)
    where offer ->> 'source' = 'event_shop'
      and (
        offer ->> 'event_id' <>
          current_setting('test.signature_market_state')::jsonb #>> '{current_event,id}'
        or not exists (
          select 1
          from public.card_catalog cards
          where cards.card_id = offer ->> 'card_id'
            and (
              offer ->> 'event_id' <> 'signature-series'
              or cards.visual_metadata ->> 'treatment' = 'approved-local-asset'
            )
        )
      )
  ),
  'authenticated market offers match their event and Signature offers use approved assets'
);

select * from finish();
rollback;
