-- Align the Signature Series catalog with the nine approved, existing full-card
-- artworks. Event rotation, non-Signature cards, pricing rules, and account
-- balances remain untouched. Because the five replacements represent different
-- players and positions, the migration aborts if a retired ID gained an
-- account, lineup, reward, or match-history reference after the deployment
-- audit; historical identities are never silently relabeled.

begin;

-- Freeze catalog-backed purchase/lineup resolution for the short correction
-- transaction so the zero-reference audit and retirement cannot race a write.
lock table public.card_catalog in access exclusive mode;

create temporary table signature_card_id_migrations (
  old_card_id text primary key,
  new_card_id text not null unique
) on commit drop;

-- BEGIN GENERATED SIGNATURE CARD ID MIGRATIONS
insert into signature_card_id_migrations (old_card_id, new_card_id) values
  ('nhl-drake-batherson-signature-series', 'nhl-jeremy-swayman-signature-series'),
  ('nhl-dylan-larkin-signature-series', 'nhl-rasmus-dahlin-signature-series'),
  ('nhl-evgeni-malkin-signature-series', 'pwhl-megan-keller-signature-series'),
  ('nhl-mark-stone-signature-series', 'pwhl-raygan-kirk-signature-series'),
  ('pwhl-erin-ambrose-signature-series', 'pwhl-sophie-jaques-signature-series');
-- END GENERATED SIGNATURE CARD ID MIGRATIONS

do $signature_preconditions$
declare
  old_count integer;
  conflicting_new_count integer;
