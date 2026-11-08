export type GamePhase = 'waiting' | 'base_selection' | 'conquest' | 'allocation' | 'war' | 'finished';

export type QuestionType = 'choice' | 'estimation';

export type QuestionCategory =
  | 'istorie'
  | 'geografie'
  | 'biologie'
  | 'fizica'
  | 'chimie'
  | 'matematica'
  | 'literatura'
  | 'arta'
  | 'sport'
  | 'muzica'
  | 'cinematografie'
  | 'cultura_generala'
  | 'tehnologie'
  | 'informatica';

export interface Question {
  id: string;
  type: QuestionType;
  category: QuestionCategory;
  difficulty: 'usor' | 'mediu' | 'greu';
  question: string;
  options?: string[];
  correctAnswerIndex?: number;
  targetNumber?: number;
  unit?: string;
  explanation?: string;
  sourceUrl?: string;
}

export interface Territory {
  id: string;
  name: string;
  shortName: string;
  region: string;
  svgPath: string;
  labelX: number;
  labelY: number;
  points: number;
  ownerId: string | null;
  isBase: boolean;
  basePlayerName?: string;
  castleTowers?: number; // 3 intact towers initially
  defensiveBonus?: number; // +100 bonus active
  neighbors: string[];
}

export interface Player {
  id: string;
  username: string;
  avatar: string;
  frame?: string;
  title?: string;
  color: string;
  score: number;
  isHost: boolean;
  isReady: boolean;
  isAi: boolean;
  isConnected?: boolean;
  aiDifficulty?: 'incepator' | 'intermediar' | 'avansat' | 'expert';
  baseTerritoryId?: string;
  castleTowers: number; // starts at 3; eliminated when reaches 0
  defensiveBonus: number; // bonus accumulated through successful defenses
  isEliminated?: boolean;
  territoriesCount: number;
  correctAnswers: number;
  wrongAnswers: number;
  baseAttackAttemptsUsed: Record<string, number>; // targetPlayerId -> count
}

export interface ActiveQuestionState {
  question: Question;
  startTime: number;
  durationSeconds: number;
  attackerId?: string;
  defenderId?: string;
  targetTerritoryId?: string;
  phaseContext: 'conquest' | 'allocation' | 'war';
  isTiebreak?: boolean;
  playerAnswers: Record<string, { answer: number | string; submitTime: number; isCorrect?: boolean; diff?: number }>;
  resolved: boolean;
}

export interface RoundTrackerState {
  phaseTitle: string; // "Cucerire", "Departajare", "Război"
  currentRound: number;
  totalRounds: number;
  playerOrder: string[]; // player IDs
  activePlayerId: string;
}

export interface GameState {
  roomId: string;
  roomName: string;
  isPrivate: boolean;
  maxPlayers: number;
  selectedCategories?: QuestionCategory[];
  round: number;
  maxRounds: number;
  phase: GamePhase;
  players: Player[];
  activePlayerIndex: number;
  territories: Record<string, Territory>;
  currentQuestion?: ActiveQuestionState | null;
  turnTimeLimit: number; // in seconds
  turnTimerExpiresAt: number; // timestamp
  pendingTerritoryId?: string | null;
  allocationWinnerId?: string | null; // Set when an estimation winner has 15s to pick any neutral territory
  allocationPickReady?: boolean;
  conquestPickQueue?: string[];
  conquestPickerId?: string | null;
  usedQuestionIds: string[];
  unallocatedTerritoriesQueue?: string[];
  gameLog: Array<{ id: string; text: string; timestamp: number; type: 'info' | 'conquest' | 'battle' | 'elimination' }>;
  winner?: Player | null;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role?: 'user' | 'admin';
  avatar: string;
  frame?: string;
  title?: string;
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  territoriesConquered: number;
  correctAnswersTotal: number;
  highestScore: number;
  createdAt: string;
}

