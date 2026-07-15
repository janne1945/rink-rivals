-- Align function volatility with the server clock and remove a dead local from
-- the Live join contract. No RPC signatures or response shapes change.

alter function public.get_season_locker() volatile;
alter function public.live_rivalry_room_payload(uuid) volatile;

create or replace function public.join_live_rivalry_room(
  room_code text,
  client_request_id text,
  lineup_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_code text := upper(regexp_replace(btrim(join_live_rivalry_room.room_code), '[^A-Za-z0-9]', '', 'g'));
  normalized_request_id text := btrim(join_live_rivalry_room.client_request_id);
  profile public.profiles%rowtype;
  room public.live_rivalry_rooms%rowtype;
  selected_lineup public.lineups%rowtype;
  lineup_snapshot jsonb;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if normalized_code !~ '^[A-HJ-NP-Z2-9]{6}$'
    or normalized_request_id is null or length(normalized_request_id) not between 1 and 200
    or join_live_rivalry_room.lineup_id is null then
    raise exception 'Enter a valid six-character room code and lineup.' using errcode = '22023';
  end if;
  select * into profile from public.profiles profiles where profiles.id = requesting_user_id for update;
  if not found or not profile.onboarding_completed then
    raise exception 'Onboarding must be completed before joining a Live room.' using errcode = 'P0001';
  end if;
  select * into room from public.live_rivalry_rooms rooms where rooms.room_code = normalized_code for update;
  if not found then raise exception 'Live room not found.' using errcode = 'P0002'; end if;
  if room.status = 'waiting' and room.expires_at <= clock_timestamp() then
    update public.live_rivalry_rooms rooms set status = 'expired', completed_at = clock_timestamp(), state_version = state_version + 1
    where rooms.id = room.id;
    raise exception 'This Live room has expired.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.live_rivalry_players players
    where players.room_id = room.id and players.user_id = requesting_user_id
  ) then
    return public.live_rivalry_room_payload(room.id);
  end if;
  if room.host_user_id = requesting_user_id then raise exception 'You are already the host of this room.' using errcode = 'P0001'; end if;
  if room.status <> 'waiting' then raise exception 'This Live room is no longer joinable.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.live_rivalry_players players where players.room_id = room.id and players.role = 'guest') then
    raise exception 'This Live room already has two players.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.live_rivalry_players players
    join public.live_rivalry_rooms rooms on rooms.id = players.room_id
    where players.user_id = requesting_user_id and rooms.status in ('waiting', 'active')
  ) then
    raise exception 'You already have an open Live room. Reconnect to it first.' using errcode = 'P0001';
  end if;
  select * into selected_lineup from public.lineups lineups
  where lineups.id = join_live_rivalry_room.lineup_id and lineups.user_id = requesting_user_id for share;
  if not found or selected_lineup.mode <> room.mode then
    raise exception 'Choose a lineup that matches the host room mode.' using errcode = 'P0001';
  end if;
  lineup_snapshot := public.lineup_as_json(requesting_user_id, selected_lineup.id);
  perform public.assert_valid_lineup(requesting_user_id, room.mode, lineup_snapshot -> 'slots');
  insert into public.live_rivalry_players (
    room_id, user_id, role, join_request_id, display_label, lineup_id, lineup_snapshot
  ) values (
    room.id, requesting_user_id, 'guest', normalized_request_id,
    coalesce(nullif(btrim(profile.display_name), ''), 'Guest Rival'), selected_lineup.id, lineup_snapshot
  );
  update public.live_rivalry_rooms rooms set state_version = state_version + 1 where rooms.id = room.id;
  perform public.notify_live_rivalry_room(room.id);
  return public.live_rivalry_room_payload(room.id);
end;
$$;

revoke all on function public.join_live_rivalry_room(text, text, uuid) from public, anon;
grant execute on function public.join_live_rivalry_room(text, text, uuid) to authenticated;
