create index if not exists match_rewards_match_user_idx
  on public.match_rewards (match_id, user_id);