begin
  select count(*)::integer into old_count
  from public.card_catalog cards
  join signature_card_id_migrations migrations
    on migrations.old_card_id = cards.card_id
  where cards.set_id = 'signature-series';

  select count(*)::integer into conflicting_new_count
  from public.card_catalog cards
  join signature_card_id_migrations migrations
    on migrations.new_card_id = cards.card_id;

  if old_count <> 5 or conflicting_new_count <> 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'Signature correction expected five old IDs and no new IDs (found %s old / %s new).',
        old_count,
        conflicting_new_count
      );
  end if;

  if exists (
    select 1 from public.user_cards records
    join signature_card_id_migrations migrations on migrations.old_card_id = records.card_id
  ) or exists (
    select 1 from public.lineup_slots records
    join signature_card_id_migrations migrations on migrations.old_card_id = records.card_id
  ) or exists (
    select 1 from public.purchase_receipts records
    join signature_card_id_migrations migrations on migrations.old_card_id = records.card_id
  ) or exists (
    select 1 from public.match_rounds records
    join signature_card_id_migrations migrations
      on migrations.old_card_id in (records.player_card_id, records.opponent_card_id)
  ) or exists (
    select 1 from public.rivalry_reward_options records
    join signature_card_id_migrations migrations on migrations.old_card_id = records.card_id
  ) or exists (
    select 1 from public.starter_team_cards records
    join signature_card_id_migrations migrations on migrations.old_card_id = records.card_id
  ) or exists (
    select 1
    from public.match_tickets records
    cross join signature_card_id_migrations migrations
    where position(to_jsonb(migrations.old_card_id)::text in records.lineup_snapshot::text) > 0
       or position(to_jsonb(migrations.old_card_id)::text in records.opponent_snapshot::text) > 0
       or position(to_jsonb(migrations.old_card_id)::text in records.situations_snapshot::text) > 0
  ) or exists (
    select 1
    from public.match_rounds records
    cross join signature_card_id_migrations migrations
    where position(to_jsonb(migrations.old_card_id)::text in records.transcript::text) > 0
  ) or exists (
    select 1
    from public.match_rewards records
    cross join signature_card_id_migrations migrations
    where position(to_jsonb(migrations.old_card_id)::text in records.breakdown::text) > 0
  ) or exists (
    select 1
    from public.starter_grant_receipts records
    cross join signature_card_id_migrations migrations
    where position(to_jsonb(migrations.old_card_id)::text in records.card_snapshot::text) > 0
  ) or exists (
    select 1
    from public.starter_migration_audits records
    cross join signature_card_id_migrations migrations
    where position(to_jsonb(migrations.old_card_id)::text in records.ownership_snapshot::text) > 0
       or position(to_jsonb(migrations.old_card_id)::text in records.open_ticket_snapshot::text) > 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'A retired Signature CardVersion has an account or gameplay-history reference; aborting to preserve its player identity.';
  end if;

  if exists (
    select 1
    from public.ai_opponents opponents
    cross join signature_card_id_migrations migrations
    where migrations.old_card_id <> 'nhl-dylan-larkin-signature-series'
      and position(to_jsonb(migrations.old_card_id)::text in opponents.lineup_slots::text) > 0
  ) or (
    select count(*)
    from public.ai_opponents opponents
    where position(
      to_jsonb('nhl-dylan-larkin-signature-series'::text)::text
      in opponents.lineup_slots::text
    ) > 0
  ) <> 2 then
    raise exception using
      errcode = '23514',
      message = 'Signature correction expected exactly the two reviewed Dylan Larkin AI lineup references.';
  end if;
end
$signature_preconditions$;

-- The original launch contract capped every Event at 90 OVR. Approved
-- Signature artwork is the authoritative 92-96 source, so replace only that
-- constraint and retain every other card-type rule verbatim.
alter table public.card_catalog
  drop constraint card_catalog_content_contract_check;

-- BEGIN GENERATED SIGNATURE SERIES CATALOG
insert into public.card_catalog (card_id, player_id, team_id, league, eligible_positions, role, overall, attributes, abilities, price, set_id, card_type, card_tier, market_availability, is_permanent, is_reward_only, is_active, available_from, available_to, image_reference, visual_metadata, source_metadata, legacy_retained)
select seeded.card_id, seeded.player_id, seeded.team_id, seeded.league, seeded.eligible_positions, seeded.role, seeded.overall, seeded.attributes, seeded.abilities, seeded.price, seeded.set_id, seeded.card_type, seeded.card_tier, seeded.market_availability, seeded.is_permanent, seeded.is_reward_only, seeded.is_active, seeded.available_from, seeded.available_to, seeded.image_reference, seeded.visual_metadata, seeded.source_metadata, seeded.legacy_retained
from jsonb_to_recordset($signature_catalog$[{"card_id":"nhl-cale-makar-signature-series","player_id":"nhl-cale-makar","team_id":"nhl-colorado-avalanche","league":"NHL","eligible_positions":["RD"],"role":"skater","overall":95,"attributes":{"speed":97,"shooting":92,"passing":96,"puckControl":96,"defense":97,"physicality":97,"hockeyIq":96,"clutch":95},"abilities":["signature series specialist"],"price":23000,"set_id":"signature-series","card_type":"event","card_tier":"signature","market_availability":"event-shop","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z","image_reference":"player-asset:nhl-cale-makar/event/nhl-cale-makar-signature-series","visual_metadata":{"treatment":"approved-local-asset","accent":"#d4af37","frame":"signature","artworkPosition":"RD","artworkOverall":95,"artworkAttributes":{"SPD":97,"SHT":92,"PLY":96,"DEF":97,"CLT":95}},"source_metadata":{"status":"signature-artwork-corrected","catalogId":"rink-rivals-content-foundation-2026","snapshotDate":"2026-07-14"},"legacy_retained":false},{"card_id":"nhl-connor-mcdavid-signature-series","player_id":"nhl-connor-mcdavid","team_id":"nhl-edmonton-oilers","league":"NHL","eligible_positions":["C"],"role":"skater","overall":96,"attributes":{"speed":99,"shooting":95,"passing":98,"puckControl":98,"defense":86,"physicality":86,"hockeyIq":98,"clutch":97},"abilities":["signature series specialist"],"price":24500,"set_id":"signature-series","card_type":"event","card_tier":"signature","market_availability":"event-shop","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z","image_reference":"player-asset:nhl-connor-mcdavid/event/nhl-connor-mcdavid-signature-series","visual_metadata":{"treatment":"approved-local-asset","accent":"#d4af37","frame":"signature","artworkPosition":"C","artworkOverall":96,"artworkAttributes":{"SPD":99,"SHT":95,"PLY":98,"DEF":86,"CLT":97}},"source_metadata":{"status":"signature-artwork-corrected","catalogId":"rink-rivals-content-foundation-2026","snapshotDate":"2026-07-14"},"legacy_retained":false},{"card_id":"nhl-david-pastrnak-signature-series","player_id":"nhl-david-pastrnak","team_id":"nhl-boston-bruins","league":"NHL","eligible_positions":["RW"],"role":"skater","overall":94,"attributes":{"speed":93,"shooting":95,"passing":94,"puckControl":94,"defense":86,"physicality":86,"hockeyIq":94,"clutch":92},"abilities":["signature series specialist"],"price":21500,"set_id":"signature-series","card_type":"event","card_tier":"signature","market_availability":"event-shop","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z","image_reference":"player-asset:nhl-david-pastrnak/event/nhl-david-pastrnak-signature-series","visual_metadata":{"treatment":"approved-local-asset","accent":"#d4af37","frame":"signature","artworkPosition":"RW","artworkOverall":94,"artworkAttributes":{"SPD":93,"SHT":95,"PLY":94,"DEF":86,"CLT":92}},"source_metadata":{"status":"signature-artwork-corrected","catalogId":"rink-rivals-content-foundation-2026","snapshotDate":"2026-07-14"},"legacy_retained":false},{"card_id":"nhl-jeremy-swayman-signature-series","player_id":"nhl-jeremy-swayman","team_id":"nhl-boston-bruins","league":"NHL","eligible_positions":["G"],"role":"goalie","overall":92,"attributes":{"reflexes":93,"positioning":91,"glove":93,"blocker":92,"reboundControl":91,"puckHandling":91,"consistency":91,"clutch":91},"abilities":["signature series specialist"],"price":18500,"set_id":"signature-series","card_type":"event","card_tier":"signature","market_availability":"event-shop","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z","image_reference":"player-asset:nhl-jeremy-swayman/event/nhl-jeremy-swayman-signature-series","visual_metadata":{"treatment":"approved-local-asset","accent":"#d4af37","frame":"signature","artworkPosition":"G","artworkOverall":92,"artworkAttributes":{"HGH":93,"LOW":92,"QCK":93,"POS":91,"RBC":91}},"source_metadata":{"status":"signature-artwork-corrected","catalogId":"rink-rivals-content-foundation-2026","snapshotDate":"2026-07-14"},"legacy_retained":false},{"card_id":"nhl-rasmus-dahlin-signature-series","player_id":"nhl-rasmus-dahlin","team_id":"nhl-buffalo-sabres","league":"NHL","eligible_positions":["RD"],"role":"skater","overall":93,"attributes":{"speed":92,"shooting":91,"passing":93,"puckControl":93,"defense":94,"physicality":94,"hockeyIq":93,"clutch":93},"abilities":["signature series specialist"],"price":20000,"set_id":"signature-series","card_type":"event","card_tier":"signature","market_availability":"event-shop","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z","image_reference":"player-asset:nhl-rasmus-dahlin/event/nhl-rasmus-dahlin-signature-series","visual_metadata":{"treatment":"approved-local-asset","accent":"#d4af37","frame":"signature","artworkPosition":"RD","artworkOverall":93,"artworkAttributes":{"SPD":92,"SHT":91,"PLY":93,"DEF":94,"CLT":93}},"source_metadata":{"status":"signature-artwork-corrected","catalogId":"rink-rivals-content-foundation-2026","snapshotDate":"2026-07-14"},"legacy_retained":false},{"card_id":"pwhl-hilary-knight-signature-series","player_id":"pwhl-hilary-knight","team_id":"pwhl-detroit","league":"PWHL","eligible_positions":["LW","C","RW"],"role":"skater","overall":87,"attributes":{"speed":90,"shooting":87,"passing":94,"puckControl":93,"defense":80,"physicality":81,"hockeyIq":90,"clutch":88},"abilities":["signature series specialist"],"price":11000,"set_id":"signature-series","card_type":"event","card_tier":"signature","market_availability":"event-shop","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"2026-07-13T00:00:00.000Z","image_reference":"player-asset:pwhl-hilary-knight/event/pwhl-hilary-knight-signature-series","visual_metadata":{"treatment":"neutral-placeholder","accent":"#d4af37","frame":"signature"},"source_metadata":{"status":"signature-history-retained","catalogId":"rink-rivals-content-foundation-2026","snapshotDate":"2026-07-14"},"legacy_retained":false},{"card_id":"pwhl-marie-philip-poulin-signature-series","player_id":"pwhl-marie-philip-poulin","team_id":"pwhl-montreal-victoire","league":"PWHL","eligible_positions":["C"],"role":"skater","overall":96,"attributes":{"speed":94,"shooting":93,"passing":96,"puckControl":96,"defense":92,"physicality":92,"hockeyIq":96,"clutch":95},"abilities":["signature series specialist"],"price":24500,"set_id":"signature-series","card_type":"event","card_tier":"signature","market_availability":"event-shop","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z","image_reference":"player-asset:pwhl-marie-philip-poulin/event/pwhl-marie-philip-poulin-signature-series","visual_metadata":{"treatment":"approved-local-asset","accent":"#d4af37","frame":"signature","artworkPosition":"C","artworkOverall":96,"artworkAttributes":{"SPD":94,"SHT":93,"PLY":96,"DEF":92,"CLT":95}},"source_metadata":{"status":"signature-artwork-corrected","catalogId":"rink-rivals-content-foundation-2026","snapshotDate":"2026-07-14"},"legacy_retained":false},{"card_id":"pwhl-megan-keller-signature-series","player_id":"pwhl-megan-keller","team_id":"pwhl-boston-fleet","league":"PWHL","eligible_positions":["RD"],"role":"skater","overall":94,"attributes":{"speed":92,"shooting":88,"passing":91,"puckControl":91,"defense":95,"physicality":95,"hockeyIq":91,"clutch":93},"abilities":["signature series specialist"],"price":21500,"set_id":"signature-series","card_type":"event","card_tier":"signature","market_availability":"event-shop","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z","image_reference":"player-asset:pwhl-megan-keller/event/pwhl-megan-keller-signature-series","visual_metadata":{"treatment":"approved-local-asset","accent":"#d4af37","frame":"signature","artworkPosition":"RD","artworkOverall":94,"artworkAttributes":{"SPD":92,"SHT":88,"PLY":91,"DEF":95,"CLT":93}},"source_metadata":{"status":"signature-artwork-corrected","catalogId":"rink-rivals-content-foundation-2026","snapshotDate":"2026-07-14"},"legacy_retained":false},{"card_id":"pwhl-raygan-kirk-signature-series","player_id":"pwhl-raygan-kirk","team_id":"pwhl-toronto-sceptres","league":"PWHL","eligible_positions":["G"],"role":"goalie","overall":92,"attributes":{"reflexes":92,"positioning":93,"glove":91,"blocker":92,"reboundControl":90,"puckHandling":90,"consistency":93,"clutch":93},"abilities":["signature series specialist"],"price":18500,"set_id":"signature-series","card_type":"event","card_tier":"signature","market_availability":"event-shop","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z","image_reference":"player-asset:pwhl-raygan-kirk/event/pwhl-raygan-kirk-signature-series","visual_metadata":{"treatment":"approved-local-asset","accent":"#d4af37","frame":"signature","artworkPosition":"G","artworkOverall":92,"artworkAttributes":{"HGH":91,"LOW":92,"QCK":92,"POS":93,"RBC":90}},"source_metadata":{"status":"signature-artwork-corrected","catalogId":"rink-rivals-content-foundation-2026","snapshotDate":"2026-07-14"},"legacy_retained":false},{"card_id":"pwhl-sophie-jaques-signature-series","player_id":"pwhl-sophie-jaques","team_id":"pwhl-vancouver-goldeneyes","league":"PWHL","eligible_positions":["RD"],"role":"skater","overall":93,"attributes":{"speed":91,"shooting":87,"passing":93,"puckControl":93,"defense":94,"physicality":94,"hockeyIq":93,"clutch":92},"abilities":["signature series specialist"],"price":20000,"set_id":"signature-series","card_type":"event","card_tier":"signature","market_availability":"event-shop","is_permanent":false,"is_reward_only":false,"is_active":true,"available_from":"2026-01-01T00:00:00.000Z","available_to":"9999-12-31T23:59:59.999Z","image_reference":"player-asset:pwhl-sophie-jaques/event/pwhl-sophie-jaques-signature-series","visual_metadata":{"treatment":"approved-local-asset","accent":"#d4af37","frame":"signature","artworkPosition":"RD","artworkOverall":93,"artworkAttributes":{"SPD":91,"SHT":87,"PLY":93,"DEF":94,"CLT":92}},"source_metadata":{"status":"signature-artwork-corrected","catalogId":"rink-rivals-content-foundation-2026","snapshotDate":"2026-07-14"},"legacy_retained":false}]$signature_catalog$::jsonb) as seeded(
  card_id text,
  player_id text,
  team_id text,
  league text,
  eligible_positions text[],
  role text,
  overall integer,
  attributes jsonb,
  abilities text[],
  price integer,
  set_id text,
  card_type text,
  card_tier text,
  market_availability text,
  is_permanent boolean,
  is_reward_only boolean,
  is_active boolean,
  available_from timestamptz,
  available_to timestamptz,
  image_reference text,
  visual_metadata jsonb,
  source_metadata jsonb,
  legacy_retained boolean
)
on conflict (card_id) do update set
  player_id = excluded.player_id,
  team_id = excluded.team_id,
  league = excluded.league,
  eligible_positions = excluded.eligible_positions,
  role = excluded.role,
  overall = excluded.overall,
  attributes = excluded.attributes,
  abilities = excluded.abilities,
  price = excluded.price,
  set_id = excluded.set_id,
  card_type = excluded.card_type,
  card_tier = excluded.card_tier,
  market_availability = excluded.market_availability,
  is_permanent = excluded.is_permanent,
  is_reward_only = excluded.is_reward_only,
  is_active = excluded.is_active,
  available_from = excluded.available_from,
  available_to = excluded.available_to,
  image_reference = excluded.image_reference,
  visual_metadata = excluded.visual_metadata,
  source_metadata = excluded.source_metadata,
  legacy_retained = excluded.legacy_retained;
-- END GENERATED SIGNATURE SERIES CATALOG

-- Two reviewed AI lineups used the retired Dylan Larkin Signature ID at C.
-- Keep their position, Event-card tier, and 88-OVR balance class unchanged.
-- BEGIN GENERATED SIGNATURE AI LINEUPS
insert into public.ai_opponents (id, name, mode, difficulty, lineup_slots)
select seeded.id, seeded.name, seeded.mode, seeded.difficulty, seeded.lineup_slots
from jsonb_to_recordset($signature_ai_lineups$[{"id":"nhl-elite-summit-club","name":"Summit Club","mode":"nhl-circuit","difficulty":"elite","lineup_slots":{"LW":"nhl-brady-tkachuk-frozen-frights","C":"nhl-connor-bedard-rising-stars","RW":"nhl-seth-jarvis-playoff-heroes","LD":"nhl-adam-fox-franchise-icons","RD":"nhl-cale-makar-signature-series","G":"nhl-igor-shesterkin-frozen-frights"}},{"id":"open-elite-northern-alliance","name":"Northern Alliance","mode":"open-ice","difficulty":"elite","lineup_slots":{"LW":"pwhl-alex-carpenter-franchise-icons","C":"nhl-connor-bedard-rising-stars","RW":"pwhl-sarah-fillier-franchise-icons","LD":"nhl-adam-fox-franchise-icons","RD":"pwhl-sophie-jaques-winter-classic","G":"nhl-igor-shesterkin-frozen-frights"}}]$signature_ai_lineups$::jsonb) as seeded(
  id text,
  name text,
  mode text,
  difficulty text,
  lineup_slots jsonb
)
on conflict (id) do update set
  name = excluded.name,
  mode = excluded.mode,
  difficulty = excluded.difficulty,
  lineup_slots = excluded.lineup_slots;
-- END GENERATED SIGNATURE AI LINEUPS

do $signature_ai_guard$
begin
  if exists (
    select 1
    from public.ai_opponents opponents
    cross join signature_card_id_migrations migrations
    where position(to_jsonb(migrations.old_card_id)::text in opponents.lineup_slots::text) > 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'An AI opponent still references a retired Signature CardVersion.';
  end if;
end
$signature_ai_guard$;

delete from public.card_catalog cards
using signature_card_id_migrations migrations
where cards.card_id = migrations.old_card_id;

alter table public.card_catalog
  add constraint card_catalog_content_contract_check check (
    (
      card_type = 'starter'
      and card_tier = 'starter'
      and overall between 68 and 76
      and price = 0
      and market_availability = 'unavailable'
      and is_permanent
      and not is_reward_only
      and available_from is null
      and available_to is null
    )
    or (
      card_type = 'base'
      and card_tier = 'standard'
      and overall between 68 and 86
      and price > 0
      and market_availability = 'base-market'
      and is_permanent
      and not is_reward_only
      and available_from is null
      and available_to is null
    )
    or (
      card_type = 'event'
      and card_tier in ('featured', 'elite', 'signature')
      and price > 0
      and market_availability = 'event-shop'
      and not is_permanent
      and not is_reward_only
      and available_from is not null
      and available_to is not null
      and available_from < available_to
      and (
        (
          set_id = 'signature-series'
          and card_tier = 'signature'
          and (
            (
              coalesce(visual_metadata ->> 'treatment', '') = 'approved-local-asset'
              and overall between 92 and 96
              and price = 6500 + (overall - 84) * 1500
            )
            or (
              coalesce(visual_metadata ->> 'treatment', '') = 'neutral-placeholder'
              and overall between 84 and 90
              and available_to <= '2026-07-13 00:00:00+00'::timestamptz
            )
          )
        )
        or (
          set_id <> 'signature-series'
          and overall between 84 and 90
        )
      )
    )
    or (
      card_type = 'reward'
      and card_tier in ('featured', 'elite', 'signature')
      and overall between 68 and 90
      and price = 0
      and market_availability = 'reward-only'
      and is_permanent
      and is_reward_only
      and available_from is null
      and available_to is null
    )
  ) not valid;

alter table public.card_catalog
  validate constraint card_catalog_content_contract_check;

alter table public.card_catalog
  add constraint card_catalog_signature_artwork_contract_check check (
    set_id <> 'signature-series'
    or coalesce(visual_metadata ->> 'treatment', '') <> 'approved-local-asset'
    or coalesce((
      card_id = player_id || '-signature-series'
      and image_reference = 'player-asset:' || player_id || '/event/' || card_id
      and visual_metadata ?& array['artworkPosition', 'artworkOverall', 'artworkAttributes']::text[]
      and jsonb_typeof(visual_metadata -> 'artworkAttributes') = 'object'
      and overall = (visual_metadata ->> 'artworkOverall')::integer
      and eligible_positions = array[visual_metadata ->> 'artworkPosition']::text[]
      and (
        (
          role = 'skater'
          and visual_metadata ->> 'artworkPosition' in ('LW', 'C', 'RW', 'LD', 'RD')
          and visual_metadata -> 'artworkAttributes'
            ?& array['SPD', 'SHT', 'PLY', 'DEF', 'CLT']::text[]
          and (
            (visual_metadata -> 'artworkAttributes')
              - array['SPD', 'SHT', 'PLY', 'DEF', 'CLT']::text[]
          ) = '{}'::jsonb
          and attributes ?& array[
            'speed', 'shooting', 'passing', 'puckControl',
            'defense', 'physicality', 'hockeyIq', 'clutch'
          ]::text[]
          and (
            attributes - array[
              'speed', 'shooting', 'passing', 'puckControl',
              'defense', 'physicality', 'hockeyIq', 'clutch'
            ]::text[]
          ) = '{}'::jsonb
          and (attributes ->> 'speed')::integer =
            (visual_metadata #>> '{artworkAttributes,SPD}')::integer
          and (attributes ->> 'shooting')::integer =
            (visual_metadata #>> '{artworkAttributes,SHT}')::integer
          and (attributes ->> 'passing')::integer =
            (visual_metadata #>> '{artworkAttributes,PLY}')::integer
          and (attributes ->> 'puckControl')::integer =
            (visual_metadata #>> '{artworkAttributes,PLY}')::integer
          and (attributes ->> 'defense')::integer =
            (visual_metadata #>> '{artworkAttributes,DEF}')::integer
          and (attributes ->> 'physicality')::integer =
            (visual_metadata #>> '{artworkAttributes,DEF}')::integer
          and (attributes ->> 'hockeyIq')::integer =
            (visual_metadata #>> '{artworkAttributes,PLY}')::integer
          and (attributes ->> 'clutch')::integer =
            (visual_metadata #>> '{artworkAttributes,CLT}')::integer
        )
        or (
          role = 'goalie'
          and visual_metadata ->> 'artworkPosition' = 'G'
          and visual_metadata -> 'artworkAttributes'
            ?& array['HGH', 'LOW', 'QCK', 'POS', 'RBC']::text[]
          and (
            (visual_metadata -> 'artworkAttributes')
              - array['HGH', 'LOW', 'QCK', 'POS', 'RBC']::text[]
          ) = '{}'::jsonb
          and attributes ?& array[
            'reflexes', 'positioning', 'glove', 'blocker',
            'reboundControl', 'puckHandling', 'consistency', 'clutch'
          ]::text[]
          and (
            attributes - array[
              'reflexes', 'positioning', 'glove', 'blocker',
              'reboundControl', 'puckHandling', 'consistency', 'clutch'
            ]::text[]
          ) = '{}'::jsonb
          and (attributes ->> 'reflexes')::integer =
            (visual_metadata #>> '{artworkAttributes,QCK}')::integer
          and (attributes ->> 'positioning')::integer =
            (visual_metadata #>> '{artworkAttributes,POS}')::integer
          and (attributes ->> 'glove')::integer =
            (visual_metadata #>> '{artworkAttributes,HGH}')::integer
          and (attributes ->> 'blocker')::integer =
            (visual_metadata #>> '{artworkAttributes,LOW}')::integer
          and (attributes ->> 'reboundControl')::integer =
            (visual_metadata #>> '{artworkAttributes,RBC}')::integer
          and (attributes ->> 'puckHandling')::integer =
            (visual_metadata #>> '{artworkAttributes,RBC}')::integer
          and (attributes ->> 'consistency')::integer =
            (visual_metadata #>> '{artworkAttributes,POS}')::integer
          and (attributes ->> 'clutch')::integer =
            (visual_metadata #>> '{artworkAttributes,POS}')::integer
        )
      )
    ), false)
  ) not valid;

alter table public.card_catalog
  validate constraint card_catalog_signature_artwork_contract_check;

do $signature_postconditions$
declare
  expected_players constant text[] := array[
    'nhl-cale-makar',
    'nhl-connor-mcdavid',
    'nhl-david-pastrnak',
    'nhl-jeremy-swayman',
    'nhl-rasmus-dahlin',
    'pwhl-marie-philip-poulin',
    'pwhl-megan-keller',
    'pwhl-raygan-kirk',
    'pwhl-sophie-jaques'
  ]::text[];
  actual_players text[];
begin
  select array_agg(cards.player_id order by cards.player_id)
  into actual_players
  from public.card_catalog cards
  where cards.set_id = 'signature-series'
    and cards.is_active
    and cards.available_from <= '2026-07-14 12:00:00+00'::timestamptz
    and '2026-07-14 12:00:00+00'::timestamptz < cards.available_to;

  if actual_players is distinct from expected_players then
    raise exception using
      errcode = '23514',
      message = format('Unexpected active Signature player set: %s', actual_players);
  end if;

  if (select count(*) from public.card_catalog where set_id = 'signature-series') <> 10 then
    raise exception using
      errcode = '23514',
      message = 'Signature correction must retain exactly ten catalog rows.';
  end if;

  if exists (
    select 1
    from public.card_catalog cards
    join signature_card_id_migrations migrations
      on migrations.old_card_id = cards.card_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'A retired Signature CardVersion still exists after correction.';
  end if;
end
$signature_postconditions$;

commit;
