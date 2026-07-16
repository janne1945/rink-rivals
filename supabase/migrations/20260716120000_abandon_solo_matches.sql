-- Solo matches are resumable while the player remains in the match experience,
-- but an explicit exit must release the one-open-ticket guard without granting
-- rewards or progression.

create or replace function public.abandon_match(client_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_match_id text := btrim(abandon_match.client_match_id);
  ticket public.match_tickets%rowtype;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200 then
    raise exception 'A valid match id is required.' using errcode = '22023';
  end if;

  select * into ticket from public.match_tickets tickets
  where tickets.user_id = requesting_user_id and tickets.client_match_id = normalized_match_id
  for update;
  if not found then raise exception 'A valid server-issued match ticket is required.' using errcode = 'P0001'; end if;

  if ticket.status = 'settled' then return jsonb_build_object('status', 'already-settled'); end if;
  if ticket.status = 'abandoned' then return jsonb_build_object('status', 'already-abandoned'); end if;

  update public.match_tickets tickets
  set status = 'abandoned', outcome = null, settled_at = null
  where tickets.id = ticket.id;
  return jsonb_build_object('status', 'abandoned');
end;
$$;

revoke all on function public.abandon_match(text) from public, anon;
grant execute on function public.abandon_match(text) to authenticated;

create or replace function public.abandon_arena_match(client_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_match_id text := btrim(abandon_arena_match.client_match_id);
  ticket public.arena_match_tickets%rowtype;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200 then
    raise exception 'A valid Arena match id is required.' using errcode = '22023';
  end if;

  select * into ticket from public.arena_match_tickets tickets
  where tickets.user_id = requesting_user_id and tickets.client_match_id = normalized_match_id
  for update;
  if not found then raise exception 'A valid Arena ticket is required.' using errcode = 'P0001'; end if;

  if ticket.status = 'settled' then return jsonb_build_object('status', 'already-settled'); end if;
  if ticket.status = 'abandoned' then return jsonb_build_object('status', 'already-abandoned'); end if;

  update public.arena_match_tickets tickets
  set status = 'abandoned', outcome = null, settled_at = null
  where tickets.id = ticket.id;
  return jsonb_build_object('status', 'abandoned');
end;
$$;

revoke all on function public.abandon_arena_match(text) from public, anon;
grant execute on function public.abandon_arena_match(text) to authenticated;

create or replace function public.abandon_rivalry_challenge(client_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  requesting_user_id uuid := auth.uid();
  normalized_match_id text := btrim(abandon_rivalry_challenge.client_match_id);
  attempt public.rivalry_challenge_attempts%rowtype;
begin
  if requesting_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if normalized_match_id is null or length(normalized_match_id) not between 1 and 200 then
    raise exception 'A valid Ghost Rivalry match id is required.' using errcode = '22023';
  end if;

  select * into attempt from public.rivalry_challenge_attempts attempts
  where attempts.user_id = requesting_user_id and attempts.client_match_id = normalized_match_id
  for update;
  if not found then raise exception 'A valid Ghost Rivalry attempt is required.' using errcode = 'P0001'; end if;

  if attempt.status = 'settled' then return jsonb_build_object('status', 'already-settled'); end if;
  if attempt.status = 'abandoned' then return jsonb_build_object('status', 'already-abandoned'); end if;

  update public.rivalry_challenge_attempts attempts
  set status = 'abandoned', outcome = null, settled_at = null
  where attempts.id = attempt.id;
  return jsonb_build_object('status', 'abandoned');
end;
$$;

revoke all on function public.abandon_rivalry_challenge(text) from public, anon;
grant execute on function public.abandon_rivalry_challenge(text) to authenticated;
