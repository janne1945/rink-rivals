alter table public.profiles
  add column if not exists completed_matches integer not null default 0
  check (completed_matches >= 0);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_match_id text not null check (length(btrim(client_match_id)) between 1 and 200),
  mode text not null check (mode in ('nhl-circuit', 'pwhl-circuit', 'open-ice')),
  difficulty text not null check (difficulty in ('rookie', 'pro', 'elite')),
  outcome text not null check (outcome in ('win', 'draw', 'loss')),
  reward_rule_version text not null,
  completed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  unique (user_id, client_match_id),
  unique (id, user_id)
);

create table public.match_rewards (
  match_id uuid primary key,
  user_id uuid not null,
  match_credits integer not null check (match_credits >= 0),
  objective_credits integer not null default 0 check (objective_credits >= 0),
  rivalry_credits integer not null default 0 check (rivalry_credits >= 0),
  total_credits integer generated always as
    (match_credits + objective_credits + rivalry_credits) stored,
  rule_version text not null,
  breakdown jsonb not null default '{}'::jsonb,
  granted_at timestamptz not null default clock_timestamp(),
  foreign key (match_id, user_id)
    references public.matches(id, user_id) on delete cascade
);

create table public.objective_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  objective_id text not null check (objective_id in (
    'daily-match-complete', 'daily-match-win', 'daily-spotlight', 'weekly-circuit-tour'
  )),
  period_key text not null,
  current integer not null default 0 check (current >= 0),
  target integer not null check (target > 0),
  completed_modes text[] not null default '{}',
  completed_at timestamptz,
  reward_credits integer not null check (reward_credits >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, objective_id, period_key),
  check (current <= target),
  check (completed_modes <@ array['nhl-circuit', 'pwhl-circuit', 'open-ice']::text[])
);

create table public.rivalry_road_progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_step_index integer not null default 0 check (current_step_index between 0 and 3),
  completed_step_ids text[] not null default '{}',
  status text not null default 'in-progress'
    check (status in ('in-progress', 'choice-pending', 'complete')),
  selected_card_id text,
  updated_at timestamptz not null default clock_timestamp(),
  check (completed_step_ids <@ array[
    'nhl-circuit-complete', 'pwhl-circuit-complete', 'open-ice-pro-win'
  ]::text[])
);

create index matches_user_completed_at_idx
  on public.matches (user_id, completed_at desc);
create index match_rewards_user_granted_at_idx
  on public.match_rewards (user_id, granted_at desc);
create index match_rewards_match_user_idx
  on public.match_rewards (match_id, user_id);
create index objective_progress_user_updated_at_idx
  on public.objective_progress (user_id, updated_at desc);

alter table public.matches enable row level security;
alter table public.match_rewards enable row level security;
alter table public.objective_progress enable row level security;
alter table public.rivalry_road_progress enable row level security;

create policy "Users read own matches"
  on public.matches for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read own match rewards"
  on public.match_rewards for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read own objective progress"
  on public.objective_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read own rivalry road progress"
  on public.rivalry_road_progress for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.matches from anon, authenticated;
revoke all on public.match_rewards from anon, authenticated;
revoke all on public.objective_progress from anon, authenticated;
revoke all on public.rivalry_road_progress from anon, authenticated;
grant select on public.matches to authenticated;
grant select on public.match_rewards to authenticated;
grant select on public.objective_progress to authenticated;
grant select on public.rivalry_road_progress to authenticated;

