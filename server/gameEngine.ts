import {
  GameState,
  Player,
  Territory,
  Question,
  ActiveQuestionState,
  GamePhase,
  WarBattleAssignment,
  WarBattleResultSummary,
} from '../src/types/game';
import { createMapForPlayerCount, getMapMetadata } from './romaniaMapData';
import { shuffleArray } from './questionsData';
import {
  canTargetTerritory,
  canSelectBase,
  canCompleteBaseSelection,
  isAdjacentToPlayer,
  determineEstimationWinner,
  selectEligibleAllocationWinner,
  getLegalNeutralTargetsForPlayer,
  getLegalAllocationTargetsForPlayer,
  shouldContinueConquestPhase,
  calculateConquestRounds,
  buildSimultaneousWarPairings,
  buildIndividualWarTurnOrder,
  getLegalWarTargetsForAttacker,
  formatWarAttackAnnouncement,
  isShortReadableChoiceQuestion,
  isValidNumericTiebreakQuestion,
  canPlayerRegenerateTower,
  resolveAttackOriginTerritory,
  evaluateWarBattleChoiceOutcome,
  evaluateWarBattleTiebreakOutcome,
  getLegalWarTargetsForPair,
  buildConquestTurnSchedule,
  getRoundFixedTurnOrder,
  orderConquestWinnersByFixedTurnOrder,
  SCORING,
} from '../src/game/rules';
import { db } from './db';
import {
  deleteActiveGameSnapshotFromPostgres,
  isPostgresConfigured,
  saveActiveGameSnapshotsToPostgres,
} from './postgresRepo';

export const PLAYER_COLORS = [
  '#2563EB', // 1: Albastru Regal
  '#DC2626', // 2: Roșu Purpuriu
  '#059669', // 3: Verde Smarald
  '#D97706', // 4: Auriu Imperial
  '#7C3AED', // 5: Violet Voievodal
  '#0891B2', // 6: Cian Dunărean
  '#E11D48', // 7: Roz Rubin
  '#65A30D', // 8: Verde Câmpie
  '#EA580C', // 9: Portocaliu Flacără
  '#4F46E5', // 10: Indigo Carpatin
];

const BOT_NAMES = [
  'Ștefan cel Mare',
  'Mihai Viteazul',
  'Vlad Țepeș',
  'Mircea cel Bătrân',
  'Regele Decebal',
  'Iancu de Hunedoara',
  'Regina Maria',
  'Aurel Vlaicu',
  'Ana Aslan',
];

export class GameManager {
  private games: Map<string, GameState> = new Map();
  private ioCallback?: (roomId: string, event: string, data: any) => void;
  private botTimers: Map<string, NodeJS.Timeout[]> = new Map();
  private playerBotTimers: Map<string, NodeJS.Timeout> = new Map();
  private questionTimers: Map<string, NodeJS.Timeout> = new Map();
  private selectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private turnAdvanceTimers: Map<string, NodeJS.Timeout> = new Map();
  private emptyRoomCleanupTimers: Map<string, NodeJS.Timeout> = new Map();
  private emptyRoomGraceMs = 30000;

  constructor() {}

  public setEmptyRoomGraceMsForTesting(ms: number): void {
    this.emptyRoomGraceMs = Math.max(10, ms);
  }

  private clearEmptyRoomCleanupTimer(roomId: string): void {
    const t = this.emptyRoomCleanupTimers.get(roomId);
    if (t) {
      clearTimeout(t);
      this.emptyRoomCleanupTimers.delete(roomId);
    }
  }

  private closeAndCleanupRoom(roomId: string): void {
    this.clearRoomTimers(roomId);
    this.games.delete(roomId);
    if (isPostgresConfigured()) {
      void deleteActiveGameSnapshotFromPostgres(roomId);
    }
  }

  private scheduleEmptyRoomCleanup(roomId: string): void {
    this.clearEmptyRoomCleanupTimer(roomId);
    const timer = setTimeout(() => {
      this.emptyRoomCleanupTimers.delete(roomId);
      const game = this.games.get(roomId);
      if (!game) return;

      const connectedHumans = game.players.filter(
        (p) => !p.isAi && p.isConnected !== false && !p.hasLeftIntentionally
      );
      if (connectedHumans.length > 0) {
        return;
      }

      const hasAiBots = game.players.some((p) => p.isAi);
      if (game.phase === 'waiting' || game.phase === 'finished' || !hasAiBots) {
        this.closeAndCleanupRoom(roomId);
      } else {
        // Active match with AI bots: mark disconnected humans as having left so endGame cleans up the room immediately when the AI match finishes
        for (const p of game.players) {
          if (!p.isAi && p.isConnected === false) {
            p.hasLeftIntentionally = true;
          }
        }
      }
    }, this.emptyRoomGraceMs);
    timer.unref?.();
    this.emptyRoomCleanupTimers.set(roomId, timer);
  }

  private makeLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  private isBotControlled(player: Player | undefined): boolean {
    if (!player) return false;
    return Boolean(player.isAi || player.botControlled || player.isConnected === false);
  }

  private setPlayerBotTimer(roomId: string, playerId: string, timer: NodeJS.Timeout): void {
    const key = `${roomId}:${playerId}`;
    const prev = this.playerBotTimers.get(key);
    if (prev) clearTimeout(prev);
    this.playerBotTimers.set(key, timer);

    const timers = this.botTimers.get(roomId) || [];
    timers.push(timer);
    this.botTimers.set(roomId, timers);
  }

