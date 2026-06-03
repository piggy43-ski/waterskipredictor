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
  /**
   * Combined podium multiplier (override-aware) resolved when the user finishes
   * picking 1-2-3 inside a parlay leg. Used as a single leg factor in the
   * parlay product so podium counts as ONE leg, not three.
   */
  podiumMultiplier?: number | null;
  /** Market id of the podium market this leg's podium was picked on. */
  podiumMarketId?: string | null;
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
