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
    content: 'This is your Token Balance. You use tokens to enter contests.',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'buy-tokens',
    target: '#buy-tokens-btn',
    title: 'Buy Tokens',
    content: 'Buy tokens to enter contests. Daily limit: $250 (25,000 tokens).',
    placement: 'left',
    route: '/',
  },
  {
    id: 'nav-events',
    target: '#nav-events',
    title: 'Find Contests',
    content: 'Pick a tournament and choose a contest to enter.',
    placement: 'top',
  },
  {
    id: 'contest-types',
    target: '#contest-types',
    title: 'Contest Types',
    content: '• Winner: pick who finishes 1st\n• Podium: pick someone to finish top 3\n• Highest Score: pick who posts the best score',
    placement: 'bottom',
    route: '/tournaments',
  },
  {
    id: 'athlete-list',
    target: '#athlete-list',
    title: 'Select an Athlete',
    content: 'Select an athlete. The Multiplier shows projected rewards if you\'re correct.',
    placement: 'top',
  },
  {
    id: 'multiplier-display',
    target: '#multiplier-display',
    title: 'Understanding Multipliers',
    content: 'Multiplier = projected rewards factor. Higher multipliers mean lower probability.',
    placement: 'left',
  },
  {
    id: 'entry-amount',
    target: '#entry-amount-input',
    title: 'Entry Amount',
    content: 'Choose your Entry Amount. Max per entry: $100 (10,000 tokens).',
    placement: 'top',
  },
  {
    id: 'confirm-entry',
    target: '#confirm-entry-btn',
    title: 'Review Your Entry',
    content: 'Review your entry before confirming.',
    placement: 'top',
  },
  {
    id: 'nav-rewards',
    target: '#nav-rewards',
    title: 'Redeem Rewards',
    content: 'Redeem tokens for rewards like gear, lessons, or experiences. Rewards only — no cash out.',
    placement: 'top',
  },
  {
    id: 'complete',
    target: null,
    title: "You're ready!",
    content: 'Start with small entries, learn the contest types, and have fun.',
    placement: 'center',
    isModal: true,
  },
];
