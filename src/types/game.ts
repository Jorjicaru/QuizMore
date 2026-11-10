export type GamePhase =
  | 'waiting'
  | 'base_selection'
  | 'conquest'
  | 'allocation'
  | 'war'
  | 'finished';

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
  | 'informatica'
  | string;

export interface Question {
  id: string;
  category: QuestionCategory;
  difficulty: 'usor' | 'mediu' | 'greu' | string;
  type: 'choice' | 'estimation';
  question: string;
  options?: string[];
  correctAnswerIndex?: number;
  targetNumber?: number;
  unit?: string;
  explanation?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceCheckedAt?: string;
  factKey?: string;
  reviewStatus?: 'draft' | 'approved' | 'rejected' | 'disabled';
  verified?: boolean;
  isDisabled?: boolean;
  reportedCount?: number;
}

export interface Territory {
  id: string;
  name: string;
  shortName: string;
  region: string;
  svgPath: string;
  internalLinesSvg?: string;
  counties?: string[];
  labelX: number;
  labelY: number;
  points: number;
  ownerId: string | null;
  isBase: boolean;
  basePlayerName?: string;
  castleTowers?: number; // 0 to 3 for bases
  defensiveBonus?: number;
  neighbors: string[];
}

export interface Player {
  id: string;
  username: string;
  avatar: string;
  color: string;
  score: number;
  isHost: boolean;
  isReady: boolean;
  isAi: boolean;
  aiDifficulty?: 'incepator' | 'intermediar' | 'avansat' | 'expert';
  isConnected?: boolean;
  isEliminated?: boolean;
  baseTerritoryId?: string | null;
  castleTowers: number;
  defensiveBonus: number;
  attackBonusPoints?: number;
  territoriesCount: number;
  correctAnswers: number;
  wrongAnswers: number;
  baseAttackAttemptsUsed?: Record<string, number>;
}

export interface PlayerAnswerSubmission {
  answer: number | string | null;
  submitTime: number;
  isCorrect?: boolean;
  diff?: number;
  rank?: number;
  answerStatus?: 'CORRECT' | 'WRONG' | 'NO_RESPONSE';
}

export interface ActiveQuestionState {
  questionInstanceId?: string;
  question: Question;
  startTime: number;
  durationSeconds: number;
  targetTerritoryId?: string;
  attackerId: string;
  defenderId?: string;
  phaseContext: 'conquest' | 'allocation' | 'war';
  isTiebreak?: boolean;
  participantIds?: string[];
  warRoundId?: string;
  winnerIds?: string[];
  playerAnswers: Record<string, PlayerAnswerSubmission>;
  resolved: boolean;
}

export interface WarBattleAssignment {
  battleId: string;
  attackerId: string;
  defenderId: string;
  targetTerritoryId: string | null;
  status: 'selecting_target' | 'ready' | 'choice_question' | 'numeric_tiebreak' | 'resolved' | 'auto_selected' | 'skipped';
  attackerChoiceCorrect?: boolean;
  defenderChoiceCorrect?: boolean;
  attackerChoiceAnswer?: number | null;
  defenderChoiceAnswer?: number | null;
  attackerNumericAnswer?: number | null;
  defenderNumericAnswer?: number | null;
  attackerNumericDiff?: number | null;
  defenderNumericDiff?: number | null;
  attackerSubmitTime?: number | null;
  defenderSubmitTime?: number | null;
  winnerId?: string | null;
  outcome?: 'attacker_won' | 'defender_won' | 'draw_no_bonus' | 'needs_tiebreak' | 'skipped';
}

export interface WarRoundState {
  roundId: string;
  roundNumber: number;
  status: 'selecting_targets' | 'choice_question' | 'numeric_tiebreak' | 'resolving' | 'completed';
  attackerIds: string[];
  defenderIds: string[];
  byePlayerIds: string[];
  battles: WarBattleAssignment[];
  selectionDeadline: number | null;
  questionDeadline: number | null;
}

export type RoundTrackerMarkerState =
  | 'done'
  | 'active'
  | 'pending'
  | 'answered'
  | 'correct'
  | 'wrong'
  | 'no_response'
  | 'winner'
  | 'attacker'
  | 'defender'
  | 'bye'
  | 'eliminated';

export interface RoundTrackerMarkerItem {
  playerId: string;
  username: string;
  color: string;
  state: RoundTrackerMarkerState;
  label: string;
  orderIndex: number;
}

export interface RoundTrackerBattlePair {
  battleId: string;
  attacker: RoundTrackerMarkerItem;
  defender: RoundTrackerMarkerItem;
  targetTerritoryId: string | null;
  status: WarBattleAssignment['status'];
}

export interface RoundDisplayModel {
  phase: GamePhase;
  phaseLabel: string;
  subMode: 'base_selection' | 'question' | 'picking' | 'war_selecting' | 'war_question' | 'war_resolving' | 'finished';
  subModeLabel: string;
  currentRound: number;
  totalRounds: number;
  remainingSteps: number;
  items: RoundTrackerMarkerItem[];
  battlePairs: RoundTrackerBattlePair[];
  byeItems: RoundTrackerMarkerItem[];
}

export interface GameLogEntry {
  id: string;
  text: string;
  timestamp: number;
  type: 'info' | 'conquest' | 'battle' | 'elimination';
}

export interface GameState {
  roomId: string;
  roomName: string;
  isPrivate: boolean;
  maxPlayers: number;
  mapId?: string;
  mapPresetPlayerCount?: number;
  mapTerritoryCount?: number;
  mapVersion?: string;
  selectedCategories?: QuestionCategory[];
  round: number;
  maxRounds: number;
  phase: GamePhase;
  players: Player[];
  activePlayerIndex: number;
  territories: Record<string, Territory>;
  turnTimeLimit: number;
  turnTimerExpiresAt: number;
  gameLog: GameLogEntry[];
  currentQuestion: ActiveQuestionState | null;
  usedQuestionIds?: string[];
  usedFactKeys?: string[];
  categoryUsageCounts?: Record<string, number>;
  allocationNoResponseRetries?: number;
  pendingTerritoryId?: string | null;
  conquestPickQueue?: string[];
  conquestPickerId?: string | null;
  unallocatedTerritoriesQueue?: string[];
  allocationWinnerId?: string | null;
  allocationPickReady?: boolean;
  warRound?: WarRoundState | null;
  warRoleHistory?: Record<string, Array<'attacker' | 'defender' | 'bye'>>;
  winner?: Player;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  avatar: string;
  title: string;
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  territoriesConquered: number;
  correctAnswersTotal: number;
  highestScore: number;
  createdAt: string;
}
