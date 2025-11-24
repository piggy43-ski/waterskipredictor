export type Discipline = 'slalom' | 'trick' | 'jump';
export type Category = 'open_men' | 'open_women';
export type MarketType = 'WINNER' | 'PODIUM' | 'HEAD_TO_HEAD' | 'OVER_UNDER';
export type PredictionStatus = 'PENDING' | 'WON' | 'LOST' | 'VOID';

export interface Athlete {
  id: string;
  name: string;
  gender: 'male' | 'female';
  country: string;
  federation: string;
  disciplines: Discipline[];
  current_rank_slalom?: number;
  current_rank_trick?: number;
  current_rank_jump?: number;
  current_points_slalom?: number;
  current_points_trick?: number;
  current_points_jump?: number;
}

export interface RankingSnapshot {
  id: string;
  athlete_id: string;
  discipline: Discipline;
  category: Category;
  world_rank: number;
  best_score: number;
  week_date: string;
}

export interface Tournament {
  id: string;
  name: string;
  location: string;
  start_date: string;
  end_date: string;
  disciplines: Discipline[];
  status: 'upcoming' | 'live' | 'finished';
}

export interface Market {
  id: string;
  tournament_id: string;
  discipline: Discipline;
  category: Category;
  market_type: MarketType;
  name: string;
}

export interface Selection {
  id: string;
  market_id: string;
  athlete_id: string;
  athlete: Athlete;
  description: string;
  decimal_odds: number;
}

export interface Prediction {
  id: string;
  user_id: string;
  selection: Selection;
  staked_tokens: number;
  status: PredictionStatus;
  payout_tokens?: number;
  created_at: string;
}

export interface TokenWallet {
  user_id: string;
  balance: number;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  required_tokens: number;
  partner: string;
  category: 'coaching' | 'gear' | 'experience';
  image_url: string;
}
