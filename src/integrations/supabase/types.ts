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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      athlete_rankings: {
        Row: {
          athlete_id: string
          created_at: string
          discipline: string
          gender: string
          id: string
          list_date: string
          points: number
          rank: number
          source: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          discipline: string
          gender: string
          id?: string
          list_date?: string
          points: number
          rank: number
          source?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          discipline?: string
          gender?: string
          id?: string
          list_date?: string
          points?: number
          rank?: number
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_rankings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_results: {
        Row: {
          athlete_id: string
          created_at: string
          discipline: string
          gender: string
          id: string
          made_finals: boolean | null
          missed_first_pass: boolean | null
          missed_gate: boolean | null
          position: number | null
          score_raw: number | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          discipline: string
          gender: string
          id?: string
          made_finals?: boolean | null
          missed_first_pass?: boolean | null
          missed_gate?: boolean | null
          position?: number | null
          score_raw?: number | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          discipline?: string
          gender?: string
          id?: string
          made_finals?: boolean | null
          missed_first_pass?: boolean | null
          missed_gate?: boolean | null
          position?: number | null
          score_raw?: number | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_results_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      athletes: {
        Row: {
          bio: string | null
          country: string
          country_code: string | null
          created_at: string
          current_points_jump: number | null
          current_points_slalom: number | null
          current_points_trick: number | null
          current_rank_jump: number | null
          current_rank_slalom: number | null
          current_rank_trick: number | null
          disciplines: string[]
          fantasy_price_jump: number | null
          fantasy_price_slalom: number | null
          fantasy_price_trick: number | null
          federation: string
          full_name: string | null
          gender: string
          id: string
          injury_flag: boolean | null
          iwwf_athlete_id: string | null
          manual_boost_factor: number | null
          name: string
          performance_index_jump: number | null
          performance_index_slalom: number | null
          performance_index_trick: number | null
          popularity_index: number | null
          profile_image_url: string | null
          updated_at: string
          year_of_birth: number
        }
        Insert: {
          bio?: string | null
          country: string
          country_code?: string | null
          created_at?: string
          current_points_jump?: number | null
          current_points_slalom?: number | null
          current_points_trick?: number | null
          current_rank_jump?: number | null
          current_rank_slalom?: number | null
          current_rank_trick?: number | null
          disciplines?: string[]
          fantasy_price_jump?: number | null
          fantasy_price_slalom?: number | null
          fantasy_price_trick?: number | null
          federation: string
          full_name?: string | null
          gender: string
          id?: string
          injury_flag?: boolean | null
          iwwf_athlete_id?: string | null
          manual_boost_factor?: number | null
          name: string
          performance_index_jump?: number | null
          performance_index_slalom?: number | null
          performance_index_trick?: number | null
          popularity_index?: number | null
          profile_image_url?: string | null
          updated_at?: string
          year_of_birth: number
        }
        Update: {
          bio?: string | null
          country?: string
          country_code?: string | null
          created_at?: string
          current_points_jump?: number | null
          current_points_slalom?: number | null
          current_points_trick?: number | null
          current_rank_jump?: number | null
          current_rank_slalom?: number | null
          current_rank_trick?: number | null
          disciplines?: string[]
          fantasy_price_jump?: number | null
          fantasy_price_slalom?: number | null
          fantasy_price_trick?: number | null
          federation?: string
          full_name?: string | null
          gender?: string
          id?: string
          injury_flag?: boolean | null
          iwwf_athlete_id?: string | null
          manual_boost_factor?: number | null
          name?: string
          performance_index_jump?: number | null
          performance_index_slalom?: number | null
          performance_index_trick?: number | null
          popularity_index?: number | null
          profile_image_url?: string | null
          updated_at?: string
          year_of_birth?: number
        }
        Relationships: []
      }
      markets: {
        Row: {
          category: string
          created_at: string
          discipline: string
          id: string
          market_type: string
          name: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          discipline: string
          id?: string
          market_type: string
          name: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          discipline?: string
          id?: string
          market_type?: string
          name?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "markets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      podium_selections: {
        Row: {
          athlete_id: string
          created_at: string | null
          id: string
          position_predicted: number
          prediction_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          id?: string
          position_predicted: number
          prediction_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          id?: string
          position_predicted?: number
          prediction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "podium_selections_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "podium_selections_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          athlete_name: string
          category: string
          created_at: string
          decimal_odds: number
          discipline: string
          id: string
          is_parlay_parent: boolean | null
          market_type: string
          parlay_id: string | null
          parlay_leg_count: number | null
          payout_tokens: number | null
          potential_payout: number
          selection_id: string
          settled_at: string | null
          staked_tokens: number
          status: string
          tournament_name: string
          user_id: string
        }
        Insert: {
          athlete_name: string
          category: string
          created_at?: string
          decimal_odds: number
          discipline: string
          id?: string
          is_parlay_parent?: boolean | null
          market_type: string
          parlay_id?: string | null
          parlay_leg_count?: number | null
          payout_tokens?: number | null
          potential_payout: number
          selection_id: string
          settled_at?: string | null
          staked_tokens: number
          status?: string
          tournament_name: string
          user_id: string
        }
        Update: {
          athlete_name?: string
          category?: string
          created_at?: string
          decimal_odds?: number
          discipline?: string
          id?: string
          is_parlay_parent?: boolean | null
          market_type?: string
          parlay_id?: string | null
          parlay_leg_count?: number | null
          payout_tokens?: number | null
          potential_payout?: number
          selection_id?: string
          settled_at?: string | null
          staked_tokens?: number
          status?: string
          tournament_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_parlay_id_fkey"
            columns: ["parlay_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          email: string
          id: string
          lifetime_deposited: number | null
          lifetime_losses: number | null
          lifetime_winnings: number | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          email: string
          id: string
          lifetime_deposited?: number | null
          lifetime_losses?: number | null
          lifetime_winnings?: number | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          email?: string
          id?: string
          lifetime_deposited?: number | null
          lifetime_losses?: number | null
          lifetime_winnings?: number | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      redemptions: {
        Row: {
          created_at: string
          id: string
          reward_id: string
          status: string
          tokens_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reward_id: string
          status?: string
          tokens_spent: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reward_id?: string
          status?: string
          tokens_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          available: boolean
          category: string
          created_at: string
          description: string
          id: string
          image_url: string | null
          name: string
          partner: string
          required_tokens: number
          updated_at: string
        }
        Insert: {
          available?: boolean
          category: string
          created_at?: string
          description: string
          id?: string
          image_url?: string | null
          name: string
          partner: string
          required_tokens: number
          updated_at?: string
        }
        Update: {
          available?: boolean
          category?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          name?: string
          partner?: string
          required_tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      selections: {
        Row: {
          athlete_id: string
          created_at: string
          decimal_odds: number
          description: string
          id: string
          market_id: string
          result: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          decimal_odds: number
          description: string
          id?: string
          market_id: string
          result?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          decimal_odds?: number
          description?: string
          id?: string
          market_id?: string
          result?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "selections_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      token_wallets: {
        Row: {
          created_at: string
          earned_tokens: number
          id: string
          purchased_tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          earned_tokens?: number
          id?: string
          purchased_tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          earned_tokens?: number
          id?: string
          purchased_tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          disciplines: string[]
          end_date: string
          id: string
          location: string
          name: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          disciplines?: string[]
          end_date: string
          id?: string
          location: string
          name: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          disciplines?: string[]
          end_date?: string
          id?: string
          location?: string
          name?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_earned_tokens: {
        Args: { amount: number; user_id_param: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
