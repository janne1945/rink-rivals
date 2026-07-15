export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_opponents: {
        Row: {
          difficulty: string
          id: string
          lineup_slots: Json
          mode: string
          name: string
        }
        Insert: {
          difficulty: string
          id: string
          lineup_slots: Json
          mode: string
          name: string
        }
        Update: {
          difficulty?: string
          id?: string
          lineup_slots?: Json
          mode?: string
          name?: string
        }
        Relationships: []
      }
      card_catalog: {
        Row: {
          abilities: string[]
          attributes: Json
          available_from: string | null
          available_to: string | null
          card_id: string
          card_tier: string
          card_type: string
          created_at: string
          eligible_positions: string[]
          image_reference: string
          is_active: boolean
          is_permanent: boolean
          is_reward_only: boolean
          league: string
          legacy_retained: boolean
          market_availability: string
          overall: number
          player_id: string
          price: number
          role: string
          set_id: string
          source_metadata: Json
          team_id: string
          updated_at: string
          visual_metadata: Json
        }
        Insert: {
          abilities?: string[]
          attributes?: Json
          available_from?: string | null
          available_to?: string | null
          card_id: string
          card_tier: string
          card_type: string
          created_at?: string
          eligible_positions: string[]
          image_reference: string
          is_active?: boolean
          is_permanent: boolean
          is_reward_only?: boolean
          league: string
          legacy_retained?: boolean
          market_availability: string
          overall: number
          player_id: string
          price: number
          role: string
          set_id: string
          source_metadata?: Json
          team_id: string
          updated_at?: string
          visual_metadata?: Json
        }
        Update: {
          abilities?: string[]
          attributes?: Json
          available_from?: string | null
          available_to?: string | null
          card_id?: string
          card_tier?: string
          card_type?: string
          created_at?: string
          eligible_positions?: string[]
          image_reference?: string
          is_active?: boolean
          is_permanent?: boolean
          is_reward_only?: boolean
          league?: string
          legacy_retained?: boolean
          market_availability?: string
          overall?: number
          player_id?: string
          price?: number
          role?: string
          set_id?: string
          source_metadata?: Json
          team_id?: string
          updated_at?: string
          visual_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "card_catalog_player_league_fkey"
            columns: ["player_id", "league"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id", "league"]
          },
          {
            foreignKeyName: "card_catalog_team_league_fkey"
            columns: ["team_id", "league"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id", "league"]
          },
        ]
      }
      event_definitions: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          rotation_order: number
          updated_at: string
          visual_metadata: Json
        }
        Insert: {
          created_at?: string
          description: string
          id: string
          is_active?: boolean
          name: string
          rotation_order: number
          updated_at?: string
          visual_metadata?: Json
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          rotation_order?: number
          updated_at?: string
          visual_metadata?: Json
        }
        Relationships: []
      }
      lineup_slots: {
        Row: {
          card_id: string
          created_at: string
          lineup_id: string
          slot: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          lineup_id: string
          slot: string
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          lineup_id?: string
          slot?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineup_slots_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_slots_lineup_user_fkey"
            columns: ["lineup_id", "user_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "lineup_slots_user_card_fkey"
            columns: ["user_id", "card_id"]
            isOneToOne: false
            referencedRelation: "user_cards"
            referencedColumns: ["user_id", "card_id"]
          },
        ]
      }
      lineups: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          mode: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          mode?: string
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          mode?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_rewards: {
        Row: {
          breakdown: Json
          granted_at: string
          match_credits: number
          match_id: string
          objective_credits: number
          rivalry_credits: number
          rule_version: string
          total_credits: number | null
          user_id: string
        }
        Insert: {
          breakdown?: Json
          granted_at?: string
          match_credits: number
          match_id: string
          objective_credits?: number
          rivalry_credits?: number
          rule_version: string
          total_credits?: number | null
          user_id: string
        }
        Update: {
          breakdown?: Json
          granted_at?: string
          match_credits?: number
          match_id?: string
          objective_credits?: number
          rivalry_credits?: number
          rule_version?: string
          total_credits?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_rewards_match_id_user_id_fkey"
            columns: ["match_id", "user_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      match_rounds: {
        Row: {
          client_request_id: string
          opponent_card_id: string
          opponent_score: number
          opponent_slot: string
          played_at: string
          player_card_id: string
          player_score: number
          player_slot: string
          round_index: number
          situation_id: string
          ticket_id: string
          transcript: Json
          user_id: string
          winner: string
        }
        Insert: {
          client_request_id: string
          opponent_card_id: string
          opponent_score: number
          opponent_slot: string
          played_at?: string
          player_card_id: string
          player_score: number
          player_slot: string
          round_index: number
          situation_id: string
          ticket_id: string
          transcript: Json
          user_id: string
          winner: string
        }
        Update: {
          client_request_id?: string
          opponent_card_id?: string
          opponent_score?: number
          opponent_slot?: string
          played_at?: string
          player_card_id?: string
          player_score?: number
          player_slot?: string
          round_index?: number
          situation_id?: string
          ticket_id?: string
          transcript?: Json
          user_id?: string
          winner?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_rounds_opponent_card_id_fkey"
            columns: ["opponent_card_id"]
            isOneToOne: false
            referencedRelation: "card_catalog"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "match_rounds_player_card_id_fkey"
            columns: ["player_card_id"]
            isOneToOne: false
            referencedRelation: "card_catalog"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "match_rounds_ticket_id_user_id_fkey"
            columns: ["ticket_id", "user_id"]
            isOneToOne: false
            referencedRelation: "match_tickets"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "match_rounds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_tickets: {
        Row: {
          client_match_id: string
          difficulty: string
          id: string
          lineup_id: string
          lineup_snapshot: Json
          mode: string
          opponent_id: string
          opponent_snapshot: Json
          outcome: string | null
          seed: string
          settled_at: string | null
          situations_snapshot: Json
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          client_match_id: string
          difficulty: string
          id?: string
          lineup_id: string
          lineup_snapshot: Json
          mode: string
          opponent_id: string
          opponent_snapshot: Json
          outcome?: string | null
          seed: string
          settled_at?: string | null
          situations_snapshot: Json
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          client_match_id?: string
          difficulty?: string
          id?: string
          lineup_id?: string
          lineup_snapshot?: Json
          mode?: string
          opponent_id?: string
          opponent_snapshot?: Json
          outcome?: string | null
          seed?: string
          settled_at?: string | null
          situations_snapshot?: Json
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_tickets_lineup_id_user_id_fkey"
            columns: ["lineup_id", "user_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "match_tickets_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "ai_opponents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          client_match_id: string
          completed_at: string
          created_at: string
          difficulty: string
          id: string
          mode: string
          outcome: string
          reward_rule_version: string
          user_id: string
        }
        Insert: {
          client_match_id: string
          completed_at?: string
          created_at?: string
          difficulty: string
          id?: string
          mode: string
          outcome: string
          reward_rule_version: string
          user_id: string
        }
        Update: {
          client_match_id?: string
          completed_at?: string
          created_at?: string
          difficulty?: string
          id?: string
          mode?: string
          outcome?: string
          reward_rule_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      objective_progress: {
        Row: {
          completed_at: string | null
          completed_modes: string[]
          current: number
          objective_id: string
          period_key: string
          reward_credits: number
          target: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_modes?: string[]
          current?: number
          objective_id: string
          period_key: string
          reward_credits: number
          target: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_modes?: string[]
          current?: number
          objective_id?: string
          period_key?: string
          reward_credits?: number
          target?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "objective_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          active: boolean
          archetype: string
          created_at: string
          current_team_id: string
          handedness: string
          id: string
          image_reference: string | null
          league: string
          name: string
          nationality: string | null
          primary_position: string
          role: string
          secondary_positions: string[]
          source_metadata: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          archetype: string
          created_at?: string
          current_team_id: string
          handedness: string
          id: string
          image_reference?: string | null
          league: string
          name: string
          nationality?: string | null
          primary_position: string
          role: string
          secondary_positions?: string[]
          source_metadata?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          archetype?: string
          created_at?: string
          current_team_id?: string
          handedness?: string
          id?: string
          image_reference?: string | null
          league?: string
          name?: string
          nationality?: string | null
          primary_position?: string
          role?: string
          secondary_positions?: string[]
          source_metadata?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_current_team_id_league_fkey"
            columns: ["current_team_id", "league"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id", "league"]
          },
        ]
      }
      profiles: {
        Row: {
          completed_matches: number
          created_at: string
          credits: number
          display_name: string | null
          favorite_team_id: string | null
          id: string
          onboarding_completed: boolean
          starter_claimed_at: string | null
          starter_lineup_id: string | null
          updated_at: string
        }
        Insert: {
          completed_matches?: number
          created_at?: string
          credits?: number
          display_name?: string | null
          favorite_team_id?: string | null
          id: string
          onboarding_completed?: boolean
          starter_claimed_at?: string | null
          starter_lineup_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_matches?: number
          created_at?: string
          credits?: number
          display_name?: string | null
          favorite_team_id?: string | null
          id?: string
          onboarding_completed?: boolean
          starter_claimed_at?: string | null
          starter_lineup_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_starter_lineup_user_fkey"
            columns: ["starter_lineup_id", "id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      purchase_receipts: {
        Row: {
          card_id: string
          client_request_id: string
          event_id: string | null
          id: string
          offer_id: string
          price: number
          purchased_at: string
          source: string
          user_id: string
        }
        Insert: {
          card_id: string
          client_request_id: string
          event_id?: string | null
          id?: string
          offer_id: string
          price: number
          purchased_at?: string
          source: string
          user_id: string
        }
        Update: {
          card_id?: string
          client_request_id?: string
          event_id?: string | null
          id?: string
          offer_id?: string
          price?: number
          purchased_at?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipts_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_catalog"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "purchase_receipts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_receipts: {
        Row: {
          card_id: string
          claimed_at: string
          client_request_id: string
          id: string
          source_id: string
          user_id: string
        }
        Insert: {
          card_id: string
          claimed_at?: string
          client_request_id: string
          id?: string
          source_id: string
          user_id: string
        }
        Update: {
          card_id?: string
          claimed_at?: string
          client_request_id?: string
          id?: string
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_receipts_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "rivalry_reward_options"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "reward_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rivalry_reward_options: {
        Row: {
          card_id: string
          display_order: number
        }
        Insert: {
          card_id: string
          display_order: number
        }
        Update: {
          card_id?: string
          display_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "rivalry_reward_options_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "card_catalog"
            referencedColumns: ["card_id"]
          },
        ]
      }
      rivalry_road_progress: {
        Row: {
          completed_step_ids: string[]
          current_step_index: number
          selected_card_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_step_ids?: string[]
          current_step_index?: number
          selected_card_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_step_ids?: string[]
          current_step_index?: number
          selected_card_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rivalry_road_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      starter_grant_receipts: {
        Row: {
          card_snapshot: Json
          claimed_at: string
          credits_granted: number
          grant_version: string
          lineup_id: string
          origin: string
          team_id: string
          user_id: string
        }
        Insert: {
          card_snapshot: Json
          claimed_at?: string
          credits_granted: number
          grant_version: string
          lineup_id: string
          origin: string
          team_id: string
          user_id: string
        }
        Update: {
          card_snapshot?: Json
          claimed_at?: string
          credits_granted?: number
          grant_version?: string
          lineup_id?: string
          origin?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "starter_grant_receipts_lineup_id_user_id_fkey"
            columns: ["lineup_id", "user_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "starter_grant_receipts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "starter_grant_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      starter_migration_audits: {
        Row: {
          audited_at: string
          credits_at_audit: number
          legacy_claimed_at: string
          legacy_lineup_id: string | null
          legacy_team_id: string | null
          open_ticket_snapshot: Json
          ownership_snapshot: Json
          reason: string
          reviewed_at: string | null
          state: string
          user_id: string
        }
        Insert: {
          audited_at?: string
          credits_at_audit: number
          legacy_claimed_at: string
          legacy_lineup_id?: string | null
          legacy_team_id?: string | null
          open_ticket_snapshot: Json
          ownership_snapshot: Json
          reason: string
          reviewed_at?: string | null
          state: string
          user_id: string
        }
        Update: {
          audited_at?: string
          credits_at_audit?: number
          legacy_claimed_at?: string
          legacy_lineup_id?: string | null
          legacy_team_id?: string | null
          open_ticket_snapshot?: Json
          ownership_snapshot?: Json
          reason?: string
          reviewed_at?: string | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "starter_migration_audits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      starter_team_cards: {
        Row: {
          card_id: string
          slot: string
          team_id: string
        }
        Insert: {
          card_id: string
          slot: string
          team_id: string
        }
        Update: {
          card_id?: string
          slot?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "starter_team_cards_catalog_card_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_catalog"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "starter_team_cards_team_card_fkey"
            columns: ["team_id", "card_id"]
            isOneToOne: true
            referencedRelation: "card_catalog"
            referencedColumns: ["team_id", "card_id"]
          },
          {
            foreignKeyName: "starter_team_cards_team_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          abbreviation: string
          active: boolean
          created_at: string
          id: string
          league: string
          name: string
          source_metadata: Json
          updated_at: string
          visual_metadata: Json
        }
        Insert: {
          abbreviation: string
          active?: boolean
          created_at?: string
          id: string
          league: string
          name: string
          source_metadata?: Json
          updated_at?: string
          visual_metadata?: Json
        }
        Update: {
          abbreviation?: string
          active?: boolean
          created_at?: string
          id?: string
          league?: string
          name?: string
          source_metadata?: Json
          updated_at?: string
          visual_metadata?: Json
        }
        Relationships: []
      }
      user_cards: {
        Row: {
          acquired_at: string
          card_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          acquired_at?: string
          card_id: string
          quantity?: number
          user_id: string
        }
        Update: {
          acquired_at?: string
          card_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cards_catalog_card_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_catalog"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "user_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_lineup: { Args: { lineup_id: string }; Returns: Json }
      assert_valid_lineup: {
        Args: {
          lineup_mode: string
          requested_slots: Json
          requesting_user_id: string
        }
        Returns: undefined
      }
      build_ai_opponent_lineup: {
        Args: {
          difficulty: string
          match_seed: string
          mode: string
          opponent_id: string
        }
        Returns: Json
      }
      card_quartett_score: {
        Args: { requested_card_id: string; situation: Json }
        Returns: Json
      }
      card_situation_score: {
        Args: { requested_card_id: string; situation: Json }
        Returns: number
      }
      claim_rivalry_reward: {
        Args: { card_id: string; client_request_id: string }
        Returns: Json
      }
      claim_starter_team: {
        Args: { selected_team_id: string }
        Returns: string
      }
      current_market_offers: {
        Args: { at_time: string }
        Returns: {
          card_id: string
          ends_at: string
          event_id: string
          offer_id: string
          placement: string
          price: number
          regular_price: number
          source: string
          starts_at: string
        }[]
      }
      get_market_state: { Args: never; Returns: Json }
      lineup_as_json: {
        Args: { requested_lineup_id: string; requesting_user_id: string }
        Returns: Json
      }
      play_match_round: {
        Args: {
          client_match_id: string
          client_request_id: string
          player_card_id: string
          round_index: number
        }
        Returns: Json
      }
      purchase_card: {
        Args: { client_request_id: string; offer_id: string }
        Returns: Json
      }
      quartett_situation: { Args: { situation: Json }; Returns: Json }
      resolve_event_rotation_slot: {
        Args: { at_time: string }
        Returns: number
      }
      save_lineup: {
        Args: { lineup_id: string; mode: string; name: string; slots: Json }
        Returns: Json
      }
      settle_match: { Args: { client_match_id: string }; Returns: Json }
      start_match: {
        Args: { client_match_id: string; difficulty: string; mode: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
