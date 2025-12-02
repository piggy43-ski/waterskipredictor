import { Discipline, Category } from './index';
import { Selection } from './index';
import { Tournament } from './index';

export interface ParlayLeg {
  discipline: Discipline;
  gender: 'men' | 'women';
  category: Category;
  winner: Selection | null;
  podium: {
    first: Selection | null;
    second: Selection | null;
    third: Selection | null;
  };
  highestScore: Selection | null;
  isComplete: boolean;
}

export interface ParlayState {
  tournament: Tournament | null;
  legs: ParlayLeg[];
  currentStep: 'context' | 'winner' | 'podium' | 'highestScore' | 'summary' | 'stake';
  currentLegIndex: number;
}

export type ParlayStep = 'context' | 'winner' | 'podium' | 'highestScore' | 'summary' | 'stake';
