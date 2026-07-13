-- Cover the foreign-key columns used by account cleanup, catalog maintenance,
-- and match transcript joins. These indexes are additive and do not alter the
-- server-authority or RLS contract.

create index if not exists match_rounds_opponent_card_id_idx
  on public.match_rounds (opponent_card_id);
create index if not exists match_rounds_player_card_id_idx
  on public.match_rounds (player_card_id);
create index if not exists match_rounds_ticket_user_idx
  on public.match_rounds (ticket_id, user_id);

create index if not exists match_tickets_lineup_user_idx
  on public.match_tickets (lineup_id, user_id);
create index if not exists match_tickets_opponent_id_idx
  on public.match_tickets (opponent_id);

create index if not exists profiles_starter_lineup_user_idx
  on public.profiles (starter_lineup_id, id)
  where starter_lineup_id is not null;

create index if not exists purchase_receipts_card_id_idx
  on public.purchase_receipts (card_id);
create index if not exists purchase_receipts_event_id_idx
  on public.purchase_receipts (event_id)
  where event_id is not null;
create index if not exists reward_receipts_card_id_idx
  on public.reward_receipts (card_id);
create index if not exists starter_team_cards_card_id_idx
  on public.starter_team_cards (card_id);
create index if not exists user_cards_card_id_idx
  on public.user_cards (card_id);
