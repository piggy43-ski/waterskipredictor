export interface TutorialStep {
  id: string;
  target: string | null; // CSS selector or null for modal
  title: string;
  content: string;
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
  route?: string;
  isModal?: boolean;
}

export const tutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to WaterSki Predictor',
    content: 'Make skill-based predictions, earn reward tokens, redeem for gear and experiences. No cash withdrawals.',
    placement: 'center',
    isModal: true,
  },
  {
    id: 'token-balance',
    target: '#token-balance',
    title: 'Your Token Balance',
    content: 'You start with 0 tokens. Buy tokens to enter predictions and earn reward tokens for gear and experiences. Tokens have no cash value.',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'buy-tokens',
    target: '#buy-tokens-btn',
    title: 'Get Tokens',
    content: 'Tap here to buy tokens. Daily limit: $250 (25,000 tokens). Use tokens to enter predictions.',
    placement: 'left',
    route: '/',
  },
  {
    id: 'nav-events',
    target: '#nav-events',
    title: 'Find Predictions',
    content: 'Pick a tournament and choose a prediction to enter.',
    placement: 'top',
    route: '/',
  },
  {
    id: 'contest-types',
    target: null,
    title: 'Prediction Types',
    content: '• Winner: pick who finishes 1st\n• Podium: pick someone to finish top 3\n• Highest Score: pick who posts the best score',
    placement: 'center',
    isModal: true,
  },
  {
    id: 'athlete-selection',
    target: null,
    title: 'Select an Athlete',
    content: 'When you open a tournament, you\'ll see the athlete list. Select an athlete to predict their performance.',
    placement: 'center',
    isModal: true,
  },
  {
    id: 'multiplier-info',
    target: null,
    title: 'Understanding Multipliers',
    content: 'The Multiplier shows your projected rewards if correct. Higher multipliers = lower probability = bigger rewards.',
    placement: 'center',
    isModal: true,
  },
  {
    id: 'entry-info',
    target: null,
    title: 'Entry Amount',
    content: 'Choose your Entry Amount when placing a prediction. Max per entry: $100 (10,000 tokens).',
    placement: 'center',
    isModal: true,
  },
  {
    id: 'nav-rewards',
    target: '#nav-rewards',
    title: 'Redeem Rewards',
    content: 'Redeem tokens for rewards like gear, lessons, or experiences. Rewards only — no cash out.',
    placement: 'top',
    route: '/',
  },
  {
    id: 'complete',
    target: null,
    title: "You're ready!",
    content: 'Start with small entries, learn the prediction types, and have fun.',
    placement: 'center',
    isModal: true,
  },
];
