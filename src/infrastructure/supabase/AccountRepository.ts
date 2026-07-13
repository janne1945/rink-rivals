import type { SupabaseClient } from "@supabase/supabase-js";

import type { GameMode, LineupSlot } from "../../domain/lineups";
import type { Database } from "./database.types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserCardRow = Database["public"]["Tables"]["user_cards"]["Row"];
type LineupRow = Database["public"]["Tables"]["lineups"]["Row"];
type LineupSlotRow = Database["public"]["Tables"]["lineup_slots"]["Row"];

export interface AccountProfile {
  readonly id: string;
  readonly displayName: string | null;
  readonly credits: number;
  readonly selectedTeamId: string | null;
  readonly starterClaimedAt: string | null;
  readonly onboardingCompleted: boolean;
}

export interface AccountCard {
  readonly cardId: string;
  readonly quantity: number;
  readonly acquiredAt: string;
}

export interface AccountLineup {
  readonly id: string;
  readonly name: string;
  readonly mode: GameMode;
  readonly isActive: boolean;
  readonly slots: Readonly<Partial<Record<LineupSlot, string>>>;
}

export interface AccountRepository {
  loadProfile(): Promise<AccountProfile>;
  loadOwnCards(): Promise<readonly AccountCard[]>;
  loadLineup(lineupId?: string): Promise<AccountLineup | null>;
  claimStarterTeam(selectedTeamId: string): Promise<AccountLineup>;
}

function requireData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data.");
  return data;
}

function toProfile(row: ProfileRow): AccountProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    credits: row.credits,
    selectedTeamId: row.favorite_team_id,
    starterClaimedAt: row.starter_claimed_at,
    onboardingCompleted: row.onboarding_completed,
  };
}

function toCard(row: UserCardRow): AccountCard {
  return {
    cardId: row.card_id,
    quantity: row.quantity,
    acquiredAt: row.acquired_at,
  };
}

export class SupabaseAccountRepository implements AccountRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async loadProfile(): Promise<AccountProfile> {
    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .single();
    return toProfile(requireData(data, error));
  }

  async loadOwnCards(): Promise<readonly AccountCard[]> {
    const { data, error } = await this.client
      .from("user_cards")
      .select("*")
      .order("acquired_at", { ascending: true });
    return requireData(data, error).map(toCard);
  }

  async loadLineup(lineupId?: string): Promise<AccountLineup | null> {
    let query = this.client.from("lineups").select("*");
    query = lineupId
      ? query.eq("id", lineupId)
      : query.eq("is_active", true).eq("mode", "nhl-circuit");

    const { data: lineup, error: lineupError } = await query.maybeSingle();
    if (lineupError) throw new Error(lineupError.message);
    if (!lineup) return null;

    const { data: slots, error: slotsError } = await this.client
      .from("lineup_slots")
      .select("*")
      .eq("lineup_id", lineup.id);
    const slotRows = requireData(slots, slotsError);
    return this.toLineup(lineup, slotRows);
  }

  async claimStarterTeam(selectedTeamId: string): Promise<AccountLineup> {
    const { data: lineupId, error } = await this.client.rpc(
      "claim_starter_team",
      { selected_team_id: selectedTeamId },
    );
    const id = requireData(lineupId, error);
    const lineup = await this.loadLineup(id);
    if (!lineup) throw new Error("Claimed starter lineup could not be loaded.");
    return lineup;
  }

  private toLineup(lineup: LineupRow, slots: LineupSlotRow[]): AccountLineup {
    const mappedSlots: Partial<Record<LineupSlot, string>> = {};
    for (const row of slots) mappedSlots[row.slot as LineupSlot] = row.card_id;
    return {
      id: lineup.id,
      name: lineup.name,
      mode: lineup.mode as GameMode,
      isActive: lineup.is_active,
      slots: mappedSlots,
    };
  }
}
