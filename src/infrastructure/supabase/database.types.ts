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
      lineup_slots: {
        Row: {
          card_id: string
          lineup_id: string
          slot: string
          user_id: string
        }
        Insert: {
          card_id: string
          lineup_id: string
          slot: string
          user_id: string
        }
        Update: {
          card_id?: string
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
          updated_at?: string
        }
        Relationships: []
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
      claim_starter_team: {
        Args: { selected_team_id: string }
        Returns: string
      }
      settle_match: {
        Args: {
          client_match_id: string
          match_difficulty: string
          match_mode: string
          match_outcome: string
        }
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

