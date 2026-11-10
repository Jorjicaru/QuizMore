import {
  GameState,
  Player,
  Territory,
  Question,
  ActiveQuestionState,
  GamePhase,
  WarBattleAssignment,
} from '../src/types/game';
import { createMapForPlayerCount, getMapMetadata } from './romaniaMapData';
import { shuffleArray } from './questionsData';
import {
  canTargetTerritory,
  canSelectBase,
  canCompleteBaseSelection,
  isAdjacentToPlayer,
  determineEstimationWinner,
  calculateConquestRounds,
  buildSimultaneousWarPairings,
  evaluateWarBattleChoiceOutcome,
  evaluateWarBattleTiebreakOutcome,
  getLegalWarTargetsForPair,
  SCORING,
} from '../src/game/rules';
import { db } from './db';

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
  private questionTimers: Map<string, NodeJS.Timeout> = new Map();
  private selectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private turnAdvanceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {}

  private makeLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
    const maxUnallocatedTerritories = Math.max(1, territoryCount - playerCount);
    const maxAllocationRetries = 4;
    return {
      requiredChoice: conquestRounds + warRounds,
      requiredEstimation: maxUnallocatedTerritories + warRounds + maxAllocationRetries,
      maxAllocationRetries,
    };
  }

  public getRandomQuestion(game: GameState, type?: 'choice' | 'estimation'): Question | null {
    const selectedCategories = game.selectedCategories || [];
    const usedIds = new Set(game.usedQuestionIds || []);
    const usedFacts = new Set(game.usedFactKeys || []);
    game.categoryUsageCounts = game.categoryUsageCounts || {};

    const allAvailable = db
      .getAllQuestions()
      .filter(
        (question) =>
          !question.isDisabled &&
          (!question.reviewStatus || question.reviewStatus === 'approved') &&
          (!type || question.type === type) &&
          !usedIds.has(question.id) &&
          (!question.factKey || !usedFacts.has(question.factKey))
      );

    // Strictly respect selectedCategories when the host selected specific categories
    const pool = allAvailable.filter(
      (question) =>
        !selectedCategories.length || selectedCategories.includes(question.category)
    );

    if (!pool.length) return null;

    // Category-balanced selection: prefer the allowed category with the lowest usage count in this match
    const availableCategories = Array.from(new Set(pool.map((q) => q.category)));
    let minUsage = Infinity;
    for (const cat of availableCategories) {
      const count = game.categoryUsageCounts[cat] || 0;
      if (count < minUsage) minUsage = count;
    }
    const leastUsedCategories = new Set(
      availableCategories.filter((cat) => (game.categoryUsageCounts![cat] || 0) === minUsage)
    );
    const balancedPool = pool.filter((q) => leastUsedCategories.has(q.category));
    const finalCandidates = balancedPool.length > 0 ? balancedPool : pool;

    const source = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
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

  public joinRoom(
    roomId: string,
    user: { id: string; username: string; avatar: string }
  ): { success: boolean; message: string; game?: GameState } {
    const game = this.games.get(roomId);
    if (!game) return { success: false, message: 'Camera nu a fost găsită.' };

    const existing = game.players.find((p) => p.id === user.id);
    if (existing) {
      existing.isConnected = true;
      this.notifyUpdate(roomId);
      return {
        success: true,
        message: 'Reconectat în cameră.',
        game: this.getClientState(roomId),
      };
    }

    if (game.phase !== 'waiting') {
      return { success: false, message: 'Jocul este deja în desfășurare.' };
    }
    if (game.players.length >= game.maxPlayers) {
      return { success: false, message: 'Camera este plină.' };
    }

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
      message: 'Te-ai alăturat cu succes!',
      game: this.getClientState(roomId),
    };
  }

  public leaveRoom(roomId: string, userId: string): void {
    const game = this.games.get(roomId);
    if (!game) return;
    const leavingPlayer = game.players.find((p) => p.id === userId);
    if (!leavingPlayer) return;

    if (game.phase !== 'waiting' && game.phase !== 'finished') {
      // Keep the player record and owned territories stable during an active match.
      leavingPlayer.isConnected = false;
      game.gameLog.push({
        id: this.makeLogId(),
        text: `${leavingPlayer.username} s-a deconectat. Poate reveni în partidă.`,
        timestamp: Date.now(),
        type: 'info',
      });
      this.notifyUpdate(roomId);
      return;
    }

    game.players = game.players.filter((p) => p.id !== userId);
    if (game.players.length === 0) {
      this.clearRoomTimers(roomId);
      this.games.delete(roomId);
      return;
    }
    if (leavingPlayer.isHost) {
      const nextHuman = game.players.find((p) => !p.isAi) || game.players[0];
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
    if (game.players.some((p) => !p.isAi && !p.isReady)) {
      return {
        success: false,
        message: 'Toți jucătorii trebuie să fie gata înainte de începerea meciului.',
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
          !q.isDisabled &&
          (!q.reviewStatus || q.reviewStatus === 'approved') &&
          (!game.selectedCategories?.length || game.selectedCategories.includes(q.category))
      );
    const availableChoice = roomQuestions.filter((q) => q.type === 'choice').length;
    const availableEstimation = roomQuestions.filter((q) => q.type === 'estimation').length;
    const uniqueRoomFactKeys = new Set(roomQuestions.map((q) => q.factKey || q.id)).size;

    if (availableEstimation === 0) {
      return {
        success: false,
        message:
          'Categoriile selectate nu conțin întrebări numerice pentru faza de împărțire și departajări.',
      };
    }
    if (availableChoice === 0) {
      return {
        success: false,
        message: 'Categoriile selectate nu conțin întrebări grilă pentru cucerire și război.',
      };
    }
    if (
      availableChoice < budget.requiredChoice ||
      availableEstimation < budget.requiredEstimation ||
      uniqueRoomFactKeys < budget.requiredChoice + budget.requiredEstimation
    ) {
      return {
        success: false,
        message: `Categoriile selectate au prea puține întrebări unice pentru o partidă de ${game.players.length} jucători (necesar: minim ${budget.requiredChoice} grilă și ${budget.requiredEstimation} numerice; disponibil: ${availableChoice} grilă și ${availableEstimation} numerice). Selectează mai multe categorii!`,
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
    game.usedQuestionIds = [];
    game.usedFactKeys = [];
    game.categoryUsageCounts = {};
    game.allocationNoResponseRetries = 0;
    for (const p of game.players) {
      p.attackBonusPoints = 0;
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
   * Starts a 15-second selection timer for the current phase.
   */
  private startSelectionTimer(roomId: string): void {
    const existing = this.selectionTimers.get(roomId);
    if (existing) clearTimeout(existing);

    const game = this.games.get(roomId);
    if (!game || game.phase === 'finished' || game.currentQuestion) return;

    game.turnTimeLimit = 15;
    game.turnTimerExpiresAt = Date.now() + 15000;
    if (game.phase === 'war' && game.warRound) {
      game.warRound.selectionDeadline = game.turnTimerExpiresAt;
    }

    const timer = setTimeout(() => {
      this.handleSelectionTimeout(roomId);
    }, 15000);
    this.selectionTimers.set(roomId, timer);
  }

  private handleSelectionTimeout(roomId: string): void {
    const game = this.games.get(roomId);
    if (!game || game.phase === 'finished' || game.currentQuestion) return;

    // SIMULTANEOUS WAR TARGET SELECTION TIMEOUT
    if (game.phase === 'war' && game.warRound && game.warRound.status === 'selecting_targets') {
      for (const battle of game.warRound.battles) {
        if (!battle.targetTerritoryId && battle.status !== 'skipped') {
          const validIds = getLegalWarTargetsForPair(
            battle.attackerId,
            battle.defenderId,
            game.territories
          );
          const atk = game.players.find((p) => p.id === battle.attackerId);
          if (validIds.length > 0) {
            const pickId = validIds[Math.floor(Math.random() * validIds.length)];
            battle.targetTerritoryId = pickId;
            battle.status = 'auto_selected';
            const tName = game.territories[pickId]?.name || pickId;
            game.gameLog.push({
              id: this.makeLogId(),
              text: `⏱️ Timpul a expirat pentru ${atk?.username || 'Atacator'}! S-a selectat automat ținta învecinată ${tName}.`,
              timestamp: Date.now(),
              type: 'battle',
            });
          } else {
            battle.status = 'skipped';
            battle.outcome = 'skipped';
            game.gameLog.push({
              id: this.makeLogId(),
              text: `⚖️ Duelul pentru ${atk?.username || 'Atacator'} a fost omis: nu există niciun teritoriu inamic direct învecinat.`,
              timestamp: Date.now(),
              type: 'info',
            });
          }
        }
      }
      this.launchSimultaneousWarChoiceQuestion(game);
      return;
    }

    const activePlayer = game.players[game.activePlayerIndex];
    if (!activePlayer || activePlayer.isEliminated) {
      this.advanceTurn(roomId);
      return;
    }

    if (game.phase === 'allocation' && game.allocationWinnerId) {
      const neutralTerritories = Object.values(game.territories).filter((t) => t.ownerId === null);
      if (neutralTerritories.length > 0) {
        const adjacentNeutrals = neutralTerritories.filter((t) =>
          isAdjacentToPlayer(t.id, game.allocationWinnerId!, game.territories)
        );
        const pool = adjacentNeutrals.length > 0 ? adjacentNeutrals : neutralTerritories;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        game.gameLog.push({
          id: this.makeLogId(),
          text: `⏱️ Timpul a expirat pentru ${activePlayer.username}! S-a selectat automat ${pick.name}.`,
          timestamp: Date.now(),
          type: 'info',
        });
        this.selectTerritory(roomId, game.allocationWinnerId, pick.id);
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
    if (game.currentQuestion)
      return { success: false, message: 'Așteaptă rezolvarea întrebării curente.' };

    const territory = game.territories[territoryId];
    if (!territory) return { success: false, message: 'Teritoriul nu există.' };

    // ==========================================
    // 4. FAZA: RĂZBOI SIMULTAN (WAR)
    // ==========================================
    if (game.phase === 'war') {
      if (!game.warRound || game.warRound.status !== 'selecting_targets') {
        return { success: false, message: 'Selecția țintelor de atac nu este activă acum.' };
      }

      const battle = game.warRound.battles.find((b) => b.attackerId === userId);
      if (!battle) {
        return {
          success: false,
          message: 'Nu ești atacator în această rundă de război! Ești în apărare sau în repaus.',
        };
      }
      if (battle.targetTerritoryId !== null) {
        return {
          success: false,
          message: 'Ținta de atac a fost deja aleasă pentru această rundă!',
        };
      }

      const attackerPlayer = game.players.find((p) => p.id === userId);
      const defenderPlayer = game.players.find((p) => p.id === battle.defenderId);
      if (!attackerPlayer || attackerPlayer.isEliminated) {
        return { success: false, message: 'Jucătorul atacator nu este disponibil.' };
      }
      if (!defenderPlayer || defenderPlayer.isEliminated) {
        return { success: false, message: 'Apărătorul desemnat nu mai este activ.' };
      }

      const check = canTargetTerritory(
        territoryId,
        attackerPlayer,
        game.territories,
        'war',
        battle.defenderId
      );
      if (!check.allowed) {
        return { success: false, message: check.reason || 'Atac nepermis pe acest teritoriu!' };
      }

      battle.targetTerritoryId = territoryId;
      battle.status = 'ready';
      game.pendingTerritoryId = territoryId;

      game.gameLog.push({
        id: this.makeLogId(),
        text: `⚔️ ${attackerPlayer.username} atacă teritoriul ${territory.name} stăpânit de ${defenderPlayer.username}!`,
        timestamp: Date.now(),
        type: 'battle',
      });

      const allSelected = game.warRound.battles.every(
        (b) => b.targetTerritoryId !== null || b.status === 'skipped'
      );
      if (allSelected) {
        this.launchSimultaneousWarChoiceQuestion(game);
      } else {
        // Set activePlayerIndex to the next attacker who still needs to pick a target
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
        message: `Ținta ${territory.name} a fost blocată pentru atac!`,
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
        game.activePlayerIndex = 0;
        game.round = 1;
        game.maxRounds = calculateConquestRounds(
          Object.keys(game.territories).length,
          game.players.length
        );

        game.gameLog.push({
          id: this.makeLogId(),
          text: `🚩 Toate bazele au fost întemeiate! Faza 1: CUCERIRE (${game.maxRounds} runde, ${SCORING.CONQUEST} puncte per teritoriu). Toată lumea răspunde în același timp la întrebări grilă!`,
          timestamp: Date.now(),
          type: 'info',
        });

        this.notifyUpdate(roomId);
        setTimeout(() => {
          this.triggerNextConquestQuestion(game);
        }, 1500);
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

      setTimeout(() => {
        this.processNextConquestPick(game);
      }, 900);
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
        setTimeout(() => {
          this.triggerNextAllocationQuestion(game);
        }, 1200);
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
    game.warRoleHistory = game.warRoleHistory || {};

    game.gameLog.push({
      id: this.makeLogId(),
      text: `⚔️ Harta României este complet ocupată! Începe FAZA DE RĂZBOI SIMULTAN (${SCORING.WAR_DUEL} pct per bătălie)!`,
      timestamp: Date.now(),
      type: 'info',
    });

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

    game.warRoleHistory = game.warRoleHistory || {};
    const pairing = buildSimultaneousWarPairings(
      activePlayers.map((p) => p.id),
      game.territories,
      game.round,
      game.warRoleHistory
    );

    // Record roles in history
    for (const pid of pairing.attackerIds) {
      game.warRoleHistory[pid] = [...(game.warRoleHistory[pid] || []), 'attacker'];
    }
    for (const pid of pairing.defenderIds) {
      game.warRoleHistory[pid] = [...(game.warRoleHistory[pid] || []), 'defender'];
    }
    for (const pid of pairing.byePlayerIds) {
      game.warRoleHistory[pid] = [...(game.warRoleHistory[pid] || []), 'bye'];
    }

    const battles: WarBattleAssignment[] = pairing.pairs.map((pair, idx) => ({
      battleId: `war_r${game.round}_b${idx + 1}`,
      attackerId: pair.attackerId,
      defenderId: pair.defenderId,
      targetTerritoryId: null,
      status: 'selecting_target',
    }));

    const deadline = Date.now() + 15000;
    game.warRound = {
      roundId: `war_round_${game.round}_${Date.now()}`,
      roundNumber: game.round,
      status: 'selecting_targets',
      attackerIds: pairing.attackerIds,
      defenderIds: pairing.defenderIds,
      byePlayerIds: pairing.byePlayerIds,
      battles,
      selectionDeadline: deadline,
      questionDeadline: null,
    };

    const firstAttackerIdx = game.players.findIndex((p) => p.id === pairing.attackerIds[0]);
    if (firstAttackerIdx >= 0) {
      game.activePlayerIndex = firstAttackerIdx;
    }

    const pairDescriptions = battles
      .map((b) => {
        const atk = game.players.find((p) => p.id === b.attackerId)?.username || b.attackerId;
        const def = game.players.find((p) => p.id === b.defenderId)?.username || b.defenderId;
        return `${atk} ⚔️ ${def}`;
      })
      .join(' | ');

    const byeNames = pairing.byePlayerIds
      .map((id) => game.players.find((p) => p.id === id)?.username || id)
      .join(', ');

    game.gameLog.push({
      id: this.makeLogId(),
      text: `⚔️ Război Runda ${game.round}/${game.maxRounds}: Dueluri simultane [${pairDescriptions}]${
        byeNames ? ` (Repaus/BYE: ${byeNames})` : ''
      }. Atacatorii au 15s să aleagă ținta!`,
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
      if (attacker && attacker.isAi && !battle.targetTerritoryId) {
        const timer = setTimeout(() => {
          const currentGame = this.games.get(roomId);
          if (
            !currentGame ||
            currentGame.phase !== 'war' ||
            !currentGame.warRound ||
            currentGame.warRound.status !== 'selecting_targets'
          ) {
            return;
          }
          const currentBattle = currentGame.warRound.battles.find(
            (b) => b.battleId === battle.battleId
          );
          if (!currentBattle || currentBattle.targetTerritoryId) return;

          const validIds = getLegalWarTargetsForPair(
            currentBattle.attackerId,
            currentBattle.defenderId,
            currentGame.territories
          );
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
              this.launchSimultaneousWarChoiceQuestion(currentGame);
            } else {
              this.notifyUpdate(roomId);
            }
          }
        }, 1100 + Math.random() * 1100);

        const timers = this.botTimers.get(roomId) || [];
        timers.push(timer);
        this.botTimers.set(roomId, timers);
      }
    }
  }

  private launchSimultaneousWarChoiceQuestion(game: GameState): void {
    if (!game.warRound) return;
    const roomId = game.roomId;
    this.clearSelectionTimer(roomId);

    const activeBattles = game.warRound.battles.filter((b) => b.targetTerritoryId !== null);
    if (activeBattles.length === 0) {
      game.round++;
      this.startSimultaneousWarRound(game);
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
      new Set(activeBattles.flatMap((b) => [b.attackerId, b.defenderId]))
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

      if (battle.outcome === 'attacker_won') {
        if (targetTerritory.isBase) {
          targetTerritory.castleTowers = Math.max(0, (targetTerritory.castleTowers ?? 3) - 1);
          defender.castleTowers = targetTerritory.castleTowers;

          if (targetTerritory.castleTowers > 0) {
            // Tower destroyed: award +400 pts to attacker via persistent attackBonusPoints so recalculatePlayerScores preserves it
            attacker.attackBonusPoints = (attacker.attackBonusPoints || 0) + SCORING.WAR_DUEL;
            attacker.score += SCORING.WAR_DUEL;
            game.gameLog.push({
              id: this.makeLogId(),
              text: `🏰 TURN DOBORÂT! Castelul lui ${defender.username} a pierdut 1 turn în fața lui ${attacker.username} (+${SCORING.WAR_DUEL} pct)! Mai are ${targetTerritory.castleTowers}/3 turnuri intacte.`,
              timestamp: Date.now(),
              type: 'battle',
            });
          } else {
            // All 3 towers destroyed: Defender eliminated & all territories transferred to attacker!
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

            game.gameLog.push({
              id: this.makeLogId(),
              text: `👑 CASTELUL LUI ${defender.username} A FOST CUCERIT DEFINITIV DE ${attacker.username}! Toate teritoriile sale au fost preluate!`,
              timestamp: Date.now(),
              type: 'elimination',
            });
          }
        } else {
          // Regular territory conquered: becomes worth 400 pts
          targetTerritory.ownerId = attacker.id;
          targetTerritory.points = SCORING.WAR_DUEL;
          targetTerritory.defensiveBonus = 0;

          // Check if defender lost their very last territory
          const remainingDefenderLand = Object.values(game.territories).filter(
            (t) => t.ownerId === defender.id
          ).length;
          if (remainingDefenderLand === 0) {
            defender.isEliminated = true;
          }

          game.gameLog.push({
            id: this.makeLogId(),
            text: `🚩 ${attacker.username} a învins pe ${defender.username} și a cucerit ${targetTerritory.name}! (${SCORING.WAR_DUEL} pct)`,
            timestamp: Date.now(),
            type: 'conquest',
          });
        }
      } else if (battle.outcome === 'defender_won') {
        targetTerritory.defensiveBonus =
          (targetTerritory.defensiveBonus || 0) + SCORING.DEFENSIVE_BONUS;
        game.gameLog.push({
          id: this.makeLogId(),
          text: `🛡️ ${defender.username} a apărat cu succes ${targetTerritory.name} în fața lui ${attacker.username} (+${SCORING.DEFENSIVE_BONUS} bonus defensiv)!`,
          timestamp: Date.now(),
          type: 'battle',
        });
      } else {
        // draw_no_bonus
        game.gameLog.push({
          id: this.makeLogId(),
          text: `⚖️ Niciun răspuns corect în duelul ${attacker.username} vs ${defender.username} pentru ${targetTerritory.name}. Teritoriul rămâne la apărător fără bonus.`,
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
      isTiebreak?: boolean;
      participantIds?: string[];
      warRoundId?: string;
    }
  ): void {
    const durationSeconds = question.type === 'estimation' ? 10 : 12;
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

      // Sort by submission time ascending (fastest answer gets first pick)
      correctSubmissions.sort((a, b) => a.submitTime - b.submitTime);
      correctSubmissions.forEach((c, idx) => {
        if (cq.playerAnswers[c.player.id]) {
          cq.playerAnswers[c.player.id].rank = idx + 1;
        }
      });
      cq.winnerIds = correctSubmissions.map((c) => c.player.id);

      if (correctSubmissions.length === 0) {
        game.gameLog.push({
          id: this.makeLogId(),
          text: `❌ Niciun jucător nu a răspuns corect în această rundă de cucerire. Nicio zonă nu este alocată.`,
          timestamp: Date.now(),
          type: 'info',
        });
      } else {
        const names = correctSubmissions
          .map((c) => `${c.player.username} (${(c.submitTime / 1000).toFixed(2)}s)`)
          .join(', ');
        game.gameLog.push({
          id: this.makeLogId(),
          text: `🎯 Răspuns corect: ${names}! Fiecare are rândul să aleagă câte un teritoriu învecinat (+${SCORING.CONQUEST} pct).`,
          timestamp: Date.now(),
          type: 'conquest',
        });
      }

      this.notifyUpdate(roomId);

      const delayTimer = setTimeout(() => {
        game.currentQuestion = null;
        game.pendingTerritoryId = null;
        if (correctSubmissions.length > 0) {
          game.conquestPickQueue = correctSubmissions.map((c) => c.player.id);
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
      for (const r of outcome.rankings) {
        if (cq.playerAnswers[r.playerId]) {
          cq.playerAnswers[r.playerId].rank = r.rank;
          cq.playerAnswers[r.playerId].diff = r.diff;
        }
      }

      if (outcome.winnerId) {
        game.allocationNoResponseRetries = 0;
        const winner = game.players.find((p) => p.id === outcome.winnerId);
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

          game.gameLog.push({
            id: this.makeLogId(),
            text: `🏆 ${winner.username} a fost cel mai aproape la departajare (+${SCORING.ALLOCATION} pct) și are 15s să aleagă o zonă liberă!`,
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
        // Bounded retry policy when no player answers the allocation question (max 2 retries per territory)
        game.allocationNoResponseRetries = (game.allocationNoResponseRetries || 0) + 1;
        if (game.allocationNoResponseRetries <= 2) {
          game.gameLog.push({
            id: this.makeLogId(),
            text: `⏱️ Niciun jucător nu a trimis un număr valid la departajare (încercarea ${game.allocationNoResponseRetries}/2). Se repetă întrebarea pentru această zonă!`,
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
          // Max retries reached: deterministically assign a neutral territory to the active player with fewest territories
          game.allocationNoResponseRetries = 0;
          const neutrals = Object.values(game.territories).filter((t) => t.ownerId === null);
          const activePlayers = game.players.filter((p) => !p.isEliminated);
          if (neutrals.length > 0 && activePlayers.length > 0) {
            const fallbackPlayer = [...activePlayers].sort((a, b) => {
              if (a.territoriesCount !== b.territoriesCount) return a.territoriesCount - b.territoriesCount;
              return a.score - b.score;
            })[0];
            const adj = neutrals.filter((t) => isAdjacentToPlayer(t.id, fallbackPlayer.id, game.territories));
            const targetNeutral = adj.length > 0 ? adj[0] : neutrals[0];
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
          this.notifyUpdate(roomId);
          const nextTimer = setTimeout(() => {
            game.currentQuestion = null;
            const remainingNeutrals = Object.values(game.territories).filter((t) => t.ownerId === null).length;
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
    // CASE 3: SIMULTANEOUS WAR RESOLUTION (+400 pts)
    // ------------------------------------------
    if (cq.phaseContext === 'war' && game.warRound) {
      // Mark NO_RESPONSE for participants who timed out
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

      if (!cq.isTiebreak && q.type === 'choice') {
        // Evaluate each simultaneous battle pair on the common choice question
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
            text: `⚔️ Egalitate la grilă în duelul (${tiedNames})! Se declanșează Întrebarea Numerică de Departajare (10s)!`,
            timestamp: Date.now(),
            type: 'battle',
          });

          this.notifyUpdate(roomId);

          const tiebreakQ = this.getRandomQuestion(game, 'estimation');
          if (!tiebreakQ) {
            for (const b of tiedBattles) {
              b.outcome = 'draw_no_bonus';
              b.winnerId = b.defenderId;
              b.status = 'resolved';
            }
            this.applySimultaneousWarRoundOutcomes(game);
            this.notifyUpdate(roomId);
            const advTimer = setTimeout(() => {
              game.round++;
              this.startSimultaneousWarRound(game);
            }, 3000);
            this.turnAdvanceTimers.set(roomId, advTimer);
            return;
          }

          const tiebreakParticipants = Array.from(
            new Set(tiedBattles.flatMap((b) => [b.attackerId, b.defenderId]))
          );

          const tieTimer = setTimeout(() => {
            if (!game.warRound) return;
            game.warRound.status = 'numeric_tiebreak';
            this.startQuestion(game, tiebreakQ, {
              targetTerritoryId: tiedBattles[0].targetTerritoryId || undefined,
              attackerId: tiedBattles[0].attackerId,
              defenderId: tiedBattles[0].defenderId,
              phaseContext: 'war',
              isTiebreak: true,
              participantIds: tiebreakParticipants,
              warRoundId: game.warRound.roundId,
            });
          }, 2800);

          this.turnAdvanceTimers.set(roomId, tieTimer);
          return;
        }

        // All battles decided at choice stage! Apply outcomes atomically.
        this.applySimultaneousWarRoundOutcomes(game);
        this.notifyUpdate(roomId);

        const advTimer = setTimeout(() => {
          game.round++;
          this.startSimultaneousWarRound(game);
        }, 3200);
        this.turnAdvanceTimers.set(roomId, advTimer);
        return;
      } else {
        // Tiebreak numeric question resolution for tied battles
        const winners: string[] = [];
        for (const battle of game.warRound.battles) {
          if (battle.outcome !== 'needs_tiebreak') {
            if (battle.winnerId && battle.outcome !== 'draw_no_bonus') {
              winners.push(battle.winnerId);
            }
            continue;
          }

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

        cq.winnerIds = winners;
        this.applySimultaneousWarRoundOutcomes(game);
        this.notifyUpdate(roomId);

        const advTimer = setTimeout(() => {
          game.round++;
          this.startSimultaneousWarRound(game);
        }, 3200);
        this.turnAdvanceTimers.set(roomId, advTimer);
        return;
      }
    }
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
      game.round++;
      this.startSimultaneousWarRound(game);
      return;
    }

    if (game.phase === 'conquest') {
      const neutralCount = Object.values(game.territories).filter((t) => t.ownerId === null).length;
      if (game.round >= game.maxRounds || neutralCount === 0) {
        if (neutralCount > 0) {
          game.phase = 'allocation';
          game.round = 0;
          game.maxRounds = neutralCount;
          game.unallocatedTerritoriesQueue = Object.values(game.territories)
            .filter((t) => t.ownerId === null)
            .map((t) => t.id);

          game.gameLog.push({
            id: this.makeLogId(),
            text: `⚖️ Au rămas ${neutralCount} teritorii neocupate! Începe FAZA DE DEPARTAJARE (${SCORING.ALLOCATION} pct per teritoriu prin estimare).`,
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
    const neutralCount = Object.values(game.territories).filter((t) => t.ownerId === null).length;
    if (neutralCount === 0 || game.round > game.maxRounds) {
      this.finishConquestRound(game);
      return;
    }

    game.gameLog.push({
      id: this.makeLogId(),
      text: `📜 Cucerire - Runda ${game.round}/${game.maxRounds}: Toată lumea răspunde în același timp la întrebare!`,
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
      phaseContext: 'conquest',
      attackerId: game.players[0].id,
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

    // Strict conquest adjacency check: does picker have at least 1 adjacent neutral territory?
    const adjacentNeutrals = Object.values(game.territories).filter(
      (t) => canTargetTerritory(t.id, picker, game.territories, 'conquest').allowed
    );
    if (adjacentNeutrals.length === 0) {
      game.gameLog.push({
        id: this.makeLogId(),
        text: `⚠️ ${picker.username} a răspuns corect, dar nu mai are teritorii libere învecinate disponibile!`,
        timestamp: Date.now(),
        type: 'info',
      });
      this.notifyUpdate(roomId);
      this.processNextConquestPick(game);
      return;
    }

    game.activePlayerIndex = game.players.findIndex((p) => p.id === picker.id);
    game.conquestPickerId = picker.id;
    game.currentQuestion = null;
    game.pendingTerritoryId = null;

    game.gameLog.push({
      id: this.makeLogId(),
      text: `🎯 ${picker.username} a răspuns corect! Are 15s să aleagă o zonă liberă învecinată (+${SCORING.CONQUEST} pct).`,
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
    game.round += 1;

    const neutralCount = Object.values(game.territories).filter((t) => t.ownerId === null).length;
    if (game.round > game.maxRounds || neutralCount === 0) {
      if (neutralCount > 0) {
        game.phase = 'allocation';
        game.round = 0;
        game.maxRounds = neutralCount;
        game.gameLog.push({
          id: this.makeLogId(),
          text: `⚖️ S-a încheiat faza de cucerire! Au rămas ${neutralCount} teritorii libere. Începe FAZA DE DEPARTAJARE (${SCORING.ALLOCATION} pct per teritoriu - întrebări numerice)!`,
          timestamp: Date.now(),
          type: 'info',
        });
        this.notifyUpdate(roomId);
        setTimeout(() => this.triggerNextAllocationQuestion(game), 1800);
      } else {
        this.enterWarPhase(game);
      }
    } else {
      setTimeout(() => {
        this.triggerNextConquestQuestion(game);
      }, 1800);
    }
  }

  private triggerNextAllocationQuestion(game: GameState): void {
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
      text: `⚖️ Departajare pentru unul dintre cele ${neutralCount} teritorii libere! Toți jucătorii răspund la aceeași întrebare numerică.`,
      timestamp: Date.now(),
      type: 'info',
    });

    const q = this.getRandomQuestion(game, 'estimation');
    if (!q) {
      this.finishForQuestionExhaustion(game, 'estimation');
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
        user.profile.matchesPlayed++;
        if (p.id === winner.id) user.profile.wins++;
        else user.profile.losses++;
        user.profile.territoriesConquered += p.territoriesCount;
        user.profile.correctAnswersTotal += p.correctAnswers;
        if (p.score > user.profile.highestScore) user.profile.highestScore = p.score;
        db.updateUserProfile(user.id, user.profile);
      }
    }

    this.notifyUpdate(game.roomId);
  }

  private checkAiTurn(roomId: string): void {
    const game = this.games.get(roomId);
    if (!game || game.phase === 'finished' || game.currentQuestion) return;

    if (game.phase === 'war') {
      this.scheduleSimultaneousWarAiTargetSelections(game);
      return;
    }

    const activePlayer = game.players[game.activePlayerIndex];
    if (!activePlayer || !activePlayer.isAi) return;

    const timer = setTimeout(() => {
      this.executeAiTurn(roomId, activePlayer);
    }, 1100 + Math.random() * 700);

    const timers = this.botTimers.get(roomId) || [];
    timers.push(timer);
    this.botTimers.set(roomId, timers);
  }

  private executeAiTurn(roomId: string, bot: Player): void {
    const game = this.games.get(roomId);
    if (!game || game.players[game.activePlayerIndex]?.id !== bot.id) return;

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
      const neutrals = Object.values(game.territories).filter((t) => t.ownerId === null);
      if (neutrals.length > 0) {
        const adjacentNeutrals = neutrals.filter((t) =>
          isAdjacentToPlayer(t.id, bot.id, game.territories)
        );
        const pool = adjacentNeutrals.length > 0 ? adjacentNeutrals : neutrals;
        const choice = pool[Math.floor(Math.random() * pool.length)];
        this.selectTerritory(roomId, bot.id, choice.id);
      }
    }
  }

  private scheduleAiAnswers(game: GameState): void {
    const cq = game.currentQuestion;
    if (!cq) return;

    const q = cq.question;
    const participants =
      cq.participantIds && cq.participantIds.length > 0
        ? cq.participantIds
        : cq.phaseContext === 'war'
        ? [cq.attackerId, cq.defenderId!].filter(Boolean)
        : game.players.filter((p) => !p.isEliminated).map((p) => p.id);

    for (const pid of participants) {
      const player = game.players.find((p) => p.id === pid);
      if (player && player.isAi) {
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

        const timer = setTimeout(() => {
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

          this.submitAnswer(game.roomId, player.id, chosenAnswer);
        }, delayMs);

        const timers = this.botTimers.get(game.roomId) || [];
        timers.push(timer);
        this.botTimers.set(game.roomId, timers);
      }
    }
  }

  private clearRoomTimers(roomId: string): void {
    const timers = this.botTimers.get(roomId);
    if (timers) {
      for (const t of timers) clearTimeout(t);
      this.botTimers.delete(roomId);
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

  public shutdownAllRooms(): void {
    for (const roomId of this.games.keys()) {
      this.clearRoomTimers(roomId);
    }
  }

  private notifyUpdate(roomId: string): void {
    const game = this.games.get(roomId);
    if (game && this.ioCallback) {
      this.ioCallback(roomId, 'game_state_update', this.getClientState(roomId));
    }
  }
}

export const gameManager = new GameManager();