create or replace function public.settle_match(
  client_match_id text,
  match_mode text,
  match_difficulty text,
  match_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  settlement_time timestamptz := clock_timestamp();
  day_key text := to_char(settlement_time at time zone 'UTC', 'YYYY-MM-DD');
  week_key text := to_char(
    date_trunc('week', settlement_time at time zone 'UTC'),
    'YYYY-MM-DD'
  );
  spotlight_mode text;
  match_id uuid;
  existing_match public.matches%rowtype;
  base_credits integer;
  objective_credits integer := 0;
  rivalry_credits integer := 0;
  total_credits integer;
  profile_credits integer;
  profile_completed_matches integer;
  progress_row public.objective_progress%rowtype;
  road public.rivalry_road_progress%rowtype;
  newly_completed boolean;
  rule_version constant text := 'match-rules-v1';
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if client_match_id is null or length(btrim(client_match_id)) not between 1 and 200 then
    raise exception 'A valid client match id is required.' using errcode = '22023';
  end if;
  if match_mode not in ('nhl-circuit', 'pwhl-circuit', 'open-ice') then
    raise exception 'Invalid match mode.' using errcode = '22023';
  end if;
  if match_difficulty not in ('rookie', 'pro', 'elite') then
    raise exception 'Invalid match difficulty.' using errcode = '22023';
  end if;
  if match_outcome not in ('win', 'draw', 'loss') then
    raise exception 'Invalid match outcome.' using errcode = '22023';
  end if;

  insert into public.matches (
    user_id, client_match_id, mode, difficulty, outcome, reward_rule_version, completed_at
  ) values (
    requesting_user_id, btrim(client_match_id), match_mode, match_difficulty,
    match_outcome, rule_version, settlement_time
  )
  on conflict on constraint matches_user_id_client_match_id_key do nothing
  returning id into match_id;

  if match_id is null then
    select * into existing_match
      from public.matches
      where user_id = requesting_user_id and matches.client_match_id = btrim(settle_match.client_match_id)
      for update;
    if existing_match.mode <> match_mode
      or existing_match.difficulty <> match_difficulty
      or existing_match.outcome <> match_outcome then
      raise exception 'Match id was already settled with different match data.'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'status', 'already-settled',
      'match_id', existing_match.id,
      'reward_credits', (select total_credits from public.match_rewards where match_rewards.match_id = existing_match.id),
      'credits', (select credits from public.profiles where id = requesting_user_id),
      'completed_matches', (select completed_matches from public.profiles where id = requesting_user_id)
    );
  end if;

  base_credits := case match_difficulty
    when 'rookie' then case match_outcome when 'win' then 120 when 'draw' then 90 else 60 end
    when 'pro' then case match_outcome when 'win' then 180 when 'draw' then 120 else 80 end
    when 'elite' then case match_outcome when 'win' then 260 when 'draw' then 160 else 100 end
  end;
  spotlight_mode := (array['nhl-circuit', 'pwhl-circuit', 'open-ice'])[
    1 + mod((day_key::date - date '1970-01-01'), 3)
  ];

  insert into public.objective_progress
    (user_id, objective_id, period_key, current, target, reward_credits, completed_at)
  values
    (requesting_user_id, 'daily-match-complete', day_key, 1, 1, 75, settlement_time)
  on conflict (user_id, objective_id, period_key) do update
    set updated_at = settlement_time
  returning (xmax = 0) into newly_completed;
  if newly_completed then objective_credits := objective_credits + 75; end if;

  if match_outcome = 'win' then
    insert into public.objective_progress
      (user_id, objective_id, period_key, current, target, reward_credits, completed_at)
    values
      (requesting_user_id, 'daily-match-win', day_key, 1, 1, 100, settlement_time)
    on conflict (user_id, objective_id, period_key) do update
      set updated_at = settlement_time
    returning (xmax = 0) into newly_completed;
    if newly_completed then objective_credits := objective_credits + 100; end if;
  end if;

  if match_mode = spotlight_mode then
    insert into public.objective_progress
      (user_id, objective_id, period_key, current, target, reward_credits, completed_at)
    values
      (requesting_user_id, 'daily-spotlight', day_key, 1, 1, 100, settlement_time)
    on conflict (user_id, objective_id, period_key) do update
      set updated_at = settlement_time
    returning (xmax = 0) into newly_completed;
    if newly_completed then objective_credits := objective_credits + 100; end if;
  end if;

  insert into public.objective_progress (
    user_id, objective_id, period_key, current, target, completed_modes,
    completed_at, reward_credits
  ) values (
    requesting_user_id, 'weekly-circuit-tour', week_key, 1, 5, array[match_mode], null, 350
  )
  on conflict (user_id, objective_id, period_key) do update set
    current = least(5, objective_progress.current + 1),
    completed_modes = (
      select array_agg(distinct mode_name order by mode_name)
      from unnest(objective_progress.completed_modes || array[match_mode]) as mode_name
    ),
    completed_at = case
      when objective_progress.completed_at is null
        and least(5, objective_progress.current + 1) = 5
        and (select count(distinct mode_name) from unnest(objective_progress.completed_modes || array[match_mode]) mode_name) = 3
      then settlement_time else objective_progress.completed_at end,
    updated_at = settlement_time
  returning * into progress_row;
  if progress_row.completed_at = settlement_time then
    objective_credits := objective_credits + 350;
  end if;

  insert into public.rivalry_road_progress (user_id)
  values (requesting_user_id)
  on conflict (user_id) do nothing;
  select * into road from public.rivalry_road_progress
    where user_id = requesting_user_id for update;

  if road.status = 'in-progress' and (
    (road.current_step_index = 0 and match_mode = 'nhl-circuit') or
    (road.current_step_index = 1 and match_mode = 'pwhl-circuit') or
    (road.current_step_index = 2 and match_mode = 'open-ice' and match_outcome = 'win'
      and match_difficulty in ('pro', 'elite'))
  ) then
    if road.current_step_index in (0, 1) then rivalry_credits := 150; end if;
    update public.rivalry_road_progress set
      completed_step_ids = completed_step_ids || case road.current_step_index
        when 0 then 'nhl-circuit-complete'
        when 1 then 'pwhl-circuit-complete'
        else 'open-ice-pro-win'
      end,
      current_step_index = road.current_step_index + 1,
      status = case when road.current_step_index = 2 then 'choice-pending' else 'in-progress' end,
      updated_at = settlement_time
    where user_id = requesting_user_id;
  end if;

  total_credits := base_credits + objective_credits + rivalry_credits;
  insert into public.match_rewards (
    match_id, user_id, match_credits, objective_credits, rivalry_credits,
    rule_version, breakdown
  ) values (
    match_id, requesting_user_id, base_credits, objective_credits, rivalry_credits,
    rule_version, jsonb_build_object(
      'match', base_credits, 'objectives', objective_credits, 'rivalry_road', rivalry_credits
    )
  );
  update public.profiles set
    credits = credits + total_credits,
    completed_matches = completed_matches + 1,
    updated_at = settlement_time
  where id = requesting_user_id
  returning credits, completed_matches into profile_credits, profile_completed_matches;
  if not found then raise exception 'Profile not found.' using errcode = 'P0002'; end if;

  return jsonb_build_object(
    'status', 'settled',
    'match_id', match_id,
    'reward_credits', total_credits,
    'match_credits', base_credits,
    'objective_credits', objective_credits,
    'rivalry_credits', rivalry_credits,
    'credits', profile_credits,
    'completed_matches', profile_completed_matches
  );
end;
$$;

revoke execute on function public.settle_match(text, text, text, text) from public, anon;
grant execute on function public.settle_match(text, text, text, text) to authenticated;
