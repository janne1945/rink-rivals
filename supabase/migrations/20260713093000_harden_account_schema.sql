revoke all on function public.handle_new_user() from public, anon, authenticated;

drop index if exists public.lineup_slots_lineup_card_key;
create index if not exists lineup_slots_lineup_user_idx
  on public.lineup_slots (lineup_id, user_id);
create index if not exists lineup_slots_user_card_idx
  on public.lineup_slots (user_id, card_id);
