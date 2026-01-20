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
          team_name: string | null
          total_points: number
          total_team_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pot_id: string
          rank?: number | null
          team_name?: string | null
          total_points?: number
          total_team_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pot_id?: string
          rank?: number | null
          team_name?: string | null
          total_points?: number
          total_team_value?: number
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
      market_odds: {
        Row: {
          adjusted_probability: number | null
          athlete_id: string
          athlete_rank: number | null
          base_decimal_odds: number
          base_probability: number
          blended_probability: number | null
          calibration_iterations: number | null
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
          last_safe_mode_check: string | null
          locked_at: string | null
          loss_probability: number | null
          market_type: string
          name: string
          odds_validation_error: string | null
          odds_validation_status: string | null
          profit_p05: number | null
          safe_mode_status: string | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          discipline: string
          expected_profit?: number | null
          id?: string
          last_safe_mode_check?: string | null
          locked_at?: string | null
          loss_probability?: number | null
          market_type: string
          name: string
          odds_validation_error?: string | null
          odds_validation_status?: string | null
          profit_p05?: number | null
          safe_mode_status?: string | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          discipline?: string
          expected_profit?: number | null
          id?: string
          last_safe_mode_check?: string | null
          locked_at?: string | null
          loss_probability?: number | null
          market_type?: string
          name?: string
          odds_validation_error?: string | null
          odds_validation_status?: string | null
          profit_p05?: number | null
          safe_mode_status?: string | null
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
          id: string
          lifetime_deposited: number | null
          lifetime_losses: number | null
          lifetime_winnings: number | null
          notification_preferences: Json | null
          privacy_version: string | null
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
          id: string
          lifetime_deposited?: number | null
          lifetime_losses?: number | null
          lifetime_winnings?: number | null
          notification_preferences?: Json | null
          privacy_version?: string | null
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
          id?: string
          lifetime_deposited?: number | null
          lifetime_losses?: number | null
          lifetime_winnings?: number | null
          notification_preferences?: Json | null
          privacy_version?: string | null
          tos_accepted?: boolean | null
          tos_accepted_at?: string | null
          tos_version?: string | null
          tutorial_completed?: boolean | null
          tutorial_completed_at?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
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
          fulfillment_type: string | null
          id: string
          image_url: string | null
          max_per_user: number | null
          max_total: number | null
          name: string
          partner: string
          required_tokens: number
          updated_at: string
          usd_cost: number | null
        }
        Insert: {
          available?: boolean
          category: string
          created_at?: string
          description: string
          fulfillment_type?: string | null
          id?: string
          image_url?: string | null
          max_per_user?: number | null
          max_total?: number | null
          name: string
          partner: string
          required_tokens: number
          updated_at?: string
          usd_cost?: number | null
        }
        Update: {
          available?: boolean
          category?: string
          created_at?: string
          description?: string
          fulfillment_type?: string | null
          id?: string
          image_url?: string | null
          max_per_user?: number | null
          max_total?: number | null
          name?: string
          partner?: string
          required_tokens?: number
          updated_at?: string
          usd_cost?: number | null
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
          source_id: string | null
          source_type: string | null
          tournament_id: string | null
          transaction_status: string | null
          type: string
          user_id: string
        }
        Insert: {
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
          source_id?: string | null
          source_type?: string | null
          tournament_id?: string | null
          transaction_status?: string | null
          type: string
          user_id: string
        }
        Update: {
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
          disciplines: string[]
          end_date: string | null
          end_datetime: string | null
          has_final: boolean | null
          has_qualifying: boolean | null
          has_semifinal: boolean | null
          id: string
          location: string
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
          disciplines?: string[]
          end_date?: string | null
          end_datetime?: string | null
          has_final?: boolean | null
          has_qualifying?: boolean | null
          has_semifinal?: boolean | null
          id?: string
          location: string
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
          disciplines?: string[]
          end_date?: string | null
          end_datetime?: string | null
          has_final?: boolean | null
          has_qualifying?: boolean | null
          has_semifinal?: boolean | null
          id?: string
          location?: string
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
      [_ in never]: never
    }
    Functions: {
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
      user_has_accepted_invite: {
        Args: { _pot_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_fantasy_entry: {
        Args: { _pot_id: string; _user_id: string }
        Returns: boolean
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
