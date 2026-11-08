import {
  GameState,
  Player,
  Territory,
  Question,
  ActiveQuestionState,
  GamePhase,
} from '../src/types/game';
import { createMapForPlayerCount } from './romaniaMapData';
import { shuffleArray } from './questionsData';
import {
  canTargetTerritory,
  canSelectBase,
  canCompleteBaseSelection,
  isAdjacentToPlayer,
  resolveBattle,
  determineEstimationWinner,
  calculateConquestRounds,
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

  constructor() {
  }

  private makeLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  public setIoCallback(callback: (roomId: string, event: string, data: any) => void): void {
    this.ioCallback = callback;
  }

  public reloadQuestions(): void {
    // The question repository is read from the database on demand.
  }

  private getRandomQuestion(game: GameState, type?: 'choice' | 'estimation'): Question | null {
    const selectedCategories = game.selectedCategories || [];
    const usedIds = new Set(game.usedQuestionIds || []);
    const pool = db.getAllQuestions().filter(question =>
      (!selectedCategories.length || selectedCategories.includes(question.category)) &&
      (!type || question.type === type) && !usedIds.has(question.id)
    );
    if (!pool.length) return null;
    const source = pool[Math.floor(Math.random() * pool.length)];
    game.usedQuestionIds = [...(game.usedQuestionIds || []), source.id];
    const selected: Question = { ...source };
    if (source.type === 'choice' && Array.isArray(source.options)) {
      const indexed = source.options.map((value, index) => ({ value, index }));
      const shuffled = shuffleArray(indexed);
      selected.options = shuffled.map(item => item.value);
      selected.correctAnswerIndex = shuffled.findIndex(item => item.index === source.correctAnswerIndex);
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
      'istorie', 'geografie', 'biologie', 'fizica', 'chimie', 'matematica',
      'literatura', 'arta', 'sport', 'muzica', 'cinematografie',
      'cultura_generala', 'tehnologie', 'informatica',
    ]);
    const requestedCategories = options.selectedCategories || [];
    if (!Array.isArray(requestedCategories) || requestedCategories.some(category => !allowedCategories.has(category))) {
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

    const state: GameState = {
      roomId,
      roomName: options.roomName || `Meciul lui ${options.hostUser.username}`,
      isPrivate: !!options.isPrivate,
      maxPlayers,
      selectedCategories: selectedCategories as any,
      round: 1,
      maxRounds: 6,
      phase: 'waiting',
      players,
      activePlayerIndex: 0,
      territories: createMapForPlayerCount(players.length),
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
      allocationPickReady: false,
    };

    this.games.set(roomId, state);
    return state;
  }

  private createBotPlayer(colorIndex: number, difficulty: 'incepator' | 'intermediar' | 'avansat' | 'expert'): Player {
    const name = BOT_NAMES[colorIndex % BOT_NAMES.length];
    return {
      id: `bot_${colorIndex}_${Date.now()}`,
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

  public getPublicRooms(): Array<{ roomId: string; roomName: string; playersCount: number; maxPlayers: number; phase: GamePhase }> {
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

  public joinRoom(roomId: string, user: { id: string; username: string; avatar: string }): { success: boolean; message: string; game?: GameState } {
    const game = this.games.get(roomId);
    if (!game) return { success: false, message: 'Camera nu a fost găsită.' };

    const existing = game.players.find(p => p.id === user.id);
    if (existing) {
      existing.isConnected = true;
      this.notifyUpdate(roomId);
      return { success: true, message: 'Reconectat în cameră.', game: this.getClientState(roomId) };
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
    game.territories = createMapForPlayerCount(game.players.length);
    game.gameLog.push({ id: this.makeLogId(), text: `${user.username} s-a alăturat camerei.`, timestamp: Date.now(), type: 'info' });
    this.notifyUpdate(roomId);
    return { success: true, message: 'Te-ai alăturat cu succes!', game: this.getClientState(roomId) };
  }

  public leaveRoom(roomId: string, userId: string): void {
    const game = this.games.get(roomId);
    if (!game) return;
    const leavingPlayer = game.players.find(p => p.id === userId);
    if (!leavingPlayer) return;

    if (game.phase !== 'waiting' && game.phase !== 'finished') {
      // Keep the player record and owned territories stable during an active match.
      leavingPlayer.isConnected = false;
      game.gameLog.push({ id: this.makeLogId(), text: `${leavingPlayer.username} s-a deconectat. Poate reveni în partidă.`, timestamp: Date.now(), type: 'info' });
      this.notifyUpdate(roomId);
      return;
    }

    game.players = game.players.filter(p => p.id !== userId);
    if (game.players.length === 0) {
      this.clearRoomTimers(roomId);
      this.games.delete(roomId);
      return;
    }
    if (leavingPlayer.isHost) {
      const nextHuman = game.players.find(p => !p.isAi) || game.players[0];
      nextHuman.isHost = true;
    }
    if (game.phase === 'waiting') game.territories = createMapForPlayerCount(game.players.length);
    game.gameLog.push({ id: this.makeLogId(), text: `${leavingPlayer.username} a părăsit camera.`, timestamp: Date.now(), type: 'info' });
    this.notifyUpdate(roomId);
  }

  public addBot(roomId: string, requesterId: string, difficulty: 'incepator' | 'intermediar' | 'avansat' | 'expert' = 'intermediar'): boolean {
    const game = this.games.get(roomId);
    if (!game || game.phase !== 'waiting') return false;
    if (!game.players.some(p => p.id === requesterId && p.isHost && !p.isAi)) return false;
    if (game.players.length >= game.maxPlayers) return false;

    const bot = this.createBotPlayer(game.players.length, difficulty);
    game.players.push(bot);
    game.territories = createMapForPlayerCount(game.players.length);

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
    if (!game.players.some(p => p.id === requesterId && p.isHost && !p.isAi)) return false;
    if (!game.players.some(p => p.id === botId && p.isAi)) return false;

    const initialLen = game.players.length;
    game.players = game.players.filter(p => p.id !== botId);
    if (game.players.length !== initialLen) {
      game.territories = createMapForPlayerCount(game.players.length);
      this.notifyUpdate(roomId);
      return true;
    }
    return false;
  }

  public setReady(roomId: string, userId: string, isReady: boolean): boolean {
    const game = this.games.get(roomId);
    if (!game || game.phase !== 'waiting') return false;

    const p = game.players.find(x => x.id === userId);
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

    if (game.phase !== 'waiting') return { success: false, message: 'Partida a fost deja pornită.' };

    const caller = game.players.find(p => p.id === userId);
    if (!caller?.isHost) {
      return { success: false, message: 'Doar creatorul camerei poate porni jocul.' };
    }

    if (game.players.length < 2) {
      return { success: false, message: 'Sunt necesari cel puțin 2 jucători (sau adaugă un bot AI).' };
    }
    if (game.players.some(p => !p.isAi && !p.isReady)) {
      return { success: false, message: 'Toți jucătorii trebuie să fie gata înainte de începerea meciului.' };
    }
    const roomQuestions = db.getAllQuestions().filter(q => !game.selectedCategories?.length || game.selectedCategories.includes(q.category));
    if (!roomQuestions.some(q => q.type === 'estimation')) {
      return { success: false, message: 'Categoriile selectate nu conțin întrebări numerice pentru faza de împărțire și departajări.' };
    }
    if (!roomQuestions.some(q => q.type === 'choice')) {
      return { success: false, message: 'Categoriile selectate nu conțin întrebări grilă pentru cucerire și război.' };
    }

    // Set map according to player count and verify that enough spaced base positions exist.
    game.territories = createMapForPlayerCount(game.players.length);
    const possibleFirstBases = Object.values(game.territories).filter(t =>
      canCompleteBaseSelection(t.id, game.territories, game.players.length - 1)
    );
    if (!possibleFirstBases.length) {
      return { success: false, message: 'Harta nu permite amplasarea tuturor bazelor la distanța necesară. Verifică graful de vecinătate al hărții.' };
    }
    game.phase = 'base_selection';
    game.activePlayerIndex = 0;
    game.usedQuestionIds = [];
    game.allocationPickReady = false;
    game.round = 1;

    game.gameLog.push({
      id: this.makeLogId(),
      text: '⚔️ Jocul a început! Faza 1: Alegerea Bazei (1000 Puncte). Nicio bază nu poate fi lipită de alta!',
      timestamp: Date.now(),
      type: 'info',
    });

    this.startSelectionTimer(roomId);
    this.notifyUpdate(roomId);
    this.checkAiTurn(roomId);
    return { success: true, message: 'Jocul a pornit!' };
  }

  /**
   * Starts a 15-second selection timer for the current active player.
   * If they don't select a territory in 15 seconds, the server auto-selects a valid one.
   */
  private startSelectionTimer(roomId: string): void {
    const existing = this.selectionTimers.get(roomId);
    if (existing) clearTimeout(existing);

    const game = this.games.get(roomId);
    if (!game || game.phase === 'finished' || game.currentQuestion) return;

    game.turnTimeLimit = 15;
    game.turnTimerExpiresAt = Date.now() + 15000;

    const timer = setTimeout(() => {
      this.handleSelectionTimeout(roomId);
    }, 15000);
    this.selectionTimers.set(roomId, timer);
  }

  private handleSelectionTimeout(roomId: string): void {
    const game = this.games.get(roomId);
    if (!game || game.phase === 'finished' || game.currentQuestion) return;

    const activePlayer = game.players[game.activePlayerIndex];
    if (!activePlayer || activePlayer.isEliminated) { this.advanceTurn(roomId); return; }

    if (game.phase === 'allocation' && game.allocationWinnerId) {
      const neutralTerritories = Object.values(game.territories).filter(t => t.ownerId === null);
      if (neutralTerritories.length > 0) {
        const pick = neutralTerritories[Math.floor(Math.random() * neutralTerritories.length)];
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
      const picker = game.players.find(p => p.id === game.conquestPickerId);
      if (picker) {
        let valid = Object.values(game.territories).filter(t =>
          canTargetTerritory(t.id, picker, game.territories, 'conquest').allowed
        );
        if (valid.length === 0) {
          valid = Object.values(game.territories).filter(t => t.ownerId === null);
        }
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
        }
      }
    }

    // Find all valid selectable territories for current player
    const validTerritories = Object.values(game.territories).filter(t => {
      if (game.phase === 'base_selection') {
        return canCompleteBaseSelection(t.id, game.territories, game.players.length - game.activePlayerIndex - 1);
      }
      const check = canTargetTerritory(t.id, activePlayer, game.territories, game.phase as any);
      return check.allowed;
    });

    if (validTerritories.length > 0) {
      // Pick random valid territory
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
      game.gameLog.push({ id: this.makeLogId(), text: 'Partida a fost oprită: nu au mai rămas suficiente poziții valide pentru bazele tuturor jucătorilor.', timestamp: Date.now(), type: 'info' });
      this.clearRoomTimers(roomId);
      this.notifyUpdate(roomId);
    } else {
      // Advance turn if no valid territory is available.
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

  private finishForQuestionExhaustion(game: GameState, questionType: 'choice' | 'estimation'): void {
    game.phase = 'finished';
    game.currentQuestion = null;
    game.pendingTerritoryId = null;
    const eligible = game.players.filter(p => !p.isEliminated && Object.values(game.territories).some(t => t.ownerId === p.id));
    const winner = [...eligible].sort((a, b) => b.score - a.score)[0];
    game.gameLog.push({
      id: this.makeLogId(),
      text: `Partida s-a încheiat anticipat: s-au epuizat întrebările ${questionType === 'choice' ? 'grilă' : 'numerice'} nefolosite din categoriile selectate. Rezultatul se calculează pe baza punctajului actual.`,
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
  public selectTerritory(roomId: string, userId: string, territoryId: string): { success: boolean; message: string } {
    const game = this.games.get(roomId);
    if (!game) return { success: false, message: 'Jocul nu a fost găsit.' };

    const activePlayer = game.players[game.activePlayerIndex];
    if (!activePlayer || activePlayer.isEliminated) return { success: false, message: 'Jucătorul activ nu este disponibil.' };
    if (game.currentQuestion) return { success: false, message: 'Așteaptă rezolvarea întrebării curente.' };
    if (activePlayer.id !== userId) {
      return { success: false, message: 'Nu este rândul tău acum!' };
    }

    const territory = game.territories[territoryId];
    if (!territory) return { success: false, message: 'Teritoriul nu există.' };

    // ==========================================
    // 1. FAZA: ALEGEREA BAZEI (BASE SELECTION)
    // ==========================================
    if (game.phase === 'base_selection') {
      // Check buffer rule: Bases CANNOT be adjacent! Neighbors of existing bases are blocked!
      if (!canCompleteBaseSelection(territoryId, game.territories, game.players.length - game.activePlayerIndex - 1)) {
        return {
          success: false,
          message: 'Nu poți alege o bază lipită de baza altui jucător. Păstrează cel puțin o zonă de distanță!',
        };
      }

      this.clearSelectionTimer(roomId);
      // Assign Base (1000 points) with 3 Castle Towers
      territory.ownerId = activePlayer.id;
      territory.isBase = true;
      territory.castleTowers = 3;
      territory.defensiveBonus = 0;
      territory.points = SCORING.BASE; // 1000 points
      territory.basePlayerName = activePlayer.username;

      activePlayer.baseTerritoryId = territoryId;
      activePlayer.castleTowers = 3;
      activePlayer.defensiveBonus = 0;
      activePlayer.territoriesCount = 1;
      activePlayer.score += SCORING.BASE;

      game.gameLog.push({
        id: this.makeLogId(),
        text: `🏰 ${activePlayer.username} și-a stabilit Baza în ${territory.name}! (+${SCORING.BASE} pct)`,
        timestamp: Date.now(),
        type: 'conquest',
      });

      // Advance to next player for base selection
      const nextIndex = game.activePlayerIndex + 1;
      if (nextIndex < game.players.length) {
        game.activePlayerIndex = nextIndex;
        this.startSelectionTimer(roomId);
        this.notifyUpdate(roomId);
        this.checkAiTurn(roomId);
        return { success: true, message: 'Baza a fost aleasă!' };
      } else {
        // All players have chosen their base -> Transition to CONQUEST phase!
        game.phase = 'conquest';
        game.activePlayerIndex = 0;
        game.round = 1;
        game.maxRounds = calculateConquestRounds(Object.keys(game.territories).length, game.players.length);

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
        return { success: true, message: 'Faza de cucerire a început!' };
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
        const hasAdjacent = Object.values(game.territories).some(
          t => t.ownerId === null && isAdjacentToPlayer(t.id, activePlayer.id, game.territories)
        );
        if (hasAdjacent) {
          return { success: false, message: check.reason || 'Poți cuceri doar teritorii neutre adiacente stăpânirii tale!' };
        }
      }

      this.clearSelectionTimer(roomId);
      territory.ownerId = activePlayer.id;
      territory.points = SCORING.CONQUEST; // 200 pct
      activePlayer.territoriesCount++;
      activePlayer.score += SCORING.CONQUEST;
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
      }, 1000);
      return { success: true, message: 'Teritoriul a fost cucerit!' };
    }

    // ==========================================
    // 3. FAZA: DEPARTAJARE / ALOCARE (ALLOCATION)
    // ==========================================
    if (game.phase === 'allocation') {
      if (game.allocationWinnerId !== userId || !game.allocationPickReady) {
        return { success: false, message: 'Doar câștigătorul întrebării de departajare poate alege teritoriul!' };
      }
      if (territory.ownerId !== null) {
        return { success: false, message: 'Trebuie să alegi un teritoriu liber (neutru)!' };
      }

      this.clearSelectionTimer(roomId);
      territory.ownerId = activePlayer.id;
      territory.points = SCORING.ALLOCATION; // 300 pts
      territory.defensiveBonus = 0;
      activePlayer.territoriesCount++;
      activePlayer.score += SCORING.ALLOCATION;
      game.allocationWinnerId = null;
      game.allocationPickReady = false;

      game.gameLog.push({
        id: this.makeLogId(),
        text: `🚩 ${activePlayer.username} a ales ${territory.name}! Teritoriul îi aparține acum (+${SCORING.ALLOCATION} pct).`,
        timestamp: Date.now(),
        type: 'conquest',
      });

      this.notifyUpdate(roomId);

      // Check remaining neutrals
      const neutralCount = Object.values(game.territories).filter(t => t.ownerId === null).length;
      if (neutralCount > 0) {
        setTimeout(() => {
          this.triggerNextAllocationQuestion(game);
        }, 1500);
      } else {
        // Transition to War phase!
        game.phase = 'war';
        game.round = 1;
        game.maxRounds = 6;
        game.activePlayerIndex = 0;
        game.gameLog.push({
          id: this.makeLogId(),
          text: `⚔️ Harta României este complet cucerită! Începe FAZA DE RĂZBOI (${SCORING.WAR_DUEL} pct per duel între vecini)!`,
          timestamp: Date.now(),
          type: 'info',
        });
        this.startSelectionTimer(roomId);
        this.notifyUpdate(roomId);
        this.checkAiTurn(roomId);
      }
      return { success: true, message: 'Teritoriul a fost revendicat!' };
    }

    // ==========================================
    // 4. FAZA: RĂZBOI / ATAC (WAR)
    // ==========================================
    if (game.phase === 'war') {
      const check = canTargetTerritory(territoryId, activePlayer, game.territories, 'war');
      if (!check.allowed) {
        return { success: false, message: check.reason || 'Atac nepermis pe acest teritoriu!' };
      }

      const defenderId = territory.ownerId!;
      const defender = game.players.find(p => p.id === defenderId);
      if (!defender || defender.isEliminated) return { success: false, message: 'Apărătorul nu mai este activ.' };
      const q = this.getRandomQuestion(game);
      if (!q) {
        this.finishForQuestionExhaustion(game, 'choice');
        return { success: false, message: 'Partida s-a oprit: s-au epuizat întrebările grilă unice din categoriile selectate.' };
      }
      this.clearSelectionTimer(roomId);

      // Record non-neighbor base attack attempt
      const isDirectNeighbor = Object.values(game.territories).some(
        t => t.ownerId === activePlayer.id && territory.neighbors.includes(t.id)
      );
      if (territory.isBase && !isDirectNeighbor) {
        activePlayer.baseAttackAttemptsUsed[defenderId] = (activePlayer.baseAttackAttemptsUsed[defenderId] || 0) + 1;
      }

      game.pendingTerritoryId = territoryId;
      game.gameLog.push({
        id: this.makeLogId(),
        text: `⚔️ ${activePlayer.username} atacă teritoriul ${territory.name} stăpânit de ${defender?.username}! (Duel pentru ${SCORING.WAR_DUEL} pct)`,
        timestamp: Date.now(),
        type: 'battle',
      });

      this.startQuestion(game, q, {
        targetTerritoryId: territoryId,
        attackerId: activePlayer.id,
        defenderId: defenderId,
        phaseContext: 'war',
      });
      return { success: true, message: 'Bătălia a început!' };
    }

    return { success: false, message: 'Acțiune invalidă.' };
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
    }
  ): void {
    const durationSeconds = question.type === 'estimation' ? 10 : 12;

    this.clearSelectionTimer(game.roomId);
    game.currentQuestion = {
      question,
      startTime: Date.now(),
      durationSeconds,
      targetTerritoryId: context.targetTerritoryId,
      attackerId: context.attackerId,
      defenderId: context.defenderId,
      phaseContext: context.phaseContext,
      isTiebreak: context.isTiebreak,
      playerAnswers: {},
      resolved: false,
    };

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

  public submitAnswer(roomId: string, userId: string, answer: string | number): { success: boolean; message: string } {
    const game = this.games.get(roomId);
    if (!game || !game.currentQuestion || game.currentQuestion.resolved) {
      return { success: false, message: 'Nicio întrebare activă.' };
    }

    const cq = game.currentQuestion;
    if (Date.now() >= cq.startTime + cq.durationSeconds * 1000) {
      this.resolveCurrentQuestion(roomId);
      return { success: false, message: 'Timpul pentru răspuns a expirat.' };
    }
    const player = game.players.find(p => p.id === userId);
    if (!player || player.isEliminated) return { success: false, message: 'Nu poți răspunde în această partidă.' };
    if (cq.question.type === 'choice') {
      const choice = Number(answer);
      if (!Number.isInteger(choice) || choice < 0 || choice > 3) return { success: false, message: 'Varianta de răspuns este invalidă.' };
      answer = choice;
    } else {
      const raw = String(answer).trim().replace(',', '.');
      if (!/^-?\d+(\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) return { success: false, message: 'Introdu un număr valid.' };
      answer = Number(raw);
    }

    // Check if player is eligible to answer
    if (cq.phaseContext === 'war') {
      if (userId !== cq.attackerId && userId !== cq.defenderId) {
        return { success: false, message: 'Doar atacatorul și apărătorul răspund în acest duel.' };
      }
    }
    // In conquest and allocation, all active players answer simultaneously!

    if (cq.playerAnswers[userId]) {
      return { success: false, message: 'Ai trimis deja răspunsul!' };
    }

    const submitTime = Date.now() - cq.startTime;
    cq.playerAnswers[userId] = { answer, submitTime };

    // Check if all expected players submitted
    let requiredPlayers: string[] = [];
    if (cq.phaseContext === 'war') {
      requiredPlayers = [cq.attackerId!, cq.defenderId!].filter(Boolean);
    } else if (cq.phaseContext === 'conquest' || cq.phaseContext === 'allocation') {
      requiredPlayers = game.players.filter(p => !p.isEliminated).map(p => p.id);
    }

    const allSubmitted = requiredPlayers.every(id => cq.playerAnswers[id] !== undefined);
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

    return { success: true, message: 'Răspuns înregistrat!' };
  }

  private resolveCurrentQuestion(roomId: string): void {
    const game = this.games.get(roomId);
    if (!game || !game.currentQuestion || game.currentQuestion.resolved) return;

    const cq = game.currentQuestion;
    cq.resolved = true;
    const q = cq.question;
    const targetTerritory = game.territories[cq.targetTerritoryId!];
    const attacker = game.players.find(p => p.id === cq.attackerId);
    const defender = cq.defenderId ? game.players.find(p => p.id === cq.defenderId) : null;

    // ------------------------------------------
    // CASE 1: CONQUEST RESOLUTION (+200 pts)
    // ------------------------------------------
    if (cq.phaseContext === 'conquest') {
      const correctSubmissions: Array<{ player: Player; submitTime: number }> = [];
      for (const p of game.players) {
        if (p.isEliminated) continue;
        const sub = cq.playerAnswers[p.id];
        if (sub && Number(sub.answer) === q.correctAnswerIndex) {
          p.correctAnswers++;
          correctSubmissions.push({ player: p, submitTime: sub.submitTime });
        } else {
          p.wrongAnswers++;
        }
      }

      // Sort by submission time ascending (fastest answer gets first pick)
      correctSubmissions.sort((a, b) => a.submitTime - b.submitTime);

      if (correctSubmissions.length === 0) {
        game.gameLog.push({
          id: this.makeLogId(),
          text: `❌ Niciun jucător nu a răspuns corect în această rundă de cucerire. Nicio zonă nu este alocată.`,
          timestamp: Date.now(),
          type: 'info',
        });
      } else {
        const names = correctSubmissions
          .map(c => `${c.player.username} (${(c.submitTime / 1000).toFixed(1)}s)`)
          .join(', ');
        game.gameLog.push({
          id: this.makeLogId(),
          text: `🎯 Răspuns corect: ${names}! Fiecare are rândul să aleagă câte un teritoriu (+${SCORING.CONQUEST} pct).`,
          timestamp: Date.now(),
          type: 'conquest',
        });
      }

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

      this.notifyUpdate(roomId);

      const delayTimer = setTimeout(() => {
        game.currentQuestion = null;
        game.pendingTerritoryId = null;
        if (correctSubmissions.length > 0) {
          game.conquestPickQueue = correctSubmissions.map(c => c.player.id);
          this.processNextConquestPick(game);
        } else {
          this.finishConquestRound(game);
        }
      }, 2500);

      const pending = this.botTimers.get(roomId) || [];
      pending.push(delayTimer);
      this.botTimers.set(roomId, pending);
      return;
    }

    // ------------------------------------------
    // CASE 2: ALLOCATION / DEPARTAJARE (+300 pts)
    // ------------------------------------------
    else if (cq.phaseContext === 'allocation') {
      const numericSubmissions: Record<string, { answer: number; submitTime: number }> = {};
      for (const [pid, sub] of Object.entries(cq.playerAnswers)) {
        if (!isNaN(Number(sub.answer))) {
          numericSubmissions[pid] = {
            answer: Number(sub.answer),
            submitTime: sub.submitTime,
          };
        }
      }

      const outcome = determineEstimationWinner(q.targetNumber || 0, numericSubmissions);
      if (outcome.winnerId) {
        const winner = game.players.find(p => p.id === outcome.winnerId);
        if (winner) {
          winner.correctAnswers++;
          game.allocationPickReady = false;
          game.allocationWinnerId = winner.id;
          game.activePlayerIndex = game.players.findIndex(p => p.id === winner.id);

          game.gameLog.push({
            id: this.makeLogId(),
            text: `🏆 ${winner.username} a fost cel mai aproape la departajare (+${SCORING.ALLOCATION} pct) și are 15s să aleagă orice zonă liberă!`,
            timestamp: Date.now(),
            type: 'conquest',
          });

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

          this.notifyUpdate(roomId);

          const pickReadyTimer = setTimeout(() => {
            game.currentQuestion = null;
            game.pendingTerritoryId = null;
            game.allocationPickReady = true;
            this.startSelectionTimer(roomId);
            this.notifyUpdate(roomId);
            this.checkAiTurn(roomId);
          }, 2500);
          const pending = this.botTimers.get(roomId) || [];
          pending.push(pickReadyTimer);
          this.botTimers.set(roomId, pending);
          return;
        }
      }
    }

    // ------------------------------------------
    // CASE 3: WAR DUEL RESOLUTION (+400 pts)
    // ------------------------------------------
    else if (cq.phaseContext === 'war') {
      const attackerSub = cq.playerAnswers[cq.attackerId!];
      const defenderSub = defender ? cq.playerAnswers[defender.id] : undefined;

      let attackerCorrect = false;
      let defenderCorrect = false;

      if (q.type === 'choice') {
        attackerCorrect = attackerSub !== undefined && Number(attackerSub.answer) === q.correctAnswerIndex;
        defenderCorrect = defenderSub !== undefined && Number(defenderSub.answer) === q.correctAnswerIndex;

        // If both answered choice correctly and it wasn't already a tiebreak question, trigger tiebreak!
        if (attackerCorrect && defenderCorrect && !cq.isTiebreak) {
          game.gameLog.push({
            id: this.makeLogId(),
            text: `⚔️ Ambii războinici au răspuns corect! Se declanșează Întrebarea de Departajare (10s estimare numerică)!`,
            timestamp: Date.now(),
            type: 'battle',
          });

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

          this.notifyUpdate(roomId);

          const tiebreakQ = this.getRandomQuestion(game, 'estimation');
          if (!tiebreakQ) {
            // No unused numeric tiebreak question: do not fabricate a numeric response.
            if (defender) game.gameLog.push({ id: this.makeLogId(), text: 'Nu mai există întrebări numerice de departajare; apărătorul păstrează teritoriul.', timestamp: Date.now(), type: 'battle' });
            cq.resolved = true;
            const oldTimer = this.questionTimers.get(roomId);
            if (oldTimer) clearTimeout(oldTimer);
            this.questionTimers.delete(roomId);
            this.notifyUpdate(roomId);
            const timer = setTimeout(() => this.advanceTurn(roomId), 2500);
            this.turnAdvanceTimers.set(roomId, timer);
            return;
          }
          setTimeout(() => {
            this.startQuestion(game, tiebreakQ, {
              targetTerritoryId: cq.targetTerritoryId!,
              attackerId: cq.attackerId!,
              defenderId: cq.defenderId,
              phaseContext: 'war',
              isTiebreak: true,
            });
          }, 2000);
          return;
        }
      } else if (q.type === 'estimation' && q.targetNumber !== undefined) {
        const attDiff = attackerSub ? Math.abs(Number(attackerSub.answer) - q.targetNumber) : Infinity;
        const defDiff = defenderSub ? Math.abs(Number(defenderSub.answer) - q.targetNumber) : Infinity;
        if (!attackerSub && !defenderSub) {
          // No response from either participant: the defender keeps the land without a bonus.
          attackerCorrect = false;
          defenderCorrect = false;
        } else if (attDiff < defDiff) {
          attackerCorrect = true;
          defenderCorrect = false;
        } else if (defDiff < attDiff) {
          defenderCorrect = true;
          attackerCorrect = false;
        } else if ((attackerSub?.submitTime ?? Infinity) < (defenderSub?.submitTime ?? Infinity)) {
          attackerCorrect = true;
          defenderCorrect = false;
        } else if ((defenderSub?.submitTime ?? Infinity) < (attackerSub?.submitTime ?? Infinity)) {
          defenderCorrect = true;
          attackerCorrect = false;
        } else {
          // Perfect tie, including submission timestamp: defender keeps the territory, no bonus.
          attackerCorrect = false;
          defenderCorrect = false;
        }
      }

      if (attacker) {
        if (attackerCorrect) attacker.correctAnswers++;
        else attacker.wrongAnswers++;
      }
      if (defender) {
        if (defenderCorrect) defender.correctAnswers++;
        else defender.wrongAnswers++;
      }

      const battle = resolveBattle({
        targetTerritory,
        attackerCorrect,
        defenderCorrect,
        attackerTimeMs: attackerSub?.submitTime ?? 20000,
        defenderTimeMs: defenderSub?.submitTime ?? 20000,
      });

      if (battle.attackerWon && attacker && targetTerritory) {
        if (targetTerritory.isBase) {
          // Attacking castle: destroy 1 tower!
          targetTerritory.castleTowers = Math.max(0, (targetTerritory.castleTowers || 3) - 1);
          if (defender) defender.castleTowers = targetTerritory.castleTowers;
          attacker.score += SCORING.WAR_DUEL; // +400 pts

          if (targetTerritory.castleTowers > 0) {
            game.gameLog.push({
              id: this.makeLogId(),
              text: `🏰 TURN DOBORÂT! Castelul lui ${defender?.username} a pierdut 1 turn! Mai are ${targetTerritory.castleTowers}/3 turnuri în picioare. (${attacker.username} +400 pct)`,
              timestamp: Date.now(),
              type: 'battle',
            });
          } else {
            // All 3 towers destroyed: Castle falls! Defender eliminated!
            if (defender) {
              defender.isEliminated = true;
              defender.territoriesCount = 0;
              defender.score = Math.max(0, defender.score - targetTerritory.points - (targetTerritory.defensiveBonus || 0));
              defender.defensiveBonus = Math.max(0, (defender.defensiveBonus || 0) - (targetTerritory.defensiveBonus || 0));
            }
            targetTerritory.defensiveBonus = 0;
            targetTerritory.isBase = false;
            targetTerritory.ownerId = attacker.id;
            attacker.territoriesCount++;
            attacker.score += targetTerritory.points; // Base points (1000)

            game.gameLog.push({
              id: this.makeLogId(),
              text: `👑 CASTELUL LUI ${defender?.username} A FOST CUCERIT DEFINITIV! ${defender?.username} a fost eliminat, iar toate teritoriile sale trec la ${attacker.username}!`,
              timestamp: Date.now(),
              type: 'elimination',
            });

            // Transfer all defender's territories to attacker
            for (const t of Object.values(game.territories)) {
              if (t.ownerId === defender?.id) {
                const lostBonus = t.defensiveBonus || 0;
                if (defender) {
                  defender.score = Math.max(0, defender.score - t.points - lostBonus);
                  defender.defensiveBonus = Math.max(0, (defender.defensiveBonus || 0) - lostBonus);
                }
                t.defensiveBonus = 0;
                t.ownerId = attacker.id;
                attacker.territoriesCount++;
                attacker.score += t.points;
              }
            }
          }
        } else {
          // Regular territory conquered
          if (defender) {
            defender.score = Math.max(0, defender.score - targetTerritory.points - (targetTerritory.defensiveBonus || 0));
            defender.defensiveBonus = Math.max(0, (defender.defensiveBonus || 0) - (targetTerritory.defensiveBonus || 0));
          }
          targetTerritory.defensiveBonus = 0;

          targetTerritory.ownerId = attacker.id;
          targetTerritory.points = SCORING.WAR_DUEL; // 400 pts
          attacker.territoriesCount++;
          attacker.score += SCORING.WAR_DUEL;

          if (defender) {
            defender.territoriesCount = Math.max(0, defender.territoriesCount - 1);
          }

          game.gameLog.push({
            id: this.makeLogId(),
            text: `🚩 ${attacker.username} a învins în duel și a cucerit ${targetTerritory.name}! (+${SCORING.WAR_DUEL} pct)`,
            timestamp: Date.now(),
            type: 'conquest',
          });
        }
      } else if (!battle.attackerWon && defender) {
        if (battle.defensiveBonusAwarded > 0) {
          defender.score += SCORING.DEFENSIVE_BONUS;
          targetTerritory.defensiveBonus = (targetTerritory.defensiveBonus || 0) + SCORING.DEFENSIVE_BONUS;
          defender.defensiveBonus = (defender.defensiveBonus || 0) + SCORING.DEFENSIVE_BONUS;
          game.gameLog.push({
            id: this.makeLogId(),
            text: `🛡️ ${defender.username} a rezistat atacului (+${SCORING.DEFENSIVE_BONUS} bonus defensiv pentru ${targetTerritory.name})!`,
            timestamp: Date.now(),
            type: 'battle',
          });
        } else {
          game.gameLog.push({
            id: this.makeLogId(),
            text: battle.message,
            timestamp: Date.now(),
            type: 'battle',
          });
        }
      }
    }

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

    this.notifyUpdate(roomId);

    // Keep result visible for 3.5s review banner before advancing
    const existingAdv = this.turnAdvanceTimers.get(roomId);
    if (existingAdv) clearTimeout(existingAdv);

    const advTimer = setTimeout(() => {
      this.advanceTurn(roomId);
    }, 3500);
    this.turnAdvanceTimers.set(roomId, advTimer);
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

    // Check Victory Condition
    const playersWithLand = game.players.filter(p =>
      Object.values(game.territories).some(t => t.ownerId === p.id)
    );

    if (game.phase !== 'base_selection' && playersWithLand.length === 1 && game.players.length > 1) {
      this.endGame(game, playersWithLand[0]);
      return;
    }

    // ----------------------------------------------------
    // CHECK PHASE TRANSITIONS
    // ----------------------------------------------------
    if (game.phase === 'conquest') {
      const neutralCount = Object.values(game.territories).filter(t => t.ownerId === null).length;

      // If all conquest rounds finished or 0 neutrals left
      if (game.round >= game.maxRounds || neutralCount === 0) {
        if (neutralCount > 0) {
          // Neutral territories remain -> Enter DEPARTAJARE (Allocation) phase!
          game.phase = 'allocation';
          game.round = 0;
          game.maxRounds = neutralCount;
          game.unallocatedTerritoriesQueue = Object.values(game.territories)
            .filter(t => t.ownerId === null)
            .map(t => t.id);

          game.gameLog.push({
            id: this.makeLogId(),
            text: `⚖️ Au rămas ${neutralCount} teritorii neocupate! Începe FAZA DE DEPARTAJARE (${SCORING.ALLOCATION} pct per teritoriu prin estimare).`,
            timestamp: Date.now(),
            type: 'info',
          });

          this.triggerNextAllocationQuestion(game);
          return;
        } else {
          // No neutrals left -> Go directly to WAR phase!
          game.phase = 'war';
          game.round = 1;
          game.maxRounds = 6;
          game.gameLog.push({
            id: this.makeLogId(),
            text: `⚔️ Toate teritoriile au fost împărțite! Începe FAZA DE RĂZBOI (${SCORING.WAR_DUEL} pct per duel între vecini)!`,
            timestamp: Date.now(),
            type: 'info',
          });
        }
      }
    } else if (game.phase === 'allocation') {
      const neutralCount = Object.values(game.territories).filter(t => t.ownerId === null).length;
      if (neutralCount > 0) {
        // Trigger next allocation territory
        this.triggerNextAllocationQuestion(game);
        return;
      } else {
        // All allocated! Transition to WAR phase
        game.phase = 'war';
        game.round = 1;
        game.maxRounds = 6;
        game.gameLog.push({
          id: this.makeLogId(),
          text: `⚔️ Harta este complet ocupată! Începe FAZA DE RĂZBOI (${SCORING.WAR_DUEL} pct per victorie)!`,
          timestamp: Date.now(),
          type: 'info',
        });
      }
    }

    // Advance active player turn
    let nextIndex = (game.activePlayerIndex + 1) % game.players.length;

    // In war phase, skip eliminated players
    if (game.phase === 'war') {
      let attempts = 0;
      while (
        attempts < game.players.length &&
        (game.players[nextIndex].isEliminated || !Object.values(game.territories).some(t => t.ownerId === game.players[nextIndex].id))
      ) {
        nextIndex = (nextIndex + 1) % game.players.length;
        attempts++;
      }
    }

    if (nextIndex <= game.activePlayerIndex) {
      game.round++;
      if (game.phase === 'war' && game.round > game.maxRounds) {
        // Final round reached: highest score wins!
        const eligible = game.players.filter(p => !p.isEliminated && Object.values(game.territories).some(t => t.ownerId === p.id));
        const sorted = eligible.sort((a, b) => b.score - a.score);
        if (sorted[0]) this.endGame(game, sorted[0]);
        else this.endGame(game, game.players[0]);
        return;
      }
    }

    game.activePlayerIndex = nextIndex;
    this.startSelectionTimer(roomId);
    this.notifyUpdate(roomId);
    this.checkAiTurn(roomId);
  }

  public triggerNextConquestQuestion(game: GameState): void {
    if (game.phase !== 'conquest' || game.currentQuestion) return;
    const neutralCount = Object.values(game.territories).filter(t => t.ownerId === null).length;
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

    this.startQuestion(game, q, {
      phaseContext: 'conquest',
      attackerId: game.players[0].id,
    });
  }

  private processNextConquestPick(game: GameState): void {
    const roomId = game.roomId;
    if (!game.conquestPickQueue || game.conquestPickQueue.length === 0) {
      this.finishConquestRound(game);
      return;
    }

    const neutralCount = Object.values(game.territories).filter(t => t.ownerId === null).length;
    if (neutralCount === 0) {
      game.conquestPickQueue = [];
      this.finishConquestRound(game);
      return;
    }

    const nextPickerId = game.conquestPickQueue.shift()!;
    const picker = game.players.find(p => p.id === nextPickerId);
    if (!picker || picker.isEliminated) {
      this.processNextConquestPick(game);
      return;
    }

    game.activePlayerIndex = game.players.findIndex(p => p.id === picker.id);
    game.conquestPickerId = picker.id;
    game.currentQuestion = null;
    game.pendingTerritoryId = null;

    game.gameLog.push({
      id: this.makeLogId(),
      text: `🎯 ${picker.username} a răspuns corect! Are 15s să aleagă o zonă liberă (+${SCORING.CONQUEST} pct).`,
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

    const neutralCount = Object.values(game.territories).filter(t => t.ownerId === null).length;
    if (game.round > game.maxRounds || neutralCount === 0) {
      if (neutralCount > 0) {
        // Transition to ALLOCATION
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
        setTimeout(() => this.triggerNextAllocationQuestion(game), 2000);
      } else {
        // Transition to WAR
        game.phase = 'war';
        game.round = 1;
        game.maxRounds = 6;
        game.activePlayerIndex = 0;
        game.gameLog.push({
          id: this.makeLogId(),
          text: `⚔️ Harta României este complet cucerită! Începe FAZA DE RĂZBOI (${SCORING.WAR_DUEL} pct per duel între vecini)!`,
          timestamp: Date.now(),
          type: 'info',
        });
        this.startSelectionTimer(roomId);
        this.notifyUpdate(roomId);
        this.checkAiTurn(roomId);
      }
    } else {
      setTimeout(() => {
        this.triggerNextConquestQuestion(game);
      }, 2000);
    }
  }

  private triggerNextAllocationQuestion(game: GameState): void {
    if (game.phase !== 'allocation' || game.currentQuestion) return;
    game.round += 1;
    const neutralCount = Object.values(game.territories).filter(t => t.ownerId === null).length;
    if (neutralCount === 0) {
      game.phase = 'war';
      game.round = 1;
      game.maxRounds = 6;
      game.allocationWinnerId = null;
      game.allocationPickReady = false;
      game.pendingTerritoryId = null;
      game.activePlayerIndex = 0;
      this.startSelectionTimer(game.roomId);
      this.notifyUpdate(game.roomId);
      this.checkAiTurn(game.roomId);
      return;
    }

    // The numeric question contests the right to choose; it is not tied to a
    // preselected territory. The winner may click ANY remaining neutral area.
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
    this.startQuestion(game, q, {
      attackerId: game.players[0].id,
      phaseContext: 'allocation',
    });
  }

  private endGame(game: GameState, winner: Player): void {
    game.phase = 'finished';
    game.winner = winner;

    this.clearRoomTimers(game.roomId);

    game.gameLog.push({
      id: this.makeLogId(),
      text: `🏆 VICTORIE GLORIOASĂ! ${winner.username} este Marele Învingător CONQUIZ!`,
      timestamp: Date.now(),
      type: 'conquest',
    });

    // Update user stats
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

    const activePlayer = game.players[game.activePlayerIndex];
    if (!activePlayer || !activePlayer.isAi) return;

    const timer = setTimeout(() => {
      this.executeAiTurn(roomId, activePlayer);
    }, 1200 + Math.random() * 800);

    const timers = this.botTimers.get(roomId) || [];
    timers.push(timer);
    this.botTimers.set(roomId, timers);
  }

  private executeAiTurn(roomId: string, bot: Player): void {
    const game = this.games.get(roomId);
    if (!game || game.players[game.activePlayerIndex]?.id !== bot.id) return;

    if (game.phase === 'base_selection') {
      const validBases = Object.values(game.territories).filter(t => canCompleteBaseSelection(t.id, game.territories, game.players.length - game.activePlayerIndex - 1));
      if (validBases.length > 0) {
        const choice = validBases[Math.floor(Math.random() * validBases.length)];
        this.selectTerritory(roomId, bot.id, choice.id);
      }
    } else if (game.phase === 'conquest' && game.conquestPickerId === bot.id) {
      let valid = Object.values(game.territories).filter(t =>
        canTargetTerritory(t.id, bot, game.territories, 'conquest').allowed
      );
      if (valid.length === 0) {
        valid = Object.values(game.territories).filter(t => t.ownerId === null);
      }
      if (valid.length > 0) {
        const choice = valid[Math.floor(Math.random() * valid.length)];
        this.selectTerritory(roomId, bot.id, choice.id);
      }
    } else if (game.phase === 'allocation' && game.allocationWinnerId === bot.id) {
      const neutrals = Object.values(game.territories).filter(t => t.ownerId === null);
      if (neutrals.length > 0) {
        const choice = neutrals[Math.floor(Math.random() * neutrals.length)];
        this.selectTerritory(roomId, bot.id, choice.id);
      }
    } else if (game.phase === 'war') {
      const valid = Object.values(game.territories).filter(t =>
        canTargetTerritory(t.id, bot, game.territories, 'war').allowed
      );
      if (valid.length > 0) {
        const choice = valid[Math.floor(Math.random() * valid.length)];
        this.selectTerritory(roomId, bot.id, choice.id);
      } else {
        this.advanceTurn(roomId);
      }
    }
  }

  private scheduleAiAnswers(game: GameState): void {
    const cq = game.currentQuestion;
    if (!cq) return;

    const q = cq.question;
    let participants: string[] = [];
    if (cq.phaseContext === 'war') {
      participants = [cq.attackerId!, cq.defenderId!].filter(Boolean);
    } else if (cq.phaseContext === 'conquest' || cq.phaseContext === 'allocation') {
      participants = game.players.map(p => p.id);
    }

    for (const pid of participants) {
      const player = game.players.find(p => p.id === pid);
      if (player && player.isAi) {
        const difficulty = player.aiDifficulty || 'intermediar';
        let accuracy = 0.70;
        let delayMs = 3000 + Math.random() * 2000;

        if (difficulty === 'incepator') {
          accuracy = 0.50;
          delayMs = 4500 + Math.random() * 2500;
        } else if (difficulty === 'avansat') {
          accuracy = 0.85;
          delayMs = 2000 + Math.random() * 1500;
        } else if (difficulty === 'expert') {
          accuracy = 0.95;
          delayMs = 1200 + Math.random() * 1200;
        }

        const timer = setTimeout(() => {
          let chosenAnswer: number | string = 0;
          if (q.type === 'choice') {
            const isCorrect = Math.random() < accuracy;
            if (isCorrect && q.correctAnswerIndex !== undefined) {
              chosenAnswer = q.correctAnswerIndex;
            } else {
              const wrongOptions = [0, 1, 2, 3].filter(idx => idx !== q.correctAnswerIndex);
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

  private notifyUpdate(roomId: string): void {
    const game = this.games.get(roomId);
    if (game && this.ioCallback) {
      this.ioCallback(roomId, 'game_state_update', this.getClientState(roomId));
    }
  }
}

export const gameManager = new GameManager();
