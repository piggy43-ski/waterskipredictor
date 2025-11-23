import { Athlete, Tournament, Market, Selection, Prediction, Reward } from '@/types';

// Mock IWWF Athletes
export const mockAthletes: Athlete[] = [
  {
    id: '1',
    name: 'Nate Smith',
    gender: 'male',
    country: 'USA',
    federation: 'USA-WSWS',
    year_of_birth: 1996,
    disciplines: ['slalom']
  },
  {
    id: '2',
    name: 'Martin Kolman',
    gender: 'male',
    country: 'CAN',
    federation: 'WS Canada',
    year_of_birth: 1997,
    disciplines: ['slalom']
  },
  {
    id: '3',
    name: 'Joel Howley',
    gender: 'male',
    country: 'AUS',
    federation: 'AWWF',
    year_of_birth: 1994,
    disciplines: ['slalom']
  },
  {
    id: '4',
    name: 'Robert Pigozzi',
    gender: 'male',
    country: 'USA',
    federation: 'USA-WSWS',
    year_of_birth: 1993,
    disciplines: ['slalom']
  },
  {
    id: '5',
    name: 'Freddy Winter',
    gender: 'male',
    country: 'USA',
    federation: 'USA-WSWS',
    year_of_birth: 1998,
    disciplines: ['slalom']
  },
  {
    id: '6',
    name: 'Regina Jaquess',
    gender: 'female',
    country: 'USA',
    federation: 'USA-WSWS',
    year_of_birth: 1996,
    disciplines: ['slalom']
  },
  {
    id: '7',
    name: 'Whitney McClintock',
    gender: 'female',
    country: 'CAN',
    federation: 'WS Canada',
    year_of_birth: 1998,
    disciplines: ['slalom']
  },
  {
    id: '8',
    name: 'Giannina Bonnemann',
    gender: 'female',
    country: 'ARG',
    federation: 'Argentina',
    year_of_birth: 1999,
    disciplines: ['slalom']
  }
];

// Mock Tournaments
export const mockTournaments: Tournament[] = [
  {
    id: 't1',
    name: 'Moomba Masters',
    location: 'Melbourne, Australia',
    start_date: '2025-03-08',
    end_date: '2025-03-10',
    disciplines: ['slalom', 'trick', 'jump'],
    status: 'upcoming'
  },
  {
    id: 't2',
    name: 'U.S. Masters',
    location: 'West Palm Beach, FL',
    start_date: '2025-05-23',
    end_date: '2025-05-25',
    disciplines: ['slalom', 'trick', 'jump'],
    status: 'upcoming'
  },
  {
    id: 't3',
    name: 'World Championships',
    location: 'Lake Grew, USA',
    start_date: '2025-09-10',
    end_date: '2025-09-14',
    disciplines: ['slalom', 'trick', 'jump'],
    status: 'upcoming'
  }
];

// Mock Markets
export const mockMarkets: Market[] = [
  {
    id: 'm1',
    tournament_id: 't1',
    discipline: 'slalom',
    category: 'open_men',
    market_type: 'WINNER',
    name: 'Men\'s Slalom Winner'
  },
  {
    id: 'm2',
    tournament_id: 't1',
    discipline: 'slalom',
    category: 'open_women',
    market_type: 'WINNER',
    name: 'Women\'s Slalom Winner'
  }
];

// Mock Selections (with odds based on mock IWWF rankings)
export const mockSelections: Selection[] = [
  {
    id: 's1',
    market_id: 'm1',
    athlete_id: '1',
    athlete: mockAthletes[0],
    description: 'Nate Smith to win Men\'s Slalom',
    decimal_odds: 3.50
  },
  {
    id: 's2',
    market_id: 'm1',
    athlete_id: '2',
    athlete: mockAthletes[1],
    description: 'Martin Kolman to win Men\'s Slalom',
    decimal_odds: 4.20
  },
  {
    id: 's3',
    market_id: 'm1',
    athlete_id: '3',
    athlete: mockAthletes[2],
    description: 'Joel Howley to win Men\'s Slalom',
    decimal_odds: 5.00
  },
  {
    id: 's4',
    market_id: 'm1',
    athlete_id: '4',
    athlete: mockAthletes[3],
    description: 'Robert Pigozzi to win Men\'s Slalom',
    decimal_odds: 6.50
  },
  {
    id: 's5',
    market_id: 'm1',
    athlete_id: '5',
    athlete: mockAthletes[4],
    description: 'Freddy Winter to win Men\'s Slalom',
    decimal_odds: 8.00
  },
  {
    id: 's6',
    market_id: 'm2',
    athlete_id: '6',
    athlete: mockAthletes[5],
    description: 'Regina Jaquess to win Women\'s Slalom',
    decimal_odds: 2.80
  },
  {
    id: 's7',
    market_id: 'm2',
    athlete_id: '7',
    athlete: mockAthletes[6],
    description: 'Whitney McClintock to win Women\'s Slalom',
    decimal_odds: 3.20
  },
  {
    id: 's8',
    market_id: 'm2',
    athlete_id: '8',
    athlete: mockAthletes[7],
    description: 'Giannina Bonnemann to win Women\'s Slalom',
    decimal_odds: 4.50
  }
];

// Mock User Predictions
export const mockPredictions: Prediction[] = [
  {
    id: 'p1',
    user_id: 'user1',
    selection: mockSelections[0],
    staked_tokens: 100,
    status: 'PENDING',
    created_at: '2025-03-01T10:00:00Z'
  },
  {
    id: 'p2',
    user_id: 'user1',
    selection: mockSelections[5],
    staked_tokens: 200,
    status: 'PENDING',
    created_at: '2025-03-01T11:00:00Z'
  }
];

// Mock Rewards
export const mockRewards: Reward[] = [
  {
    id: 'r1',
    name: '1-Hour Pro Coaching Session',
    description: 'One-on-one coaching with a pro athlete via video call',
    required_tokens: 5000,
    partner: 'Elite Waterski Academy',
    category: 'coaching',
    image_url: '/rewards/coaching.jpg'
  },
  {
    id: 'r2',
    name: 'Pigoski Pro Gloves',
    description: 'Premium waterski gloves signed by Robert Pigozzi',
    required_tokens: 2500,
    partner: 'Pigoski',
    category: 'gear',
    image_url: '/rewards/gloves.jpg'
  },
  {
    id: 'r3',
    name: 'VIP Moomba Masters Pass',
    description: 'All-access VIP pass to Moomba Masters including pit access',
    required_tokens: 15000,
    partner: 'Moomba Masters',
    category: 'experience',
    image_url: '/rewards/vip.jpg'
  },
  {
    id: 'r4',
    name: '8-Week Online Training Program',
    description: 'Comprehensive training program with video analysis',
    required_tokens: 8000,
    partner: 'Elite Waterski Academy',
    category: 'coaching',
    image_url: '/rewards/program.jpg'
  },
  {
    id: 'r5',
    name: 'Pro Ski Package',
    description: '$500 credit toward new skis at participating dealers',
    required_tokens: 12000,
    partner: 'Radar Skis',
    category: 'gear',
    image_url: '/rewards/skis.jpg'
  }
];

// Mock Token Wallet
export const mockTokenWallet = {
  user_id: 'user1',
  balance: 2450
};
