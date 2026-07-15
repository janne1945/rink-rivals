-- Follow-up hardening for the Social Competition system.
--
-- Keep internal state RPC-only, move the Realtime membership predicate out of
-- the exposed public API schema, and cover every new composite foreign key.

create index if not exists arena_match_rounds_ticket_user_idx
  on public.arena_match_rounds (ticket_id, user_id);
create index if not exists arena_match_tickets_lineup_user_idx
  on public.arena_match_tickets (lineup_id, user_id);
create index if not exists arena_match_tickets_opponent_lineup_user_idx
  on public.arena_match_tickets (opponent_lineup_id, opponent_user_id);
create index if not exists live_rivalry_choices_room_user_idx
  on public.live_rivalry_choices (room_id, user_id);
create index if not exists live_rivalry_players_lineup_user_idx
  on public.live_rivalry_players (lineup_id, user_id);
create index if not exists live_rivalry_rooms_winner_user_idx
  on public.live_rivalry_rooms (winner_user_id);
create index if not exists live_rivalry_rounds_room_guest_idx
  on public.live_rivalry_rounds (room_id, guest_user_id);
create index if not exists live_rivalry_rounds_room_host_idx
  on public.live_rivalry_rounds (room_id, host_user_id);
create index if not exists season_reward_claims_definition_idx
  on public.season_reward_claims (season_id, tier);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.can_receive_live_rivalry(topic text, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null
    and topic ~ '^live-rivalry:[0-9a-f-]{36}$'
    and exists (
      select 1
      from public.live_rivalry_players players
      where players.user_id = target_user_id
        and players.room_id::text = substr(topic, length('live-rivalry:') + 1)
    );
$$;

revoke all on function private.can_receive_live_rivalry(text, uuid) from public, anon;
grant execute on function private.can_receive_live_rivalry(text, uuid) to authenticated;

drop policy if exists "live_rivalry_members_receive" on realtime.messages;
create policy "live_rivalry_members_receive"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and private
  and private.can_receive_live_rivalry(realtime.topic(), (select auth.uid()))
);

drop function if exists public.can_receive_live_rivalry(text, uuid);

-- These policies intentionally deny direct table access. Signed-in clients use
-- the validated SECURITY DEFINER RPC contracts instead.
create policy "arena_match_rounds_rpc_only" on public.arena_match_rounds
  for all to authenticated using (false) with check (false);
create policy "arena_match_tickets_rpc_only" on public.arena_match_tickets
  for all to authenticated using (false) with check (false);
create policy "live_rivalry_action_receipts_rpc_only" on public.live_rivalry_action_receipts
  for all to authenticated using (false) with check (false);
create policy "live_rivalry_choices_rpc_only" on public.live_rivalry_choices
  for all to authenticated using (false) with check (false);
create policy "live_rivalry_players_rpc_only" on public.live_rivalry_players
  for all to authenticated using (false) with check (false);
create policy "live_rivalry_rooms_rpc_only" on public.live_rivalry_rooms
  for all to authenticated using (false) with check (false);
create policy "live_rivalry_rounds_rpc_only" on public.live_rivalry_rounds
  for all to authenticated using (false) with check (false);
create policy "season_reward_claims_rpc_only" on public.season_reward_claims
  for all to authenticated using (false) with check (false);
create policy "season_reward_definitions_rpc_only" on public.season_reward_definitions
  for all to authenticated using (false) with check (false);
create policy "season_xp_receipts_rpc_only" on public.season_xp_receipts
  for all to authenticated using (false) with check (false);
create policy "seasons_rpc_only" on public.seasons
  for all to authenticated using (false) with check (false);
create policy "user_cosmetics_rpc_only" on public.user_cosmetics
  for all to authenticated using (false) with check (false);
create policy "user_season_progress_rpc_only" on public.user_season_progress
  for all to authenticated using (false) with check (false);
