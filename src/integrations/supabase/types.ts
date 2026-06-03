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
          activity_decay_jump: number | null
          activity_decay_slalom: number | null
          activity_decay_trick: number | null
          base_strength_jump: number | null
          base_strength_slalom: number | null
          base_strength_trick: number | null
          bio: string | null
          career_events_jump: number | null
          career_events_slalom: number | null
          career_events_trick: number | null
          career_podiums_jump: number | null
          career_podiums_slalom: number | null
          career_podiums_trick: number | null
          career_top8_jump: number | null
          career_top8_slalom: number | null
          career_top8_trick: number | null
          career_wins_jump: number | null
          career_wins_slalom: number | null
          career_wins_trick: number | null
          consecutive_finals: number | null
          consecutive_podiums: number | null
          country: string
          country_code: string | null
          created_at: string
          current_points_jump: number | null
          current_points_slalom: number | null
          current_points_trick: number | null
          current_rank_jump: number | null
          current_rank_slalom: number | null
          current_rank_trick: number | null
          current_rating_jump: number | null
          current_rating_slalom: number | null
          current_rating_trick: number | null
          defending_champion_disciplines: string[] | null
          disciplines: string[]
          fantasy_price_jump: number | null
          fantasy_price_slalom: number | null
          fantasy_price_trick: number | null
          federation: string
          form_boost_jump: number | null
          form_boost_slalom: number | null
          form_boost_trick: number | null
          full_name: string | null
          gender: string
          id: string
          injury_flag: boolean | null
          is_retired: boolean | null
          iwwf_athlete_id: string | null
          last_5_results_jump: Json | null
          last_5_results_slalom: Json | null
          last_5_results_trick: Json | null
          manual_boost_factor: number | null
          missed_events_count: number | null
          name: string
          notes: string | null
          odds_strength_score_jump: number | null
          odds_strength_score_slalom: number | null
          odds_strength_score_trick: number | null
          performance_index_jump: number | null
          performance_index_slalom: number | null
          performance_index_trick: number | null
          popularity_index: number | null
          pro_tour_titles_jump: number | null
          pro_tour_titles_slalom: number | null
          pro_tour_titles_trick: number | null
          profile_image_url: string | null
          retired_date: string | null
          season_avg_place_jump: number | null
          season_avg_place_slalom: number | null
          season_avg_place_trick: number | null
          season_events_jump: number | null
          season_events_slalom: number | null
          season_events_trick: number | null
          season_podiums_jump: number | null
          season_podiums_slalom: number | null
          season_podiums_trick: number | null
          season_wins_jump: number | null
          season_wins_slalom: number | null
          season_wins_trick: number | null
          strength_tier_jump: string | null
          strength_tier_slalom: string | null
          strength_tier_trick: string | null
          updated_at: string
          year_of_birth: number
        }
        Insert: {
          activity_decay_jump?: number | null
          activity_decay_slalom?: number | null
          activity_decay_trick?: number | null
          base_strength_jump?: number | null
          base_strength_slalom?: number | null
          base_strength_trick?: number | null
          bio?: string | null
          career_events_jump?: number | null
          career_events_slalom?: number | null
          career_events_trick?: number | null
          career_podiums_jump?: number | null
          career_podiums_slalom?: number | null
          career_podiums_trick?: number | null
          career_top8_jump?: number | null
          career_top8_slalom?: number | null
          career_top8_trick?: number | null
          career_wins_jump?: number | null
          career_wins_slalom?: number | null
          career_wins_trick?: number | null
          consecutive_finals?: number | null
          consecutive_podiums?: number | null
          country: string
          country_code?: string | null
          created_at?: string
          current_points_jump?: number | null
          current_points_slalom?: number | null
          current_points_trick?: number | null
          current_rank_jump?: number | null
          current_rank_slalom?: number | null
          current_rank_trick?: number | null
          current_rating_jump?: number | null
          current_rating_slalom?: number | null
          current_rating_trick?: number | null
          defending_champion_disciplines?: string[] | null
          disciplines?: string[]
          fantasy_price_jump?: number | null
          fantasy_price_slalom?: number | null
          fantasy_price_trick?: number | null
          federation: string
          form_boost_jump?: number | null
          form_boost_slalom?: number | null
          form_boost_trick?: number | null
          full_name?: string | null
          gender: string
          id?: string
          injury_flag?: boolean | null
          is_retired?: boolean | null
          iwwf_athlete_id?: string | null
          last_5_results_jump?: Json | null
          last_5_results_slalom?: Json | null
          last_5_results_trick?: Json | null
          manual_boost_factor?: number | null
          missed_events_count?: number | null
          name: string
          notes?: string | null
          odds_strength_score_jump?: number | null
          odds_strength_score_slalom?: number | null
          odds_strength_score_trick?: number | null
          performance_index_jump?: number | null
          performance_index_slalom?: number | null
          performance_index_trick?: number | null
          popularity_index?: number | null
          pro_tour_titles_jump?: number | null
          pro_tour_titles_slalom?: number | null
          pro_tour_titles_trick?: number | null
          profile_image_url?: string | null
          retired_date?: string | null
          season_avg_place_jump?: number | null
          season_avg_place_slalom?: number | null
          season_avg_place_trick?: number | null
          season_events_jump?: number | null
          season_events_slalom?: number | null
          season_events_trick?: number | null
          season_podiums_jump?: number | null
          season_podiums_slalom?: number | null
          season_podiums_trick?: number | null
          season_wins_jump?: number | null
          season_wins_slalom?: number | null
          season_wins_trick?: number | null
          strength_tier_jump?: string | null
          strength_tier_slalom?: string | null
          strength_tier_trick?: string | null
          updated_at?: string
          year_of_birth: number
        }
        Update: {
          activity_decay_jump?: number | null
          activity_decay_slalom?: number | null
          activity_decay_trick?: number | null
          base_strength_jump?: number | null
          base_strength_slalom?: number | null
          base_strength_trick?: number | null
          bio?: string | null
          career_events_jump?: number | null
          career_events_slalom?: number | null
          career_events_trick?: number | null
          career_podiums_jump?: number | null
          career_podiums_slalom?: number | null
          career_podiums_trick?: number | null
          career_top8_jump?: number | null
          career_top8_slalom?: number | null
          career_top8_trick?: number | null
          career_wins_jump?: number | null
          career_wins_slalom?: number | null
          career_wins_trick?: number | null
          consecutive_finals?: number | null
          consecutive_podiums?: number | null
          country?: string
          country_code?: string | null
          created_at?: string
          current_points_jump?: number | null
          current_points_slalom?: number | null
          current_points_trick?: number | null
          current_rank_jump?: number | null
          current_rank_slalom?: number | null
          current_rank_trick?: number | null
          current_rating_jump?: number | null
          current_rating_slalom?: number | null
          current_rating_trick?: number | null
          defending_champion_disciplines?: string[] | null
          disciplines?: string[]
          fantasy_price_jump?: number | null
          fantasy_price_slalom?: number | null
          fantasy_price_trick?: number | null
          federation?: string
          form_boost_jump?: number | null
          form_boost_slalom?: number | null
          form_boost_trick?: number | null
          full_name?: string | null
          gender?: string
          id?: string
          injury_flag?: boolean | null
          is_retired?: boolean | null
          iwwf_athlete_id?: string | null
          last_5_results_jump?: Json | null
          last_5_results_slalom?: Json | null
          last_5_results_trick?: Json | null
          manual_boost_factor?: number | null
          missed_events_count?: number | null
          name?: string
          notes?: string | null
          odds_strength_score_jump?: number | null
          odds_strength_score_slalom?: number | null
          odds_strength_score_trick?: number | null
          performance_index_jump?: number | null
          performance_index_slalom?: number | null
          performance_index_trick?: number | null
          popularity_index?: number | null
          pro_tour_titles_jump?: number | null
          pro_tour_titles_slalom?: number | null
          pro_tour_titles_trick?: number | null
          profile_image_url?: string | null
          retired_date?: string | null
          season_avg_place_jump?: number | null
          season_avg_place_slalom?: number | null
          season_avg_place_trick?: number | null
          season_events_jump?: number | null
          season_events_slalom?: number | null
          season_events_trick?: number | null
          season_podiums_jump?: number | null
          season_podiums_slalom?: number | null
          season_podiums_trick?: number | null
          season_wins_jump?: number | null
          season_wins_slalom?: number | null
          season_wins_trick?: number | null
          strength_tier_jump?: string | null
          strength_tier_slalom?: string | null
          strength_tier_trick?: string | null
          updated_at?: string
          year_of_birth?: number
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          actor_id: string | null
          actor_type: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          actor_type: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          actor_type?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      bet_slips: {
        Row: {
          actual_payout_tokens: number | null
          athlete_id: string | null
          created_at: string
          id: string
          leg_count: number
          market_id: string | null
          potential_payout_tokens: number
          settled_at: string | null
          settlement_run_id: string | null
          status: string
          total_odds_american: number
          total_odds_decimal: number
          total_stake_tokens: number
          tournament_id: string
          type: string
          user_id: string
        }
        Insert: {
          actual_payout_tokens?: number | null
          athlete_id?: string | null
          created_at?: string
          id?: string
          leg_count?: number
          market_id?: string | null
          potential_payout_tokens: number
          settled_at?: string | null
          settlement_run_id?: string | null
          status?: string
          total_odds_american: number
          total_odds_decimal: number
          total_stake_tokens: number
          tournament_id: string
          type?: string
          user_id: string
        }
        Update: {
          actual_payout_tokens?: number | null
          athlete_id?: string | null
          created_at?: string
          id?: string
          leg_count?: number
          market_id?: string | null
          potential_payout_tokens?: number
          settled_at?: string | null
          settlement_run_id?: string | null
          status?: string
          total_odds_american?: number
          total_odds_decimal?: number
          total_stake_tokens?: number
          tournament_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bet_slips_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_slips_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_slips_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_slips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_ledger: {
        Row: {
          amount_usd: number
          created_at: string
          description: string | null
          id: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          tokens_amount: number | null
          transaction_type: string
          user_id: string | null
        }
        Insert: {
          amount_usd: number
          created_at?: string
          description?: string | null
          id?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tokens_amount?: number | null
          transaction_type: string
          user_id?: string | null
        }
        Update: {
          amount_usd?: number
          created_at?: string
          description?: string | null
          id?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tokens_amount?: number | null
          transaction_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposit_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          email_type: string
          error_message: string | null
          id: string
          metadata: Json | null
          recipient: string
          resend_id: string | null
          sent_at: string
          status: string
          subject: string
          user_id: string | null
        }
        Insert: {
          email_type: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient: string
          resend_id?: string | null
          sent_at?: string
          status?: string
          subject: string
          user_id?: string | null
        }
        Update: {
          email_type?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient?: string
          resend_id?: string | null
          sent_at?: string
          status?: string
          subject?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_preferences: {
        Row: {
          created_at: string
          id: string
          marketing: boolean
          notifications: boolean
          prediction_reminders: boolean | null
          promo_notifications: boolean | null
          results_notifications: boolean | null
          transactional: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marketing?: boolean
          notifications?: boolean
          prediction_reminders?: boolean | null
          promo_notifications?: boolean | null
          results_notifications?: boolean | null
          transactional?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marketing?: boolean
          notifications?: boolean
          prediction_reminders?: boolean | null
          promo_notifications?: boolean | null
          results_notifications?: boolean | null
          transactional?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_subscriptions: {
        Row: {
          audience_id: string | null
          contact_id: string | null
          created_at: string
          email: string
          error_message: string | null
          id: string
          source: string | null
          subscribed: boolean
          tags: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          audience_id?: string | null
          contact_id?: string | null
          created_at?: string
          email: string
          error_message?: string | null
          id?: string
          source?: string | null
          subscribed?: boolean
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          audience_id?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string
          error_message?: string | null
          id?: string
          source?: string | null
          subscribed?: boolean
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fantasy_config: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      fantasy_entries: {
        Row: {
          created_at: string
          id: string
          pot_id: string
          rank: number | null
          remaining_budget: number
          team_name: string | null
          total_points: number
          total_team_value: number
          transfers_made: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pot_id: string
          rank?: number | null
          remaining_budget?: number
          team_name?: string | null
          total_points?: number
          total_team_value?: number
          transfers_made?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pot_id?: string
          rank?: number | null
          remaining_budget?: number
          team_name?: string | null
          total_points?: number
          total_team_value?: number
          transfers_made?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_entries_pot_id_fkey"
            columns: ["pot_id"]
            isOneToOne: false
            referencedRelation: "fantasy_pots"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_entry_athletes: {
        Row: {
          athlete_id: string
          created_at: string
          discipline: string
          entry_id: string
          id: string
          points_earned: number
          price_at_selection: number
        }
        Insert: {
          athlete_id: string
          created_at?: string
          discipline: string
          entry_id: string
          id?: string
          points_earned?: number
          price_at_selection: number
        }
        Update: {
          athlete_id?: string
          created_at?: string
          discipline?: string
          entry_id?: string
          id?: string
          points_earned?: number
          price_at_selection?: number
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_entry_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_entry_athletes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "fantasy_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invite_code: string | null
          invited_by: string
          invited_user_id: string | null
          pot_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_code?: string | null
          invited_by: string
          invited_user_id?: string | null
          pot_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_code?: string | null
          invited_by?: string
          invited_user_id?: string | null
          pot_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_invites_pot_id_fkey"
            columns: ["pot_id"]
            isOneToOne: false
            referencedRelation: "fantasy_pots"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_pots: {
        Row: {
          created_at: string
          created_by: string
          discipline_scope: string[]
          entry_fee_tokens: number
          house_rake_percent: number
          id: string
          invite_code: string | null
          max_entrants: number | null
          max_transfers_per_window: number | null
          name: string
          payout_split: Json
          payout_structure: string
          pot_type: string
          scoring_starts_from: string | null
          season_tier: number | null
          season_tournaments: string[] | null
          status: string
          team_budget: number
          tournament_id: string | null
          transfer_fee_percent: number
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by: string
          discipline_scope?: string[]
          entry_fee_tokens: number
          house_rake_percent?: number
          id?: string
          invite_code?: string | null
          max_entrants?: number | null
          max_transfers_per_window?: number | null
          name: string
          payout_split?: Json
          payout_structure?: string
          pot_type: string
          scoring_starts_from?: string | null
          season_tier?: number | null
          season_tournaments?: string[] | null
          status?: string
          team_budget?: number
          tournament_id?: string | null
          transfer_fee_percent?: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          discipline_scope?: string[]
          entry_fee_tokens?: number
          house_rake_percent?: number
          id?: string
          invite_code?: string | null
          max_entrants?: number | null
          max_transfers_per_window?: number | null
          name?: string
          payout_split?: Json
          payout_structure?: string
          pot_type?: string
          scoring_starts_from?: string | null
          season_tier?: number | null
          season_tournaments?: string[] | null
          status?: string
          team_budget?: number
          tournament_id?: string | null
          transfer_fee_percent?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_pots_scoring_starts_from_fkey"
            columns: ["scoring_starts_from"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_pots_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_roster_snapshots: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          snapshot: Json
          tournament_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          snapshot?: Json
          tournament_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          snapshot?: Json
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_roster_snapshots_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "fantasy_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_roster_snapshots_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_scoring_events: {
        Row: {
          athlete_id: string
          breakdown: Json
          created_at: string
          discipline: string
          entry_id: string
          id: string
          points_awarded: number
          tournament_id: string
        }
        Insert: {
          athlete_id: string
          breakdown?: Json
          created_at?: string
          discipline: string
          entry_id: string
          id?: string
          points_awarded?: number
          tournament_id: string
        }
        Update: {
          athlete_id?: string
          breakdown?: Json
          created_at?: string
          discipline?: string
          entry_id?: string
          id?: string
          points_awarded?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_scoring_events_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_scoring_events_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "fantasy_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_scoring_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_transfers: {
        Row: {
          athlete_id: string
          created_at: string
          discipline: string
          entry_id: string
          id: string
          price: number
          transfer_type: string
          transfer_window: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          discipline: string
          entry_id: string
          id?: string
          price: number
          transfer_type: string
          transfer_window?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          discipline?: string
          entry_id?: string
          id?: string
          price?: number
          transfer_type?: string
          transfer_window?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_transfers_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_transfers_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "fantasy_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_transfers_transfer_window_fkey"
            columns: ["transfer_window"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          body: string
          created_at: string | null
          id: string
          is_active: boolean | null
          section: string
          sort_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          section: string
          sort_order?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          section?: string
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      help_feedback: {
        Row: {
          article_id: string
          created_at: string | null
          feedback_text: string | null
          helpful: boolean
          id: string
          user_id: string | null
        }
        Insert: {
          article_id: string
          created_at?: string | null
          feedback_text?: string | null
          helpful: boolean
          id?: string
          user_id?: string | null
        }
        Update: {
          article_id?: string
          created_at?: string | null
          feedback_text?: string | null
          helpful?: boolean
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "help_feedback_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      house_bankroll_config: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: number
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      house_rewards_liability: {
        Row: {
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          fulfillment_type: string
          id: string
          notes: string | null
          partner: string
          redemption_id: string
          reward_id: string
          status: string
          token_cost: number
          updated_at: string
          usd_estimated_cost: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfillment_type?: string
          id?: string
          notes?: string | null
          partner: string
          redemption_id: string
          reward_id: string
          status?: string
          token_cost: number
          updated_at?: string
          usd_estimated_cost?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfillment_type?: string
          id?: string
          notes?: string | null
          partner?: string
          redemption_id?: string
          reward_id?: string
          status?: string
          token_cost?: number
          updated_at?: string
          usd_estimated_cost?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_rewards_liability_redemption_id_fkey"
            columns: ["redemption_id"]
            isOneToOne: false
            referencedRelation: "redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_rewards_liability_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      market_entries: {
        Row: {
          athlete_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          market_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          market_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          market_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_entries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_entries_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_health_log: {
        Row: {
          calibration: Json
          created_at: string
          field_size: number | null
          floor_value: number | null
          generator_version: string | null
          id: string
          implied_sum: number | null
          market_id: string
          market_type: string
          status: string
          tournament_id: string | null
          warnings: Json
        }
        Insert: {
          calibration?: Json
          created_at?: string
          field_size?: number | null
          floor_value?: number | null
          generator_version?: string | null
          id?: string
          implied_sum?: number | null
          market_id: string
          market_type: string
          status: string
          tournament_id?: string | null
          warnings?: Json
        }
        Update: {
          calibration?: Json
          created_at?: string
          field_size?: number | null
          floor_value?: number | null
          generator_version?: string | null
          id?: string
          implied_sum?: number | null
          market_id?: string
          market_type?: string
          status?: string
          tournament_id?: string | null
          warnings?: Json
        }
        Relationships: []
      }
      market_liability: {
        Row: {
          athlete_id: string
          bet_count: number
          id: string
          liability_if_wins: number
          market_id: string
          total_potential_payout: number
          total_stake_tokens: number
          updated_at: string | null
        }
        Insert: {
          athlete_id: string
          bet_count?: number
          id?: string
          liability_if_wins?: number
          market_id: string
          total_potential_payout?: number
          total_stake_tokens?: number
          updated_at?: string | null
        }
        Update: {
          athlete_id?: string
          bet_count?: number
          id?: string
          liability_if_wins?: number
          market_id?: string
          total_potential_payout?: number
          total_stake_tokens?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_liability_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_liability_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_multiplier_overrides: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string | null
          id: string
          is_enabled: boolean
          is_protected: boolean
          manual_multiplier: number
          market_id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          is_protected?: boolean
          manual_multiplier: number
          market_id: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          is_protected?: boolean
          manual_multiplier?: number
          market_id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_multiplier_overrides_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_multiplier_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_multiplier_overrides_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_odds: {
        Row: {
          adjusted_probability: number | null
          athlete_id: string
          athlete_rank: number | null
          base_decimal_odds: number
          base_probability: number
          blended_probability: number | null
          calibration_iterations: number | null
          clipped_count: number | null
          dynamic_max_used: number | null
          final_decimal_odds: number
          generated_at: string | null
          id: string
          is_frozen: boolean | null
          manual_multiplier: number | null
          market_id: string
          mc_probability: number | null
          model_version: string | null
          normalized_probability: number | null
          overround: number | null
          power_score: number | null
          prior_probability: number | null
          raw_probability: number | null
          scaling_factor: number | null
          sims: number | null
          sims_run: number | null
          strength_score: number | null
          target_implied_sum: number | null
          tau: number | null
          temperature_used: number | null
          token_price: number | null
        }
        Insert: {
          adjusted_probability?: number | null
          athlete_id: string
          athlete_rank?: number | null
          base_decimal_odds: number
          base_probability: number
          blended_probability?: number | null
          calibration_iterations?: number | null
          clipped_count?: number | null
          dynamic_max_used?: number | null
          final_decimal_odds: number
          generated_at?: string | null
          id?: string
          is_frozen?: boolean | null
          manual_multiplier?: number | null
          market_id: string
          mc_probability?: number | null
          model_version?: string | null
          normalized_probability?: number | null
          overround?: number | null
          power_score?: number | null
          prior_probability?: number | null
          raw_probability?: number | null
          scaling_factor?: number | null
          sims?: number | null
          sims_run?: number | null
          strength_score?: number | null
          target_implied_sum?: number | null
          tau?: number | null
          temperature_used?: number | null
          token_price?: number | null
        }
        Update: {
          adjusted_probability?: number | null
          athlete_id?: string
          athlete_rank?: number | null
          base_decimal_odds?: number
          base_probability?: number
          blended_probability?: number | null
          calibration_iterations?: number | null
          clipped_count?: number | null
          dynamic_max_used?: number | null
          final_decimal_odds?: number
          generated_at?: string | null
          id?: string
          is_frozen?: boolean | null
          manual_multiplier?: number | null
          market_id?: string
          mc_probability?: number | null
          model_version?: string | null
          normalized_probability?: number | null
          overround?: number | null
          power_score?: number | null
          prior_probability?: number | null
          raw_probability?: number | null
          scaling_factor?: number | null
          sims?: number | null
          sims_run?: number | null
          strength_score?: number | null
          target_implied_sum?: number | null
          tau?: number | null
          temperature_used?: number | null
          token_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_odds_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_odds_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_podium_ordering_overrides: {
        Row: {
          created_at: string
          first_athlete: string
          id: string
          is_enabled: boolean
          is_protected: boolean
          manual_multiplier: number
          market_id: string
          reason: string | null
          second_athlete: string
          third_athlete: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_athlete: string
          id?: string
          is_enabled?: boolean
          is_protected?: boolean
          manual_multiplier: number
          market_id: string
          reason?: string | null
          second_athlete: string
          third_athlete: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_athlete?: string
          id?: string
          is_enabled?: boolean
          is_protected?: boolean
          manual_multiplier?: number
          market_id?: string
          reason?: string | null
          second_athlete?: string
          third_athlete?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_podium_ordering_overrides_first_athlete_fkey"
            columns: ["first_athlete"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_podium_ordering_overrides_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_podium_ordering_overrides_second_athlete_fkey"
            columns: ["second_athlete"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_podium_ordering_overrides_third_athlete_fkey"
            columns: ["third_athlete"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      market_probability_overrides: {
        Row: {
          athlete_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_cascaded: boolean
          is_enabled: boolean | null
          manual_probability: number
          market_id: string
          reason: string | null
          updated_at: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_cascaded?: boolean
          is_enabled?: boolean | null
          manual_probability: number
          market_id: string
          reason?: string | null
          updated_at?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_cascaded?: boolean
          is_enabled?: boolean | null
          manual_probability?: number
          market_id?: string
          reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_probability_overrides_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_probability_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_probability_overrides_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_results: {
        Row: {
          athlete_id: string
          created_at: string | null
          final_rank: number
          id: string
          market_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          final_rank: number
          id?: string
          market_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          final_rank?: number
          id?: string
          market_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_results_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          category: string
          created_at: string
          discipline: string
          expected_profit: number | null
          id: string
          is_published: boolean
          last_safe_mode_check: string | null
          locked_at: string | null
          loss_probability: number | null
          market_type: string
          multipliers_generated_at: string | null
          name: string
          odds_validation_error: string | null
          odds_validation_status: string | null
          profit_p05: number | null
          published_at: string | null
          safe_mode_status: string | null
          tournament_id: string
          updated_at: string
          validation_error: string | null
          validation_status: string | null
        }
        Insert: {
          category: string
          created_at?: string
          discipline: string
          expected_profit?: number | null
          id?: string
          is_published?: boolean
          last_safe_mode_check?: string | null
          locked_at?: string | null
          loss_probability?: number | null
          market_type: string
          multipliers_generated_at?: string | null
          name: string
          odds_validation_error?: string | null
          odds_validation_status?: string | null
          profit_p05?: number | null
          published_at?: string | null
          safe_mode_status?: string | null
          tournament_id: string
          updated_at?: string
          validation_error?: string | null
          validation_status?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          discipline?: string
          expected_profit?: number | null
          id?: string
          is_published?: boolean
          last_safe_mode_check?: string | null
          locked_at?: string | null
          loss_probability?: number | null
          market_type?: string
          multipliers_generated_at?: string | null
          name?: string
          odds_validation_error?: string | null
          odds_validation_status?: string | null
          profit_p05?: number | null
          published_at?: string | null
          safe_mode_status?: string | null
          tournament_id?: string
          updated_at?: string
          validation_error?: string | null
          validation_status?: string | null
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
      notification_jobs: {
        Row: {
          created_at: string
          id: string
          market_id: string | null
          metadata: Json | null
          scheduled_for: string
          status: string
          tournament_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id?: string | null
          metadata?: Json | null
          scheduled_for: string
          status?: string
          tournament_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string | null
          metadata?: Json | null
          scheduled_for?: string
          status?: string
          tournament_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_jobs_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          metadata: Json | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          metadata?: Json | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      odds_generation_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          market_id: string
          result: Json | null
          scheduled_for: string
          started_at: string | null
          status: string
          triggered_by: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          market_id: string
          result?: Json | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
          triggered_by: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          market_id?: string
          result?: Json | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "odds_generation_jobs_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      parlay_markets: {
        Row: {
          combined_multiplier: number
          created_at: string
          final_multiplier: number
          house_factor: number
          id: string
          implied_probability: number | null
          leg_count: number
          legs: Json
          status: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          combined_multiplier: number
          created_at?: string
          final_multiplier: number
          house_factor?: number
          id?: string
          implied_probability?: number | null
          leg_count?: number
          legs: Json
          status?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          combined_multiplier?: number
          created_at?: string
          final_multiplier?: number
          house_factor?: number
          id?: string
          implied_probability?: number | null
          leg_count?: number
          legs?: Json
          status?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parlay_markets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_limits: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Relationships: []
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
          bet_slip_id: string | null
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
          settlement_metadata: Json | null
          settlement_run_id: string | null
          staked_tokens: number
          status: string
          tournament_name: string
          user_id: string
        }
        Insert: {
          athlete_name: string
          bet_slip_id?: string | null
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
          settlement_metadata?: Json | null
          settlement_run_id?: string | null
          staked_tokens: number
          status?: string
          tournament_name: string
          user_id: string
        }
        Update: {
          athlete_name?: string
          bet_slip_id?: string | null
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
          settlement_metadata?: Json | null
          settlement_run_id?: string | null
          staked_tokens?: number
          status?: string
          tournament_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_bet_slip_id_fkey"
            columns: ["bet_slip_id"]
            isOneToOne: false
            referencedRelation: "bet_slips"
            referencedColumns: ["id"]
          },
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
          age_confirmed: boolean | null
          age_confirmed_at: string | null
          avatar_url: string | null
          country: string | null
          created_at: string
          email: string
          first_purchase_at: string | null
          id: string
          lifetime_deposited: number | null
          lifetime_losses: number | null
          lifetime_winnings: number | null
          notification_preferences: Json | null
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          privacy_version: string | null
          referred_by_code_id: string | null
          tos_accepted: boolean | null
          tos_accepted_at: string | null
          tos_version: string | null
          tutorial_completed: boolean | null
          tutorial_completed_at: string | null
          updated_at: string
          username: string
        }
        Insert: {
          age_confirmed?: boolean | null
          age_confirmed_at?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          email: string
          first_purchase_at?: string | null
          id: string
          lifetime_deposited?: number | null
          lifetime_losses?: number | null
          lifetime_winnings?: number | null
          notification_preferences?: Json | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          privacy_version?: string | null
          referred_by_code_id?: string | null
          tos_accepted?: boolean | null
          tos_accepted_at?: string | null
          tos_version?: string | null
          tutorial_completed?: boolean | null
          tutorial_completed_at?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          age_confirmed?: boolean | null
          age_confirmed_at?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          email?: string
          first_purchase_at?: string | null
          id?: string
          lifetime_deposited?: number | null
          lifetime_losses?: number | null
          lifetime_winnings?: number | null
          notification_preferences?: Json | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          privacy_version?: string | null
          referred_by_code_id?: string | null
          tos_accepted?: boolean | null
          tos_accepted_at?: string | null
          tos_version?: string | null
          tutorial_completed?: boolean | null
          tutorial_completed_at?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_code_id_fkey"
            columns: ["referred_by_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_adjustments: {
        Row: {
          actual_position: number | null
          adjustment_delta: number
          adjustment_reason: string | null
          athlete_id: string
          base_strength_before: number
          created_at: string | null
          discipline: string
          field_size: number | null
          form_boost_before: number
          id: string
          made_finals: boolean | null
          override_rating: number | null
          override_was_accurate: boolean | null
          predicted_rating: number | null
          rating_after: number
          rating_before: number
          tournament_id: string
        }
        Insert: {
          actual_position?: number | null
          adjustment_delta: number
          adjustment_reason?: string | null
          athlete_id: string
          base_strength_before: number
          created_at?: string | null
          discipline: string
          field_size?: number | null
          form_boost_before: number
          id?: string
          made_finals?: boolean | null
          override_rating?: number | null
          override_was_accurate?: boolean | null
          predicted_rating?: number | null
          rating_after: number
          rating_before: number
          tournament_id: string
        }
        Update: {
          actual_position?: number | null
          adjustment_delta?: number
          adjustment_reason?: string | null
          athlete_id?: string
          base_strength_before?: number
          created_at?: string | null
          discipline?: string
          field_size?: number | null
          form_boost_before?: number
          id?: string
          made_finals?: boolean | null
          override_rating?: number | null
          override_was_accurate?: boolean | null
          predicted_rating?: number | null
          rating_after?: number
          rating_before?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_adjustments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_adjustments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_history: {
        Row: {
          actual_score: number | null
          athlete_id: string
          category: string
          created_at: string | null
          delta: number
          discipline: string
          expected_score: number | null
          id: string
          is_major: boolean | null
          k_factor: number | null
          market_id: string | null
          new_rating: number
          old_rating: number
          tournament_id: string | null
        }
        Insert: {
          actual_score?: number | null
          athlete_id: string
          category: string
          created_at?: string | null
          delta: number
          discipline: string
          expected_score?: number | null
          id?: string
          is_major?: boolean | null
          k_factor?: number | null
          market_id?: string | null
          new_rating: number
          old_rating: number
          tournament_id?: string | null
        }
        Update: {
          actual_score?: number | null
          athlete_id?: string
          category?: string
          created_at?: string | null
          delta?: number
          discipline?: string
          expected_score?: number | null
          id?: string
          is_major?: boolean | null
          k_factor?: number | null
          market_id?: string | null
          new_rating?: number
          old_rating?: number
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rating_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      redemptions: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          carrier: string | null
          created_at: string
          estimated_arrival_date: string | null
          fulfillment_status: string
          gift_card_email: string | null
          glove_size: string | null
          id: string
          order_reference: string | null
          reward_id: string
          shipping_address_line1: string | null
          shipping_address_line2: string | null
          shipping_city: string | null
          shipping_name: string | null
          shipping_phone: string | null
          shipping_state: string | null
          shipping_zip: string | null
          shopify_gift_card_id: string | null
          shopify_order_id: string | null
          shopify_order_url: string | null
          status: string
          supplier: string | null
          tokens_spent: number
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          created_at?: string
          estimated_arrival_date?: string | null
          fulfillment_status?: string
          gift_card_email?: string | null
          glove_size?: string | null
          id?: string
          order_reference?: string | null
          reward_id: string
          shipping_address_line1?: string | null
          shipping_address_line2?: string | null
          shipping_city?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          shopify_gift_card_id?: string | null
          shopify_order_id?: string | null
          shopify_order_url?: string | null
          status?: string
          supplier?: string | null
          tokens_spent: number
          tracking_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          created_at?: string
          estimated_arrival_date?: string | null
          fulfillment_status?: string
          gift_card_email?: string | null
          glove_size?: string | null
          id?: string
          order_reference?: string | null
          reward_id?: string
          shipping_address_line1?: string | null
          shipping_address_line2?: string | null
          shipping_city?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          shopify_gift_card_id?: string | null
          shopify_order_id?: string | null
          shopify_order_url?: string | null
          status?: string
          supplier?: string | null
          tokens_spent?: number
          tracking_number?: string | null
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
      referral_codes: {
        Row: {
          bonus_multiplier: number
          code: string
          created_at: string
          created_by_admin: boolean
          elite_bonus_pct: number | null
          end_at: string | null
          id: string
          is_active: boolean
          max_uses_total: number | null
          notes: string | null
          owner_user_id: string | null
          pro_bonus_pct: number | null
          referrer_reward_pct: number
          reward_type: string
          standard_bonus_pct: number | null
          start_at: string | null
          starter_bonus_pct: number | null
          type: string
          updated_at: string
          uses_count: number
        }
        Insert: {
          bonus_multiplier?: number
          code: string
          created_at?: string
          created_by_admin?: boolean
          elite_bonus_pct?: number | null
          end_at?: string | null
          id?: string
          is_active?: boolean
          max_uses_total?: number | null
          notes?: string | null
          owner_user_id?: string | null
          pro_bonus_pct?: number | null
          referrer_reward_pct?: number
          reward_type?: string
          standard_bonus_pct?: number | null
          start_at?: string | null
          starter_bonus_pct?: number | null
          type?: string
          updated_at?: string
          uses_count?: number
        }
        Update: {
          bonus_multiplier?: number
          code?: string
          created_at?: string
          created_by_admin?: boolean
          elite_bonus_pct?: number | null
          end_at?: string | null
          id?: string
          is_active?: boolean
          max_uses_total?: number | null
          notes?: string | null
          owner_user_id?: string | null
          pro_bonus_pct?: number | null
          referrer_reward_pct?: number
          reward_type?: string
          standard_bonus_pct?: number | null
          start_at?: string | null
          starter_bonus_pct?: number | null
          type?: string
          updated_at?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_redemptions: {
        Row: {
          base_discount_pct: number | null
          bonus_tokens_awarded: number
          commission_rate_used: number | null
          created_at: string
          effective_discount_pct: number | null
          id: string
          pack_name: string | null
          purchase_amount_tokens: number
          purchase_amount_usd: number
          purchase_id: string
          referral_code_id: string
          referral_discount_pct: number | null
          referred_user_id: string
          referrer_paid_at: string | null
          referrer_reward_type: string
          referrer_reward_value: number
          referrer_user_id: string | null
        }
        Insert: {
          base_discount_pct?: number | null
          bonus_tokens_awarded: number
          commission_rate_used?: number | null
          created_at?: string
          effective_discount_pct?: number | null
          id?: string
          pack_name?: string | null
          purchase_amount_tokens: number
          purchase_amount_usd: number
          purchase_id: string
          referral_code_id: string
          referral_discount_pct?: number | null
          referred_user_id: string
          referrer_paid_at?: string | null
          referrer_reward_type: string
          referrer_reward_value: number
          referrer_user_id?: string | null
        }
        Update: {
          base_discount_pct?: number | null
          bonus_tokens_awarded?: number
          commission_rate_used?: number | null
          created_at?: string
          effective_discount_pct?: number | null
          id?: string
          pack_name?: string | null
          purchase_amount_tokens?: number
          purchase_amount_usd?: number
          purchase_id?: string
          referral_code_id?: string
          referral_discount_pct?: number | null
          referred_user_id?: string
          referrer_paid_at?: string | null
          referrer_reward_type?: string
          referrer_reward_value?: number
          referrer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_redemptions_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_redemptions_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_redemptions_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          fulfillment_overhead_usd: number | null
          fulfillment_type: string | null
          id: string
          image_url: string | null
          max_per_user: number | null
          max_total: number | null
          name: string
          partner: string
          redemption_frequency_weight: number | null
          required_tokens: number
          sort_order: number
          tier: string | null
          updated_at: string
          usd_cost: number | null
        }
        Insert: {
          available?: boolean
          category: string
          created_at?: string
          description: string
          fulfillment_overhead_usd?: number | null
          fulfillment_type?: string | null
          id?: string
          image_url?: string | null
          max_per_user?: number | null
          max_total?: number | null
          name: string
          partner: string
          redemption_frequency_weight?: number | null
          required_tokens: number
          sort_order?: number
          tier?: string | null
          updated_at?: string
          usd_cost?: number | null
        }
        Update: {
          available?: boolean
          category?: string
          created_at?: string
          description?: string
          fulfillment_overhead_usd?: number | null
          fulfillment_type?: string | null
          id?: string
          image_url?: string | null
          max_per_user?: number | null
          max_total?: number | null
          name?: string
          partner?: string
          redemption_frequency_weight?: number | null
          required_tokens?: number
          sort_order?: number
          tier?: string | null
          updated_at?: string
          usd_cost?: number | null
        }
        Relationships: []
      }
      risk_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          id: string
          market_id: string | null
          message: string
          metadata: Json
          severity: string
          tournament_id: string | null
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          id?: string
          market_id?: string | null
          message: string
          metadata?: Json
          severity?: string
          tournament_id?: string | null
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          market_id?: string | null
          message?: string
          metadata?: Json
          severity?: string
          tournament_id?: string | null
        }
        Relationships: []
      }
      risk_config: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      safe_mode_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error: string | null
          id: string
          market_id: string
          scheduled_for: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          market_id: string
          scheduled_for: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          market_id?: string
          scheduled_for?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safe_mode_jobs_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: true
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
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
      shadow_prediction_legs: {
        Row: {
          actual_decimal_odds: number | null
          actual_status: string | null
          bet_slip_id: string
          created_at: string
          id: string
          notes: string | null
          prediction_id: string
          shadow_capped: boolean | null
          shadow_decimal_odds: number | null
          shadow_run_id: string
          shadow_status: string | null
        }
        Insert: {
          actual_decimal_odds?: number | null
          actual_status?: string | null
          bet_slip_id: string
          created_at?: string
          id?: string
          notes?: string | null
          prediction_id: string
          shadow_capped?: boolean | null
          shadow_decimal_odds?: number | null
          shadow_run_id: string
          shadow_status?: string | null
        }
        Update: {
          actual_decimal_odds?: number | null
          actual_status?: string | null
          bet_slip_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          prediction_id?: string
          shadow_capped?: boolean | null
          shadow_decimal_odds?: number | null
          shadow_run_id?: string
          shadow_status?: string | null
        }
        Relationships: []
      }
      shadow_settlements: {
        Row: {
          actual_payout_tokens: number | null
          actual_status: string | null
          bet_slip_id: string
          created_at: string
          delta_tokens: number | null
          id: string
          notes: string | null
          shadow_payout_tokens: number | null
          shadow_run_id: string
          shadow_status: string | null
          tournament_id: string
          user_id: string
        }
        Insert: {
          actual_payout_tokens?: number | null
          actual_status?: string | null
          bet_slip_id: string
          created_at?: string
          delta_tokens?: number | null
          id?: string
          notes?: string | null
          shadow_payout_tokens?: number | null
          shadow_run_id: string
          shadow_status?: string | null
          tournament_id: string
          user_id: string
        }
        Update: {
          actual_payout_tokens?: number | null
          actual_status?: string | null
          bet_slip_id?: string
          created_at?: string
          delta_tokens?: number | null
          id?: string
          notes?: string | null
          shadow_payout_tokens?: number | null
          shadow_run_id?: string
          shadow_status?: string | null
          tournament_id?: string
          user_id?: string
        }
        Relationships: []
      }
      system_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      token_transactions: {
        Row: {
          affects_wallet: boolean
          amount: number
          balance_after: number
          counterparty: string | null
          created_at: string
          description: string
          fantasy_entry_id: string | null
          id: string
          metadata: Json | null
          reference_id: string | null
          reference_type: string | null
          settlement_batch_id: string | null
          settlement_run_id: string | null
          source_id: string | null
          source_type: string | null
          tournament_id: string | null
          transaction_status: string | null
          type: string
          user_id: string
        }
        Insert: {
          affects_wallet?: boolean
          amount: number
          balance_after: number
          counterparty?: string | null
          created_at?: string
          description: string
          fantasy_entry_id?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          settlement_batch_id?: string | null
          settlement_run_id?: string | null
          source_id?: string | null
          source_type?: string | null
          tournament_id?: string | null
          transaction_status?: string | null
          type: string
          user_id: string
        }
        Update: {
          affects_wallet?: boolean
          amount?: number
          balance_after?: number
          counterparty?: string | null
          created_at?: string
          description?: string
          fantasy_entry_id?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          settlement_batch_id?: string | null
          settlement_run_id?: string | null
          source_id?: string | null
          source_type?: string | null
          tournament_id?: string | null
          transaction_status?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_transactions_fantasy_entry_id_fkey"
            columns: ["fantasy_entry_id"]
            isOneToOne: false
            referencedRelation: "fantasy_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_transactions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
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
      tournament_entries: {
        Row: {
          athlete_id: string
          created_at: string | null
          custom_odds: number | null
          discipline: string
          discipline_rank: number | null
          id: string
          override_rating: number | null
          rating_0_100: number | null
          seed_rank: number | null
          tournament_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          custom_odds?: number | null
          discipline: string
          discipline_rank?: number | null
          id?: string
          override_rating?: number | null
          rating_0_100?: number | null
          seed_rank?: number | null
          tournament_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          custom_odds?: number | null
          discipline?: string
          discipline_rank?: number | null
          id?: string
          override_rating?: number | null
          rating_0_100?: number | null
          seed_rank?: number | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_entries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_entries_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_results: {
        Row: {
          advanced_to_next_round: boolean | null
          athlete_id: string
          buoys: number | null
          created_at: string | null
          discipline: string
          final_overall_rank: number | null
          gender: string
          id: string
          jump_distance_m: number | null
          line_length_m: number | null
          made_finals: boolean | null
          missed_first_pass: boolean | null
          missed_gate: boolean | null
          no_score: boolean | null
          raw_score: number | null
          round_rank: number | null
          round_type: string
          score_display: string | null
          stood_both_passes: boolean | null
          tie_break_score: string | null
          tournament_id: string
          trick_points: number | null
          updated_at: string | null
        }
        Insert: {
          advanced_to_next_round?: boolean | null
          athlete_id: string
          buoys?: number | null
          created_at?: string | null
          discipline: string
          final_overall_rank?: number | null
          gender: string
          id?: string
          jump_distance_m?: number | null
          line_length_m?: number | null
          made_finals?: boolean | null
          missed_first_pass?: boolean | null
          missed_gate?: boolean | null
          no_score?: boolean | null
          raw_score?: number | null
          round_rank?: number | null
          round_type: string
          score_display?: string | null
          stood_both_passes?: boolean | null
          tie_break_score?: string | null
          tournament_id: string
          trick_points?: number | null
          updated_at?: string | null
        }
        Update: {
          advanced_to_next_round?: boolean | null
          athlete_id?: string
          buoys?: number | null
          created_at?: string | null
          discipline?: string
          final_overall_rank?: number | null
          gender?: string
          id?: string
          jump_distance_m?: number | null
          line_length_m?: number | null
          made_finals?: boolean | null
          missed_first_pass?: boolean | null
          missed_gate?: boolean | null
          no_score?: boolean | null
          raw_score?: number | null
          round_rank?: number | null
          round_type?: string
          score_display?: string | null
          stood_both_passes?: boolean | null
          tie_break_score?: string | null
          tournament_id?: string
          trick_points?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_results_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          allow_bet_modification_until: string | null
          betting_open_time: string | null
          created_at: string
          current_handle_tokens: number
          disciplines: string[]
          end_date: string | null
          end_datetime: string | null
          handle_warning_threshold: number
          has_final: boolean | null
          has_qualifying: boolean | null
          has_semifinal: boolean | null
          id: string
          location: string
          max_handle_tokens: number | null
          name: string
          notes: string | null
          settled_at: string | null
          start_date: string | null
          start_datetime: string | null
          status: string
          updated_at: string
          year: number | null
        }
        Insert: {
          allow_bet_modification_until?: string | null
          betting_open_time?: string | null
          created_at?: string
          current_handle_tokens?: number
          disciplines?: string[]
          end_date?: string | null
          end_datetime?: string | null
          handle_warning_threshold?: number
          has_final?: boolean | null
          has_qualifying?: boolean | null
          has_semifinal?: boolean | null
          id?: string
          location: string
          max_handle_tokens?: number | null
          name: string
          notes?: string | null
          settled_at?: string | null
          start_date?: string | null
          start_datetime?: string | null
          status?: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          allow_bet_modification_until?: string | null
          betting_open_time?: string | null
          created_at?: string
          current_handle_tokens?: number
          disciplines?: string[]
          end_date?: string | null
          end_datetime?: string | null
          handle_warning_threshold?: number
          has_final?: boolean | null
          has_qualifying?: boolean | null
          has_semifinal?: boolean | null
          id?: string
          location?: string
          max_handle_tokens?: number | null
          name?: string
          notes?: string | null
          settled_at?: string | null
          start_date?: string | null
          start_datetime?: string | null
          status?: string
          updated_at?: string
          year?: number | null
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
      house_bankroll_summary: {
        Row: {
          available_bankroll_usd: number | null
          base_bankroll_usd: number | null
          fees_usd: number | null
          gross_deposits_usd: number | null
          last_synced_at: string | null
          max_single_liability_tokens: number | null
          max_single_liability_usd: number | null
          net_deposits_usd: number | null
          refunds_usd: number | null
          reserve_pct: number | null
          reserve_usd: number | null
          solvency_status: string | null
          token_value_usd: number | null
          total_handle_tokens: number | null
          total_handle_usd: number | null
          total_liability_tokens: number | null
          total_liability_usd: number | null
          withdrawals_usd: number | null
          worst_case_loss_usd: number | null
        }
        Relationships: []
      }
      leaderboard_season_2026: {
        Row: {
          accuracy_pct: number | null
          avatar_url: string | null
          net_pnl: number | null
          rank: number | null
          total_predictions: number | null
          total_staked: number | null
          total_won: number | null
          user_id: string | null
          username: string | null
          win_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bet_slips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_odds_audit: {
        Row: {
          athlete_name: string | null
          calibration_iterations: number | null
          category: string | null
          discipline: string | null
          field_rank: number | null
          generated_at: string | null
          id: string | null
          implied_contrib: number | null
          market_id: string | null
          market_name: string | null
          market_type: string | null
          multiplier: number | null
          probability: number | null
          rating: number | null
          strength_score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_odds_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_odds_audit_v: {
        Row: {
          athlete_id: string | null
          athlete_name: string | null
          calibration_iterations: number | null
          category: string | null
          clipped_count: number | null
          discipline: string | null
          dynamic_max_used: number | null
          field_rank: number | null
          generated_at: string | null
          implied_contrib: number | null
          market_id: string | null
          market_name: string | null
          market_type: string | null
          model_version: string | null
          multiplier: number | null
          odds_id: string | null
          probability: number | null
          strength_score: number | null
          temperature_used: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_odds_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_odds_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      v_wallet_ledger: {
        Row: {
          affects_wallet: boolean | null
          amount: number | null
          balance_after: number | null
          counterparty: string | null
          created_at: string | null
          description: string | null
          fantasy_entry_id: string | null
          id: string | null
          metadata: Json | null
          reference_id: string | null
          reference_type: string | null
          settlement_batch_id: string | null
          settlement_run_id: string | null
          source_id: string | null
          source_type: string | null
          tournament_id: string | null
          transaction_status: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          affects_wallet?: boolean | null
          amount?: number | null
          balance_after?: number | null
          counterparty?: string | null
          created_at?: string | null
          description?: string | null
          fantasy_entry_id?: string | null
          id?: string | null
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          settlement_batch_id?: string | null
          settlement_run_id?: string | null
          source_id?: string | null
          source_type?: string | null
          tournament_id?: string | null
          transaction_status?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          affects_wallet?: boolean | null
          amount?: number | null
          balance_after?: number | null
          counterparty?: string | null
          created_at?: string | null
          description?: string | null
          fantasy_entry_id?: string | null
          id?: string | null
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          settlement_batch_id?: string | null
          settlement_run_id?: string | null
          source_id?: string | null
          source_type?: string | null
          tournament_id?: string | null
          transaction_status?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "token_transactions_fantasy_entry_id_fkey"
            columns: ["fantasy_entry_id"]
            isOneToOne: false
            referencedRelation: "fantasy_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_transactions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      athlete_cap_pct: { Args: { p_multiplier: number }; Returns: number }
      check_athlete_capacity: {
        Args: {
          p_added_tokens?: number
          p_athlete_id: string
          p_market_id: string
        }
        Returns: Json
      }
      compute_worst_case_liability: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      create_redemption: {
        Args: {
          p_gift_card_email?: string
          p_glove_size?: string
          p_reward_id: string
          p_shipping_address_line1?: string
          p_shipping_address_line2?: string
          p_shipping_city?: string
          p_shipping_name?: string
          p_shipping_phone?: string
          p_shipping_state?: string
          p_shipping_zip?: string
        }
        Returns: string
      }
      deduct_tokens: {
        Args: { amount_param: number; user_id_param: string }
        Returns: {
          new_balance: number
          new_earned_tokens: number
          new_purchased_tokens: number
          success: boolean
        }[]
      }
      emit_event: {
        Args: { p_event_type: string; p_payload?: Json; p_user_id: string }
        Returns: string
      }
      get_leaderboard_top: {
        Args: { p_limit?: number }
        Returns: {
          accuracy_pct: number
          avatar_url: string
          net_pnl: number
          rank: number
          total_predictions: number
          total_staked: number
          total_won: number
          user_id: string
          username: string
          win_count: number
        }[]
      }
      get_user_leaderboard_position: {
        Args: { p_user_id: string }
        Returns: {
          accuracy_pct: number
          avatar_url: string
          net_pnl: number
          rank: number
          total_predictions: number
          username: string
        }[]
      }
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
      is_pot_public: { Args: { _pot_id: string }; Returns: boolean }
      notify_admins_redemption_new: {
        Args: {
          p_redemption_id: string
          p_reward_name: string
          p_tokens: number
        }
        Returns: undefined
      }
      populate_highest_score_results: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      rebuild_market_liability: { Args: never; Returns: undefined }
      refund_redemption: {
        Args: { p_reason: string; p_redemption_id: string }
        Returns: Json
      }
      resolve_highest_score_winner: {
        Args: {
          p_discipline: string
          p_gender: string
          p_tournament_id: string
        }
        Returns: string
      }
      reverse_settlement: {
        Args: {
          p_actor_id?: string
          p_reason?: string
          p_run_id?: string
          p_slip_id?: string
        }
        Returns: {
          amount: number
          compensating_tx_id: string
          original_tx_id: string
          reversed_slip_id: string
        }[]
      }
      user_has_accepted_invite: {
        Args: { _pot_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_fantasy_entry: {
        Args: { _pot_id: string; _user_id: string }
        Returns: boolean
      }
      validate_referral_code: { Args: { p_code: string }; Returns: boolean }
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