  private clearPlayerBotTimer(roomId: string, playerId: string): void {
    const key = `${roomId}:${playerId}`;
    const timer = this.playerBotTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.playerBotTimers.delete(key);
    }
  }

  private setTurnAdvanceTimer(roomId: string, timer: NodeJS.Timeout): void {
    const prev = this.turnAdvanceTimers.get(roomId);
    if (prev) clearTimeout(prev);
    this.turnAdvanceTimers.set(roomId, timer);
  }

  public setIoCallback(callback: (roomId: string, event: string, data: any) => void): void {
    this.ioCallback = callback;
  }

  public reloadQuestions(): void {
    // The question repository is read from the database on demand.
  }

  private applyMapPreset(game: GameState, playerCount: number): void {
    const clampedCount = Math.max(2, Math.min(10, Math.round(playerCount || 2)));
    const meta = getMapMetadata(clampedCount);
    game.territories = createMapForPlayerCount(clampedCount);
    game.mapId = meta.mapId;
    game.mapPresetPlayerCount = meta.playerCount;
    game.mapTerritoryCount = meta.territoryCount;
    game.mapVersion = meta.version;
  }

  private recalculatePlayerScores(game: GameState): void {
    for (const p of game.players) {
      let score = 0;
      let count = 0;
      let defBonus = 0;
      let baseTowers = p.castleTowers ?? 3;
      let baseId: string | null = null;

      for (const t of Object.values(game.territories)) {
        if (t.ownerId === p.id) {
          count++;
          score += (t.points || 0) + (t.defensiveBonus || 0);
          defBonus += t.defensiveBonus || 0;
          if (t.isBase) {
            baseTowers = t.castleTowers ?? 3;
            baseId = t.id;
          }
        }
      }

      p.territoriesCount = count;
      p.score = score + (p.attackBonusPoints || 0);
      p.defensiveBonus = defBonus;
      p.baseTerritoryId = baseId;
      if (baseId) {
        p.castleTowers = baseTowers;
      } else if (game.phase !== 'waiting' && game.phase !== 'base_selection') {
        p.castleTowers = 0;
      }
    }
  }

  /**
   * Computes the required question budget for a match given playerCount and territoryCount.
   * Ensures a match can never run out of unique choice or estimation questions.
   */
  public static calculateMatchQuestionBudget(
    playerCount: number,
    territoryCount: number,
    warRounds = 6
  ): { requiredChoice: number; requiredEstimation: number; maxAllocationRetries: number } {
    const conquestRounds = calculateConquestRounds(territoryCount, playerCount);
    const maxAllocationQuestions = Math.max(
      2,
      Math.ceil((territoryCount - playerCount) / Math.max(2, playerCount))
    );
    const maxAllocationRetries = 4;
    return {
      requiredChoice: conquestRounds + maxAllocationQuestions + warRounds + maxAllocationRetries,
      requiredEstimation: 0,
      maxAllocationRetries,
    };
  }

  public getRandomQuestion(
    game: GameState,
    type: 'choice' | 'estimation' = 'choice'
  ): Question | null {
    const selectedCategories = game.selectedCategories || [];
    const usedIds = new Set(game.usedQuestionIds || []);
    const usedFacts = new Set(game.usedFactKeys || []);
    game.categoryUsageCounts = game.categoryUsageCounts || {};

    const allAvailable = db
      .getAllQuestions()
      .filter((question) => {
        const isValidType =
          type === 'estimation'
            ? isValidNumericTiebreakQuestion(question)
            : isShortReadableChoiceQuestion(question);
        return (
          isValidType &&
          !usedIds.has(question.id) &&
          (!question.factKey || !usedFacts.has(question.factKey))
        );
      });

    // Respect selectedCategories when the host selected specific categories (fallback to allAvailable for estimation tiebreaks if category pool is empty)
    const filteredPool = allAvailable.filter(
      (question) =>
        !selectedCategories.length || selectedCategories.includes(question.category)
    );
    const pool =
      filteredPool.length > 0
        ? filteredPool
        : type === 'estimation' || !selectedCategories.length
        ? allAvailable
        : [];

    if (!pool.length) return null;

    // Mix topics randomly across questions (avoiding specialized single-category streaks)
    const lastCategory = (game as any).lastQuestionCategory as string | undefined;
    const diversePool =
      lastCategory && pool.some((q) => q.category !== lastCategory)
        ? pool.filter((q) => q.category !== lastCategory)
        : pool;

    const source = diversePool[Math.floor(Math.random() * diversePool.length)];
    (game as any).lastQuestionCategory = source.category;
    usedIds.add(source.id);
    game.usedQuestionIds = Array.from(usedIds);
    if (source.factKey) {
      usedFacts.add(source.factKey);
      game.usedFactKeys = Array.from(usedFacts);
    }
    game.categoryUsageCounts[source.category] =
      (game.categoryUsageCounts[source.category] || 0) + 1;

    const selected: Question = { ...source };
    if (source.type === 'choice' && Array.isArray(source.options)) {
      const indexed = source.options.map((value, index) => ({ value, index }));
      const shuffled = shuffleArray(indexed);
      selected.options = shuffled.map((item) => item.value);
      selected.correctAnswerIndex = shuffled.findIndex(
        (item) => item.index === source.correctAnswerIndex
      );
    }
    return selected;
  }

  /** Client snapshots never reveal correct answers or submitted values before resolution. */
  public getClientState(roomId: string): GameState | undefined {
    const original = this.games.get(roomId);
    if (!original) return undefined;
    const snapshot = JSON.parse(JSON.stringify(original)) as GameState;
    if (snapshot.currentQuestion && !snapshot.currentQuestion.resolved) {
      delete snapshot.currentQuestion.question.correctAnswerIndex;
      delete snapshot.currentQuestion.question.targetNumber;
      delete snapshot.currentQuestion.question.explanation;
      const redacted: Record<string, any> = {};
      for (const playerId of Object.keys(snapshot.currentQuestion.playerAnswers || {})) {
        redacted[playerId] = { answer: null, submitTime: null };
      }
      snapshot.currentQuestion.playerAnswers = redacted;
    }
    return snapshot;
  }

  public createRoom(options: {
    hostUser: { id: string; username: string; avatar: string };
    roomName?: string;
    isPrivate?: boolean;
    maxPlayers?: number;
    maxRounds?: number;
    initialBotsCount?: number;
    botDifficulty?: 'incepator' | 'intermediar' | 'avansat' | 'expert';
    selectedCategories?: string[];
  }): GameState {
    const allowedCategories = new Set([
      'istorie',
      'geografie',
      'biologie',
      'fizica',
      'chimie',
      'matematica',
      'literatura',
      'arta',
      'sport',
      'muzica',
      'cinematografie',
      'cultura_generala',
      'tehnologie',
      'informatica',
    ]);
    const requestedCategories = options.selectedCategories || [];
    if (
      !Array.isArray(requestedCategories) ||
      requestedCategories.some((category) => !allowedCategories.has(category))
    ) {
      throw new Error('Lista domeniilor de întrebări conține categorii invalide.');
    }
    const selectedCategories = [...new Set(requestedCategories)];
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const maxPlayers = Math.min(10, Math.max(2, Number(options.maxPlayers) || 4));

    const hostPlayer: Player = {
      id: options.hostUser.id,
      username: options.hostUser.username,
      avatar: options.hostUser.avatar || 'av_vlad',
      color: PLAYER_COLORS[0],
      score: 0,
      isHost: true,
      isReady: true,
      isAi: false,
      isConnected: true,
      castleTowers: 3,
      defensiveBonus: 0,
      territoriesCount: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      baseAttackAttemptsUsed: {},
    };

    const players: Player[] = [hostPlayer];

    const initialBots = Math.min(maxPlayers - 1, options.initialBotsCount || 0);
    for (let i = 0; i < initialBots; i++) {
      players.push(this.createBotPlayer(i + 1, options.botDifficulty || 'intermediar'));
    }

    const effectiveCount = Math.max(2, players.length);
    const meta = getMapMetadata(effectiveCount);

    const state: GameState = {
      roomId,
      roomName: options.roomName || `Meciul lui ${options.hostUser.username}`,
      isPrivate: !!options.isPrivate,
      maxPlayers,
      mapId: meta.mapId,
      mapPresetPlayerCount: meta.playerCount,
      mapTerritoryCount: meta.territoryCount,
      mapVersion: meta.version,
      selectedCategories: selectedCategories as any,
      round: 1,
      maxRounds: 6,
      phase: 'waiting',
      players,
      activePlayerIndex: 0,
      territories: createMapForPlayerCount(effectiveCount),
      turnTimeLimit: 15,
      turnTimerExpiresAt: 0,
      gameLog: [
        {
          id: this.makeLogId(),
          text: `Camera a fost creată de ${options.hostUser.username}.`,
          timestamp: Date.now(),
          type: 'info',
        },
      ],
      currentQuestion: null,
      usedQuestionIds: [],
      usedFactKeys: [],
      categoryUsageCounts: {},
      allocationNoResponseRetries: 0,
      allocationPickReady: false,
      warRound: null,
      warRoleHistory: {},
      spectators: [],
    };

    this.games.set(roomId, state);
    return state;
  }

  private createBotPlayer(
    colorIndex: number,
    difficulty: 'incepator' | 'intermediar' | 'avansat' | 'expert'
  ): Player {
    const name = BOT_NAMES[colorIndex % BOT_NAMES.length];
    return {
      id: `bot_${colorIndex}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      username: `${name}`,
      avatar: 'av_razes',
      color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length],
      score: 0,
      isHost: false,
      isReady: true,
      isAi: true,
      aiDifficulty: difficulty,
      castleTowers: 3,
      defensiveBonus: 0,
      territoriesCount: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      baseAttackAttemptsUsed: {},
    };
  }

  public getRoom(roomId: string): GameState | undefined {
    return this.games.get(roomId);
  }

  public getPublicRooms(): Array<{
    roomId: string;
    roomName: string;
    playersCount: number;
    maxPlayers: number;
    phase: GamePhase;
  }> {
    const list = [];
    for (const [id, game] of this.games.entries()) {
      if (!game.isPrivate && game.phase === 'waiting') {
        list.push({
          roomId: id,
          roomName: game.roomName,
          playersCount: game.players.length,
          maxPlayers: game.maxPlayers,
          phase: game.phase,
        });
      }
    }
    return list;
  }

  public isSpectator(roomId: string, userId: string): boolean {
    const game = this.games.get(roomId);
    if (!game) return false;
    if (game.players.some((p) => p.id === userId)) return false;
    return Boolean(game.spectators?.some((s) => s.id === userId));
  }

  public joinRoom(
    roomId: string,
    user: { id: string; username: string; avatar: string }
  ): { success: boolean; message: string; game?: GameState; isSpectator?: boolean } {
    const game = this.games.get(roomId);
    if (!game) return { success: false, message: 'Camera nu a fost găsită.' };

    const existing = game.players.find((p) => p.id === user.id);
    if (existing) {
      const wasDisconnected = existing.isConnected === false || existing.botControlled === true;
      this.clearEmptyRoomCleanupTimer(roomId);
      this.clearPlayerBotTimer(roomId, user.id);
      existing.isConnected = true;
      existing.botControlled = false;
      existing.hasLeftIntentionally = false;
      delete existing.disconnectedAt;
      if (game.spectators) {
        game.spectators = game.spectators.filter((s) => s.id !== user.id);
      }

      if (wasDisconnected && game.phase !== 'waiting' && game.phase !== 'finished') {
        game.gameLog.push({
          id: this.makeLogId(),
          text: `🔄 ${existing.username} a revenit în partidă și a preluat comanda de la bot!`,
          timestamp: Date.now(),
          type: 'info',
        });
      }
      this.notifyUpdate(roomId);
      return {
        success: true,
        isSpectator: false,
        message: 'Reconectat în cameră.',
        game: this.getClientState(roomId),
      };
    }

    if (game.phase !== 'waiting') {
      if (game.phase === 'finished') {
        return {
          success: false,
          message: 'Acest meci s-a încheiat deja.',
        };
      }
      game.spectators = game.spectators || [];
      const existingSpectator = game.spectators.find((s) => s.id === user.id);
      if (existingSpectator) {
        existingSpectator.isConnected = true;
        existingSpectator.username = user.username;
        existingSpectator.avatar = user.avatar || 'av_vlad';
      } else {
        game.spectators.push({
          id: user.id,
          username: user.username,
          avatar: user.avatar || 'av_vlad',
          isConnected: true,
        });
        game.gameLog.push({
          id: this.makeLogId(),
          text: `👁️ ${user.username} urmărește meciul ca spectator.`,
          timestamp: Date.now(),
          type: 'info',
        });
      }
      this.notifyUpdate(roomId);
      return {
        success: true,
        isSpectator: true,
        message: 'Ai intrat ca spectator în meci!',
        game: this.getClientState(roomId),
      };
    }
    if (game.players.length >= game.maxPlayers) {
      return { success: false, message: 'Camera este plină.' };
    }

    this.clearEmptyRoomCleanupTimer(roomId);

    const newPlayer: Player = {
      id: user.id,
      username: user.username,
      avatar: user.avatar || 'av_vlad',
      color: PLAYER_COLORS[game.players.length % PLAYER_COLORS.length],
      score: 0,
      isHost: false,
      isReady: false,
      isAi: false,
      isConnected: true,
      botControlled: false,
      hasLeftIntentionally: false,
      castleTowers: 3,
      defensiveBonus: 0,
      territoriesCount: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      baseAttackAttemptsUsed: {},
    };

    game.players.push(newPlayer);
    this.applyMapPreset(game, Math.max(2, game.players.length));
    game.gameLog.push({
      id: this.makeLogId(),
      text: `${user.username} s-a alăturat camerei.`,
      timestamp: Date.now(),
      type: 'info',
    });
    this.notifyUpdate(roomId);
    return {
      success: true,
      isSpectator: false,
      message: 'Te-ai alăturat cu succes!',
      game: this.getClientState(roomId),
    };
  }

  private activateBotTakeoverForPlayer(game: GameState, player: Player): void {
    const alreadyOffline = player.isConnected === false && player.botControlled === true;
    player.isConnected = false;
    player.botControlled = true;
    player.disconnectedAt = player.disconnectedAt || Date.now();

    if (!alreadyOffline) {
      game.gameLog.push({
        id: this.makeLogId(),
        text: `🤖 ${player.username} s-a deconectat. Botul a preluat temporar controlul până la revenirea jucătorului.`,
        timestamp: Date.now(),
        type: 'info',
      });
    }

    this.notifyUpdate(game.roomId);

    if (game.currentQuestion && !game.currentQuestion.resolved) {
      this.scheduleAiAnswerForPlayer(game, player);
    } else {
      this.checkAiTurn(game.roomId);
    }
  }

  public handleSocketDisconnect(roomId: string, userId: string): void {
    const game = this.games.get(roomId);
    if (!game) return;
    const spectator = game.spectators?.find((s) => s.id === userId);
    const player = game.players.find((p) => p.id === userId);
    if (!player && spectator) {
      spectator.isConnected = false;
      this.notifyUpdate(roomId);
      return;
    }
    if (!player || player.isAi) return;

    if (game.phase !== 'waiting' && game.phase !== 'finished') {
      this.activateBotTakeoverForPlayer(game, player);
      const connectedHumans = game.players.filter(
        (p) => !p.isAi && p.isConnected !== false && !p.hasLeftIntentionally
      );
      if (connectedHumans.length === 0) {
        this.scheduleEmptyRoomCleanup(roomId);
      }
      return;
    }

    if (game.phase === 'finished') {
      player.isConnected = false;
      const connectedHumans = game.players.filter(
        (p) => !p.isAi && p.isConnected !== false && !p.hasLeftIntentionally
      );
      if (connectedHumans.length === 0) {
        this.closeAndCleanupRoom(roomId);
      } else {
        this.notifyUpdate(roomId);
      }
      return;
    }

    // In waiting lobby: mark player disconnected without corrupting player list, and transfer host if another connected human exists
    player.isConnected = false;
    player.disconnectedAt = Date.now();
    if (player.isHost) {
      const nextConnectedHuman = game.players.find((p) => !p.isAi && p.id !== userId && p.isConnected !== false);
      if (nextConnectedHuman) {
        player.isHost = false;
        nextConnectedHuman.isHost = true;
      }
    }
    const connectedHumans = game.players.filter(
      (p) => !p.isAi && p.isConnected !== false && !p.hasLeftIntentionally
    );
    if (connectedHumans.length === 0) {
      this.scheduleEmptyRoomCleanup(roomId);
    }
    this.notifyUpdate(roomId);
  }

  public leaveRoom(roomId: string, userId: string): void {
    const game = this.games.get(roomId);
    if (!game) return;
    const leavingPlayer = game.players.find((p) => p.id === userId);
    if (!leavingPlayer) {
      if (game.spectators?.some((s) => s.id === userId)) {
        game.spectators = game.spectators.filter((s) => s.id !== userId);
        this.notifyUpdate(roomId);
      }
      return;
    }

    if (game.phase !== 'waiting' && game.phase !== 'finished') {
      leavingPlayer.hasLeftIntentionally = true;
      const remainingActiveHumans = game.players.filter(
        (p) => !p.isAi && !p.hasLeftIntentionally && p.isConnected !== false
      );
      const disconnectedButNotLeftHumans = game.players.filter(
        (p) => !p.isAi && !p.hasLeftIntentionally && p.isConnected === false
      );
      const hasAiBots = game.players.some((p) => p.isAi);

      if (remainingActiveHumans.length === 0 && disconnectedButNotLeftHumans.length === 0) {
        if (!hasAiBots) {
          // All human players left a human-only match -> close and clean up room immediately
          this.closeAndCleanupRoom(roomId);
          return;
        }
        // Match against AI bots -> continue match with bot takeover until endGame, then clean up
        this.activateBotTakeoverForPlayer(game, leavingPlayer);
        return;
      }

      if (remainingActiveHumans.length === 0 && disconnectedButNotLeftHumans.length > 0) {
        this.scheduleEmptyRoomCleanup(roomId);
      }
      this.activateBotTakeoverForPlayer(game, leavingPlayer);
      return;
    }

    if (game.phase === 'finished') {
      leavingPlayer.isConnected = false;
      leavingPlayer.hasLeftIntentionally = true;
      const remainingHumans = game.players.filter(
        (p) => !p.isAi && p.isConnected !== false && !p.hasLeftIntentionally
      );
      if (remainingHumans.length === 0) {
        this.closeAndCleanupRoom(roomId);
      } else {
        this.notifyUpdate(roomId);
      }
      return;
    }

    game.players = game.players.filter((p) => p.id !== userId);
    const remainingHumans = game.players.filter((p) => !p.isAi);
    const remainingConnectedHumans = remainingHumans.filter(
      (p) => p.isConnected !== false && !p.hasLeftIntentionally
    );
    if (game.players.length === 0 || remainingHumans.length === 0) {
      this.closeAndCleanupRoom(roomId);
      return;
    }
    if (remainingConnectedHumans.length === 0) {
      this.scheduleEmptyRoomCleanup(roomId);
    }
    if (leavingPlayer.isHost) {
      const nextHuman =
        game.players.find((p) => !p.isAi && p.isConnected !== false) ||
        game.players.find((p) => !p.isAi) ||
        game.players[0];
      nextHuman.isHost = true;
    }
    if (game.phase === 'waiting') {
      this.applyMapPreset(game, Math.max(2, game.players.length));
    }
    game.gameLog.push({
      id: this.makeLogId(),
      text: `${leavingPlayer.username} a părăsit camera.`,
      timestamp: Date.now(),
      type: 'info',
    });
    this.notifyUpdate(roomId);
  }

  public getRoomForUser(userId: string): GameState | undefined {
    let activeMatch: GameState | undefined;
    let waitingRoom: GameState | undefined;
    let finishedRoom: GameState | undefined;

    for (const game of this.games.values()) {
      const hasUser = game.players.some((p) => p.id === userId && !p.isAi);
      if (!hasUser) continue;
      if (game.phase !== 'waiting' && game.phase !== 'finished') {
        activeMatch = game;
        break;
      } else if (game.phase === 'waiting') {
        waitingRoom = game;
      } else if (game.phase === 'finished') {
        finishedRoom = game;
      }
    }

    const target = activeMatch || waitingRoom || finishedRoom;
    return target ? this.getClientState(target.roomId) : undefined;
  }

  public removeDeletedUserFromRooms(userId: string): void {
    for (const roomId of Array.from(this.games.keys())) {
      const g = this.games.get(roomId);
      if (!g) continue;
      if (
        g.players.some((p) => p.id === userId) ||
        g.spectators?.some((s) => s.id === userId)
      ) {
        this.leaveRoom(roomId, userId);
      }
    }
  }

  public addBot(
    roomId: string,
    requesterId: string,
    difficulty: 'incepator' | 'intermediar' | 'avansat' | 'expert' = 'intermediar'
  ): boolean {
    const game = this.games.get(roomId);
    if (!game || game.phase !== 'waiting') return false;
    if (!game.players.some((p) => p.id === requesterId && p.isHost && !p.isAi)) return false;
    if (game.players.length >= game.maxPlayers) return false;

    const bot = this.createBotPlayer(game.players.length, difficulty);
    game.players.push(bot);
    this.applyMapPreset(game, Math.max(2, game.players.length));

    game.gameLog.push({
      id: this.makeLogId(),
      text: `${bot.username} (${difficulty}) a fost adăugat.`,
      timestamp: Date.now(),
      type: 'info',
    });

    this.notifyUpdate(roomId);
    return true;
  }

  public removeBot(roomId: string, requesterId: string, botId: string): boolean {
    const game = this.games.get(roomId);
    if (!game || game.phase !== 'waiting') return false;
    if (!game.players.some((p) => p.id === requesterId && p.isHost && !p.isAi)) return false;
    if (!game.players.some((p) => p.id === botId && p.isAi)) return false;

    const initialLen = game.players.length;
    game.players = game.players.filter((p) => p.id !== botId);
    if (game.players.length !== initialLen) {
      this.applyMapPreset(game, Math.max(2, game.players.length));
      this.notifyUpdate(roomId);
      return true;
    }
    return false;
  }

  public setReady(roomId: string, userId: string, isReady: boolean): boolean {
    const game = this.games.get(roomId);
    if (!game || game.phase !== 'waiting') return false;

    const p = game.players.find((x) => x.id === userId);
    if (p) {
      p.isReady = isReady;
      this.notifyUpdate(roomId);
      return true;
    }
    return false;
  }

  public startGame(roomId: string, userId: string): { success: boolean; message: string } {
    const game = this.games.get(roomId);
    if (!game) return { success: false, message: 'Camera nu există.' };

    if (game.phase !== 'waiting')
      return { success: false, message: 'Partida a fost deja pornită.' };

    const caller = game.players.find((p) => p.id === userId);
    if (!caller?.isHost) {
      return { success: false, message: 'Doar creatorul camerei poate porni jocul.' };
    }

    if (game.players.length < 2) {
      return {
        success: false,
        message: 'Sunt necesari cel puțin 2 jucători (sau adaugă un bot AI).',
      };
    }
    if (game.players.some((p) => !p.isAi && p.isConnected !== false && !p.isReady)) {
      return {
        success: false,
        message: 'Toți jucătorii conectați trebuie să fie gata înainte de începerea meciului.',
      };
    }
    // Freeze map according to actual participant count (game.players.length, never maxPlayers)
    this.applyMapPreset(game, game.players.length);

    const territoryCount = Object.keys(game.territories).length;
    const budget = GameManager.calculateMatchQuestionBudget(
      game.players.length,
      territoryCount,
      game.maxRounds || 6
    );

    const roomQuestions = db
      .getAllQuestions()
      .filter(
        (q) =>
          isShortReadableChoiceQuestion(q) &&
          (!game.selectedCategories?.length || game.selectedCategories.includes(q.category))
      );
    const availableChoice = roomQuestions.length;
    const uniqueRoomFactKeys = new Set(roomQuestions.map((q) => q.factKey || q.id)).size;

    if (availableChoice === 0) {
      return {
        success: false,
        message: 'Categoriile selectate nu conțin întrebări cu variante pentru începerea meciului.',
      };
    }
    if (availableChoice < budget.requiredChoice || uniqueRoomFactKeys < budget.requiredChoice) {
      return {
        success: false,
        message: `Categoriile selectate au prea puține întrebări unice pentru o partidă de ${game.players.length} jucători (necesar: minim ${budget.requiredChoice} întrebări cu variante; disponibil: ${availableChoice}).`,
      };
    }

    const possibleFirstBases = Object.values(game.territories).filter((t) =>
      canCompleteBaseSelection(t.id, game.territories, game.players.length - 1)
    );
    if (!possibleFirstBases.length) {
      return {
        success: false,
        message:
          'Harta nu permite amplasarea tuturor bazelor la distanța necesară. Verifică graful de vecinătate al hărții.',
      };
    }
    game.phase = 'base_selection';
    game.activePlayerIndex = 0;
    game.turnOrder = game.players.map((p) => p.id);
    const estConquestRounds = calculateConquestRounds(
      Object.keys(game.territories).length,
      game.players.length
    );
    game.conquestTurnSchedule = buildConquestTurnSchedule(
      game.turnOrder,
      Math.max(8, estConquestRounds + 4)
    );
    game.usedQuestionIds = [];
    game.usedFactKeys = [];
    game.categoryUsageCounts = {};
    game.allocationNoResponseRetries = 0;
    for (const p of game.players) {
      p.attackBonusPoints = 0;
      p.hasLeftIntentionally = false;
      if (!p.isAi && p.isConnected === false) {
        p.botControlled = true;
      }
    }
    game.allocationPickReady = false;
    game.warRound = null;
    game.warRoleHistory = {};
    game.round = 1;

    game.gameLog.push({
      id: this.makeLogId(),
      text: `⚔️ Jocul a început pe harta pentru ${game.mapPresetPlayerCount} jucători (${game.mapTerritoryCount} teritorii)! Faza 1: Alegerea Bazei (1000 Puncte).`,
      timestamp: Date.now(),
      type: 'info',
    });

    this.startSelectionTimer(roomId);
    this.notifyUpdate(roomId);
    this.checkAiTurn(roomId);
    return { success: true, message: 'Jocul a pornit!' };
  }

  /**
   * Starts a selection timer for the current phase (default 15s, or remaining duration after restore).
   */
  private startSelectionTimer(roomId: string, customDurationMs = 15000): void {
    const existing = this.selectionTimers.get(roomId);
    if (existing) clearTimeout(existing);

    const game = this.games.get(roomId);
    if (!game || game.phase === 'finished' || game.currentQuestion) return;

    const clampedMs = Math.max(250, Math.min(15000, Math.round(customDurationMs)));
    game.turnTimeLimit = 15;
    game.turnTimerExpiresAt = Date.now() + clampedMs;
    if (game.phase === 'war' && game.warRound) {
      game.warRound.selectionDeadline = game.turnTimerExpiresAt;
    }

    const timer = setTimeout(() => {
      this.handleSelectionTimeout(roomId);
    }, clampedMs);
    this.selectionTimers.set(roomId, timer);
  }

  private handleSelectionTimeout(roomId: string): void {
    const game = this.games.get(roomId);
    if (!game || game.phase === 'finished' || game.currentQuestion) return;

    // INDIVIDUAL WAR TARGET SELECTION TIMEOUT
    if (game.phase === 'war' && game.warRound && game.warRound.status === 'selecting_targets') {
      for (const battle of game.warRound.battles) {
        if (!battle.targetTerritoryId && !battle.warActionType && battle.status !== 'skipped') {
          const validIds = battle.defenderId
            ? getLegalWarTargetsForPair(battle.attackerId, battle.defenderId, game.territories)
            : getLegalWarTargetsForAttacker(battle.attackerId, game.territories);
          const atk = game.players.find((p) => p.id === battle.attackerId);
          if (validIds.length > 0) {
            const pickId = validIds[Math.floor(Math.random() * validIds.length)];
            const targetTerr = game.territories[pickId];
            battle.warActionType = 'attack';
            battle.targetTerritoryId = pickId;
            if (targetTerr?.ownerId) {
              battle.defenderId = targetTerr.ownerId;
            }
            battle.status = 'auto_selected';
            game.pendingTerritoryId = pickId;
            if (battle.defenderId) {
              game.warRound.defenderIds = [battle.defenderId];
              game.warRound.byePlayerIds = game.players
                .filter(
                  (p) =>
                    !p.isEliminated && p.id !== battle.attackerId && p.id !== battle.defenderId
                )
                .map((p) => p.id);
            }
            const def = game.players.find((p) => p.id === battle.defenderId);
            const announcement = formatWarAttackAnnouncement({
              attacker: atk,
              defender: def,
              targetTerritory: targetTerr,
              originTerritory: resolveAttackOriginTerritory(
                battle.attackerId,
                pickId,
                game.territories
              ),
            });
            game.gameLog.push({
              id: this.makeLogId(),
              text: `⏱️ Timpul a expirat pentru ${atk?.username || 'Atacator'}! ${announcement.headline}`,
              timestamp: Date.now(),
              type: 'battle',
            });
          } else if (canPlayerRegenerateTower(battle.attackerId, game.territories)) {
            this.regenerateTower(roomId, battle.attackerId);
            return;
          } else {
            battle.status = 'skipped';
            battle.outcome = 'skipped';
            game.gameLog.push({
              id: this.makeLogId(),
              text: `⚖️ Rândul de atac pentru ${atk?.username || 'Atacator'} a fost omis: nu există niciun teritoriu inamic direct învecinat.`,
              timestamp: Date.now(),
              type: 'info',
            });
          }
        }
      }
      this.beginWarAttackPreview(game);
      return;
    }

    const activePlayer = game.players[game.activePlayerIndex];
    if (!activePlayer || activePlayer.isEliminated) {
      this.advanceTurn(roomId);
      return;
    }

    if (game.phase === 'allocation' && game.allocationWinnerId) {
      const winnerPlayer = game.players.find((p) => p.id === game.allocationWinnerId);
      const legalAllocIds = winnerPlayer
        ? getLegalAllocationTargetsForPlayer(winnerPlayer.id, game.territories)
        : [];
      if (legalAllocIds.length > 0) {
        const pickId = legalAllocIds[Math.floor(Math.random() * legalAllocIds.length)];
        const pickName = game.territories[pickId]?.name || pickId;
        game.gameLog.push({
          id: this.makeLogId(),
          text: `⏱️ Timpul a expirat pentru ${activePlayer.username}! S-a selectat automat teritoriul ${pickName}.`,
          timestamp: Date.now(),
          type: 'info',
        });
        this.selectTerritory(roomId, game.allocationWinnerId, pickId);
        return;
      } else {
        game.allocationWinnerId = null;
        game.allocationPickReady = false;
        this.triggerNextAllocationQuestion(game);
        return;
      }
    }

    if (game.phase === 'conquest' && game.conquestPickerId) {
      const picker = game.players.find((p) => p.id === game.conquestPickerId);
      if (picker) {
        // Strict adjacency rule in conquest! Never pick a non-adjacent territory in conquest.
        const valid = Object.values(game.territories).filter(
          (t) => canTargetTerritory(t.id, picker, game.territories, 'conquest').allowed
        );
        if (valid.length > 0) {
          const pick = valid[Math.floor(Math.random() * valid.length)];
          game.gameLog.push({
            id: this.makeLogId(),
            text: `⏱️ Timpul a expirat pentru ${picker.username}! S-a cucerit automat ${pick.name}.`,
            timestamp: Date.now(),
            type: 'info',
          });
          this.selectTerritory(roomId, picker.id, pick.id);
          return;
        } else {
          // Boxed in: cannot pick any adjacent neutral territory
          game.conquestPickerId = null;
          this.processNextConquestPick(game);
          return;
        }
      }
    }

    const validTerritories = Object.values(game.territories).filter((t) => {
      if (game.phase === 'base_selection') {
        return canCompleteBaseSelection(
          t.id,
          game.territories,
          game.players.length - game.activePlayerIndex - 1
        );
      }
      const check = canTargetTerritory(t.id, activePlayer, game.territories, game.phase as any);
      return check.allowed;
    });

    if (validTerritories.length > 0) {
      const pick = validTerritories[Math.floor(Math.random() * validTerritories.length)];
      game.gameLog.push({
        id: this.makeLogId(),
        text: `⏱️ Timpul a expirat pentru ${activePlayer.username}! S-a selectat automat ${pick.name}.`,
        timestamp: Date.now(),
        type: 'info',
      });
      this.selectTerritory(roomId, activePlayer.id, pick.id);
    } else if (game.phase === 'base_selection') {
      game.phase = 'finished';
      game.gameLog.push({
        id: this.makeLogId(),
        text: 'Partida a fost oprită: nu au mai rămas suficiente poziții valide pentru bazele tuturor jucătorilor.',
        timestamp: Date.now(),
        type: 'info',
      });
      this.clearRoomTimers(roomId);
      this.notifyUpdate(roomId);
    } else {
      this.advanceTurn(roomId);
    }
  }

  private clearSelectionTimer(roomId: string): void {
    const timer = this.selectionTimers.get(roomId);
    if (timer) clearTimeout(timer);
    this.selectionTimers.delete(roomId);
    const game = this.games.get(roomId);
    if (game) game.turnTimerExpiresAt = 0;
  }

  private finishForQuestionExhaustion(
    game: GameState,
    questionType: 'choice' | 'estimation'
  ): void {
    game.phase = 'finished';
    game.currentQuestion = null;
    game.pendingTerritoryId = null;
    const eligible = game.players.filter(
      (p) => !p.isEliminated && Object.values(game.territories).some((t) => t.ownerId === p.id)
    );
    const winner = [...eligible].sort((a, b) => b.score - a.score)[0];
    game.gameLog.push({
      id: this.makeLogId(),
      text: `Partida s-a încheiat anticipat: s-au epuizat întrebările ${
        questionType === 'choice' ? 'grilă' : 'numerice'
      } din categoriile selectate.`,
      timestamp: Date.now(),
      type: 'info',
    });
    if (winner) {
      this.endGame(game, winner);
    } else {
      this.clearRoomTimers(game.roomId);
      this.notifyUpdate(game.roomId);
    }
  }

  public regenerateTower(
    roomId: string,
    userId: string
  ): { success: boolean; message: string } {
    const game = this.games.get(roomId);
    if (!game) return { success: false, message: 'Jocul nu a fost găsit.' };
    if (this.isSpectator(roomId, userId)) {
      return { success: false, message: 'Spectatorii nu pot efectua acțiuni în timpul meciului.' };
    }
    if (game.phase !== 'war' || !game.warRound || game.warRound.status !== 'selecting_targets') {
      return {
        success: false,
        message: 'Regenerarea unui turn este disponibilă doar la începutul turei tale de război!',
      };
    }
    if (game.currentQuestion) {
      return { success: false, message: 'Așteaptă rezolvarea întrebării curente.' };
    }

    const battle = game.warRound.battles.find((b) => b.attackerId === userId);
    if (!battle) {
      return {
        success: false,
        message: 'Nu este rândul tău acum! Poți regenera un turn doar pe tura ta.',
      };
    }
    if (
      battle.targetTerritoryId !== null ||
      battle.warActionType !== undefined ||
      battle.status !== 'selecting_target'
    ) {
      return {
        success: false,
        message: 'Ai ales deja acțiunea pentru această tură!',
      };
    }

    const player = game.players.find((p) => p.id === userId);
    if (!player || player.isEliminated) {
      return { success: false, message: 'Jucătorul nu este activ în această partidă.' };
    }

    if (!canPlayerRegenerateTower(userId, game.territories)) {
      return {
        success: false,
        message: 'Cetatea ta are deja toate cele 3 turnuri intacte (sau nu mai deții baza)!',
      };
    }

    const baseTerritory = Object.values(game.territories).find(
      (t) => t.ownerId === userId && t.isBase
    );
    if (!baseTerritory) {
      return { success: false, message: 'Nu mai deții o cetate de bază.' };
    }

    this.clearSelectionTimer(roomId);
    this.clearPlayerBotTimer(roomId, userId);

    battle.warActionType = 'regenerate_tower';
    battle.targetTerritoryId = baseTerritory.id;
    battle.defenderId = '';
    battle.status = 'choice_question';
    game.pendingTerritoryId = baseTerritory.id;
    game.warRound.defenderIds = [];
    game.warRound.byePlayerIds = game.players
      .filter((p) => !p.isEliminated && p.id !== userId)
      .map((p) => p.id);

    const q = this.getRandomQuestion(game, 'choice');
    if (!q) {
      this.finishForQuestionExhaustion(game, 'choice');
      return { success: false, message: 'Nu mai sunt întrebări disponibile.' };
    }

    game.warRound.status = 'choice_question';
    game.gameLog.push({
      id: this.makeLogId(),
      text: `🏰 ${player.username} încearcă să regenereze un turn în Cetatea ${baseTerritory.name} (${baseTerritory.castleTowers ?? 2}/3 turnuri)! Trebuie să răspundă corect la întrebare (15s).`,
      timestamp: Date.now(),
      type: 'battle',
    });

    this.startQuestion(game, q, {
      targetTerritoryId: baseTerritory.id,
      attackerId: userId,
      phaseContext: 'war',
      warActionType: 'regenerate_tower',
      isTiebreak: false,
      participantIds: [userId],
      warRoundId: game.warRound.roundId,
    });

    return {
      success: true,
      message: `Întrebare pentru regenerarea unui turn în Cetatea ${baseTerritory.name}!`,
    };
  }

  /**
   * Called when an active player selects a territory on the map.
   */
  public selectTerritory(
    roomId: string,
    userId: string,
    territoryId: string
  ): { success: boolean; message: string; territoryId?: string; pointsAwarded?: number } {
    const game = this.games.get(roomId);
    if (!game) return { success: false, message: 'Jocul nu a fost găsit.' };
    if (this.isSpectator(roomId, userId)) {
      return { success: false, message: 'Spectatorii nu pot selecta teritorii.' };
    }
    if (game.currentQuestion)
      return { success: false, message: 'Așteaptă rezolvarea întrebării curente.' };

    const territory = game.territories[territoryId];
    if (!territory) return { success: false, message: 'Teritoriul nu există.' };

    // ==========================================
    // 4. FAZA: RĂZBOI (ATAC INDIVIDUAL 1 CONTRA 1)
    // ==========================================
    if (game.phase === 'war') {
      if (!game.warRound || game.warRound.status !== 'selecting_targets') {
        return { success: false, message: 'Selecția țintei de atac nu este activă acum.' };
      }

      const battle = game.warRound.battles.find((b) => b.attackerId === userId);
      if (!battle) {
        return {
          success: false,
          message: 'Nu este rândul tău să ataci acum! Urmărește atacul jucătorului activ.',
        };
      }
      if (battle.targetTerritoryId !== null || battle.warActionType !== undefined) {
        return {
          success: false,
          message: 'Ținta sau acțiunea a fost deja aleasă pentru această tură!',
        };
      }

      const attackerPlayer = game.players.find((p) => p.id === userId);
      if (!attackerPlayer || attackerPlayer.isEliminated) {
        return { success: false, message: 'Jucătorul atacator nu este disponibil.' };
      }

      const assignedDefenderId =
        battle.defenderId && battle.defenderId.trim().length > 0 ? battle.defenderId : null;

      const check = canTargetTerritory(
        territoryId,
        attackerPlayer,
        game.territories,
        'war',
        assignedDefenderId
      );
      if (!check.allowed) {
        return { success: false, message: check.reason || 'Atac nepermis pe acest teritoriu!' };
      }

      const defenderPlayer = game.players.find((p) => p.id === territory.ownerId);
      if (!defenderPlayer || defenderPlayer.isEliminated) {
        return { success: false, message: 'Apărătorul teritoriului vizat nu mai este activ.' };
      }

      battle.warActionType = 'attack';
      battle.defenderId = defenderPlayer.id;
      battle.targetTerritoryId = territoryId;
      battle.status = 'ready';
      game.pendingTerritoryId = territoryId;
      game.warRound.defenderIds = Array.from(
        new Set(
          game.warRound.battles
            .map((b) => b.defenderId)
            .filter((id): id is string => Boolean(id && id.trim().length > 0))
        )
      );
      game.warRound.byePlayerIds = game.players
        .filter(
          (p) =>
            !p.isEliminated &&
            !game.warRound!.attackerIds.includes(p.id) &&
            !game.warRound!.defenderIds.includes(p.id)
        )
        .map((p) => p.id);

      const originTerr = resolveAttackOriginTerritory(
        attackerPlayer.id,
        territoryId,
        game.territories
      );
      const announcement = formatWarAttackAnnouncement({
        attacker: attackerPlayer,
        defender: defenderPlayer,
        targetTerritory: territory,
        originTerritory: originTerr,
      });

      game.gameLog.push({
        id: this.makeLogId(),
        text: `⚔️ ${announcement.headline}!`,
        timestamp: Date.now(),
        type: 'battle',
      });

      const allSelected = game.warRound.battles.every(
        (b) => b.targetTerritoryId !== null || b.status === 'skipped'
      );
      if (allSelected) {
        this.beginWarAttackPreview(game);
      } else {
        const nextUnpicked = game.warRound.battles.find(
          (b) => b.targetTerritoryId === null && b.status !== 'skipped'
        );
        if (nextUnpicked) {
          const idx = game.players.findIndex((p) => p.id === nextUnpicked.attackerId);
          if (idx >= 0) game.activePlayerIndex = idx;
        }
        this.notifyUpdate(roomId);
      }

      return {
        success: true,
        message: announcement.headline,
        territoryId,
      };
    }

    const activePlayer = game.players[game.activePlayerIndex];
    if (!activePlayer || activePlayer.isEliminated)
      return { success: false, message: 'Jucătorul activ nu este disponibil.' };
    if (activePlayer.id !== userId) {
      return { success: false, message: 'Nu este rândul tău acum!' };
    }

    // ==========================================
    // 1. FAZA: ALEGEREA BAZEI (BASE SELECTION)
    // ==========================================
    if (game.phase === 'base_selection') {
      if (
        !canCompleteBaseSelection(
          territoryId,
          game.territories,
          game.players.length - game.activePlayerIndex - 1
        )
      ) {
        return {
          success: false,
          message:
            'Nu poți alege o bază lipită de baza altui jucător. Păstrează cel puțin o zonă de distanță!',
        };
      }

      this.clearSelectionTimer(roomId);
      territory.ownerId = activePlayer.id;
      territory.isBase = true;
      territory.castleTowers = 3;
      territory.defensiveBonus = 0;
      territory.points = SCORING.BASE;
      territory.basePlayerName = activePlayer.username;

      activePlayer.baseTerritoryId = territoryId;
      activePlayer.castleTowers = 3;
      activePlayer.defensiveBonus = 0;
      this.recalculatePlayerScores(game);

      game.gameLog.push({
        id: this.makeLogId(),
        text: `🏰 ${activePlayer.username} și-a stabilit Baza în ${territory.name}! (+${SCORING.BASE} pct)`,
        timestamp: Date.now(),
        type: 'conquest',
      });

      const nextIndex = game.activePlayerIndex + 1;
      if (nextIndex < game.players.length) {
        game.activePlayerIndex = nextIndex;
        this.startSelectionTimer(roomId);
        this.notifyUpdate(roomId);
        this.checkAiTurn(roomId);
        return {
          success: true,
          message: `Cetatea de bază ${territory.name} (+1000 pct) a fost întemeiată!`,
          territoryId,
          pointsAwarded: SCORING.BASE,
        };
      } else {
        game.phase = 'conquest';
        game.round = 1;
        game.maxRounds = calculateConquestRounds(
          Object.keys(game.territories).length,
          game.players.length
        );
        if (!game.turnOrder || game.turnOrder.length === 0) {
          game.turnOrder = game.players.map((p) => p.id);
        }
        game.conquestTurnSchedule = buildConquestTurnSchedule(
          game.turnOrder,
          Math.max(8, game.maxRounds + 4)
        );
        const firstRoundOrder = getRoundFixedTurnOrder(game, 1);
        const firstIdx = game.players.findIndex((p) => p.id === firstRoundOrder[0]);
        game.activePlayerIndex = firstIdx >= 0 ? firstIdx : 0;

        game.gameLog.push({
          id: this.makeLogId(),
          text: `🚩 Toate bazele au fost întemeiate! Faza 1: CUCERIRE (${game.maxRounds} runde, ${SCORING.CONQUEST} puncte per teritoriu). Toată lumea răspunde în același timp la întrebări grilă, iar alegerea teritoriilor urmează ordinea fixă a rundei!`,
          timestamp: Date.now(),
          type: 'info',
        });

        this.notifyUpdate(roomId);
        const startConquestTimer = setTimeout(() => {
          this.turnAdvanceTimers.delete(roomId);
          this.triggerNextConquestQuestion(game);
        }, 1500);
        this.setTurnAdvanceTimer(roomId, startConquestTimer);
        return {
          success: true,
          message: `Cetatea de bază ${territory.name} (+1000 pct) a fost întemeiată! Începe Cucerirea!`,
          territoryId,
          pointsAwarded: SCORING.BASE,
        };
      }
    }

    // ==========================================
    // 2. FAZA: CUCERIRE (CONQUEST) - ALEGERE DUPĂ RĂSPUNS CORECT
    // ==========================================
    if (game.phase === 'conquest') {
      if (!game.conquestPickerId || game.conquestPickerId !== userId) {
        return { success: false, message: 'Nu este rândul tău să alegi teritoriul!' };
      }
      if (territory.ownerId !== null) {
        return { success: false, message: 'Poți alege doar un teritoriu liber (neutru)!' };
      }
      const check = canTargetTerritory(territoryId, activePlayer, game.territories, 'conquest');
      if (!check.allowed) {
        return {
          success: false,
          message:
            check.reason || 'Poți cuceri doar teritorii neutre adiacente stăpânirii tale!',
        };
      }

      this.clearSelectionTimer(roomId);
      territory.ownerId = activePlayer.id;
      territory.points = SCORING.CONQUEST;
      territory.defensiveBonus = 0;
      this.recalculatePlayerScores(game);
      game.conquestPickerId = null;

      game.gameLog.push({
        id: this.makeLogId(),
        text: `🚩 ${activePlayer.username} a cucerit ${territory.name}! (+${SCORING.CONQUEST} pct)`,
        timestamp: Date.now(),
        type: 'conquest',
      });

      this.notifyUpdate(roomId);

      const nextPickTimer = setTimeout(() => {
        this.turnAdvanceTimers.delete(roomId);
        this.processNextConquestPick(game);
      }, 900);
      this.setTurnAdvanceTimer(roomId, nextPickTimer);
      return {
        success: true,
        message: `TERITORIU CUCERIT: ${territory.name} (+${SCORING.CONQUEST} PCT)!`,
        territoryId,
        pointsAwarded: SCORING.CONQUEST,
      };
    }

    // ==========================================
    // 3. FAZA: DEPARTAJARE / ALOCARE (ALLOCATION)
    // ==========================================
    if (game.phase === 'allocation') {
      if (game.allocationWinnerId !== userId || !game.allocationPickReady) {
        return {
          success: false,
          message: 'Doar câștigătorul întrebării de departajare poate alege teritoriul!',
        };
      }
      if (territory.ownerId !== null) {
        return { success: false, message: 'Trebuie să alegi un teritoriu liber (neutru)!' };
      }
      const check = canTargetTerritory(territoryId, activePlayer, game.territories, 'allocation');
      if (!check.allowed) {
        return {
          success: false,
          message:
            check.reason || 'Trebuie să alegi un teritoriu liber învecinat cu teritoriile tale!',
        };
      }

      this.clearSelectionTimer(roomId);
      territory.ownerId = activePlayer.id;
      territory.points = SCORING.ALLOCATION;
      territory.defensiveBonus = 0;
      this.recalculatePlayerScores(game);
      game.allocationWinnerId = null;
      game.allocationPickReady = false;

      game.gameLog.push({
        id: this.makeLogId(),
        text: `🚩 ${activePlayer.username} a ales ${territory.name}! Teritoriul îi aparține acum (+${SCORING.ALLOCATION} pct).`,
        timestamp: Date.now(),
        type: 'conquest',
      });

      this.notifyUpdate(roomId);

      const neutralCount = Object.values(game.territories).filter((t) => t.ownerId === null).length;
      if (neutralCount > 0) {
        const nextAllocTimer = setTimeout(() => {
          this.turnAdvanceTimers.delete(roomId);
          this.triggerNextAllocationQuestion(game);
        }, 1200);
        this.setTurnAdvanceTimer(roomId, nextAllocTimer);
      } else {
        this.enterWarPhase(game);
      }
      return {
        success: true,
        message: `TERITORIU REVENDICAT: ${territory.name} (+${SCORING.ALLOCATION} PCT)!`,
        territoryId,
        pointsAwarded: SCORING.ALLOCATION,
      };
    }

    return { success: false, message: 'Acțiune invalidă.' };
  }

  private enterWarPhase(game: GameState): void {
    game.phase = 'war';
    game.round = 1;
    game.maxRounds = 6;
    game.activePlayerIndex = 0;
    game.warTurnQueue = [];
    game.warRoleHistory = game.warRoleHistory || {};

    game.gameLog.push({
      id: this.makeLogId(),
      text: `⚔️ Harta României este complet ocupată! Începe FAZA DE RĂZBOI (${SCORING.WAR_DUEL} pct per bătălie)! Fiecare jucător atacă pe rând o țintă învecinată.`,
      timestamp: Date.now(),
      type: 'info',
    });

    this.startSimultaneousWarRound(game);
  }

  private advanceToNextWarTurnOrRound(game: GameState): void {
    const activePlayers = game.players.filter(
      (p) => !p.isEliminated && Object.values(game.territories).some((t) => t.ownerId === p.id)
    );
    if (activePlayers.length <= 1) {
      if (activePlayers[0]) {
        this.endGame(game, activePlayers[0]);
      } else if (game.players[0]) {
        this.endGame(game, game.players[0]);
      }
      return;
    }

    // Filter remaining queue in current round to players who still have legal adjacent enemy targets or can regenerate a tower
    const remainingQueue = (game.warTurnQueue || []).filter(
      (pid) =>
        activePlayers.some((p) => p.id === pid) &&
        (getLegalWarTargetsForAttacker(pid, game.territories).length > 0 ||
          canPlayerRegenerateTower(pid, game.territories))
    );
    game.warTurnQueue = remainingQueue;

    if (remainingQueue.length === 0) {
      game.round += 1;
      game.warTurnQueue = [];
    }

    this.startSimultaneousWarRound(game);
  }

  private startSimultaneousWarRound(game: GameState): void {
    const roomId = game.roomId;
    this.clearSelectionTimer(roomId);
    game.currentQuestion = null;
    game.pendingTerritoryId = null;

    const activePlayers = game.players.filter(
      (p) => !p.isEliminated && Object.values(game.territories).some((t) => t.ownerId === p.id)
    );

    if (activePlayers.length <= 1) {
      if (activePlayers[0]) {
        this.endGame(game, activePlayers[0]);
      } else if (game.players[0]) {
        this.endGame(game, game.players[0]);
      }
      return;
    }

    if (game.round > game.maxRounds) {
      const sorted = [...activePlayers].sort((a, b) => b.score - a.score);
      this.endGame(game, sorted[0]);
      return;
    }

    const activeIds = activePlayers.map((p) => p.id);
    if (!game.warTurnQueue || game.warTurnQueue.length === 0) {
      game.warTurnQueue = buildIndividualWarTurnOrder(
        activeIds,
        game.territories,
        game.round
      );
    } else {
      game.warTurnQueue = game.warTurnQueue.filter(
        (pid) =>
          activeIds.includes(pid) &&
          (getLegalWarTargetsForAttacker(pid, game.territories).length > 0 ||
            canPlayerRegenerateTower(pid, game.territories))
      );
    }

    if (game.warTurnQueue.length === 0) {
      // No player has any adjacent enemy territory (should not happen on connected graph, but safe guard)
      const sorted = [...activePlayers].sort((a, b) => b.score - a.score);
      this.endGame(game, sorted[0]);
      return;
    }

    const attackerId = game.warTurnQueue.shift()!;
    const attacker = game.players.find((p) => p.id === attackerId);
    game.warRoleHistory = game.warRoleHistory || {};
    game.warRoleHistory[attackerId] = [...(game.warRoleHistory[attackerId] || []), 'attacker'];

    const battles: WarBattleAssignment[] = [
      {
        battleId: `war_r${game.round}_${attackerId}`,
        attackerId,
        defenderId: '',
        targetTerritoryId: null,
        status: 'selecting_target',
      },
    ];

    const byePlayerIds = activeIds.filter((id) => id !== attackerId);
    const deadline = Date.now() + 15000;
    game.warRound = {
      roundId: `war_round_${game.round}_${attackerId}_${Date.now()}`,
      roundNumber: game.round,
      status: 'selecting_targets',
      attackerIds: [attackerId],
      defenderIds: [],
      byePlayerIds,
      battles,
      selectionDeadline: deadline,
      questionDeadline: null,
      lastBattleResult: null,
    };

    const attackerIdx = game.players.findIndex((p) => p.id === attackerId);
    if (attackerIdx >= 0) {
      game.activePlayerIndex = attackerIdx;
    }

    game.gameLog.push({
      id: this.makeLogId(),
      text: `⚔️ Război Runda ${game.round}/${game.maxRounds}: Este rândul lui ${attacker?.username || attackerId} să aleagă un teritoriu inamic învecinat pentru atac (15s)!`,
      timestamp: Date.now(),
      type: 'battle',
    });

    this.startSelectionTimer(roomId);
    this.notifyUpdate(roomId);
    this.scheduleSimultaneousWarAiTargetSelections(game);
  }

  private scheduleSimultaneousWarAiTargetSelections(game: GameState): void {
    if (!game.warRound || game.warRound.status !== 'selecting_targets') return;
    const roomId = game.roomId;

    for (const battle of game.warRound.battles) {
      const attacker = game.players.find((p) => p.id === battle.attackerId);
      if (attacker && this.isBotControlled(attacker) && !battle.targetTerritoryId) {
        const timer = setTimeout(() => {
          this.playerBotTimers.delete(`${roomId}:${attacker.id}`);
          const currentGame = this.games.get(roomId);
          if (
            !currentGame ||
            currentGame.phase !== 'war' ||
            !currentGame.warRound ||
            currentGame.warRound.status !== 'selecting_targets'
          ) {
            return;
          }
          const currentAttacker = currentGame.players.find((p) => p.id === battle.attackerId);
          if (!this.isBotControlled(currentAttacker)) return;

          const currentBattle = currentGame.warRound.battles.find(
            (b) => b.battleId === battle.battleId
          );
          if (!currentBattle || currentBattle.targetTerritoryId) return;

          const validIds = currentBattle.defenderId
            ? getLegalWarTargetsForPair(
                currentBattle.attackerId,
                currentBattle.defenderId,
                currentGame.territories
              )
            : getLegalWarTargetsForAttacker(currentBattle.attackerId, currentGame.territories);
          if (validIds.length > 0) {
            const pickId = validIds[Math.floor(Math.random() * validIds.length)];
            this.selectTerritory(roomId, currentBattle.attackerId, pickId);
          } else {
            currentBattle.status = 'skipped';
            currentBattle.outcome = 'skipped';
            const allDone = currentGame.warRound.battles.every(
              (b) => b.targetTerritoryId !== null || b.status === 'skipped'
            );
            if (allDone) {
              this.beginWarAttackPreview(currentGame);
            } else {
              this.notifyUpdate(roomId);
            }
          }
        }, 1100 + Math.random() * 1100);

        this.setPlayerBotTimer(roomId, attacker.id, timer);
      }
    }
  }

  private beginWarAttackPreview(game: GameState, customDurationMs = 2800): void {
    if (!game.warRound) return;
    const roomId = game.roomId;
    this.clearSelectionTimer(roomId);

    const prevAdv = this.turnAdvanceTimers.get(roomId);
    if (prevAdv) {
      clearTimeout(prevAdv);
      this.turnAdvanceTimers.delete(roomId);
    }

    const activeBattles = game.warRound.battles.filter((b) => b.targetTerritoryId !== null);
    if (activeBattles.length === 0) {
      this.advanceToNextWarTurnOrRound(game);
      return;
    }

    const durationMs = Math.max(250, Math.min(5000, Math.round(customDurationMs)));
    const expiresAt = Date.now() + durationMs;
    game.warRound.status = 'attack_preview';
    game.warRound.attackPreviewDurationMs = durationMs;
    game.warRound.attackPreviewExpiresAt = expiresAt;
    game.warRound.selectionDeadline = null;
    game.turnTimeLimit = Math.max(1, Math.ceil(durationMs / 1000));
    game.turnTimerExpiresAt = expiresAt;

    const firstBattle = activeBattles[0];
    const atkPlayer = game.players.find((p) => p.id === firstBattle.attackerId);
    const defPlayer = game.players.find((p) => p.id === firstBattle.defenderId);
    const targetTerr = firstBattle.targetTerritoryId
      ? game.territories[firstBattle.targetTerritoryId]
      : null;
    const originTerr =
      firstBattle.targetTerritoryId && atkPlayer
        ? resolveAttackOriginTerritory(
            atkPlayer.id,
            firstBattle.targetTerritoryId,
            game.territories
          )
        : null;
    const announcement = formatWarAttackAnnouncement({
      attacker: atkPlayer,
      defender: defPlayer,
      targetTerritory: targetTerr,
      originTerritory: originTerr,
    });

    game.gameLog.push({
      id: this.makeLogId(),
      text: `🎯 ${announcement.headline} — ${announcement.responderText}`,
      timestamp: Date.now(),
      type: 'battle',
    });

    this.notifyUpdate(roomId);

    const previewTimer = setTimeout(() => {
      this.turnAdvanceTimers.delete(roomId);
      const currentGame = this.games.get(roomId);
      if (
        !currentGame ||
        currentGame.phase !== 'war' ||
        !currentGame.warRound ||
        currentGame.warRound.status !== 'attack_preview'
      ) {
        return;
      }
      this.launchSimultaneousWarChoiceQuestion(currentGame);
    }, durationMs);

    this.turnAdvanceTimers.set(roomId, previewTimer);
  }

  private launchSimultaneousWarChoiceQuestion(game: GameState): void {
    if (!game.warRound) return;
    const roomId = game.roomId;
    this.clearSelectionTimer(roomId);
    game.warRound.attackPreviewExpiresAt = null;

    const activeBattles = game.warRound.battles.filter((b) => b.targetTerritoryId !== null);
    if (activeBattles.length === 0) {
      this.advanceToNextWarTurnOrRound(game);
      return;
    }

    const q = this.getRandomQuestion(game, 'choice');
    if (!q) {
      this.finishForQuestionExhaustion(game, 'choice');
      return;
    }

    game.warRound.status = 'choice_question';
    for (const b of activeBattles) {
      b.status = 'choice_question';
    }

    const participantIds = Array.from(
      new Set(activeBattles.flatMap((b) => [b.attackerId, b.defenderId]).filter(Boolean))
    );

    this.startQuestion(game, q, {
      targetTerritoryId: activeBattles[0].targetTerritoryId || undefined,
      attackerId: activeBattles[0].attackerId,
      defenderId: activeBattles[0].defenderId,
      phaseContext: 'war',
      isTiebreak: false,
      participantIds,
      warRoundId: game.warRound.roundId,
    });
  }

  private applySimultaneousWarRoundOutcomes(game: GameState): void {
    if (!game.warRound) return;
    game.warRound.status = 'resolving';

    for (const battle of game.warRound.battles) {
      battle.status = 'resolved';
      const targetTerritory = battle.targetTerritoryId
        ? game.territories[battle.targetTerritoryId]
        : undefined;
      const attacker = game.players.find((p) => p.id === battle.attackerId);
      const defender = game.players.find((p) => p.id === battle.defenderId);

      if (!targetTerritory || !attacker || !defender) continue;
      const wasBaseTarget = Boolean(targetTerritory.isBase);

      if (battle.outcome === 'attacker_won') {
        if (targetTerritory.isBase) {
          targetTerritory.castleTowers = Math.max(0, (targetTerritory.castleTowers ?? 3) - 1);
          defender.castleTowers = targetTerritory.castleTowers;

          if (targetTerritory.castleTowers > 0) {
            attacker.attackBonusPoints = (attacker.attackBonusPoints || 0) + SCORING.WAR_DUEL;
            attacker.score += SCORING.WAR_DUEL;
            battle.siegeStreak = (battle.siegeStreak || 0) + 1;
            const remainingTowers = targetTerritory.castleTowers;
            const summary: WarBattleResultSummary = {
              battleId: battle.battleId,
              attackerId: attacker.id,
              attackerName: attacker.username,
              attackerColor: attacker.color,
              defenderId: defender.id,
              defenderName: defender.username,
              defenderColor: defender.color,
              targetTerritoryId: targetTerritory.id,
              territoryName: targetTerritory.name,
              isBaseTarget: true,
              outcome: 'attacker_won',
              headline: `Turn distrus — ${remainingTowers}/3 rămase`,
              details: `${attacker.username} a distrus un turn din Cetatea ${targetTerritory.name} apărată de ${defender.username} (+${SCORING.WAR_DUEL} pct)! Turn distrus — ${remainingTowers}/3 rămase. Asediul continuă imediat cu următoarea întrebare!`,
              effectBadge: `💥 TURN DISTRUS — ${remainingTowers}/3 RĂMASE`,
              remainingTowers,
              maxTowers: 3,
              siegeContinues: true,
              expiresAt: Date.now() + 3400,
            };
            game.warRound.lastBattleResult = summary;
            game.gameLog.push({
              id: this.makeLogId(),
              text: `💥 Turn distrus — ${remainingTowers}/3 rămase! ${summary.details}`,
              timestamp: Date.now(),
              type: 'battle',
            });
          } else {
            defender.isEliminated = true;
            defender.castleTowers = 0;
            targetTerritory.isBase = false;
            targetTerritory.basePlayerName = undefined;
            targetTerritory.castleTowers = 0;
            targetTerritory.defensiveBonus = 0;
            targetTerritory.ownerId = attacker.id;

            for (const t of Object.values(game.territories)) {
              if (t.ownerId === defender.id) {
                t.defensiveBonus = 0;
                t.isBase = false;
                t.basePlayerName = undefined;
                t.castleTowers = 0;
                t.ownerId = attacker.id;
              }
            }

            const summary: WarBattleResultSummary = {
              battleId: battle.battleId,
              attackerId: attacker.id,
              attackerName: attacker.username,
              attackerColor: attacker.color,
              defenderId: defender.id,
              defenderName: defender.username,
              defenderColor: defender.color,
              targetTerritoryId: targetTerritory.id,
              territoryName: targetTerritory.name,
              isBaseTarget: true,
              outcome: 'attacker_won',
              headline: 'Atac reușit — Cetate cucerită!',
              details: `${attacker.username} a distrus ultimul turn (0/3 rămase), a cucerit definitiv Cetatea ${targetTerritory.name} a lui ${defender.username} și a preluat toate teritoriile sale!`,
              effectBadge: '👑 CETATE CUCERITĂ DEFINITIV (0/3 TURNURI)',
              remainingTowers: 0,
              maxTowers: 3,
              siegeContinues: false,
              expiresAt: Date.now() + 3400,
            };
            game.warRound.lastBattleResult = summary;
            game.gameLog.push({
              id: this.makeLogId(),
              text: `👑 Atac reușit! ${summary.details}`,
              timestamp: Date.now(),
              type: 'elimination',
            });
          }
        } else {
          targetTerritory.ownerId = attacker.id;
          targetTerritory.points = SCORING.WAR_DUEL;
          targetTerritory.defensiveBonus = 0;

          const remainingDefenderLand = Object.values(game.territories).filter(
            (t) => t.ownerId === defender.id
          ).length;
          if (remainingDefenderLand === 0) {
            defender.isEliminated = true;
          }

          const summary: WarBattleResultSummary = {
            battleId: battle.battleId,
            attackerId: attacker.id,
            attackerName: attacker.username,
            attackerColor: attacker.color,
            defenderId: defender.id,
            defenderName: defender.username,
            defenderColor: defender.color,
            targetTerritoryId: targetTerritory.id,
            territoryName: targetTerritory.name,
            isBaseTarget: wasBaseTarget,
            outcome: 'attacker_won',
            headline: 'Atac reușit',
            details: `${attacker.username} a cucerit teritoriul ${targetTerritory.name} de la ${defender.username} (+${SCORING.WAR_DUEL} pct)!`,
            effectBadge: `🚩 TERITORIU CUCERIT (+${SCORING.WAR_DUEL} PCT)`,
            expiresAt: Date.now() + 3400,
          };
          game.warRound.lastBattleResult = summary;
          game.gameLog.push({
            id: this.makeLogId(),
            text: `🚩 Atac reușit! ${summary.details}`,
            timestamp: Date.now(),
            type: 'conquest',
          });
        }
      } else if (battle.outcome === 'defender_won') {
        targetTerritory.defensiveBonus =
          (targetTerritory.defensiveBonus || 0) + SCORING.DEFENSIVE_BONUS;
        const summary: WarBattleResultSummary = {
          battleId: battle.battleId,
          attackerId: attacker.id,
          attackerName: attacker.username,
          attackerColor: attacker.color,
          defenderId: defender.id,
          defenderName: defender.username,
          defenderColor: defender.color,
          targetTerritoryId: targetTerritory.id,
          territoryName: targetTerritory.name,
          isBaseTarget: wasBaseTarget,
          outcome: 'defender_won',
          headline: 'Apărare reușită',
          details: `${defender.username} a apărat cu succes ${targetTerritory.name} în fața atacului lansat de ${attacker.username} (+${SCORING.DEFENSIVE_BONUS} pct bonus defensiv)!`,
          effectBadge: `🛡️ SCUT DEFENSIV (+${SCORING.DEFENSIVE_BONUS} PCT)`,
          expiresAt: Date.now() + 3400,
        };
        game.warRound.lastBattleResult = summary;
        game.gameLog.push({
          id: this.makeLogId(),
          text: `🛡️ Apărare reușită! ${summary.details}`,
          timestamp: Date.now(),
          type: 'battle',
        });
      } else {
        const summary: WarBattleResultSummary = {
          battleId: battle.battleId,
          attackerId: attacker.id,
          attackerName: attacker.username,
          attackerColor: attacker.color,
          defenderId: defender.id,
          defenderName: defender.username,
          defenderColor: defender.color,
          targetTerritoryId: targetTerritory.id,
          territoryName: targetTerritory.name,
          isBaseTarget: wasBaseTarget,
          outcome: 'draw_no_bonus',
          headline: 'Apărare reușită',
          details: `Niciun răspuns corect în duelul dintre ${attacker.username} și ${defender.username}: ${targetTerritory.name} rămâne la ${defender.username} (fără bonus).`,
          effectBadge: '🛡️ TERITORIU PĂSTRAT',
          expiresAt: Date.now() + 3400,
        };
        game.warRound.lastBattleResult = summary;
        game.gameLog.push({
          id: this.makeLogId(),
          text: `⚖️ Apărare reușită! ${summary.details}`,
          timestamp: Date.now(),
          type: 'battle',
        });
      }
    }

    this.recalculatePlayerScores(game);
    game.warRound.status = 'completed';
  }

  private startQuestion(
    game: GameState,
    question: Question,
    context: {
      targetTerritoryId?: string;
      attackerId: string;
      defenderId?: string;
      phaseContext: 'conquest' | 'allocation' | 'war';
      warActionType?: 'attack' | 'regenerate_tower';
      isTiebreak?: boolean;
      participantIds?: string[];
      warRoundId?: string;
    }
  ): void {
    const durationSeconds = 15;
    const startTime = Date.now();

    const defaultParticipants =
      context.participantIds && context.participantIds.length > 0
        ? context.participantIds
        : context.phaseContext === 'war'
        ? [context.attackerId, context.defenderId!].filter(Boolean)
        : game.players.filter((p) => !p.isEliminated).map((p) => p.id);

    this.clearSelectionTimer(game.roomId);
    game.currentQuestion = {
      questionInstanceId: `${question.id}_${startTime}`,
      question,
      startTime,
      durationSeconds,
      targetTerritoryId: context.targetTerritoryId,
      attackerId: context.attackerId,
      defenderId: context.defenderId,
      phaseContext: context.phaseContext,
      warActionType: context.warActionType,
      isTiebreak: context.isTiebreak,
      participantIds: defaultParticipants,
      warRoundId: context.warRoundId,
      winnerIds: [],
      playerAnswers: {},
      resolved: false,
    };

    if (game.warRound) {
      game.warRound.questionDeadline = startTime + durationSeconds * 1000;
    }

    this.notifyUpdate(game.roomId);

    // AI bot automatic answering
    this.scheduleAiAnswers(game);

    const existingTimer = this.questionTimers.get(game.roomId);
    if (existingTimer) clearTimeout(existingTimer);

    // Timeout: if time runs out, auto resolve question
    const timer = setTimeout(() => {
      this.resolveCurrentQuestion(game.roomId);
    }, durationSeconds * 1000);
    this.questionTimers.set(game.roomId, timer);
  }

  public submitAnswer(
    roomId: string,
    userId: string,
    answer: string | number,
    questionInstanceId?: string
  ): {
    success: boolean;
    message: string;
    code?:
      | 'ACCEPTED'
      | 'DUPLICATE'
      | 'EXPIRED'
      | 'STALE_INSTANCE'
      | 'INVALID_ANSWER'
      | 'NOT_PARTICIPANT'
      | 'NO_ACTIVE_QUESTION';
    acceptedAnswer?: number;
    questionId?: string;
    questionInstanceId?: string;
    startTime?: number;
  } {
    const game = this.games.get(roomId);
    if (!game || !game.currentQuestion || game.currentQuestion.resolved) {
      return {
        success: false,
        code: 'NO_ACTIVE_QUESTION',
        message: 'Nicio întrebare activă.',
      };
    }

    const cq = game.currentQuestion;
    if (
      questionInstanceId &&
      cq.questionInstanceId &&
      questionInstanceId !== cq.questionInstanceId
    ) {
      return {
        success: false,
        code: 'STALE_INSTANCE',
        message: 'Această întrebare s-a încheiat deja.',
      };
    }

    if (Date.now() >= cq.startTime + cq.durationSeconds * 1000 + 350) {
      this.resolveCurrentQuestion(roomId);
      return {
        success: false,
        code: 'EXPIRED',
        message: 'Timpul pentru răspuns a expirat.',
      };
    }
    const player = game.players.find((p) => p.id === userId);
    if (!player || player.isEliminated) {
      return {
        success: false,
        code: 'NOT_PARTICIPANT',
        message: 'Nu poți răspunde în această partidă.',
      };
    }

    const requiredPlayers =
      cq.participantIds && cq.participantIds.length > 0
        ? cq.participantIds
        : cq.phaseContext === 'war'
        ? [cq.attackerId, cq.defenderId!].filter(Boolean)
        : game.players.filter((p) => !p.isEliminated).map((p) => p.id);

    if (!requiredPlayers.includes(userId)) {
      return {
        success: false,
        code: 'NOT_PARTICIPANT',
        message: 'Nu participi la această întrebare.',
      };
    }

    // Strict duplicate check using hasOwnProperty so answer = 0 is properly guarded
    if (Object.prototype.hasOwnProperty.call(cq.playerAnswers, userId)) {
      return {
        success: false,
        code: 'DUPLICATE',
        message: 'Ai trimis deja răspunsul!',
      };
    }

    let numericValue: number;
    if (cq.question.type === 'choice') {
      const choice = Number(answer);
      const maxIndex = (cq.question.options?.length || 4) - 1;
      if (!Number.isInteger(choice) || choice < 0 || choice > maxIndex) {
        return {
          success: false,
          code: 'INVALID_ANSWER',
          message: 'Varianta de răspuns este invalidă.',
        };
      }
      numericValue = choice;
    } else {
      const raw = String(answer).trim().replace(',', '.');
      if (!/^-?\d+(\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) {
        return {
          success: false,
          code: 'INVALID_ANSWER',
          message: 'Introdu un număr valid.',
        };
      }
      numericValue = Number(raw);
    }

    const submitTime = Math.max(0, Date.now() - cq.startTime);
    cq.playerAnswers[userId] = { answer: numericValue, submitTime };

    const allSubmitted = requiredPlayers.every((id) =>
      Object.prototype.hasOwnProperty.call(cq.playerAnswers, id)
    );
    if (allSubmitted) {
      const qTimer = this.questionTimers.get(roomId);
      if (qTimer) {
        clearTimeout(qTimer);
        this.questionTimers.delete(roomId);
      }
      this.resolveCurrentQuestion(roomId);
    } else {
      this.notifyUpdate(roomId);
    }

    return {
      success: true,
      code: 'ACCEPTED',
      message: 'Răspuns înregistrat!',
      acceptedAnswer: numericValue,
      questionId: cq.question.id,
      questionInstanceId: cq.questionInstanceId,
      startTime: cq.startTime,
    };
  }

  private resolveCurrentQuestion(roomId: string): void {
    const game = this.games.get(roomId);
    if (!game || !game.currentQuestion || game.currentQuestion.resolved) return;

    const cq = game.currentQuestion;
    cq.resolved = true;
    const q = cq.question;

    const requiredPlayers =
      cq.participantIds && cq.participantIds.length > 0
        ? cq.participantIds
        : cq.phaseContext === 'war'
        ? [cq.attackerId, cq.defenderId!].filter(Boolean)
        : game.players.filter((p) => !p.isEliminated).map((p) => p.id);

    // Cancel any pending bot answers and question timers for this room
    const qTimer = this.questionTimers.get(roomId);
    if (qTimer) {
      clearTimeout(qTimer);
      this.questionTimers.delete(roomId);
    }
    const bTimers = this.botTimers.get(roomId);
    if (bTimers) {
      for (const t of bTimers) clearTimeout(t);
      this.botTimers.delete(roomId);
    }

    // ------------------------------------------
    // CASE 1: CONQUEST RESOLUTION (+200 pts)
    // ------------------------------------------
    if (cq.phaseContext === 'conquest') {
      const correctSubmissions: Array<{ player: Player; submitTime: number }> = [];
      for (const pid of requiredPlayers) {
        const p = game.players.find((x) => x.id === pid);
        if (!p || p.isEliminated) continue;
        const sub = cq.playerAnswers[p.id];

        if (!sub || sub.answer === null || sub.answer === undefined) {
          // Timeout: NO_RESPONSE — do NOT increment wrongAnswers!
          cq.playerAnswers[p.id] = {
            answer: null,
            submitTime: cq.durationSeconds * 1000,
            isCorrect: false,
            answerStatus: 'NO_RESPONSE',
          };
        } else if (Number(sub.answer) === q.correctAnswerIndex) {
          p.correctAnswers++;
          sub.isCorrect = true;
          sub.answerStatus = 'CORRECT';
          correctSubmissions.push({ player: p, submitTime: sub.submitTime });
        } else {
          p.wrongAnswers++;
          sub.isCorrect = false;
          sub.answerStatus = 'WRONG';
        }
      }

      // Order strictly by the fixed deterministic turn order for this round (NOT by submitTime)
      const roundTurnOrder = getRoundFixedTurnOrder(game, game.round);
      const orderedWinnerIds = orderConquestWinnersByFixedTurnOrder(
        correctSubmissions.map((c) => c.player.id),
        roundTurnOrder
      );
      const subByPlayerId = new Map(correctSubmissions.map((c) => [c.player.id, c]));
      const orderedSubmissions = orderedWinnerIds
        .map((pid) => subByPlayerId.get(pid))
        .filter((c): c is { player: Player; submitTime: number } => Boolean(c));

      orderedSubmissions.forEach((c, idx) => {
        if (cq.playerAnswers[c.player.id]) {
          cq.playerAnswers[c.player.id].rank = idx + 1;
        }
      });
      cq.winnerIds = orderedWinnerIds;

      if (orderedSubmissions.length === 0) {
        game.conquestStallRounds = (game.conquestStallRounds || 0) + 1;
        game.gameLog.push({
          id: this.makeLogId(),
          text: `❌ Niciun jucător nu a răspuns corect în această rundă de cucerire. Nicio zonă nu este alocată.`,
          timestamp: Date.now(),
          type: 'info',
        });
      } else {
        game.conquestStallRounds = 0;
        const names = orderedSubmissions
          .map((c, idx) => `#${idx + 1} ${c.player.username}`)
          .join(', ');
        game.gameLog.push({
          id: this.makeLogId(),
          text: `🎯 Răspuns corect! Ordinea fixă de cucerire în Runda ${game.round}: ${names} (+${SCORING.CONQUEST} pct).`,
          timestamp: Date.now(),
          type: 'conquest',
        });
      }

      this.notifyUpdate(roomId);

      const delayTimer = setTimeout(() => {
        game.currentQuestion = null;
        game.pendingTerritoryId = null;
        if (orderedSubmissions.length > 0) {
          game.conquestPickQueue = [...orderedWinnerIds];
          this.processNextConquestPick(game);
        } else {
          this.finishConquestRound(game);
        }
      }, 2800);

      const pending = this.botTimers.get(roomId) || [];
      pending.push(delayTimer);
      this.botTimers.set(roomId, pending);
      return;
    }

    // ------------------------------------------
    // CASE 2: ALLOCATION / DEPARTAJARE (+300 pts)
    // ------------------------------------------
    if (cq.phaseContext === 'allocation') {
      let rankings: Array<{
        playerId: string;
        answer: number;
        diff: number;
        submitTime: number;
        rank: number;
      }> = [];

      if (q.type === 'choice') {
        const correctEntries: Array<{ playerId: string; answer: number; submitTime: number }> = [];
        for (const pid of requiredPlayers) {
          const p = game.players.find((x) => x.id === pid);
          const sub = cq.playerAnswers[pid];
          if (!sub || sub.answer === null || sub.answer === undefined || isNaN(Number(sub.answer))) {
            cq.playerAnswers[pid] = {
              answer: null,
              submitTime: cq.durationSeconds * 1000,
              isCorrect: false,
              answerStatus: 'NO_RESPONSE',
            };
          } else {
            const val = Number(sub.answer);
            const isCorr = val === q.correctAnswerIndex;
            sub.isCorrect = isCorr;
            sub.answerStatus = isCorr ? 'CORRECT' : 'WRONG';
            sub.diff = isCorr ? 0 : 1;
            if (isCorr) {
              correctEntries.push({
                playerId: pid,
                answer: val,
                submitTime: sub.submitTime,
              });
            } else if (p) {
              p.wrongAnswers++;
            }
          }
        }
        correctEntries.sort((a, b) => a.submitTime - b.submitTime);
        rankings = correctEntries.map((entry, idx) => ({
          playerId: entry.playerId,
          answer: entry.answer,
          diff: 0,
          submitTime: entry.submitTime,
          rank: idx + 1,
        }));
        for (const r of rankings) {
          if (cq.playerAnswers[r.playerId]) {
            cq.playerAnswers[r.playerId].rank = r.rank;
          }
        }
      } else {
        const numericSubmissions: Record<string, { answer: number; submitTime: number }> = {};
        for (const pid of requiredPlayers) {
          const sub = cq.playerAnswers[pid];
          if (!sub || sub.answer === null || sub.answer === undefined || isNaN(Number(sub.answer))) {
            cq.playerAnswers[pid] = {
              answer: null,
              submitTime: cq.durationSeconds * 1000,
              isCorrect: false,
              answerStatus: 'NO_RESPONSE',
            };
          } else {
            const val = Number(sub.answer);
            numericSubmissions[pid] = {
              answer: val,
              submitTime: sub.submitTime,
            };
            sub.diff = Math.abs(val - (q.targetNumber || 0));
            sub.answerStatus = 'WRONG';
          }
        }
        const outcome = determineEstimationWinner(q.targetNumber || 0, numericSubmissions);
        rankings = outcome.rankings;
        for (const r of rankings) {
          if (cq.playerAnswers[r.playerId]) {
            cq.playerAnswers[r.playerId].rank = r.rank;
            cq.playerAnswers[r.playerId].diff = r.diff;
          }
        }
      }

      const activePlayerIds = game.players.filter((p) => !p.isEliminated).map((p) => p.id);
      const eligibility = selectEligibleAllocationWinner(
        rankings,
        activePlayerIds,
        game.territories
      );

      if (eligibility.winnerId) {
        game.allocationNoResponseRetries = 0;
        const winner = game.players.find((p) => p.id === eligibility.winnerId);
        if (winner) {
          winner.correctAnswers++;
          if (cq.playerAnswers[winner.id]) {
            cq.playerAnswers[winner.id].isCorrect = true;
            cq.playerAnswers[winner.id].answerStatus = 'CORRECT';
          }
          cq.winnerIds = [winner.id];
          game.allocationPickReady = false;
          game.allocationWinnerId = winner.id;
          game.activePlayerIndex = game.players.findIndex((p) => p.id === winner.id);

          if (eligibility.bypassedEnclavedIds.length > 0) {
            const bypassedNames = eligibility.bypassedEnclavedIds
              .map((id) => game.players.find((p) => p.id === id)?.username || id)
              .join(', ');
            game.gameLog.push({
              id: this.makeLogId(),
              text: `⚠️ ${bypassedNames} nu are niciun teritoriu liber învecinat. Dreptul de alegere trece la ${winner.username}!`,
              timestamp: Date.now(),
              type: 'info',
            });
          }

          const hasAdjacentNeutral =
            getLegalNeutralTargetsForPlayer(winner.id, game.territories).length > 0;
          game.gameLog.push({
            id: this.makeLogId(),
            text: hasAdjacentNeutral
              ? `🏆 ${winner.username} a câștigat departajarea (+${SCORING.ALLOCATION} pct) și are 15s să aleagă o zonă liberă învecinată!`
              : `🏆 ${winner.username} a câștigat departajarea (+${SCORING.ALLOCATION} pct)! Deoarece nu mai are zone libere adiacente, poate alege o zonă liberă rămasă pe hartă!`,
            timestamp: Date.now(),
            type: 'conquest',
          });

          this.notifyUpdate(roomId);

          const pickReadyTimer = setTimeout(() => {
            game.currentQuestion = null;
            game.pendingTerritoryId = null;
            game.allocationPickReady = true;
            this.startSelectionTimer(roomId);
            this.notifyUpdate(roomId);
            this.checkAiTurn(roomId);
          }, 2800);
          const pending = this.botTimers.get(roomId) || [];
          pending.push(pickReadyTimer);
          this.botTimers.set(roomId, pending);
          return;
        }
      } else {
        // Bounded retry policy when no player answered correctly (max 2 retries per territory)
        game.allocationNoResponseRetries = (game.allocationNoResponseRetries || 0) + 1;
        if (game.allocationNoResponseRetries <= 2) {
          game.gameLog.push({
            id: this.makeLogId(),
            text: `⏱️ Niciun jucător nu a răspuns corect la departajare (încercarea ${game.allocationNoResponseRetries}/2). Se repetă întrebarea pentru această zonă!`,
            timestamp: Date.now(),
            type: 'info',
          });
          this.notifyUpdate(roomId);
          const retryTimer = setTimeout(() => {
            game.currentQuestion = null;
            game.round = Math.max(0, game.round - 1);
            this.triggerNextAllocationQuestion(game);
          }, 2800);
          const pending = this.botTimers.get(roomId) || [];
          pending.push(retryTimer);
          this.botTimers.set(roomId, pending);
          return;
        } else {
          // Max retries reached: deterministically assign a legal neutral territory to the active player with fewest territories
          game.allocationNoResponseRetries = 0;
          const activeCandidates = game.players.filter((p) => !p.isEliminated);
          const withAdjacent = activeCandidates.filter(
            (p) => getLegalNeutralTargetsForPlayer(p.id, game.territories).length > 0
          );
          const pool = withAdjacent.length > 0 ? withAdjacent : activeCandidates;
          if (pool.length > 0) {
            const fallbackPlayer = [...pool].sort((a, b) => {
              if (a.territoriesCount !== b.territoriesCount)
                return a.territoriesCount - b.territoriesCount;
              return a.score - b.score;
            })[0];
            const legalIds = getLegalAllocationTargetsForPlayer(
              fallbackPlayer.id,
              game.territories
            );
            const targetNeutral = legalIds.length > 0 ? game.territories[legalIds[0]] : undefined;
            if (targetNeutral) {
              targetNeutral.ownerId = fallbackPlayer.id;
              targetNeutral.points = SCORING.ALLOCATION;
              targetNeutral.defensiveBonus = 0;
              this.recalculatePlayerScores(game);
              game.gameLog.push({
                id: this.makeLogId(),
                text: `⚖️ Lipsă repetată de răspuns: teritoriul ${targetNeutral.name} a fost alocat automat către ${fallbackPlayer.username} (+${SCORING.ALLOCATION} pct).`,
                timestamp: Date.now(),
                type: 'conquest',
              });
            }
          }
          this.notifyUpdate(roomId);
          const nextTimer = setTimeout(() => {
            game.currentQuestion = null;
            const remainingNeutrals = Object.values(game.territories).filter(
              (t) => t.ownerId === null
            ).length;
            if (remainingNeutrals > 0) {
              this.triggerNextAllocationQuestion(game);
            } else {
              this.enterWarPhase(game);
            }
          }, 2800);
          const pending = this.botTimers.get(roomId) || [];
          pending.push(nextTimer);
          this.botTimers.set(roomId, pending);
          return;
        }
      }
    }

    // ------------------------------------------
    // CASE 3: WAR DUEL RESOLUTION (+400 pts)
    // ------------------------------------------
    if (cq.phaseContext === 'war' && game.warRound) {
      for (const pid of requiredPlayers) {
        const p = game.players.find((x) => x.id === pid);
        const sub = cq.playerAnswers[pid];
        if (!sub || sub.answer === null || sub.answer === undefined) {
          cq.playerAnswers[pid] = {
            answer: null,
            submitTime: cq.durationSeconds * 1000,
            isCorrect: false,
            answerStatus: 'NO_RESPONSE',
          };
        } else if (q.type === 'choice') {
          const isCorr = Number(sub.answer) === q.correctAnswerIndex;
          sub.isCorrect = isCorr;
          sub.answerStatus = isCorr ? 'CORRECT' : 'WRONG';
          if (p) {
            if (isCorr) p.correctAnswers++;
            else p.wrongAnswers++;
          }
        } else if (q.type === 'estimation' && q.targetNumber !== undefined) {
          sub.diff = Math.abs(Number(sub.answer) - q.targetNumber);
          sub.answerStatus = 'WRONG';
        }
      }

      // Tower regeneration single-player question resolution
      if (cq.warActionType === 'regenerate_tower') {
        const attacker = game.players.find((p) => p.id === cq.attackerId);
        const battle = game.warRound.battles.find((b) => b.attackerId === cq.attackerId);
        const baseTerritory =
          (cq.targetTerritoryId ? game.territories[cq.targetTerritoryId] : undefined) ||
          Object.values(game.territories).find((t) => t.ownerId === cq.attackerId && t.isBase);
        const sub = cq.playerAnswers[cq.attackerId];
        const isSuccess = Boolean(sub && sub.isCorrect);

        if (isSuccess && baseTerritory && baseTerritory.ownerId === cq.attackerId && baseTerritory.isBase) {
          const prevTowers = baseTerritory.castleTowers ?? 2;
          baseTerritory.castleTowers = Math.min(3, prevTowers + 1);
          if (attacker) {
            attacker.castleTowers = baseTerritory.castleTowers;
          }
          cq.winnerIds = [cq.attackerId];
          if (battle) {
            battle.status = 'resolved';
            battle.outcome = 'attacker_won';
            battle.winnerId = cq.attackerId;
            battle.attackerChoiceCorrect = true;
          }
          this.recalculatePlayerScores(game);
          const remainingTowers = baseTerritory.castleTowers;
          const summary: WarBattleResultSummary = {
            battleId: battle?.battleId || `regen_${Date.now()}`,
            attackerId: cq.attackerId,
            attackerName: attacker?.username || 'Jucător',
            attackerColor: attacker?.color || '#f59e0b',
            defenderId: cq.attackerId,
            defenderName: attacker?.username || 'Jucător',
            defenderColor: attacker?.color || '#f59e0b',
            targetTerritoryId: baseTerritory.id,
            territoryName: baseTerritory.name,
            isBaseTarget: true,
            outcome: 'attacker_won',
            headline: `Turn regenerat — ${remainingTowers}/3 turnuri`,
            details: `${attacker?.username || 'Jucătorul'} a răspuns corect și a regenerat 1 turn în Cetatea ${baseTerritory.name} (${remainingTowers}/3 turnuri active)!`,
            effectBadge: `🏰 +1 TURN REGENERAT (${remainingTowers}/3)`,
            remainingTowers,
            maxTowers: 3,
            isTowerRegenerated: true,
            siegeContinues: false,
            expiresAt: Date.now() + 3200,
          };
          game.warRound.lastBattleResult = summary;
          game.warRound.status = 'completed';
          game.gameLog.push({
            id: this.makeLogId(),
            text: `🏰 Turn regenerat! ${summary.details}`,
            timestamp: Date.now(),
            type: 'conquest',
          });
        } else {
          cq.winnerIds = [];
          if (battle) {
            battle.status = 'resolved';
            battle.outcome = 'draw_no_bonus';
            battle.winnerId = null;
            battle.attackerChoiceCorrect = false;
          }
          this.recalculatePlayerScores(game);
          const currentTowers = baseTerritory?.castleTowers ?? attacker?.castleTowers ?? 2;
          const summary: WarBattleResultSummary = {
            battleId: battle?.battleId || `regen_${Date.now()}`,
            attackerId: cq.attackerId,
            attackerName: attacker?.username || 'Jucător',
            attackerColor: attacker?.color || '#f59e0b',
            defenderId: cq.attackerId,
            defenderName: attacker?.username || 'Jucător',
            defenderColor: attacker?.color || '#f59e0b',
            targetTerritoryId: baseTerritory?.id || '',
            territoryName: baseTerritory?.name || 'Cetate',
            isBaseTarget: true,
            outcome: 'draw_no_bonus',
            headline: `Regenerare eșuată — ${currentTowers}/3 turnuri`,
            details: `${attacker?.username || 'Jucătorul'} nu a răspuns corect. Cetatea ${baseTerritory?.name || ''} rămâne cu ${currentTowers}/3 turnuri.`,
            effectBadge: `🏰 ${currentTowers}/3 TURNURI (NESCHIMBAT)`,
            remainingTowers: currentTowers,
            maxTowers: 3,
            isTowerRegenerated: false,
            siegeContinues: false,
            expiresAt: Date.now() + 3200,
          };
          game.warRound.lastBattleResult = summary;
          game.warRound.status = 'completed';
          game.gameLog.push({
            id: this.makeLogId(),
            text: `❌ Regenerare eșuată! ${summary.details}`,
            timestamp: Date.now(),
            type: 'info',
          });
        }

        this.notifyUpdate(roomId);
        const advTimer = setTimeout(() => {
          this.advanceToNextWarTurnOrRound(game);
        }, 3000);
        this.setTurnAdvanceTimer(roomId, advTimer);
        return;
      }

      if (!cq.isTiebreak && q.type === 'choice') {
        const tiedBattles: WarBattleAssignment[] = [];
        const winnersSoFar: string[] = [];

        for (const battle of game.warRound.battles) {
          if (!battle.targetTerritoryId) continue;
          const res = evaluateWarBattleChoiceOutcome(
            battle.attackerId,
            battle.defenderId,
            cq.playerAnswers,
            q.correctAnswerIndex ?? 0
          );
          battle.attackerChoiceCorrect = res.attackerChoiceCorrect;
          battle.defenderChoiceCorrect = res.defenderChoiceCorrect;
          battle.attackerChoiceAnswer = res.attackerChoiceAnswer;
          battle.defenderChoiceAnswer = res.defenderChoiceAnswer;
          battle.outcome = res.outcome;
          battle.winnerId = res.winnerId;

          if (res.outcome === 'needs_tiebreak') {
            battle.status = 'numeric_tiebreak';
            tiedBattles.push(battle);
          } else {
            battle.status = 'resolved';
            if (res.winnerId && res.outcome !== 'draw_no_bonus') {
              winnersSoFar.push(res.winnerId);
            }
          }
        }

        cq.winnerIds = winnersSoFar;

        if (tiedBattles.length > 0) {
          const tiedNames = tiedBattles
            .map((b) => {
              const atk = game.players.find((p) => p.id === b.attackerId)?.username || 'Atacator';
              const def = game.players.find((p) => p.id === b.defenderId)?.username || 'Apărător';
              return `${atk} vs ${def}`;
            })
            .join(', ');

          game.gameLog.push({
            id: this.makeLogId(),
            text: `⚔️ Ambii jucători au răspuns corect în duelul (${tiedNames})! Se declanșează Întrebarea Numerică de Departajare (15s)!`,
            timestamp: Date.now(),
            type: 'battle',
          });

          this.notifyUpdate(roomId);

          const tiebreakQ =
            this.getRandomQuestion(game, 'estimation') || this.getRandomQuestion(game, 'choice');
          if (!tiebreakQ) {
            for (const b of tiedBattles) {
              b.outcome = 'draw_no_bonus';
              b.winnerId = b.defenderId;
              b.status = 'resolved';
            }
            this.applySimultaneousWarRoundOutcomes(game);
            this.notifyUpdate(roomId);
            this.schedulePostWarBattleStep(game);
            return;
          }

          const tieTimer = setTimeout(() => {
            this.launchWarTiebreakQuestion(game, tiedBattles, tiebreakQ);
          }, 2800);

          this.setTurnAdvanceTimer(roomId, tieTimer);
          return;
        }

        this.applySimultaneousWarRoundOutcomes(game);
        this.notifyUpdate(roomId);
        this.schedulePostWarBattleStep(game);
        return;
      } else {
        const winners: string[] = [];
        for (const battle of game.warRound.battles) {
          if (battle.outcome !== 'needs_tiebreak') {
            if (battle.winnerId && battle.outcome !== 'draw_no_bonus') {
              winners.push(battle.winnerId);
            }
            continue;
          }

          if (q.type === 'choice') {
            const atkSub = cq.playerAnswers[battle.attackerId];
            const defSub = cq.playerAnswers[battle.defenderId];
            const atkCorr = Boolean(
              atkSub && atkSub.answer !== null && Number(atkSub.answer) === q.correctAnswerIndex
            );
            const defCorr = Boolean(
              defSub && defSub.answer !== null && Number(defSub.answer) === q.correctAnswerIndex
            );
            const atkTime = atkSub?.submitTime ?? cq.durationSeconds * 1000;
            const defTime = defSub?.submitTime ?? cq.durationSeconds * 1000;

            battle.attackerSubmitTime = atkTime;
            battle.defenderSubmitTime = defTime;

            if (atkCorr && !defCorr) {
              battle.outcome = 'attacker_won';
              battle.winnerId = battle.attackerId;
            } else if (!atkCorr && defCorr) {
              battle.outcome = 'defender_won';
              battle.winnerId = battle.defenderId;
            } else if (atkCorr && defCorr) {
              if (atkTime <= defTime) {
                battle.outcome = 'attacker_won';
                battle.winnerId = battle.attackerId;
              } else {
                battle.outcome = 'defender_won';
                battle.winnerId = battle.defenderId;
              }
            } else {
              battle.outcome = 'draw_no_bonus';
              battle.winnerId = battle.defenderId;
            }
            battle.status = 'resolved';

            if (battle.outcome === 'attacker_won' || battle.outcome === 'defender_won') {
              winners.push(battle.winnerId!);
              if (cq.playerAnswers[battle.winnerId!]) {
                cq.playerAnswers[battle.winnerId!].rank = 1;
              }
            }
          } else {
            const res = evaluateWarBattleTiebreakOutcome(
              battle.attackerId,
              battle.defenderId,
              cq.playerAnswers,
              q.targetNumber ?? 0
            );
            battle.attackerNumericAnswer = res.attackerNumericAnswer;
            battle.defenderNumericAnswer = res.defenderNumericAnswer;
            battle.attackerNumericDiff = res.attackerNumericDiff;
            battle.defenderNumericDiff = res.defenderNumericDiff;
            battle.attackerSubmitTime = res.attackerSubmitTime;
            battle.defenderSubmitTime = res.defenderSubmitTime;
            battle.outcome = res.outcome;
            battle.winnerId = res.winnerId;
            battle.status = 'resolved';

            if (res.outcome === 'attacker_won' || res.outcome === 'defender_won') {
              winners.push(res.winnerId);
              const winPlayer = game.players.find((p) => p.id === res.winnerId);
              if (winPlayer) winPlayer.correctAnswers++;
              if (cq.playerAnswers[res.winnerId]) {
                cq.playerAnswers[res.winnerId].isCorrect = true;
                cq.playerAnswers[res.winnerId].answerStatus = 'CORRECT';
                cq.playerAnswers[res.winnerId].rank = 1;
              }
            }
          }
        }

        cq.winnerIds = winners;
        this.applySimultaneousWarRoundOutcomes(game);
        this.notifyUpdate(roomId);
        this.schedulePostWarBattleStep(game);
        return;
      }
    }
  }

  private launchWarTiebreakQuestion(
    game: GameState,
    tiedBattles: WarBattleAssignment[],
    tiebreakQ?: Question | null
  ): void {
    if (!game.warRound || tiedBattles.length === 0) return;
    const qToUse =
      tiebreakQ ||
      this.getRandomQuestion(game, 'estimation') ||
      this.getRandomQuestion(game, 'choice');
    if (!qToUse) return;
    const tiebreakParticipants = Array.from(
      new Set(tiedBattles.flatMap((b) => [b.attackerId, b.defenderId]).filter(Boolean))
    );
    game.warRound.status = 'numeric_tiebreak';
    this.startQuestion(game, qToUse, {
      targetTerritoryId: tiedBattles[0].targetTerritoryId || undefined,
      attackerId: tiedBattles[0].attackerId,
      defenderId: tiedBattles[0].defenderId,
      phaseContext: 'war',
      warActionType: 'attack',
      isTiebreak: true,
      participantIds: tiebreakParticipants,
      warRoundId: game.warRound.roundId,
    });
  }

  /**
   * Dacă atacatorul tocmai a distrus un turn al unei baze care mai are turnuri (`siegeContinues === true`),
   * continuă imediat asediul împotriva aceleiași baze cu următoarea întrebare.
   * Altfel, avansează la următorul jucător / rundă de război.
   */
  private schedulePostWarBattleStep(game: GameState): void {
    const roomId = game.roomId;
    const lastResult = game.warRound?.lastBattleResult;
    const battle = game.warRound?.battles[0];
    const targetTerritory =
      battle?.targetTerritoryId ? game.territories[battle.targetTerritoryId] : undefined;

    if (
      lastResult?.siegeContinues &&
      battle &&
      targetTerritory &&
      targetTerritory.isBase &&
      (targetTerritory.castleTowers ?? 0) > 0 &&
      targetTerritory.ownerId === battle.defenderId
    ) {
      const siegeTimer = setTimeout(() => {
        this.turnAdvanceTimers.delete(roomId);
        const currentGame = this.games.get(roomId);
        if (!currentGame || currentGame.phase !== 'war' || !currentGame.warRound) return;
        const currentBattle = currentGame.warRound.battles[0];
        const currentTarget =
          currentBattle?.targetTerritoryId
            ? currentGame.territories[currentBattle.targetTerritoryId]
            : undefined;
        if (
          !currentBattle ||
          !currentTarget ||
          !currentTarget.isBase ||
          (currentTarget.castleTowers ?? 0) <= 0 ||
          currentTarget.ownerId !== currentBattle.defenderId
        ) {
          this.advanceToNextWarTurnOrRound(currentGame);
          return;
        }

        currentBattle.status = 'choice_question';
        currentBattle.outcome = undefined;
        currentBattle.winnerId = null;
        delete currentBattle.attackerChoiceCorrect;
        delete currentBattle.defenderChoiceCorrect;
        delete currentBattle.attackerChoiceAnswer;
        delete currentBattle.defenderChoiceAnswer;
        delete currentBattle.attackerNumericAnswer;
        delete currentBattle.defenderNumericAnswer;
        delete currentBattle.attackerNumericDiff;
        delete currentBattle.defenderNumericDiff;
        delete currentBattle.attackerSubmitTime;
        delete currentBattle.defenderSubmitTime;

        currentGame.currentQuestion = null;
        currentGame.gameLog.push({
          id: this.makeLogId(),
          text: `🔥 Asediul continuă împotriva Cetății ${currentTarget.name} (${currentTarget.castleTowers}/3 turnuri rămase)! Următoarea întrebare de asediu începe acum!`,
          timestamp: Date.now(),
          type: 'battle',
        });

        this.launchSimultaneousWarChoiceQuestion(currentGame);
      }, 3000);

      this.setTurnAdvanceTimer(roomId, siegeTimer);
      return;
    }

    const advTimer = setTimeout(() => {
      this.turnAdvanceTimers.delete(roomId);
      this.advanceToNextWarTurnOrRound(game);
    }, 3200);
    this.setTurnAdvanceTimer(roomId, advTimer);
  }

  private advanceTurn(roomId: string): void {
    const game = this.games.get(roomId);
    if (!game) return;

    const adv = this.turnAdvanceTimers.get(roomId);
    if (adv) {
      clearTimeout(adv);
      this.turnAdvanceTimers.delete(roomId);
    }

    game.currentQuestion = null;
    game.pendingTerritoryId = null;

    const playersWithLand = game.players.filter((p) =>
      Object.values(game.territories).some((t) => t.ownerId === p.id)
    );

    if (
      game.phase !== 'base_selection' &&
      playersWithLand.length === 1 &&
      game.players.length > 1
    ) {
      this.endGame(game, playersWithLand[0]);
      return;
    }

    if (game.phase === 'war') {
      this.advanceToNextWarTurnOrRound(game);
      return;
    }

    if (game.phase === 'conquest') {
      const activeIds = game.players.filter((p) => !p.isEliminated).map((p) => p.id);
      const decision = shouldContinueConquestPhase(
        game.territories,
        activeIds,
        game.conquestStallRounds || 0
      );
      if (!decision.shouldContinue) {
        if (decision.nextPhase === 'allocation') {
          game.phase = 'allocation';
          game.round = 0;
          game.maxRounds = decision.neutralCount;
          game.unallocatedTerritoriesQueue = Object.values(game.territories)
            .filter((t) => t.ownerId === null)
            .map((t) => t.id);

          game.gameLog.push({
            id: this.makeLogId(),
            text: `⚖️ Au rămas ${decision.neutralCount} teritorii neocupate! Începe FAZA DE DEPARTAJARE (${SCORING.ALLOCATION} pct per teritoriu).`,
            timestamp: Date.now(),
            type: 'info',
          });

          this.triggerNextAllocationQuestion(game);
          return;
        } else {
          this.enterWarPhase(game);
          return;
        }
      }
    } else if (game.phase === 'allocation') {
      const neutralCount = Object.values(game.territories).filter((t) => t.ownerId === null).length;
      if (neutralCount > 0) {
        this.triggerNextAllocationQuestion(game);
        return;
      } else {
        this.enterWarPhase(game);
        return;
      }
    }

    const nextIndex = (game.activePlayerIndex + 1) % game.players.length;
    game.activePlayerIndex = nextIndex;
    this.startSelectionTimer(roomId);
    this.notifyUpdate(roomId);
    this.checkAiTurn(roomId);
  }

  public triggerNextConquestQuestion(game: GameState): void {
    if (game.phase !== 'conquest' || game.currentQuestion) return;
    const activeIds = game.players.filter((p) => !p.isEliminated).map((p) => p.id);
    const decision = shouldContinueConquestPhase(
      game.territories,
      activeIds,
      game.conquestStallRounds || 0
    );
    if (!decision.shouldContinue) {
      this.finishConquestRound(game);
      return;
    }

    if (game.round > game.maxRounds) {
      game.maxRounds = game.round;
    }

    if (!game.turnOrder || game.turnOrder.length === 0) {
      game.turnOrder = game.players.map((p) => p.id);
    }
    if (!game.conquestTurnSchedule || game.conquestTurnSchedule.length < game.maxRounds) {
      game.conquestTurnSchedule = buildConquestTurnSchedule(
        game.turnOrder,
        Math.max(8, game.maxRounds + 4)
      );
    }
    const roundOrderIds = getRoundFixedTurnOrder(game, game.round);
    const firstIdx = game.players.findIndex((p) => p.id === roundOrderIds[0]);
    if (firstIdx >= 0) {
      game.activePlayerIndex = firstIdx;
    }

    const roundOrderNames = roundOrderIds
      .map((id) => game.players.find((p) => p.id === id)?.username || id)
      .join(' → ');

    game.gameLog.push({
      id: this.makeLogId(),
      text: `📜 Cucerire - Runda ${game.round} (${decision.neutralCount} teritorii libere rămase) • Ordinea turei: ${roundOrderNames}.`,
      timestamp: Date.now(),
      type: 'info',
    });

    const q = this.getRandomQuestion(game, 'choice');
    if (!q) {
      this.finishForQuestionExhaustion(game, 'choice');
      return;
    }

    this.startQuestion(game, q, {
      phaseContext: 'conquest',
      attackerId: roundOrderIds[0] || game.players[0].id,
      participantIds: activeIds,
    });
  }

  private processNextConquestPick(game: GameState): void {
    const roomId = game.roomId;
    if (!game.conquestPickQueue || game.conquestPickQueue.length === 0) {
      this.finishConquestRound(game);
      return;
    }

    const neutralCount = Object.values(game.territories).filter((t) => t.ownerId === null).length;
    if (neutralCount === 0) {
      game.conquestPickQueue = [];
      this.finishConquestRound(game);
      return;
    }

    const nextPickerId = game.conquestPickQueue.shift()!;
    const picker = game.players.find((p) => p.id === nextPickerId);
    if (!picker || picker.isEliminated) {
      this.processNextConquestPick(game);
      return;
    }

    // Check if picker has any legal neutral targets (adjacent first, or any remaining neutral if boxed in)
    const validTargets = Object.values(game.territories).filter(
      (t) => canTargetTerritory(t.id, picker, game.territories, 'conquest').allowed
    );
    if (validTargets.length === 0) {
      game.gameLog.push({
        id: this.makeLogId(),
        text: `⚠️ ${picker.username} a răspuns corect, dar nu mai există teritorii libere pe hartă!`,
        timestamp: Date.now(),
        type: 'info',
      });
      this.notifyUpdate(roomId);
      this.processNextConquestPick(game);
      return;
    }

    const hasAdjacentNeutral =
      getLegalNeutralTargetsForPlayer(picker.id, game.territories).length > 0;
    game.activePlayerIndex = game.players.findIndex((p) => p.id === picker.id);
    game.conquestPickerId = picker.id;
    game.currentQuestion = null;
    game.pendingTerritoryId = null;

    game.gameLog.push({
      id: this.makeLogId(),
      text: hasAdjacentNeutral
        ? `🎯 ${picker.username} a răspuns corect! Are 15s să aleagă o zonă liberă învecinată (+${SCORING.CONQUEST} pct).`
        : `🎯 ${picker.username} a răspuns corect! Nu mai are vecini liberi, deci poate alege orice teritoriu liber rămas pe hartă (+${SCORING.CONQUEST} pct)!`,
      timestamp: Date.now(),
      type: 'info',
    });

    this.startSelectionTimer(roomId);
    this.notifyUpdate(roomId);
    this.checkAiTurn(roomId);
  }

  private finishConquestRound(game: GameState): void {
    const roomId = game.roomId;
    game.conquestPickerId = null;
    game.conquestPickQueue = [];

    const activeIds = game.players.filter((p) => !p.isEliminated).map((p) => p.id);
    const decision = shouldContinueConquestPhase(
      game.territories,
      activeIds,
      game.conquestStallRounds || 0
    );

    if (!decision.shouldContinue) {
      if (decision.nextPhase === 'allocation') {
        game.phase = 'allocation';
        game.round = 0;
        game.maxRounds = decision.neutralCount;
        game.unallocatedTerritoriesQueue = Object.values(game.territories)
          .filter((t) => t.ownerId === null)
          .map((t) => t.id);
        game.gameLog.push({
          id: this.makeLogId(),
          text: `⚖️ S-a încheiat faza de cucerire! Au rămas ${decision.neutralCount} teritorii libere. Începe FAZA DE DEPARTAJARE (${SCORING.ALLOCATION} pct per teritoriu)!`,
          timestamp: Date.now(),
          type: 'info',
        });
        this.notifyUpdate(roomId);
        const startAllocTimer = setTimeout(() => {
          this.turnAdvanceTimers.delete(roomId);
          this.triggerNextAllocationQuestion(game);
        }, 1800);
        this.setTurnAdvanceTimer(roomId, startAllocTimer);
      } else {
        this.enterWarPhase(game);
      }
    } else {
      game.round += 1;
      if (game.round > game.maxRounds) {
        game.maxRounds = game.round;
      }
      const nextConquestTimer = setTimeout(() => {
        this.turnAdvanceTimers.delete(roomId);
        this.triggerNextConquestQuestion(game);
      }, 1800);
      this.setTurnAdvanceTimer(roomId, nextConquestTimer);
    }
  }

  public triggerNextAllocationQuestion(game: GameState): void {
    if (game.phase !== 'allocation' || game.currentQuestion) return;
    game.round += 1;
    const neutralCount = Object.values(game.territories).filter((t) => t.ownerId === null).length;
    if (neutralCount === 0) {
      game.allocationWinnerId = null;
      game.allocationPickReady = false;
      game.pendingTerritoryId = null;
      this.enterWarPhase(game);
      return;
    }

    game.pendingTerritoryId = null;
    game.gameLog.push({
      id: this.makeLogId(),
      text: `⚖️ Departajare pentru unul dintre cele ${neutralCount} teritorii libere! Cel mai rapid răspuns corect eligibil câștigă teritoriul.`,
      timestamp: Date.now(),
      type: 'info',
    });

    const q = this.getRandomQuestion(game, 'choice');
    if (!q) {
      this.finishForQuestionExhaustion(game, 'choice');
      return;
    }
    const activeIds = game.players.filter((p) => !p.isEliminated).map((p) => p.id);
    this.startQuestion(game, q, {
      attackerId: game.players[0].id,
      phaseContext: 'allocation',
      participantIds: activeIds,
    });
  }

  private endGame(game: GameState, winner: Player): void {
    this.recalculatePlayerScores(game);
    game.phase = 'finished';
    game.winner = winner;

    this.clearRoomTimers(game.roomId);

    game.gameLog.push({
      id: this.makeLogId(),
      text: `🏆 VICTORIE GLORIOASĂ! ${winner.username} este Marele Învingător CONQUIZ cu ${winner.score} puncte!`,
      timestamp: Date.now(),
      type: 'conquest',
    });

    for (const p of game.players) {
      const user = db.findUserById(p.id);
      if (user) {
        const nextMatchesPlayed = (user.profile.matchesPlayed || 0) + 1;
        const nextWins = (user.profile.wins || 0) + (p.id === winner.id ? 1 : 0);
        const nextLosses = (user.profile.losses || 0) + (p.id === winner.id ? 0 : 1);
        const nextTerritories = (user.profile.territoriesConquered || 0) + p.territoriesCount;
        const nextCorrect = (user.profile.correctAnswersTotal || 0) + p.correctAnswers;
        const nextHighestScore = Math.max(user.profile.highestScore || 0, p.score);
        // Only update match counters; never overwrite rating, title, or manualRankOverride set by Admin!
        void db
          .updateUserProfile(user.id, {
            matchesPlayed: nextMatchesPlayed,
            wins: nextWins,
            losses: nextLosses,
            territoriesConquered: nextTerritories,
            correctAnswersTotal: nextCorrect,
            highestScore: nextHighestScore,
          })
          .catch((err) => {
            console.error('[GameEngine] Eroare la actualizarea profilului după meci:', err);
          });
      }
    }

    void db
      .recordGame({
        id: `game_${game.roomId}_${Date.now()}`,
        roomId: game.roomId,
        createdAt: new Date().toISOString(),
        durationSeconds: Math.max(60, (game.round || 1) * 60),
        playerCount: game.players.length,
        winnerId: winner.id,
        winnerUsername: winner.username,
        playersSummary: game.players.map((p) => ({
          userId: p.id,
          username: p.username,
          score: p.score,
          territories: p.territoriesCount,
          correctAnswers: p.correctAnswers,
          isWinner: p.id === winner.id,
        })),
      })
      .catch((err) => {
        console.error('[GameEngine] Eroare la salvarea rezultatului meciului:', err);
      });

    if (isPostgresConfigured()) {
      void deleteActiveGameSnapshotFromPostgres(game.roomId);
    }

    this.notifyUpdate(game.roomId);

    // If no human players remain connected in this room (e.g. human left an AI match), close and clean up the finished room immediately
    const connectedHumans = game.players.filter(
      (p) => !p.isAi && p.isConnected !== false && !p.hasLeftIntentionally
    );
    if (connectedHumans.length === 0) {
      this.closeAndCleanupRoom(game.roomId);
    }
  }

  private checkAiTurn(roomId: string): void {
    const game = this.games.get(roomId);
    if (!game || game.phase === 'finished' || game.currentQuestion) return;

    if (game.phase === 'war') {
      this.scheduleSimultaneousWarAiTargetSelections(game);
      return;
    }

    const activePlayer = game.players[game.activePlayerIndex];
    if (!activePlayer || !this.isBotControlled(activePlayer)) return;

    const timer = setTimeout(() => {
      this.playerBotTimers.delete(`${roomId}:${activePlayer.id}`);
      const currentGame = this.games.get(roomId);
      if (!currentGame) return;
      const currentActive = currentGame.players[currentGame.activePlayerIndex];
      if (!currentActive || currentActive.id !== activePlayer.id || !this.isBotControlled(currentActive)) {
        return;
      }
      this.executeAiTurn(roomId, currentActive);
    }, 1100 + Math.random() * 700);

    this.setPlayerBotTimer(roomId, activePlayer.id, timer);
  }

  private executeAiTurn(roomId: string, bot: Player): void {
    const game = this.games.get(roomId);
    if (!game || game.players[game.activePlayerIndex]?.id !== bot.id) return;
    if (!this.isBotControlled(bot)) return;

    if (game.phase === 'base_selection') {
      const validBases = Object.values(game.territories).filter((t) =>
        canCompleteBaseSelection(
          t.id,
          game.territories,
          game.players.length - game.activePlayerIndex - 1
        )
      );
      if (validBases.length > 0) {
        const choice = validBases[Math.floor(Math.random() * validBases.length)];
        this.selectTerritory(roomId, bot.id, choice.id);
      }
    } else if (game.phase === 'conquest' && game.conquestPickerId === bot.id) {
      const valid = Object.values(game.territories).filter(
        (t) => canTargetTerritory(t.id, bot, game.territories, 'conquest').allowed
      );
      if (valid.length > 0) {
        const choice = valid[Math.floor(Math.random() * valid.length)];
        this.selectTerritory(roomId, bot.id, choice.id);
      } else {
        game.conquestPickerId = null;
        this.processNextConquestPick(game);
      }
    } else if (game.phase === 'allocation' && game.allocationWinnerId === bot.id) {
      const legalNeutralIds = getLegalAllocationTargetsForPlayer(bot.id, game.territories);
      if (legalNeutralIds.length > 0) {
        const pickId = legalNeutralIds[Math.floor(Math.random() * legalNeutralIds.length)];
        this.selectTerritory(roomId, bot.id, pickId);
      } else {
        game.allocationWinnerId = null;
        game.allocationPickReady = false;
        this.triggerNextAllocationQuestion(game);
      }
    }
  }

  private scheduleAiAnswerForPlayer(game: GameState, player: Player): void {
    const cq = game.currentQuestion;
    if (!cq || cq.resolved) return;
    if (!this.isBotControlled(player)) return;
    if (Object.prototype.hasOwnProperty.call(cq.playerAnswers, player.id)) return;

    const participants =
      cq.participantIds && cq.participantIds.length > 0
        ? cq.participantIds
        : cq.phaseContext === 'war'
        ? [cq.attackerId, cq.defenderId!].filter(Boolean)
        : game.players.filter((p) => !p.isEliminated).map((p) => p.id);

    if (!participants.includes(player.id)) return;

    const q = cq.question;
    const difficulty = player.aiDifficulty || 'intermediar';
    let accuracy = 0.7;
    let delayMs = 2600 + Math.random() * 2000;

    if (difficulty === 'incepator') {
      accuracy = 0.5;
      delayMs = 3800 + Math.random() * 2200;
    } else if (difficulty === 'avansat') {
      accuracy = 0.85;
      delayMs = 1800 + Math.random() * 1400;
    } else if (difficulty === 'expert') {
      accuracy = 0.95;
      delayMs = 1100 + Math.random() * 1100;
    }

    const qInstanceId = cq.questionInstanceId;
    const timer = setTimeout(() => {
      this.playerBotTimers.delete(`${game.roomId}:${player.id}`);
      const currentGame = this.games.get(game.roomId);
      if (!currentGame || !currentGame.currentQuestion || currentGame.currentQuestion.resolved) {
        return;
      }
      if (
        qInstanceId &&
        currentGame.currentQuestion.questionInstanceId &&
        currentGame.currentQuestion.questionInstanceId !== qInstanceId
      ) {
        return;
      }
      const currentPlayer = currentGame.players.find((p) => p.id === player.id);
      if (!this.isBotControlled(currentPlayer)) return;
      if (Object.prototype.hasOwnProperty.call(currentGame.currentQuestion.playerAnswers, player.id)) {
        return;
      }

      let chosenAnswer: number | string = 0;
      if (q.type === 'choice') {
        const isCorrect = Math.random() < accuracy;
        if (isCorrect && q.correctAnswerIndex !== undefined) {
          chosenAnswer = q.correctAnswerIndex;
        } else {
          const wrongOptions = [0, 1, 2, 3].filter((idx) => idx !== q.correctAnswerIndex);
          chosenAnswer = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
        }
      } else if (q.type === 'estimation' && q.targetNumber !== undefined) {
        const variancePercent = (1 - accuracy) * 0.35;
        const factor = 1 + (Math.random() * variancePercent * 2 - variancePercent);
        chosenAnswer = Math.round(q.targetNumber * factor);
      }

      this.submitAnswer(game.roomId, player.id, chosenAnswer, qInstanceId);
    }, delayMs);

    this.setPlayerBotTimer(game.roomId, player.id, timer);
  }

  private scheduleAiAnswers(game: GameState): void {
    const cq = game.currentQuestion;
    if (!cq) return;

    const participants =
      cq.participantIds && cq.participantIds.length > 0
        ? cq.participantIds
        : cq.phaseContext === 'war'
        ? [cq.attackerId, cq.defenderId!].filter(Boolean)
        : game.players.filter((p) => !p.isEliminated).map((p) => p.id);

    for (const pid of participants) {
      const player = game.players.find((p) => p.id === pid);
      if (player && this.isBotControlled(player)) {
        this.scheduleAiAnswerForPlayer(game, player);
      }
    }
  }

  private clearRoomTimers(roomId: string): void {
    const timers = this.botTimers.get(roomId);
    if (timers) {
      for (const t of timers) clearTimeout(t);
      this.botTimers.delete(roomId);
    }
    for (const [key, timer] of this.playerBotTimers.entries()) {
      if (key.startsWith(`${roomId}:`)) {
        clearTimeout(timer);
        this.playerBotTimers.delete(key);
      }
    }
    const qTimer = this.questionTimers.get(roomId);
    if (qTimer) {
      clearTimeout(qTimer);
      this.questionTimers.delete(roomId);
    }
    const selTimer = this.selectionTimers.get(roomId);
    if (selTimer) {
      clearTimeout(selTimer);
      this.selectionTimers.delete(roomId);
    }
    const advTimer = this.turnAdvanceTimers.get(roomId);
    if (advTimer) {
      clearTimeout(advTimer);
      this.turnAdvanceTimers.delete(roomId);
    }
    this.clearEmptyRoomCleanupTimer(roomId);
  }

  public getActiveGamesCount(): number {
    let count = 0;
    for (const game of this.games.values()) {
      if (game.phase !== 'finished') count++;
    }
    return count;
  }

  public getAllActiveGames(): GameState[] {
    return Array.from(this.games.values()).filter((g) => g.phase !== 'finished');
  }

  public getAllRoomsForAdmin(): Array<{
    roomId: string;
    roomName: string;
    phase: GamePhase;
    isPrivate: boolean;
    round: number;
    maxRounds: number;
    playersCount: number;
    maxPlayers: number;
    humanPlayersCount: number;
    connectedHumansCount: number;
    disconnectedHumansCount: number;
    botTakeoverCount: number;
    aiBotsCount: number;
    players: Array<{
      id: string;
      username: string;
      isAi: boolean;
      isConnected: boolean;
      botControlled: boolean;
      score: number;
      territoriesCount: number;
    }>;
  }> {
    return Array.from(this.games.values()).map((g) => {
      const humans = g.players.filter((p) => !p.isAi);
      const connectedHumans = humans.filter((p) => p.isConnected !== false);
      const disconnectedHumans = humans.filter((p) => p.isConnected === false);
      const botTakeovers = humans.filter(
        (p) => (p.botControlled || p.isConnected === false) && g.phase !== 'waiting' && g.phase !== 'finished'
      );
      return {
        roomId: g.roomId,
        roomName: g.roomName,
        phase: g.phase,
        isPrivate: g.isPrivate,
        round: g.round,
        maxRounds: g.maxRounds,
        playersCount: g.players.length,
        maxPlayers: g.maxPlayers,
        humanPlayersCount: humans.length,
        connectedHumansCount: connectedHumans.length,
        disconnectedHumansCount: disconnectedHumans.length,
        botTakeoverCount: botTakeovers.length,
        aiBotsCount: g.players.filter((p) => p.isAi).length,
        players: g.players.map((p) => ({
          id: p.id,
          username: p.username,
          isAi: p.isAi,
          isConnected: p.isConnected !== false,
          botControlled: Boolean(!p.isAi && (p.botControlled || p.isConnected === false)),
          score: p.score,
          territoriesCount: p.territoriesCount,
        })),
      };
    });
  }

  public forceCloseRoom(roomId: string, adminReason = 'Închisă de administrator'): boolean {
    const game = this.games.get(roomId);
    if (!game) return false;
    this.clearRoomTimers(roomId);
    game.phase = 'finished';
    game.currentQuestion = null;
    game.gameLog.push({
      id: this.makeLogId(),
      text: `🛑 Camera a fost închisă de administrator (${adminReason}).`,
      timestamp: Date.now(),
      type: 'info',
    });
    this.notifyUpdate(roomId);
    this.games.delete(roomId);
    if (isPostgresConfigured()) {
      void deleteActiveGameSnapshotFromPostgres(roomId);
    }
    return true;
  }

  /**
   * Salvează neblocant snapshot-urile camerelor active în PostgreSQL (fără camerele terminate).
   */
  public async persistActiveSnapshotsNow(interrupted = false): Promise<void> {
    if (!isPostgresConfigured()) return;
    const activeGames = this.getAllActiveGames();
    await saveActiveGameSnapshotsToPostgres(activeGames, interrupted);
  }

  /**
   * Restaurează camerele active salvate în `active_game_snapshots` (PostgreSQL) înainte de oprirea serverului.
   * Evită camerele duplicate și păstrează strict timpul rămas din timere (nu acordă timp suplimentar).
   */
  public restoreGamesFromSnapshots(snapshots: GameState[]): number {
    let restoredCount = 0;
    const seenRoomIds = new Set<string>();

    for (const raw of snapshots) {
      if (!raw || !raw.roomId || raw.phase === 'finished') continue;
      if (seenRoomIds.has(raw.roomId) || this.games.has(raw.roomId)) continue;
      seenRoomIds.add(raw.roomId);

      const snapshot: GameState = JSON.parse(JSON.stringify(raw));
      const nowMs = Date.now();
      const referenceNowMs =
        typeof (snapshot as any).snapshotSavedAtMs === 'number' &&
        (snapshot as any).snapshotSavedAtMs > 0
          ? Number((snapshot as any).snapshotSavedAtMs)
          : nowMs;
      delete (snapshot as any).snapshotSavedAtMs;

      if (Array.isArray(snapshot.players)) {
        for (const p of snapshot.players) {
          if (!p.isAi) {
            p.isConnected = false;
            if (snapshot.phase !== 'waiting') {
              p.botControlled = true;
            }
          }
        }
      }
      snapshot.gameLog = Array.isArray(snapshot.gameLog) ? snapshot.gameLog : [];
      snapshot.gameLog.push({
        id: this.makeLogId(),
        text: '🔄 Partida a fost restaurată din snapshot-ul PostgreSQL după repornirea serverului.',
        timestamp: nowMs,
        type: 'info',
      });
      this.games.set(snapshot.roomId, snapshot);
      restoredCount++;

      // Re-arm active timers preserving remaining time (never granting extra time on restart)
      if (snapshot.currentQuestion && !snapshot.currentQuestion.resolved) {
        const totalDurationMs = (snapshot.currentQuestion.durationSeconds || 15) * 1000;
        const originalStartMs = Number(snapshot.currentQuestion.startTime) || referenceNowMs;
        const elapsedBeforeSaveMs = Math.max(0, referenceNowMs - originalStartMs);
        const remainingMs = Math.max(
          250,
          Math.min(totalDurationMs, totalDurationMs - elapsedBeforeSaveMs)
        );
        // Set startTime so that client remaining time calculation (startTime + durationSeconds*1000 - now) matches remainingMs
        snapshot.currentQuestion.startTime = nowMs - (totalDurationMs - remainingMs);

        const timer = setTimeout(() => {
          this.resolveCurrentQuestion(snapshot.roomId);
        }, remainingMs);
        this.questionTimers.set(snapshot.roomId, timer);
        this.scheduleAiAnswers(snapshot);
      } else if (snapshot.phase === 'war' && snapshot.warRound?.status === 'attack_preview') {
        const originalPreviewExpiresMs =
          Number(snapshot.warRound.attackPreviewExpiresAt) || referenceNowMs + 2800;
        const remainingPreviewMs = Math.max(
          250,
          Math.min(5000, originalPreviewExpiresMs - referenceNowMs)
        );
        this.beginWarAttackPreview(snapshot, remainingPreviewMs);
      } else if (
        snapshot.phase === 'base_selection' ||
        (snapshot.phase === 'conquest' && snapshot.conquestPickerId) ||
        (snapshot.phase === 'allocation' && snapshot.allocationPickReady && snapshot.allocationWinnerId) ||
        (snapshot.phase === 'war' && snapshot.warRound?.status === 'selecting_targets')
      ) {
        const originalExpiresAtMs = Number(snapshot.turnTimerExpiresAt) || referenceNowMs + 15000;
        const remainingSelectionMs = Math.max(
          250,
          Math.min(15000, originalExpiresAtMs - referenceNowMs)
        );
        this.startSelectionTimer(snapshot.roomId, remainingSelectionMs);
        this.checkAiTurn(snapshot.roomId);
      }
    }
    return restoredCount;
  }

  public shutdownAllRooms(): void {
    for (const roomId of this.games.keys()) {
      this.clearRoomTimers(roomId);
    }
    for (const timer of this.emptyRoomTimers.values()) {
      clearTimeout(timer);
    }
    this.emptyRoomTimers.clear();
    this.games.clear();
  }

  private notifyUpdate(roomId: string): void {
    const game = this.games.get(roomId);
    if (game && this.ioCallback) {
      this.ioCallback(roomId, 'game_state_update', this.getClientState(roomId));
    }
  }
}

export const gameManager = new GameManager();
