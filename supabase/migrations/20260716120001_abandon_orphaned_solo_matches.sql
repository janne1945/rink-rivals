-- Release orphaned solo tickets whose client match id is no longer available
-- in browser storage. Each source has at most one open ticket per user.

create or replace function public.abandon_open_match()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  ticket public.match_tickets%rowtype;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;

  select * into ticket from public.match_tickets tickets
  where tickets.user_id = requesting_user_id and tickets.status = 'open'
  for update;
  if not found then return jsonb_build_object('status', 'none'); end if;

  update public.match_tickets tickets
  set status = 'abandoned', outcome = null, settled_at = null
  where tickets.id = ticket.id;
  return jsonb_build_object('status', 'abandoned', 'client_match_id', ticket.client_match_id);
end;
$$;

revoke all on function public.abandon_open_match() from public, anon;
grant execute on function public.abandon_open_match() to authenticated;

create or replace function public.abandon_open_arena_match()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  ticket public.arena_match_tickets%rowtype;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;

  select * into ticket from public.arena_match_tickets tickets
  where tickets.user_id = requesting_user_id and tickets.status = 'open'
  for update;
  if not found then return jsonb_build_object('status', 'none'); end if;

  update public.arena_match_tickets tickets
  set status = 'abandoned', outcome = null, settled_at = null
  where tickets.id = ticket.id;
  return jsonb_build_object('status', 'abandoned', 'client_match_id', ticket.client_match_id);
end;
$$;

revoke all on function public.abandon_open_arena_match() from public, anon;
grant execute on function public.abandon_open_arena_match() to authenticated;

create or replace function public.abandon_open_rivalry_challenge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  attempt public.rivalry_challenge_attempts%rowtype;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;

  select * into attempt from public.rivalry_challenge_attempts attempts
  where attempts.user_id = requesting_user_id and attempts.status = 'open'
  for update;
  if not found then return jsonb_build_object('status', 'none'); end if;

  update public.rivalry_challenge_attempts attempts
  set status = 'abandoned', outcome = null, settled_at = null
  where attempts.id = attempt.id;
  return jsonb_build_object('status', 'abandoned', 'client_match_id', attempt.client_match_id);
end;
$$;

revoke all on function public.abandon_open_rivalry_challenge() from public, anon;
grant execute on function public.abandon_open_rivalry_challenge() to authenticated;
