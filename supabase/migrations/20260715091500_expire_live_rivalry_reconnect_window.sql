-- Close stale Live rooms when a participant reconnects and prevent a delayed
-- ready request from starting a room after its lobby window has elapsed.

create or replace function private.prevent_expired_live_rivalry_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'waiting'
    and new.status = 'active'
    and old.expires_at <= clock_timestamp() then
    raise exception 'This Live room has expired.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_expired_live_rivalry_start on public.live_rivalry_rooms;
create trigger prevent_expired_live_rivalry_start
before update of status on public.live_rivalry_rooms
for each row execute function private.prevent_expired_live_rivalry_start();

create or replace function public.get_live_rivalry_room(room_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  resolved_room_id uuid := get_live_rivalry_room.room_id;
  room public.live_rivalry_rooms%rowtype;
  room_expired boolean := false;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if resolved_room_id is null then
    select players.room_id into resolved_room_id
    from public.live_rivalry_players players
    join public.live_rivalry_rooms rooms on rooms.id = players.room_id
    where players.user_id = requesting_user_id and rooms.status in ('waiting', 'active')
    order by players.joined_at desc limit 1;
    if resolved_room_id is null then return jsonb_build_object('status', 'none'); end if;
  end if;
  select * into room from public.live_rivalry_rooms rooms where rooms.id = resolved_room_id for update;
  if not found then raise exception 'Live room not found.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.live_rivalry_players players where players.room_id = room.id and players.user_id = requesting_user_id) then
    raise exception 'You are not a member of this Live room.' using errcode = '42501';
  end if;
  if room.status in ('waiting', 'active') and room.expires_at <= clock_timestamp() then
    update public.live_rivalry_rooms rooms set
      status = 'expired', completed_at = clock_timestamp(), state_version = state_version + 1
    where rooms.id = room.id;
    room_expired := true;
  end if;
  update public.live_rivalry_players players set last_seen_at = clock_timestamp()
  where players.room_id = room.id and players.user_id = requesting_user_id;
  if room_expired then perform public.notify_live_rivalry_room(room.id); end if;
  return public.live_rivalry_room_payload(room.id);
end;
$$;

revoke all on function public.get_live_rivalry_room(uuid) from public, anon;
grant execute on function public.get_live_rivalry_room(uuid) to authenticated;
