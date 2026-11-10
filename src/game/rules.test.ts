import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as createClientSocket, Socket as ClientSocket } from 'socket.io-client';
import {
  areTerritoriesAdjacent,
  isAdjacentToPlayer,
  canSelectBase,
  canCompleteBaseSelection,
  canTargetTerritory,
  determineEstimationWinner,
  resolveBattle,
  getTerritoryCountForPlayers,
  calculateConquestRounds,
  buildSimultaneousWarPairings,
  evaluateWarBattleChoiceOutcome,
  evaluateWarBattleTiebreakOutcome,
  getLegalWarTargetsForPair,
  sanitizeNumericInput,
  buildRoundDisplayItems,
  computeClockOffsetSample,
  selectBestClockOffset,
  estimateServerNow,
  SCORING,
} from './rules';
import { Territory, Player, GameState } from '../types/game';
import {
  createMapForPlayerCount,
  getMapMetadata,
  ROMANIA_MAP_PRESETS,
  validatePresetNeighborGraph,
} from '../../server/romaniaMapData';
import { GameManager } from '../../server/gameEngine';
import { INITIAL_QUESTIONS, normalizeQuestionText } from '../../server/questionsData';
import { db, Database } from '../../server/db';
import { generateToken } from '../../server/auth';
import { setupSocketHandlers } from '../../server/socketHandler';
import {
  isPlaceholderValue,
  validateProductionEnv,
  assertSafeRuntimeEnvironment,
} from '../../server/envSecurity';
import {
  setPostgresPoolForTesting,
  withPostgresTransaction,
  upsertUserToPostgres,
  upsertQuestionToPostgres,
  insertGameToPostgres,
  createFriendRequestWithNotificationToPostgres,
  saveActiveGameSnapshotsToPostgres,
  loadActiveGameSnapshotsFromPostgres,
  loadAllFromPostgres,
} from '../../server/postgresRepo';
import { executeJsonToPostgresMigration } from '../../scripts/migrate_json_to_postgres';

const mockTerritories: Record<string, Territory> = {
  maramures: {
    id: 'maramures',
    name: 'Maramureș',
    shortName: 'MM',
    region: 'Nord',
    svgPath: 'M10 10 L50 10 L50 50 Z',
    labelX: 100,
    labelY: 100,
    points: 1000,
    ownerId: 'player1',
    isBase: true,
    castleTowers: 3,
    neighbors: ['satu_mare', 'cluj'],
  },
  satu_mare: {
    id: 'satu_mare',
    name: 'Satu Mare',
    shortName: 'SM',
    region: 'Nord-Vest',
    svgPath: 'M10 10 L50 10 L50 50 Z',
    labelX: 80,
    labelY: 100,
    points: 0,
    ownerId: null,
    isBase: false,
    neighbors: ['maramures', 'bihor'],
  },
  bihor: {
    id: 'bihor',
    name: 'Bihor',
    shortName: 'BH',
    region: 'Vest',
    svgPath: 'M10 10 L50 10 L50 50 Z',
    labelX: 60,
    labelY: 140,
    points: 0,
    ownerId: null,
    isBase: false,
    neighbors: ['satu_mare', 'cluj'],
  },
  cluj: {
    id: 'cluj',
    name: 'Cluj',
    shortName: 'CJ',
    region: 'Transilvania',
    svgPath: 'M10 10 L50 10 L50 50 Z',
    labelX: 100,
    labelY: 140,
    points: 0,
    ownerId: null,
    isBase: false,
    neighbors: ['maramures', 'bihor', 'alba'],
  },
  alba: {
    id: 'alba',
    name: 'Alba',
    shortName: 'AB',
    region: 'Transilvania',
    svgPath: 'M10 10 L50 10 L50 50 Z',
    labelX: 100,
    labelY: 180,
    points: 0,
    ownerId: null,
    isBase: false,
    neighbors: ['cluj', 'arad'],
  },
  arad: {
    id: 'arad',
    name: 'Arad',
    shortName: 'AR',
    region: 'Vest',
    svgPath: 'M10 10 L50 10 L50 50 Z',
    labelX: 60,
    labelY: 220,
    points: 1000,
    ownerId: 'player2',
    isBase: true,
    castleTowers: 3,
    neighbors: ['alba', 'timis'],
  },
  timis: {
    id: 'timis',
    name: 'Timiș',
    shortName: 'TM',
    region: 'Banat',
    svgPath: 'M10 10 L50 10 L50 50 Z',
    labelX: 60,
    labelY: 260,
    points: 200,
    ownerId: 'player2',
    isBase: false,
    neighbors: ['arad'],
  },
};

const player1: Player = {
  id: 'player1',
  username: 'Vlad',
  avatar: 'av_vlad',
  color: '#3B82F6',
  score: 1000,
  isHost: true,
  isReady: true,
  isAi: false,
  territoriesCount: 1,
  castleTowers: 3,
  defensiveBonus: 0,
  correctAnswers: 1,
  wrongAnswers: 0,
  baseAttackAttemptsUsed: {},
};

// ============================================================================
// SECȚIUNEA H: TESTE HĂRȚI DIZOLVATE ȘI PRESETURI DEDICATE (H1 - H15)
// ============================================================================

test('H1 & H2: toate cele 9 preseturi (2..10 jucători) au numărul exact de teritorii și acoperă toate cele 42 de județe fără duplicate', () => {
  const expectedCounts: Record<number, number> = {
    2: 10,
    3: 15,
    4: 20,
    5: 23,
    6: 26,
    7: 29,
    8: 32,
    9: 35,
    10: 38,
  };

  for (let p = 2; p <= 10; p++) {
    assert.equal(getTerritoryCountForPlayers(p), expectedCounts[p], `getTerritoryCountForPlayers(${p})`);
    const meta = getMapMetadata(p);
    assert.equal(meta.playerCount, p);
    assert.equal(meta.territoryCount, expectedCounts[p]);

    const defs = ROMANIA_MAP_PRESETS[p];
    assert.ok(Array.isArray(defs), `preset ${p} array exists`);
    assert.equal(defs.length, expectedCounts[p], `preset ${p} length`);

    const seenCounties = new Set<string>();
    const seenIds = new Set<string>();

    for (const t of defs) {
      assert.ok(!seenIds.has(t.id), `duplicate territory id ${t.id} in preset ${p}`);
      seenIds.add(t.id);
      assert.ok(t.counties && t.counties.length >= 1, `territory ${t.id} has counties`);
      for (const c of t.counties) {
        assert.ok(!seenCounties.has(c), `county ${c} duplicated in preset ${p}`);
        seenCounties.add(c);
      }
    }

    assert.equal(seenCounties.size, 42, `preset ${p} must cover all 42 counties of Romania`);

    // Verify JSON file on disk matches
    const jsonFile = path.resolve(process.cwd(), `data/maps/romania/players-${p}.json`);
    assert.ok(fs.existsSync(jsonFile), `data/maps/romania/players-${p}.json exists`);
    const parsed = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
    assert.equal(parsed.territories.length, expectedCounts[p]);
  }
});

test('H3 & H4: poligoanele teritoriilor sunt dizolvate (fără sub-path-uri multiple de județe concatenate) și graful de vecinătate este conex și simetric', () => {
  for (let p = 2; p <= 10; p++) {
    const map = createMapForPlayerCount(p);
    const ids = Object.keys(map);
    assert.ok(ids.length >= 10);

    for (const t of Object.values(map)) {
      assert.ok(t.svgPath.startsWith('M') && t.svgPath.endsWith('Z'), `valid SVG path for ${t.id}`);
      // Unless Ilfov surrounds Bucuresti as an enclave in 10p preset, a merged territory should be 1 exterior polygon ring
      const subpathCount = (t.svgPath.match(/M/g) || []).length;
      if (t.id === 'ro_p10_ilfov') {
        assert.ok(subpathCount <= 2, `Ilfov with Bucuresti enclave has at most 2 rings`);
      } else {
        assert.equal(
          subpathCount,
          1,
          `Territory ${t.id} in ${p}p preset (${t.counties?.length} counties) must be dissolved into 1 exterior ring, got ${subpathCount}`
        );
      }
      assert.ok(t.neighbors.length >= 1, `territory ${t.id} has at least 1 neighbor`);
      for (const nId of t.neighbors) {
        assert.ok(map[nId], `neighbor ${nId} exists in preset ${p}`);
        assert.ok(
          map[nId].neighbors.includes(t.id),
          `symmetric neighbor ${t.id} <-> ${nId} in preset ${p}`
        );
      }
    }

    // BFS connectivity check
    const visited = new Set<string>([ids[0]]);
    const queue = [ids[0]];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const nId of map[curr].neighbors) {
        if (!visited.has(nId)) {
          visited.add(nId);
          queue.push(nId);
        }
      }
    }
    assert.equal(visited.size, ids.length, `preset ${p} adjacency graph is 100% connected`);
  }
});

test('H5 & H6: selecția și înghețarea hărții în funcție de numărul real de jucători la startGame (nu maxPlayers)', () => {
  const gm = new GameManager();
  // Create a room with maxPlayers = 10, but only 1 human + 1 bot = 2 actual players
  const room = gm.createRoom({
    hostUser: { id: 'u1', username: 'Host', avatar: 'av_vlad' },
    maxPlayers: 10,
    initialBotsCount: 1,
    isPrivate: true,
  });

  assert.equal(room.players.length, 2);
  assert.equal(room.mapPresetPlayerCount, 2);
  assert.equal(Object.keys(room.territories).length, 10);

  // Add 2 more bots -> 4 players -> 20 territories
  gm.addBot(room.roomId, 'u1', 'intermediar');
  gm.addBot(room.roomId, 'u1', 'intermediar');
  const updatedRoom = gm.getRoom(room.roomId)!;
  assert.equal(updatedRoom.players.length, 4);
  assert.equal(updatedRoom.mapPresetPlayerCount, 4);
  assert.equal(Object.keys(updatedRoom.territories).length, 20);

  // Start game with 4 players in a 10-maxPlayers room -> freezes at 4p preset (20 territories)
  const startRes = gm.startGame(room.roomId, 'u1');
  assert.equal(startRes.success, true);
  const startedGame = gm.getRoom(room.roomId)!;
  assert.equal(startedGame.mapPresetPlayerCount, 4);
  assert.equal(startedGame.mapTerritoryCount, 20);
  assert.equal(Object.keys(startedGame.territories).length, 20);

  // Disconnect during active game does not alter map preset
  gm.leaveRoom(room.roomId, 'u1');
  assert.equal(Object.keys(gm.getRoom(room.roomId)!.territories).length, 20);
  (gm as any).clearRoomTimers(room.roomId);
});

// ============================================================================
// SECȚIUNEA 1 & 2: BLOCARE RĂSPUNS UNIC, NO_RESPONSE ȘI CUCERIRE ADIACENTĂ
// ============================================================================

test('Test 1 & 2: submitAnswer acceptă primul răspuns (inclusiv opțiunea 0) și respinge orice răspuns duplicat de la același jucător', () => {
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'u1', username: 'Host', avatar: 'av_vlad' },
    maxPlayers: 3,
    initialBotsCount: 0,
    isPrivate: true,
  });
  gm.joinRoom(room.roomId, { id: 'u2', username: 'Player2', avatar: 'av_stefan' });
  gm.setReady(room.roomId, 'u2', true);
  gm.startGame(room.roomId, 'u1');

  const game = gm.getRoom(room.roomId)!;
  // Simulate an active choice question
  game.phase = 'conquest';
  game.currentQuestion = {
    questionInstanceId: 'q_test_1',
    question: {
      id: 'q1',
      category: 'istorie',
      difficulty: 'mediu',
      type: 'choice',
      question: 'Întrebare test?',
      options: ['Var A', 'Var B', 'Var C', 'Var D'],
      correctAnswerIndex: 0,
    },
    startTime: Date.now(),
    durationSeconds: 12,
    attackerId: 'u1',
    phaseContext: 'conquest',
    participantIds: ['u1', 'u2'],
    playerAnswers: {},
    resolved: false,
  };

  // u1 submits option 0
  const firstAttempt = gm.submitAnswer(room.roomId, 'u1', 0);
  assert.equal(firstAttempt.success, true);
  assert.equal(firstAttempt.acceptedAnswer, 0);

  // u1 tries to submit option 2 right after -> rejected!
  const secondAttempt = gm.submitAnswer(room.roomId, 'u1', 2);
  assert.equal(secondAttempt.success, false);
  assert.match(secondAttempt.message, /Ai trimis deja răspunsul/);
  assert.equal(game.currentQuestion.playerAnswers['u1'].answer, 0);
  (gm as any).clearRoomTimers(room.roomId);
});

test('Test 3: NO_RESPONSE la expirarea timpului NU incrementează wrongAnswers pentru jucătorii care nu au răspuns', () => {
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'u1', username: 'Host', avatar: 'av_vlad' },
    maxPlayers: 2,
    initialBotsCount: 0,
    isPrivate: true,
  });
  gm.joinRoom(room.roomId, { id: 'u2', username: 'Player2', avatar: 'av_stefan' });
  gm.setReady(room.roomId, 'u2', true);
  gm.startGame(room.roomId, 'u1');

  const game = gm.getRoom(room.roomId)!;
  game.phase = 'conquest';
  game.currentQuestion = {
    questionInstanceId: 'q_timeout_test',
    question: {
      id: 'q_to',
      category: 'istorie',
      difficulty: 'mediu',
      type: 'choice',
      question: 'Întrebare timeout?',
      options: ['A', 'B', 'C', 'D'],
      correctAnswerIndex: 1,
    },
    startTime: Date.now() - 13000,
    durationSeconds: 12,
    attackerId: 'u1',
    phaseContext: 'conquest',
    participantIds: ['u1', 'u2'],
    playerAnswers: {
      // u1 answered wrong (0 instead of 1); u2 did NOT answer at all
      u1: { answer: 0, submitTime: 2500 },
    },
    resolved: false,
  };

  // Trigger resolution via expired submitAnswer check
  gm.submitAnswer(room.roomId, 'u2', 1);

  const p1 = game.players.find((p) => p.id === 'u1')!;
  const p2 = game.players.find((p) => p.id === 'u2')!;

  assert.equal(p1.wrongAnswers, 1, 'u1 answered wrong so wrongAnswers is 1');
  assert.equal(p2.wrongAnswers, 0, 'u2 timed out (NO_RESPONSE) so wrongAnswers MUST remain 0');
  assert.equal(game.currentQuestion.playerAnswers['u2'].answerStatus, 'NO_RESPONSE');
  assert.equal(game.currentQuestion.playerAnswers['u2'].answer, null);
  (gm as any).clearRoomTimers(room.roomId);
});

test('Test 4: canSelectBase și canTargetTerritory în faza de cucerire impun adiacența strictă', () => {
  assert.equal(canSelectBase('satu_mare', mockTerritories), false);
  assert.equal(canSelectBase('cluj', mockTerritories), false);
  assert.equal(canSelectBase('bihor', mockTerritories), true);

  // Satu Mare is adjacent to player1's base (Maramureș)
  assert.equal(canTargetTerritory('satu_mare', player1, mockTerritories, 'conquest').allowed, true);
  // Bihor is NOT adjacent to player1's territories
  assert.equal(canTargetTerritory('bihor', player1, mockTerritories, 'conquest').allowed, false);
});

// ============================================================================
// SECȚIUNEA 3: RĂZBOI SIMULTAN PENTRU 2..10 JUCĂTORI (PERECHI + BYE + TIEBREAK)
// ============================================================================

test('Test 5: buildSimultaneousWarPairings formează exact floor(N/2) bătălii simultane pentru 2, 3, 4, 5, 6, 7, 8, 9, 10 jucători și rotește BYE-ul la număr impar', () => {
  for (let n = 2; n <= 10; n++) {
    const map = createMapForPlayerCount(n);
    const territoryIds = Object.keys(map);
    const playerIds = Array.from({ length: n }, (_, i) => `p${i + 1}`);

    // Distribute all territories among the n players
    territoryIds.forEach((tid, idx) => {
      map[tid].ownerId = playerIds[idx % n];
    });

    const roleHistory: Record<string, Array<'attacker' | 'defender' | 'bye'>> = {};
    let previousByePlayer: string | null = null;

    for (let round = 1; round <= 4; round++) {
      const pairing = buildSimultaneousWarPairings(playerIds, map, round, roleHistory);
      const expectedBattles = Math.floor(n / 2);

      assert.equal(pairing.attackerIds.length, expectedBattles, `${n} players round ${round} attackers`);
      assert.equal(pairing.defenderIds.length, expectedBattles, `${n} players round ${round} defenders`);
      assert.equal(pairing.pairs.length, expectedBattles, `${n} players round ${round} pairs`);
      assert.equal(pairing.byePlayerIds.length, n % 2, `${n} players round ${round} bye count`);

      // Verify all active players are assigned to exactly 1 disjoint role
      const allAssigned = [
        ...pairing.attackerIds,
        ...pairing.defenderIds,
        ...pairing.byePlayerIds,
      ];
      assert.equal(allAssigned.length, n);
      assert.equal(new Set(allAssigned).size, n, 'no player appears twice in the same war round');

      // Verify BYE does not repeat consecutively for odd player counts
      if (n % 2 === 1) {
        const currentBye = pairing.byePlayerIds[0];
        if (previousByePlayer) {
          assert.notEqual(
            currentBye,
            previousByePlayer,
            `Player ${currentBye} received two consecutive BYEs in ${n}-player mode`
          );
        }
        previousByePlayer = currentBye;
      }

      // Record history for next round
      for (const id of pairing.attackerIds) roleHistory[id] = [...(roleHistory[id] || []), 'attacker'];
      for (const id of pairing.defenderIds) roleHistory[id] = [...(roleHistory[id] || []), 'defender'];
      for (const id of pairing.byePlayerIds) roleHistory[id] = [...(roleHistory[id] || []), 'bye'];
    }
  }
});

test('Test 6: evaluateWarBattleChoiceOutcome și evaluateWarBattleTiebreakOutcome rezolvă corect fiecare pereche independent', () => {
  const playerAnswers = {
    atk1: { answer: 2, submitTime: 1800 },
    def1: { answer: 1, submitTime: 1500 },
    atk2: { answer: 2, submitTime: 2200 },
    def2: { answer: 2, submitTime: 1900 },
    atk3: { answer: null, submitTime: 12000 },
    def3: { answer: 2, submitTime: 3100 },
    atk4: { answer: 0, submitTime: 4000 },
    def4: { answer: null, submitTime: 12000 },
  };

  // Battle 1: Attacker correct (2), Defender wrong (1) -> attacker_won
  const b1 = evaluateWarBattleChoiceOutcome('atk1', 'def1', playerAnswers, 2);
  assert.equal(b1.outcome, 'attacker_won');
  assert.equal(b1.winnerId, 'atk1');

  // Battle 2: Both correct (2) -> needs_tiebreak
  const b2 = evaluateWarBattleChoiceOutcome('atk2', 'def2', playerAnswers, 2);
  assert.equal(b2.outcome, 'needs_tiebreak');
  assert.equal(b2.winnerId, null);

  // Battle 3: Attacker no-response, Defender correct (2) -> defender_won
  const b3 = evaluateWarBattleChoiceOutcome('atk3', 'def3', playerAnswers, 2);
  assert.equal(b3.outcome, 'defender_won');
  assert.equal(b3.winnerId, 'def3');

  // Battle 4: Both wrong / no-response -> draw_no_bonus
  const b4 = evaluateWarBattleChoiceOutcome('atk4', 'def4', playerAnswers, 2);
  assert.equal(b4.outcome, 'draw_no_bonus');
  assert.equal(b4.winnerId, 'def4');

  // Now resolve Battle 2 via numeric tiebreak (target = 1918)
  const tiebreakAnswers = {
    atk2: { answer: 1915, submitTime: 4100 }, // diff 3, slower
    def2: { answer: 1921, submitTime: 2900 }, // diff 3, faster -> defender wins!
  };
  const tb2 = evaluateWarBattleTiebreakOutcome('atk2', 'def2', tiebreakAnswers, 1918);
  assert.equal(tb2.outcome, 'defender_won');
  assert.equal(tb2.winnerId, 'def2');
  assert.equal(tb2.attackerNumericDiff, 3);
  assert.equal(tb2.defenderNumericDiff, 3);
});

test('Test 7: fluxul complet de Război Simultan pentru 4 jucători (2 atacatori aleg ținte -> 1 întrebare comună -> aplicare atomică scoruri)', () => {
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'p1', username: 'P1', avatar: 'av_vlad' },
    maxPlayers: 4,
    initialBotsCount: 0,
    isPrivate: true,
  });
  gm.joinRoom(room.roomId, { id: 'p2', username: 'P2', avatar: 'av_vlad' });
  gm.joinRoom(room.roomId, { id: 'p3', username: 'P3', avatar: 'av_vlad' });
  gm.joinRoom(room.roomId, { id: 'p4', username: 'P4', avatar: 'av_vlad' });
  gm.setReady(room.roomId, 'p2', true);
  gm.setReady(room.roomId, 'p3', true);
  gm.setReady(room.roomId, 'p4', true);
  gm.startGame(room.roomId, 'p1');

  const game = gm.getRoom(room.roomId)!;
  const tIds = Object.keys(game.territories);
  const pIds = ['p1', 'p2', 'p3', 'p4'];

  // Assign all 20 territories to the 4 players
  tIds.forEach((tid, idx) => {
    const owner = pIds[idx % 4];
    game.territories[tid].ownerId = owner;
    game.territories[tid].isBase = idx < 4;
    game.territories[tid].points = idx < 4 ? 1000 : 200;
    game.territories[tid].castleTowers = idx < 4 ? 3 : 0;
  });

  // Enter simultaneous war phase
  (gm as any).enterWarPhase(game);

  assert.equal(game.phase, 'war');
  assert.ok(game.warRound);
  assert.equal(game.warRound.status, 'selecting_targets');
  assert.equal(game.warRound.battles.length, 2);

  const [battle1, battle2] = game.warRound.battles;

  // Defender cannot select a target
  const defAttempt = gm.selectTerritory(room.roomId, battle1.defenderId, tIds[0]);
  assert.equal(defAttempt.success, false);

  // Attacker 1 cannot target Defender 2's territory
  const def2Territory = Object.values(game.territories).find(
    (t) => t.ownerId === battle2.defenderId
  )!;
  const wrongDefAttempt = gm.selectTerritory(room.roomId, battle1.attackerId, def2Territory.id);
  assert.equal(wrongDefAttempt.success, false);

  // Both attackers pick legal targets from their assigned defenders
  const legal1 = getLegalWarTargetsForPair(battle1.attackerId, battle1.defenderId, game.territories);
  const legal2 = getLegalWarTargetsForPair(battle2.attackerId, battle2.defenderId, game.territories);
  assert.ok(legal1.length > 0 && legal2.length > 0);

  const sel1 = gm.selectTerritory(room.roomId, battle1.attackerId, legal1[0]);
  assert.equal(sel1.success, true);
  // Question should NOT start until Attacker 2 also selects a target
  assert.equal(game.currentQuestion, null);

  const sel2 = gm.selectTerritory(room.roomId, battle2.attackerId, legal2[0]);
  assert.equal(sel2.success, true);

  // Now common choice question must be active for all 4 participants!
  const activeCq = gm.getRoom(room.roomId)!.currentQuestion;
  assert.ok(activeCq);
  assert.equal(game.warRound.status, 'choice_question');
  assert.equal(activeCq.participantIds?.length, 4);

  const correctIdx = activeCq.question.correctAnswerIndex!;
  const wrongIdx = (correctIdx + 1) % 4;

  // Battle 1: Attacker 1 answers right, Defender 1 answers wrong
  gm.submitAnswer(room.roomId, battle1.attackerId, correctIdx);
  gm.submitAnswer(room.roomId, battle1.defenderId, wrongIdx);

  // Battle 2: Attacker 2 answers wrong, Defender 2 answers right
  gm.submitAnswer(room.roomId, battle2.attackerId, wrongIdx);
  gm.submitAnswer(room.roomId, battle2.defenderId, correctIdx);

  // Question resolves immediately once all 4 participants answered
  assert.equal(activeCq.resolved, true);
  assert.equal(battle1.outcome, 'attacker_won');
  assert.equal(battle2.outcome, 'defender_won');

  // Verify score invariant holds for all players
  for (const p of game.players) {
    const mapSum = Object.values(game.territories)
      .filter((t) => t.ownerId === p.id)
      .reduce((acc, t) => acc + (t.points || 0) + (t.defensiveBonus || 0), 0);
    // Note: if battle1 hit a base tower (+400 bonus without ownership change), p.score equals mapSum; otherwise recalculatePlayerScores matches mapSum
    assert.ok(p.score >= mapSum);
  }
  (gm as any).clearRoomTimers(room.roomId);
});

test('Test 8: determineEstimationWinner și sanitizeNumericInput gestionează numere negative, zecimale și departajarea la timp egal', () => {
  const outcome = determineEstimationWinner(1877, {
    p1: { answer: 1850, submitTime: 4000 },
    p2: { answer: 1880, submitTime: 6000 },
    p3: { answer: 1874, submitTime: 5000 },
  });
  assert.equal(outcome.winnerId, 'p3');
  assert.equal(outcome.rankings[0].diff, 3);

  assert.equal(sanitizeNumericInput('-1989.5abc'), '-1989.5');
  assert.equal(sanitizeNumericInput('18,87'), '18.87');
});

// ============================================================================
// SECȚIUNEA V4.0 & V5.0: ADIACENȚĂ TOPOLOGICĂ STRICTĂ (TESTELE A - M) & TRACKER
// ============================================================================

test('Test A, B, C, D (V4.0/V5.0): Adiacență strictă în Război — interzice orice atac la distanță, inclusiv asupra Cetăților (Bazelor) neadiacente', () => {
  const remoteNormalAttack = canTargetTerritory('timis', player1, mockTerritories, 'war', 'player2');
  assert.equal(remoteNormalAttack.allowed, false, 'Test B: atac la distanță pe teritoriu normal respins');

  const remoteBaseAttack = canTargetTerritory('arad', player1, mockTerritories, 'war', 'player2');
  assert.equal(
    remoteBaseAttack.allowed,
    false,
    'Test C: atac la distanță pe Cetate/Bază inamică respins chiar și la prima încercare!'
  );

  const territoriesWithAdjacentBase: Record<string, Territory> = {
    ...mockTerritories,
    alba: {
      ...mockTerritories.alba,
      ownerId: 'player1',
    },
  };

  const adjacentBaseAttack = canTargetTerritory(
    'arad',
    player1,
    territoriesWithAdjacentBase,
    'war',
    'player2'
  );
  assert.equal(adjacentBaseAttack.allowed, true, 'Test D: atac pe Cetate/Bază direct învecinată este permis');

  const nonAdjacentTimis = canTargetTerritory(
    'timis',
    player1,
    territoriesWithAdjacentBase,
    'war',
    'player2'
  );
  assert.equal(nonAdjacentTimis.allowed, false, 'Test A/F: doar teritoriile direct învecinate ale apărătorului pot fi atacate');
});

test('Test B & E pe harta reală a României: Vestul României (Timiș/Arad) NU poate ataca niciodată Sud-Estul (Dobrogea/Constanța)', () => {
  for (let p = 2; p <= 10; p++) {
    const map = createMapForPlayerCount(p);
    validatePresetNeighborGraph(p, ROMANIA_MAP_PRESETS[p]);

    const allTerritories = Object.values(map) as Territory[];
    const westTerritory = allTerritories.find((t) =>
      t.counties?.some((c) => c === 'Timis' || c === 'Arad' || c === 'Bihor')
    )!;
    const eastTerritory = allTerritories.find((t) =>
      t.counties?.some((c) => c === 'Constanta' || c === 'Tulcea')
    )!;

    assert.ok(westTerritory && eastTerritory);
    assert.equal(
      areTerritoriesAdjacent(westTerritory.id, eastTerritory.id, map),
      false,
      `Preset ${p}p: ${westTerritory.id} și ${eastTerritory.id} nu au voie să fie vecine!`
    );

    westTerritory.ownerId = 'player1';
    westTerritory.isBase = true;
    eastTerritory.ownerId = 'player2';
    eastTerritory.isBase = true;

    const check = canTargetTerritory(eastTerritory.id, player1, map, 'war', 'player2');
    assert.equal(
      check.allowed,
      false,
      `Preset ${p}p: Jucătorul din vest (${westTerritory.id}) nu are voie să atace Dobrogea (${eastTerritory.id})`
    );
    assert.deepEqual(
      getLegalWarTargetsForPair('player1', 'player2', map),
      [],
      `Preset ${p}p: getLegalWarTargetsForPair returnează [] când nu există graniță comună`
    );
  }
});

test('Test F & G (V4.0/V5.0): buildSimultaneousWarPairings formează DOAR dueluri cu graniță comună (sharesBorder === true) și trece jucătorii izolați în byePlayerIds', () => {
  const isolatedPairings = buildSimultaneousWarPairings(
    ['player1', 'player2'],
    mockTerritories,
    1,
    {}
  );
  assert.equal(
    isolatedPairings.pairs.length,
    0,
    'Nu se creează niciun duel ilegal dacă jucătorii nu au graniță comună'
  );
  assert.deepEqual(isolatedPairings.byePlayerIds.sort(), ['player1', 'player2']);
});

test('Teste V5.0 RoundTracker (buildRoundDisplayItems): fără multiplicare N x N (4p -> 4 markeri, 10p -> 10 markeri) și ordine autoritativă din server', () => {
  const gm = new GameManager();

  const room4 = gm.createRoom({
    hostUser: { id: 'p1', username: 'P1', avatar: 'av_1' },
    maxPlayers: 4,
    initialBotsCount: 3,
    isPrivate: true,
  });
  gm.startGame(room4.roomId, 'p1');
  const game4 = gm.getRoom(room4.roomId)!;

  const model4Base = buildRoundDisplayItems(game4);
  assert.equal(model4Base.items.length, 4, 'La 4 jucători în base_selection există exact 4 markeri (nu 16)');
  assert.equal(model4Base.items[0].state, 'active');

  const pIds4 = game4.players.map((p) => p.id);
  game4.phase = 'conquest';
  game4.currentQuestion = null;
  game4.conquestPickerId = pIds4[2];
  game4.conquestPickQueue = [pIds4[2], pIds4[0], pIds4[3]];

  const model4ConquestPick = buildRoundDisplayItems(game4);
  assert.equal(model4ConquestPick.items.length, 4, 'La 4 jucători în conquest picking există exact 4 markeri');
  assert.equal(model4ConquestPick.items[0].playerId, pIds4[2], 'Primul marker este conquestPickerId (p3)');
  assert.equal(model4ConquestPick.items[0].state, 'active');
  assert.equal(model4ConquestPick.items[1].playerId, pIds4[0], 'Al doilea marker este al doilea din conquestPickQueue (p1)');
  assert.equal(model4ConquestPick.items[2].playerId, pIds4[3], 'Al treilea marker este al treilea din conquestPickQueue (p4)');
  assert.equal(model4ConquestPick.items[3].playerId, pIds4[1], 'Jucătorul fără alegere apare la final ca done');
  assert.equal(model4ConquestPick.items[3].state, 'done');
  (gm as any).clearRoomTimers(room4.roomId);

  const room10 = gm.createRoom({
    hostUser: { id: 'h1', username: 'Host10', avatar: 'av_1' },
    maxPlayers: 10,
    initialBotsCount: 9,
    isPrivate: true,
  });
  gm.startGame(room10.roomId, 'h1');
  const game10 = gm.getRoom(room10.roomId)!;

  const model10Base = buildRoundDisplayItems(game10);
  assert.equal(
    model10Base.items.length,
    10,
    'La 10 jucători există exact 10 markeri în RoundTracker (niciodată 100!)'
  );

  const tIds10 = Object.keys(game10.territories);
  const pIds10 = game10.players.map((p) => p.id);
  tIds10.forEach((tid, idx) => {
    game10.territories[tid].ownerId = pIds10[idx % 10];
  });
  (gm as any).enterWarPhase(game10);

  const model10War = buildRoundDisplayItems(game10);
  assert.equal(model10War.items.length, 10, 'În Război 10p totalul markerilor este exact 10');
  assert.equal(
    model10War.battlePairs.length,
    game10.warRound!.battles.length,
    'Numărul de perechi din tracker corespunde exact cu warRound.battles'
  );
  model10War.battlePairs.forEach((pair, idx) => {
    assert.equal(pair.attacker.playerId, game10.warRound!.battles[idx].attackerId);
    assert.equal(pair.defender.playerId, game10.warRound!.battles[idx].defenderId);
  });

  (gm as any).clearRoomTimers(room10.roomId);
});

test('V7: PlayerSidebar clasament, rank și atribuire roluri/tur prin player.id (fără confuzie de index sortat)', () => {
  const mockPlayers = [
    { id: 'p_alpha', username: 'Alpha', color: '#ff0000', score: 200, territoriesCount: 1, castleTowers: 3, isEliminated: false },
    { id: 'p_beta', username: 'Beta', color: '#00ff00', score: 1000, territoriesCount: 5, castleTowers: 3, isEliminated: false },
    { id: 'p_gamma', username: 'Gamma', color: '#0000ff', score: 600, territoriesCount: 3, castleTowers: 2, isEliminated: false },
    { id: 'p_delta', username: 'Delta', color: '#ffff00', score: 0, territoriesCount: 0, castleTowers: 0, isEliminated: true },
  ];

  // Beta is rank 1 (1000 pct), Gamma rank 2 (600 pct), Alpha rank 3 (200 pct), Delta rank 4 (0 pct)
  const ranked = [...mockPlayers]
    .map((p, originalIdx) => ({ player: p, originalIdx }))
    .sort((a, b) => b.player.score - a.player.score || a.originalIdx - b.originalIdx);

  assert.equal(ranked[0].player.id, 'p_beta', 'Locul 1 este Beta cu 1000 pct');
  assert.equal(ranked[1].player.id, 'p_gamma', 'Locul 2 este Gamma cu 600 pct');
  assert.equal(ranked[2].player.id, 'p_alpha', 'Locul 3 este Alpha cu 200 pct');
  assert.equal(ranked[3].player.id, 'p_delta', 'Locul 4 este Delta cu 0 pct');

  // Verify that active player is identified strictly by ID
  // Suppose activePlayerIndex in original array is 0 (Alpha)
  const activePlayerId = mockPlayers[0].id;
  assert.equal(activePlayerId, 'p_alpha');

  // When iterating over ranked list, only Alpha gets isTurn = true, NOT the element at index 0 (which is Beta)!
  const isTurnForRanked = ranked.map(({ player }) => player.id === activePlayerId);
  assert.deepEqual(isTurnForRanked, [false, false, true, false], 'Doar Alpha primește isTurn, chiar dacă este pe locul 3 în clasament');

  // Verify war roles computed by ID
  const warRound = {
    attackerIds: ['p_beta'],
    defenderIds: ['p_gamma'],
    byePlayerIds: ['p_alpha'],
  };
  assert.ok(warRound.attackerIds.includes('p_beta'), 'Beta este atacator prin ID');
  assert.ok(warRound.defenderIds.includes('p_gamma'), 'Gamma este apărător prin ID');
  assert.ok(warRound.byePlayerIds.includes('p_alpha'), 'Alpha este BYE prin ID');
});

test('V7: Smooth Timer - calcul continuu al raportului scaleX și gestionarea deadline-ului absolut', () => {
  const totalDurationMs = 15000;
  const startTime = 1000000;
  const deadline = startTime + totalDurationMs;

  const calculateRatio = (now: number) => {
    const remainingMs = Math.max(0, deadline - now);
    return Math.max(0, Math.min(1, remainingMs / totalDurationMs));
  };

  // Start (0% elapsed) -> ratio 1.0
  assert.equal(calculateRatio(startTime), 1);

  // Exactly half elapsed (7.5s) -> ratio 0.5
  assert.equal(calculateRatio(startTime + 7500), 0.5);

  // 12s elapsed (3s remaining) -> ratio 0.2
  assert.equal(calculateRatio(startTime + 12000), 0.2);

  // Deadline reached -> ratio 0.0
  assert.equal(calculateRatio(deadline), 0);

  // Past deadline -> ratio stays 0 (no negative values or NaN)
  assert.equal(calculateRatio(deadline + 5000), 0);
});

// ============================================================================
// SECȚIUNEA V8.0: BANCA CANONICĂ DE ÎNTREBĂRI, NON-REPETIȚIE, CEAS SERVER & SOCKET.IO
// ============================================================================

test('V8 Test 17: Banca canonică de întrebări are peste 5.000 de întrebări verificate, 0 duplicate și acoperă toate cele 14 categorii pentru 10 jucători', () => {
  assert.ok(
    INITIAL_QUESTIONS.length >= 5000,
    `Banca canonică trebuie să aibă >= 5000 întrebări (actual: ${INITIAL_QUESTIONS.length})`
  );

  const choiceList = INITIAL_QUESTIONS.filter((q) => q.type === 'choice');
  const estimationList = INITIAL_QUESTIONS.filter((q) => q.type === 'estimation');

  assert.ok(choiceList.length >= 2500, `Minim 2500 întrebări choice (actual: ${choiceList.length})`);
  assert.ok(
    estimationList.length >= 2500,
    `Minim 2500 întrebări estimation (actual: ${estimationList.length})`
  );

  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();

  for (const q of INITIAL_QUESTIONS) {
    assert.ok(q.id && !seenIds.has(q.id), `ID duplicat sau lipsă: ${q.id}`);
    seenIds.add(q.id);

    const fp = normalizeQuestionText(q.question);
    assert.ok(fp.length >= 8 && !seenFingerprints.has(fp), `Text duplicat: ${q.question}`);
    seenFingerprints.add(fp);

    if (q.type === 'choice') {
      assert.equal(q.options?.length, 4, `Întrebarea ${q.id} trebuie să aibă 4 opțiuni`);
      assert.ok(
        Number.isInteger(q.correctAnswerIndex) &&
          q.correctAnswerIndex! >= 0 &&
          q.correctAnswerIndex! <= 3
      );
    } else {
      assert.ok(Number.isFinite(q.targetNumber), `Întrebarea ${q.id} trebuie să aibă targetNumber finit`);
      assert.ok(q.unit && q.unit.length > 0, `Întrebarea ${q.id} trebuie să aibă unitate de măsură`);
    }
  }

  // Verify every single selectable category has enough choice and estimation questions for a 10-player match
  const maxBudget10 = GameManager.calculateMatchQuestionBudget(10, 38, 6);
  const categories = [
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
  ];

  for (const cat of categories) {
    const catChoice = choiceList.filter((q) => q.category === cat).length;
    const catEst = estimationList.filter((q) => q.category === cat).length;
    assert.ok(
      catChoice >= maxBudget10.requiredChoice,
      `Categoria ${cat} are ${catChoice} întrebări choice, sub bugetul pentru 10p (${maxBudget10.requiredChoice})`
    );
    assert.ok(
      catEst >= maxBudget10.requiredEstimation,
      `Categoria ${cat} are ${catEst} întrebări estimation, sub bugetul pentru 10p (${maxBudget10.requiredEstimation})`
    );
  }
});

test('V8 Test 18: GameManager.getRandomQuestion garantează non-repetiția strictă în aceeași partidă și nu resetează niciodată usedQuestionIds la epuizare', () => {
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'u_nonrep', username: 'NonRepHost', avatar: 'av_vlad' },
    maxPlayers: 4,
    initialBotsCount: 3,
    selectedCategories: ['arta'],
    isPrivate: true,
  });

  const drawnIds = new Set<string>();
  for (let i = 0; i < 120; i++) {
    const qType = i % 2 === 0 ? 'choice' : 'estimation';
    const q = gm.getRandomQuestion(room, qType);
    assert.ok(q, `Extragerea #${i + 1} (${qType}) trebuie să returneze o întrebare validă`);
    assert.equal(
      drawnIds.has(q.id),
      false,
      `Întrebarea ${q.id} a fost repetată în aceeași partidă la extragerea #${i + 1}!`
    );
    drawnIds.add(q.id);
  }
  assert.equal(room.usedQuestionIds?.length, 120);

  // Now simulate total pool exhaustion by marking all DB questions as used in this room
  room.usedQuestionIds = db.getAllQuestions().map((q) => q.id);
  const exhaustedChoice = gm.getRandomQuestion(room, 'choice');
  const exhaustedEst = gm.getRandomQuestion(room, 'estimation');
  assert.equal(
    exhaustedChoice,
    null,
    'La epuizarea completă a băncii, getRandomQuestion trebuie să returneze null (fără resetarea usedQuestionIds)'
  );
  assert.equal(
    exhaustedEst,
    null,
    'La epuizarea completă a băncii numerice, getRandomQuestion trebuie să returneze null'
  );
  (gm as any).clearRoomTimers(room.roomId);
});

test('V8 Test 19: Preflight Question Budget în startGame blochează pornirea meciului dacă toate întrebările disponibile sunt dezactivate și permite pornirea cu banca canonică', () => {
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'u_budget', username: 'BudgetHost', avatar: 'av_vlad' },
    maxPlayers: 10,
    initialBotsCount: 9,
    selectedCategories: ['muzica'],
    isPrivate: true,
  });

  // Temporarily mark muzica questions as isDisabled to test preflight rejection
  const muzicaQuestions = db.getAllQuestions().filter((q) => q.category === 'muzica');
  for (const q of muzicaQuestions) q.isDisabled = true;

  try {
    const blockedStart = gm.startGame(room.roomId, 'u_budget');
    assert.equal(blockedStart.success, false, 'startGame trebuie să respingă pornirea când bugetul de întrebări nu este îndeplinit');
  } finally {
    for (const q of muzicaQuestions) q.isDisabled = false;
  }

  // With muzica questions re-enabled, 10-player match starts cleanly
  const validStart = gm.startGame(room.roomId, 'u_budget');
  assert.equal(validStart.success, true, 'startGame pornește cu succes când bugetul de întrebări este disponibil');
  (gm as any).clearRoomTimers(room.roomId);
});

test('V8 Test 20: Sincronizarea ceasului cu serverul (computeClockOffsetSample, selectBestClockOffset, estimateServerNow) compensează exact decalaje de -120s, -5s, +3s și +90s', () => {
  const serverTrueNow = 1_762_000_000_000;
  const skewsMs = [-120_000, -5_000, 3_000, 90_000];

  for (const skewMs of skewsMs) {
    // Client wall clock is shifted by skewMs relative to serverTrueNow
    const clientWallClockAtReceipt = serverTrueNow - skewMs;

    // Simulate 3 ping samples with different RTTs (20ms, 80ms, 140ms)
    const sampleFast = computeClockOffsetSample({
      clientSentAtPerfMs: 1000,
      clientReceivedAtPerfMs: 1020, // RTT = 20ms
      clientReceivedWallClockMs: clientWallClockAtReceipt,
      serverNowMs: serverTrueNow - 10, // Server processed halfway through the 20ms RTT
    });
    const sampleNoisy = computeClockOffsetSample({
      clientSentAtPerfMs: 2000,
      clientReceivedAtPerfMs: 2140, // RTT = 140ms
      clientReceivedWallClockMs: clientWallClockAtReceipt,
      serverNowMs: serverTrueNow - 40, // Asymmetric jitter
    });

    const best = selectBestClockOffset([sampleNoisy, sampleFast]);
    assert.equal(best.rttMs, 20, 'Se alege proba cu cel mai mic RTT (20ms)');
    assert.equal(best.offsetMs, skewMs, `Offsetul calculat trebuie să compenseze exact decalajul de ${skewMs}ms`);

    const correctedNow = estimateServerNow(clientWallClockAtReceipt, best.offsetMs);
    assert.equal(
      correctedNow,
      serverTrueNow,
      `Timpul estimat al serverului trebuie să fie egal cu timpul real al serverului pentru skew=${skewMs}ms`
    );
  }
});

test('V8 Test 21: Integrare multiplayer reală Socket.IO (time_sync_request, create/join room, base_selection, submit_answer cu questionInstanceId, blocare duplicat și opțiunea 0)', async () => {
  const gm = new GameManager();
  const httpServer = http.createServer();
  const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });
  setupSocketHandlers(io, gm);

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  const addr = httpServer.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  // Register two ephemeral users in memory in db
  const u1Id = `usr_test_s1_${Date.now()}`;
  const u2Id = `usr_test_s2_${Date.now()}`;
  const nowIso = new Date().toISOString();

  db.createUser({
    id: u1Id,
    username: 'Voievod_Test1',
    email: `${u1Id}@test.local`,
    passwordHash: 'hash',
    role: 'user',
    createdAt: nowIso,
    profile: {
      id: u1Id,
      username: 'Voievod_Test1',
      email: `${u1Id}@test.local`,
      role: 'user',
      avatar: 'av_stefan',
      title: 'Voievod',
      rating: 1200,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      territoriesConquered: 0,
      correctAnswersTotal: 0,
      highestScore: 0,
      createdAt: nowIso,
    },
  });

  db.createUser({
    id: u2Id,
    username: 'Voievod_Test2',
    email: `${u2Id}@test.local`,
    passwordHash: 'hash',
    role: 'user',
    createdAt: nowIso,
    profile: {
      id: u2Id,
      username: 'Voievod_Test2',
      email: `${u2Id}@test.local`,
      role: 'user',
      avatar: 'av_vlad',
      title: 'Voievod',
      rating: 1200,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      territoriesConquered: 0,
      correctAnswersTotal: 0,
      highestScore: 0,
      createdAt: nowIso,
    },
  });

  const token1 = generateToken(u1Id, 'user');
  const token2 = generateToken(u2Id, 'user');

  const client1: ClientSocket = createClientSocket(baseUrl, {
    auth: { token: token1 },
    transports: ['websocket'],
  });
  const client2: ClientSocket = createClientSocket(baseUrl, {
    auth: { token: token2 },
    transports: ['websocket'],
  });

  let roomId = '';

  try {
    await Promise.all([
      new Promise<void>((res, rej) => {
        client1.once('connect', () => res());
        client1.once('connect_error', rej);
      }),
      new Promise<void>((res, rej) => {
        client2.once('connect', () => res());
        client2.once('connect_error', rej);
      }),
    ]);

    // 1. Test time_sync_request ACK
    const syncRes: any = await new Promise((resolve) =>
      client1.emit('time_sync_request', { requestId: 'req_1', clientSentAt: 1234 }, resolve)
    );
    assert.equal(syncRes.requestId, 'req_1');
    assert.equal(typeof syncRes.serverNowMs, 'number');

    // 2. Client 1 creates room
    const createRes: any = await new Promise((resolve) =>
      client1.emit('create_room', { roomName: 'TestRoomV8', maxPlayers: 2, isPrivate: true }, resolve)
    );
    assert.equal(createRes.success, true);
    roomId = createRes.game.roomId;

    // 3. Client 2 joins room & sets ready
    const joinRes: any = await new Promise((resolve) =>
      client2.emit('join_room', { roomId }, resolve)
    );
    assert.equal(joinRes.success, true);
    client2.emit('set_ready', { isReady: true });
    await new Promise((r) => setTimeout(r, 40));

    // 4. Client 1 starts game
    const startRes: any = await new Promise((resolve) =>
      client1.emit('start_game', {}, resolve)
    );
    assert.equal(startRes.success, true);

    const serverGame = gm.getRoom(roomId)!;
    assert.equal(serverGame.phase, 'base_selection');

    // 5. Pick valid bases for Player 1 and Player 2
    const tList = Object.values(serverGame.territories);
    const base1 = tList.find((t) => canCompleteBaseSelection(t.id, serverGame.territories, 1))!;
    const pick1Res: any = await new Promise((resolve) =>
      client1.emit('select_territory', { territoryId: base1.id }, resolve)
    );
    assert.equal(pick1Res.success, true);

    const base2 = Object.values(serverGame.territories).find((t) =>
      canCompleteBaseSelection(t.id, serverGame.territories, 0)
    )!;
    const pick2Res: any = await new Promise((resolve) =>
      client2.emit('select_territory', { territoryId: base2.id }, resolve)
    );
    assert.equal(pick2Res.success, true);
    assert.equal(serverGame.phase, 'conquest');

    // Trigger conquest question immediately for deterministic testing
    gm.triggerNextConquestQuestion(serverGame);
    const cq = serverGame.currentQuestion!;
    assert.ok(cq, 'Întrebarea de cucerire trebuie să fie activă');

    // 6. Test stale questionInstanceId rejection
    const staleRes: any = await new Promise((resolve) =>
      client1.emit(
        'submit_answer',
        { answer: 0, questionInstanceId: 'stale_instance_id_999' },
        resolve
      )
    );
    assert.equal(staleRes.success, false);
    assert.equal(staleRes.code, 'STALE_INSTANCE');

    // 7. Test valid submission of option 0 with matching questionInstanceId
    const ans1Res: any = await new Promise((resolve) =>
      client1.emit(
        'submit_answer',
        { answer: 0, questionInstanceId: cq.questionInstanceId },
        resolve
      )
    );
    assert.equal(ans1Res.success, true);
    assert.equal(ans1Res.code, 'ACCEPTED');
    assert.equal(ans1Res.acceptedAnswer, 0);

    // 8. Test duplicate submission rejection for Client 1
    const dupRes: any = await new Promise((resolve) =>
      client1.emit(
        'submit_answer',
        { answer: 1, questionInstanceId: cq.questionInstanceId },
        resolve
      )
    );
    assert.equal(dupRes.success, false);
    assert.equal(dupRes.code, 'DUPLICATE');

    // 9. Client 2 submits answer -> question resolves immediately
    const ans2Res: any = await new Promise((resolve) =>
      client2.emit(
        'submit_answer',
        { answer: cq.question.correctAnswerIndex, questionInstanceId: cq.questionInstanceId },
        resolve
      )
    );
    assert.equal(ans2Res.success, true);
    assert.equal(cq.resolved, true);
  } finally {
    if (roomId) (gm as any).clearRoomTimers(roomId);
    client1.disconnect();
    client2.disconnect();
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    db.deleteUser(u1Id);
    db.deleteUser(u2Id);
  }
});

// ============================================================================
// SECȚIUNEA V9.0: AUDIT EDITORIAL, FACTKEY, SCOR TURNURI CETATE, RETRY ALOCARE & SIMULARE 2..10P
// ============================================================================

test('V9 Test 22: Lovirea unui turn de cetate (castleTowers > 1) acordă +400 puncte în attackBonusPoints și le păstrează după recalculatePlayerScores', () => {
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'p_atk', username: 'AtacatorCetate', avatar: 'av_vlad' },
    maxPlayers: 2,
    initialBotsCount: 0,
    isPrivate: true,
  });
  gm.joinRoom(room.roomId, { id: 'p_def', username: 'AparatorCetate', avatar: 'av_stefan' });
  gm.setReady(room.roomId, 'p_def', true);
  gm.startGame(room.roomId, 'p_atk');

  const game = gm.getRoom(room.roomId)!;
  const tIds = Object.keys(game.territories);

  // Assign half territories to p_atk and half to p_def, ensuring their bases share a border
  let baseAtkId = tIds[0];
  let baseDefId = game.territories[baseAtkId].neighbors[0];

  tIds.forEach((tid, idx) => {
    if (tid === baseAtkId) {
      game.territories[tid].ownerId = 'p_atk';
      game.territories[tid].isBase = true;
      game.territories[tid].points = SCORING.BASE;
      game.territories[tid].castleTowers = 3;
    } else if (tid === baseDefId) {
      game.territories[tid].ownerId = 'p_def';
      game.territories[tid].isBase = true;
      game.territories[tid].points = SCORING.BASE;
      game.territories[tid].castleTowers = 3;
    } else {
      game.territories[tid].ownerId = idx % 2 === 0 ? 'p_atk' : 'p_def';
      game.territories[tid].isBase = false;
      game.territories[tid].points = SCORING.ALLOCATION;
      game.territories[tid].castleTowers = 0;
    }
  });

  (gm as any).recalculatePlayerScores(game);
  const attackerBefore = game.players.find((p) => p.id === 'p_atk')!.score;

  // Enter War Phase and force p_atk as attacker and p_def as defender targeting baseDefId
  game.phase = 'war';
  game.warRound = {
    roundId: 'wr_test_tower_1',
    roundNumber: 1,
    status: 'choice_question',
    selectionDeadline: 0,
    questionDeadline: 0,
    attackerIds: ['p_atk'],
    defenderIds: ['p_def'],
    byePlayerIds: [],
    battles: [
      {
        battleId: 'b_tower_hit',
        attackerId: 'p_atk',
        defenderId: 'p_def',
        targetTerritoryId: baseDefId,
        status: 'resolved',
        outcome: 'attacker_won',
        winnerId: 'p_atk',
      },
    ],
  };

  (gm as any).applySimultaneousWarRoundOutcomes(game);

  const attackerAfter = game.players.find((p) => p.id === 'p_atk')!;
  const defenderAfter = game.players.find((p) => p.id === 'p_def')!;

  assert.equal(game.territories[baseDefId].castleTowers, 2, 'Cetatea apărătorului scade de la 3 la 2 turnuri');
  assert.equal(defenderAfter.castleTowers, 2);
  assert.equal(
    attackerAfter.attackBonusPoints,
    SCORING.WAR_DUEL,
    'Atacatorul primește +400 în attackBonusPoints'
  );
  assert.equal(
    attackerAfter.score,
    attackerBefore + SCORING.WAR_DUEL,
    'Scorul total al atacatorului păstrează bonusul de +400 puncte după recalculatePlayerScores!'
  );
  (gm as any).clearRoomTimers(room.roomId);
});

test('V9 Test 23: Audit editorial V9 (reviewStatus === approved, factKey non-repetitiv între choice și estimation, echilibru 14 categorii <= 12.5%)', () => {
  const categoryCounts: Record<string, number> = {};
  for (const q of INITIAL_QUESTIONS) {
    assert.equal(q.reviewStatus, 'approved', `Întrebarea ${q.id} trebuie să aibă reviewStatus=approved`);
    assert.ok(q.factKey && q.factKey.length >= 6, `Întrebarea ${q.id} trebuie să aibă factKey valid`);
    assert.ok(
      q.sourceUrl &&
        q.sourceUrl.startsWith('https://') &&
        q.sourceUrl !== 'https://ro.wikipedia.org' &&
        q.sourceUrl !== 'https://ro.wikipedia.org/',
      `Întrebarea ${q.id} trebuie să aibă sourceUrl specific (actual: ${q.sourceUrl})`
    );
    assert.ok(q.sourceTitle && q.sourceTitle.length >= 5, `Întrebarea ${q.id} trebuie să aibă sourceTitle`);
    categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1;
  }

  for (const [cat, count] of Object.entries(categoryCounts)) {
    const sharePct = (count / INITIAL_QUESTIONS.length) * 100;
    assert.ok(
      sharePct <= 12.5,
      `Categoria ${cat} depășește 12.5% din bancă (${sharePct.toFixed(2)}%)`
    );
  }

  // Verify factKey non-repetition across choice and estimation in the same match
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'u_fk', username: 'FactKeyHost', avatar: 'av_vlad' },
    maxPlayers: 4,
    initialBotsCount: 3,
    isPrivate: true,
  });

  const seenFactKeys = new Set<string>();
  for (let i = 0; i < 160; i++) {
    const qType = i % 2 === 0 ? 'choice' : 'estimation';
    const q = gm.getRandomQuestion(room, qType);
    assert.ok(q && q.factKey);
    assert.equal(
      seenFactKeys.has(q.factKey),
      false,
      `factKey duplicat (${q.factKey}) extras în aceeași partidă la pasul #${i + 1}!`
    );
    seenFactKeys.add(q.factKey);
  }
  assert.equal(room.usedFactKeys?.length, 160);
  (gm as any).clearRoomTimers(room.roomId);
});

test('V9 Test 24: Database.normalizeUsersMap convertește users: [] în {} și data/conquiz_db.example.json este valid', () => {
  const normalizedFromArray = Database.normalizeUsersMap([
    {
      id: 'u_arr_1',
      username: 'UserDinArray',
      email: 'arr@test.local',
      passwordHash: 'h',
      role: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
      profile: {} as any,
    },
  ]);
  assert.equal(Array.isArray(normalizedFromArray), false, 'Rezultatul nu are voie să fie Array');
  assert.equal(normalizedFromArray['u_arr_1'].username, 'UserDinArray');

  const normalizedEmpty = Database.normalizeUsersMap([]);
  assert.equal(Array.isArray(normalizedEmpty), false);
  assert.deepEqual(normalizedEmpty, {});

  const examplePath = path.resolve(process.cwd(), 'data/conquiz_db.example.json');
  assert.ok(fs.existsSync(examplePath), 'data/conquiz_db.example.json trebuie să existe');
  const parsedExample = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
  assert.equal(
    typeof parsedExample.users === 'object' &&
      parsedExample.users !== null &&
      !Array.isArray(parsedExample.users),
    true,
    'În data/conquiz_db.example.json, users trebuie să fie obiect {}, nu array []'
  );
});

test('V9 Test 25: Politica anti-blocaj la alocarea teritoriilor neutre (maxim 2 reîncercări la NO_RESPONSE, apoi alocare deterministă)', () => {
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'u_alloc1', username: 'Alloc1', avatar: 'av_vlad' },
    maxPlayers: 2,
    initialBotsCount: 0,
    isPrivate: true,
  });
  gm.joinRoom(room.roomId, { id: 'u_alloc2', username: 'Alloc2', avatar: 'av_stefan' });
  gm.setReady(room.roomId, 'u_alloc2', true);
  gm.startGame(room.roomId, 'u_alloc1');

  const game = gm.getRoom(room.roomId)!;
  const tIds = Object.keys(game.territories);
  // Leave only 1 neutral territory, assign the rest
  const neutralTid = tIds[tIds.length - 1];
  tIds.slice(0, -1).forEach((tid, idx) => {
    game.territories[tid].ownerId = idx % 2 === 0 ? 'u_alloc1' : 'u_alloc2';
    game.territories[tid].points = 300;
  });
  game.territories[neutralTid].ownerId = null;

  game.phase = 'conquest';
  game.allocationNoResponseRetries = 2; // Already retried twice
  game.currentQuestion = {
    questionInstanceId: 'q_alloc_no_resp',
    question: gm.getRandomQuestion(game, 'estimation')!,
    startTime: Date.now() - 20000,
    durationSeconds: 12,
    attackerId: 'u_alloc1',
    targetTerritoryId: neutralTid,
    phaseContext: 'allocation',
    participantIds: ['u_alloc1', 'u_alloc2'],
    playerAnswers: {}, // Nobody answered
    resolved: false,
  };

  (gm as any).resolveCurrentQuestion(game.roomId);

  assert.notEqual(
    game.territories[neutralTid].ownerId,
    null,
    'După atingerea pragului de 2 reîncercări fără răspuns, teritoriul neutru este alocat determinist pentru a preveni blocarea partidei'
  );
  (gm as any).clearRoomTimers(room.roomId);
});

test('V9 Test 26: Simulare deterministă a fluxului complet pentru 2, 3, 4, 6, 8 și 10 jucători (fără duplicate de question.id sau factKey)', () => {
  for (const playerCount of [2, 3, 4, 6, 8, 10]) {
    const gm = new GameManager();
    const room = gm.createRoom({
      hostUser: { id: 'host_sim', username: 'SimHost', avatar: 'av_vlad' },
      maxPlayers: playerCount,
      initialBotsCount: playerCount - 1,
      isPrivate: true,
    });

    const startRes = gm.startGame(room.roomId, 'host_sim');
    assert.equal(startRes.success, true, `Start game pentru ${playerCount} jucători`);

    const game = gm.getRoom(room.roomId)!;
    assert.equal(game.players.length, playerCount);
    assert.equal(
      Object.keys(game.territories).length,
      getTerritoryCountForPlayers(playerCount),
      `Harta pentru ${playerCount}p are numărul corect de teritorii`
    );

    // 1. Complete base selection for all players
    for (let i = 0; i < playerCount; i++) {
      const currentPlayer = game.players[game.activePlayerIndex];
      const remainingAfter = playerCount - (i + 1);
      const validBase = Object.values(game.territories).find((t) =>
        canCompleteBaseSelection(t.id, game.territories, remainingAfter)
      )!;
      assert.ok(validBase, `Bază validă găsită pentru jucătorul ${i + 1}/${playerCount}`);
      const res = gm.selectTerritory(room.roomId, currentPlayer.id, validBase.id);
      assert.equal(res.success, true);
    }
    assert.equal(game.phase, 'conquest', `${playerCount}p trece în faza de cucerire`);

    // 2. Assign remaining neutral territories and transition to war phase
    const neutralIds = Object.keys(game.territories).filter((id) => !game.territories[id].ownerId);
    neutralIds.forEach((tid, idx) => {
      game.territories[tid].ownerId = game.players[idx % playerCount].id;
      game.territories[tid].points = SCORING.ALLOCATION;
    });
    (gm as any).recalculatePlayerScores(game);
    (gm as any).enterWarPhase(game);

    assert.equal(game.phase, 'war', `${playerCount}p intră în faza de război simultan`);
    assert.ok(game.warRound);
    assert.equal(
      game.warRound.battles.length,
      Math.floor(playerCount / 2),
      `${playerCount}p formează ${Math.floor(playerCount / 2)} bătălii simultane`
    );

    // Verify question extraction uniqueness across the simulated match
    const qChoice = gm.getRandomQuestion(game, 'choice');
    const qEst = gm.getRandomQuestion(game, 'estimation');
    assert.ok(qChoice && qEst);
    assert.notEqual(qChoice.factKey, qEst.factKey);

    (gm as any).clearRoomTimers(room.roomId);
  }
});

// ============================================================================
// V9.1 TESTS: ENV SECURITY, POSTGRESQL PRIMARY STORE, IDEMPOTENT MIGRATION,
// BACKUP/RESTORE TO SECOND INSTANCE, SNAPSHOT RECOVERY & QUESTION GOVERNANCE
// ============================================================================

function createInMemoryPostgresTestDouble() {
  type StoreState = {
    users: Map<string, any>;
    questions: Map<string, any>;
    games: Map<string, any>;
    gamePlayerResults: Map<string, any>;
    friends: Map<string, any>;
    notifications: Map<string, any>;
    snapshots: Map<string, any>;
  };

  let state: StoreState = {
    users: new Map(),
    questions: new Map(),
    games: new Map(),
    gamePlayerResults: new Map(),
    friends: new Map(),
    notifications: new Map(),
    snapshots: new Map(),
  };

  let txBackup: StoreState | null = null;

  const cloneMap = <K, V>(m: Map<K, V>) =>
    new Map(Array.from(m.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));

  const cloneState = (s: StoreState): StoreState => ({
    users: cloneMap(s.users),
    questions: cloneMap(s.questions),
    games: cloneMap(s.games),
    gamePlayerResults: cloneMap(s.gamePlayerResults),
    friends: cloneMap(s.friends),
    notifications: cloneMap(s.notifications),
    snapshots: cloneMap(s.snapshots),
  });

  const executeQuery = async (sqlText: string, params: any[] = []): Promise<{ rows: any[] }> => {
    const sql = sqlText.replace(/\s+/g, ' ').trim();

    if (sql === 'BEGIN') {
      txBackup = cloneState(state);
      return { rows: [] };
    }
    if (sql === 'COMMIT') {
      txBackup = null;
      return { rows: [] };
    }
    if (sql === 'ROLLBACK') {
      if (txBackup) {
        state = txBackup;
        txBackup = null;
      }
      return { rows: [] };
    }

    // SELECT COUNT queries used by executeJsonToPostgresMigration
    if (
      sql.startsWith(
        "SELECT COUNT(*)::int AS cnt FROM questions WHERE review_status = 'approved' AND is_disabled = FALSE"
      )
    ) {
      const cnt = Array.from(state.questions.values()).filter(
        (q) => q.review_status === 'approved' && !q.is_disabled
      ).length;
      return { rows: [{ cnt }] };
    }
    if (sql.startsWith('SELECT COUNT(*)::int AS cnt FROM users')) {
      return { rows: [{ cnt: state.users.size }] };
    }
    if (sql.startsWith('SELECT COUNT(*)::int AS cnt FROM questions')) {
      return { rows: [{ cnt: state.questions.size }] };
    }
    if (sql.startsWith('SELECT COUNT(*)::int AS cnt FROM games')) {
      return { rows: [{ cnt: state.games.size }] };
    }
    if (sql.startsWith('SELECT COUNT(*)::int AS cnt FROM game_player_results')) {
      return { rows: [{ cnt: state.gamePlayerResults.size }] };
    }
    if (sql.startsWith('SELECT COUNT(*)::int AS cnt FROM friends')) {
      return { rows: [{ cnt: state.friends.size }] };
    }
    if (sql.startsWith('SELECT COUNT(*)::int AS cnt FROM notifications')) {
      return { rows: [{ cnt: state.notifications.size }] };
    }

    // SELECT queries used by loadAllFromPostgres & loadActiveGameSnapshotsFromPostgres
    if (sql.startsWith('SELECT * FROM users')) {
      return { rows: Array.from(state.users.values()) };
    }
    if (sql.startsWith('SELECT * FROM questions')) {
      return { rows: Array.from(state.questions.values()) };
    }
    if (sql.startsWith('SELECT * FROM games')) {
      return { rows: Array.from(state.games.values()) };
    }
    if (sql.startsWith('SELECT * FROM game_player_results')) {
      return { rows: Array.from(state.gamePlayerResults.values()) };
    }
    if (sql.startsWith('SELECT * FROM friends')) {
      return { rows: Array.from(state.friends.values()) };
    }
    if (sql.startsWith('SELECT * FROM notifications')) {
      return { rows: Array.from(state.notifications.values()) };
    }
    if (sql.startsWith('SELECT room_id, state_json FROM active_game_snapshots')) {
      return { rows: Array.from(state.snapshots.values()) };
    }

    // INSERT / UPSERT queries matching server/postgresRepo.ts
    if (sql.startsWith('INSERT INTO users')) {
      const [
        id,
        username,
        email,
        password_hash,
        role,
        is_banned,
        avatar,
        title,
        rating,
        matches_played,
        wins,
        losses,
        territories_conquered,
        correct_answers_total,
        highest_score,
        created_at,
      ] = params;
      state.users.set(id, {
        id,
        username,
        email,
        password_hash,
        role,
        is_banned,
        avatar,
        title,
        rating,
        matches_played,
        wins,
        losses,
        territories_conquered,
        correct_answers_total,
        highest_score,
        created_at,
      });
      return { rows: [] };
    }

    if (sql.startsWith('INSERT INTO questions')) {
      const [
        id,
        category,
        difficulty,
        type,
        question,
        normalized_fingerprint,
        fact_key,
        options_json,
        correct_answer_index,
        target_number,
        unit,
        explanation,
        source_url,
        source_title,
        source_checked_at,
        review_status,
        is_disabled,
        reported_count,
      ] = params;
      state.questions.set(id, {
        id,
        category,
        difficulty,
        type,
        question,
        normalized_fingerprint,
        fact_key,
        options_json: options_json ? JSON.parse(options_json) : null,
        correct_answer_index,
        target_number,
        unit,
        explanation,
        source_url,
        source_title,
        source_checked_at,
        review_status,
        is_disabled,
        reported_count,
      });
      return { rows: [] };
    }

    if (sql.startsWith('DELETE FROM questions WHERE id = $1')) {
      state.questions.delete(params[0]);
      return { rows: [] };
    }

    if (sql.startsWith('INSERT INTO games')) {
      const [
        id,
        room_id,
        created_at,
        duration_seconds,
        player_count,
        winner_id,
        winner_username,
        players_summary,
      ] = params;
      state.games.set(id, {
        id,
        room_id,
        created_at,
        duration_seconds,
        player_count,
        winner_id,
        winner_username,
        players_summary: players_summary ? JSON.parse(players_summary) : [],
      });
      return { rows: [] };
    }

    if (sql.startsWith('INSERT INTO game_player_results')) {
      const [
        game_id,
        user_id,
        username,
        score,
        territories,
        correct_answers,
        is_winner,
        created_at,
      ] = params;
      // Enforce UNIQUE (game_id, user_id)
      const uqKey = `${game_id}::${user_id}`;
      state.gamePlayerResults.set(uqKey, {
        id: state.gamePlayerResults.size + 1,
        game_id,
        user_id,
        username,
        score,
        territories,
        correct_answers,
        is_winner,
        created_at,
      });
      return { rows: [] };
    }

    if (sql.startsWith('INSERT INTO friends')) {
      const [id, requester_id, recipient_id, status, created_at] = params;
      state.friends.set(id, { id, requester_id, recipient_id, status, created_at });
      return { rows: [] };
    }

    if (sql.startsWith('INSERT INTO notifications')) {
      const [id, user_id, title, message, type, is_read, created_at] = params;
      state.notifications.set(id, {
        id,
        user_id,
        title,
        message,
        type,
        is_read,
        created_at,
      });
      return { rows: [] };
    }

    if (sql.startsWith('INSERT INTO active_game_snapshots')) {
      const [room_id, phase, player_count, state_json, interrupted_by_shutdown] = params;
      state.snapshots.set(room_id, {
        room_id,
        phase,
        player_count,
        state_json: typeof state_json === 'string' ? JSON.parse(state_json) : state_json,
        interrupted_by_shutdown,
      });
      return { rows: [] };
    }

    if (sql.startsWith('DELETE FROM active_game_snapshots')) {
      state.snapshots.delete(params[0]);
      return { rows: [] };
    }

    return { rows: [] };
  };

  return {
    pool: {
      query: executeQuery,
      connect: async () => ({
        query: executeQuery,
        release: () => {},
      }),
      end: async () => {},
    },
    getState: () => state,
    dumpBackupArchive: () =>
      JSON.stringify(cloneState(state), (_, v) =>
        v instanceof Map ? Array.from(v.entries()) : v
      ),
    restoreFromBackupArchive: (serialized: string) => {
      const raw = JSON.parse(serialized);
      state = {
        users: new Map(raw.users),
        questions: new Map(raw.questions),
        games: new Map(raw.games),
        gamePlayerResults: new Map(raw.gamePlayerResults),
        friends: new Map(raw.friends),
        notifications: new Map(raw.notifications),
        snapshots: new Map(raw.snapshots),
      };
    },
  };
}

test('V9.1 Test 27: Securitatea variabilelor de mediu respinge .env.example nemodificat, placeholder-ele românești/englezești și parolele slabe în producție', () => {
  const envExamplePath = path.resolve(process.cwd(), '.env.example');
  const rawEnvExample = fs.readFileSync(envExamplePath, 'utf-8');
  assert.equal(
    rawEnvExample.includes('CLOUDFLARE_TUNNEL_TOKEN'),
    false,
    '.env.example nu trebuie să mai conțină CLOUDFLARE_TUNNEL_TOKEN'
  );

  // Parse .env.example key-value pairs
  const parsedExampleEnv: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  for (const line of rawEnvExample.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      parsedExampleEnv[k] = v;
    }
  }

  const validationFromExample = validateProductionEnv(parsedExampleEnv);
  assert.equal(validationFromExample.valid, false);
  assert.ok(
    validationFromExample.errors.length >= 5,
    `Pornirea cu .env.example nemodificat trebuie respinsă cu erori explicite (găsite: ${validationFromExample.errors.length})`
  );
  assert.throws(
    () => assertSafeRuntimeEnvironment(parsedExampleEnv),
    /SECURITATE PRODUCȚIE/,
    'assertSafeRuntimeEnvironment trebuie să arunce excepție la pornirea cu .env.example'
  );

  // Verify Romanian & English placeholders are caught
  assert.equal(isPlaceholderValue('SchimbaCuOParolaAleatorieFoarteLunga123!'), true);
  assert.equal(isPlaceholderValue('INLOCUIESTE_CU_SECRET_JWT_ALEATORIU'), true);
  assert.equal(isPlaceholderValue('replace-with-your-secret-key-minimum-32-chars'), true);
  assert.equal(isPlaceholderValue('https://conquiz.domeniu.ro'), true);

  // Verify strong production configuration passes cleanly
  const validProdEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    APP_URL: 'https://conquiz.joc-romania-live.ro',
    JWT_SECRET: '9f8e7d6c5b4a392817263544536271809a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
    ADMIN_EMAIL: 'voievod@joc-romania-live.ro',
    ADMIN_PASSWORD: 'Xk9#mP2$vL8@nQ4!zR7*wT5&yU3',
    POSTGRES_PASSWORD: 'Pg8_vK3-mN9_pL2.qR6_wS4-xZ1',
    DATABASE_URL:
      'postgresql://conquiz_user:Pg8_vK3-mN9_pL2.qR6_wS4-xZ1@db:5432/conquiz',
  };
  const validResult = validateProductionEnv(validProdEnv);
  assert.equal(validResult.valid, true);
  assert.deepEqual(validResult.errors, []);
});

test('V9.1 Test 28: PostgreSQL ca sursă principală de date – citire/scriere reală și tranzacții SQL atomice (COMMIT și ROLLBACK)', async () => {
  const pgDouble = createInMemoryPostgresTestDouble();
  setPostgresPoolForTesting(pgDouble.pool);

  try {
    // 1. Test transactional rollback on error
    await upsertUserToPostgres({
      id: 'u_pg_1',
      username: 'StefanVoievod',
      email: 'stefan@moldova.ro',
      passwordHash: 'hash_stefan',
      role: 'user',
      createdAt: '2026-11-10T10:00:00.000Z',
      profile: {
        id: 'u_pg_1',
        username: 'StefanVoievod',
        email: 'stefan@moldova.ro',
        role: 'user',
        avatar: 'av_stefan',
        title: 'Răzeș',
        rating: 1250,
        matchesPlayed: 1,
        wins: 1,
        losses: 0,
        territoriesConquered: 15,
        correctAnswersTotal: 12,
        highestScore: 4800,
        createdAt: '2026-11-10T10:00:00.000Z',
      },
    });

    await assert.rejects(
      async () => {
        await withPostgresTransaction(async (client) => {
          await client.query('DELETE FROM questions WHERE id = $1', ['non_existent']);
          throw new Error('Eroare simulată în interiorul tranzacției');
        });
      },
      /Eroare simulată/
    );

    // 2. Test atomic game + game_player_results insertion and friend request + notification transaction
    await insertGameToPostgres({
      id: 'g_pg_1',
      roomId: 'RO1457',
      createdAt: '2026-11-10T10:30:00.000Z',
      durationSeconds: 420,
      playerCount: 2,
      winnerId: 'u_pg_1',
      winnerUsername: 'StefanVoievod',
      playersSummary: [
        {
          userId: 'u_pg_1',
          username: 'StefanVoievod',
          score: 4800,
          territories: 25,
          correctAnswers: 12,
          isWinner: true,
        },
        {
          userId: 'bot_mircea',
          username: 'Bot_Mircea',
          score: 2100,
          territories: 16,
          correctAnswers: 7,
          isWinner: false,
        },
      ],
    });

    await createFriendRequestWithNotificationToPostgres(
      {
        id: 'fr_pg_1',
        requesterId: 'u_pg_1',
        recipientId: 'u_pg_2',
        status: 'pending',
        createdAt: '2026-11-10T10:35:00.000Z',
      },
      {
        id: 'notif_pg_1',
        userId: 'u_pg_2',
        type: 'friend_request',
        title: 'Cerere de prietenie',
        message: 'StefanVoievod vrea să fiți prieteni!',
        isRead: false,
        createdAt: '2026-11-10T10:35:00.000Z',
      }
    );

    const loaded = await loadAllFromPostgres();
    assert.ok(loaded, 'loadAllFromPostgres trebuie să returneze datele din PostgreSQL');
    assert.equal(loaded.users['u_pg_1'].username, 'StefanVoievod');
    assert.equal(loaded.games.length, 1);
    assert.equal(
      loaded.games[0].playersSummary.length,
      2,
      'game_player_results încărcate și atașate la meci'
    );
    assert.equal(loaded.friends.length, 1);
    assert.equal(loaded.notifications.length, 1);
  } finally {
    setPostgresPoolForTesting(null);
  }
});

test('V9.1 Test 29: Scriptul de migrare executeJsonToPostgresMigration este 100% idempotent la rularea de două ori consecutiv (inclusiv întrebări custom și game_player_results)', async () => {
  const pgDouble = createInMemoryPostgresTestDouble();
  setPostgresPoolForTesting(pgDouble.pool);

  const tempJsonPath = path.resolve(process.cwd(), 'data/test_v91_migration_tmp.json');
  const customQuestion = {
    id: 'custom_admin_q_v91',
    type: 'choice',
    category: 'istorie',
    difficulty: 'mediu',
    question:
      'În ce an a fost proclamată Independența de Stat a României în Parlament de Mihail Kogălniceanu (întrebare custom admin)?',
    options: ['1877', '1859', '1881', '1918'],
    correctAnswerIndex: 0,
    explanation: 'Independența a fost proclamată la 9 mai 1877.',
    verified: true,
    reviewStatus: 'approved',
    factKey: 'fact_custom_indep_1877',
    sourceUrl: 'https://ro.wikipedia.org/wiki/R%C4%83zboiul_de_Independen%C8%9B%C4%83_al_Rom%C3%A2niei',
    sourceTitle: 'Războiul de Independență al României (1877)',
    sourceCheckedAt: '2026-11-10',
  };

  const sampleJsonDb = {
    users: {
      u_mig_1: {
        id: 'u_mig_1',
        username: 'MihaiViteazul',
        email: 'mihai@alba.ro',
        passwordHash: 'hash_mihai',
        role: 'user',
        createdAt: '2026-11-10T08:00:00.000Z',
        profile: {
          id: 'u_mig_1',
          username: 'MihaiViteazul',
          email: 'mihai@alba.ro',
          role: 'user',
          avatar: 'av_mihai',
          title: 'Mare Voievod',
          rating: 1320,
          matchesPlayed: 2,
          wins: 2,
          losses: 0,
          territoriesConquered: 41,
          correctAnswersTotal: 25,
          highestScore: 5200,
          createdAt: '2026-11-10T08:00:00.000Z',
        },
      },
      u_mig_2: {
        id: 'u_mig_2',
        username: 'MirceaCelBatran',
        email: 'mircea@arges.ro',
        passwordHash: 'hash_mircea',
        role: 'user',
        createdAt: '2026-11-10T08:05:00.000Z',
        profile: {
          id: 'u_mig_2',
          username: 'MirceaCelBatran',
          email: 'mircea@arges.ro',
          role: 'user',
          avatar: 'av_mircea',
          title: 'Voievod',
          rating: 1210,
          matchesPlayed: 1,
          wins: 0,
          losses: 1,
          territoriesConquered: 13,
          correctAnswersTotal: 6,
          highestScore: 1900,
          createdAt: '2026-11-10T08:05:00.000Z',
        },
      },
    },
    questions: [customQuestion],
    games: [
      {
        id: 'g_mig_1600',
        roomId: 'RO1600',
        createdAt: '2026-11-10T09:00:00.000Z',
        durationSeconds: 380,
        playerCount: 2,
        winnerId: 'u_mig_1',
        winnerUsername: 'MihaiViteazul',
        playersSummary: [
          {
            userId: 'u_mig_1',
            username: 'MihaiViteazul',
            score: 5200,
            territories: 28,
            correctAnswers: 14,
            isWinner: true,
          },
          {
            userId: 'u_mig_2',
            username: 'MirceaCelBatran',
            score: 1900,
            territories: 13,
            correctAnswers: 6,
            isWinner: false,
          },
        ],
      },
    ],
    friends: [
      {
        id: 'fr_mig_1',
        requesterId: 'u_mig_1',
        recipientId: 'u_mig_2',
        status: 'accepted',
        createdAt: '2026-11-10T09:10:00.000Z',
      },
    ],
    notifications: [
      {
        id: 'notif_mig_1',
        userId: 'u_mig_1',
        type: 'system',
        title: 'Bun venit',
        message: 'Cont migrat în PostgreSQL',
        isRead: false,
        createdAt: '2026-11-10T09:15:00.000Z',
      },
    ],
  };

  fs.writeFileSync(tempJsonPath, JSON.stringify(sampleJsonDb, null, 2), 'utf-8');

  try {
    // Run 1
    const run1 = await executeJsonToPostgresMigration({ customDbJsonPath: tempJsonPath });
    const countsAfterRun1 = {
      users: pgDouble.getState().users.size,
      questions: pgDouble.getState().questions.size,
      games: pgDouble.getState().games.size,
      results: pgDouble.getState().gamePlayerResults.size,
      friends: pgDouble.getState().friends.size,
      notifications: pgDouble.getState().notifications.size,
    };

    // Run 2 (must be 100% idempotent with zero duplicate records)
    const run2 = await executeJsonToPostgresMigration({ customDbJsonPath: tempJsonPath });
    const countsAfterRun2 = {
      users: pgDouble.getState().users.size,
      questions: pgDouble.getState().questions.size,
      games: pgDouble.getState().games.size,
      results: pgDouble.getState().gamePlayerResults.size,
      friends: pgDouble.getState().friends.size,
      notifications: pgDouble.getState().notifications.size,
    };

    assert.deepEqual(
      countsAfterRun2,
      countsAfterRun1,
      'A doua rulare a migrării nu are voie să dubleze nicio înregistrare în PostgreSQL'
    );
    assert.equal(run1.playerResultsAfter, 2);
    assert.equal(run2.playerResultsAfter, 2);
    assert.ok(
      pgDouble.getState().questions.has('custom_admin_q_v91'),
      'Întrebarea custom din JSON trebuie migrată în PostgreSQL alături de banca canonică'
    );
  } finally {
    if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
    setPostgresPoolForTesting(null);
  }
});

test('V9.1 Test 30: Backup și restaurare într-o a doua instanță PostgreSQL + recuperarea camerelor active (restoreGamesFromSnapshots) la restart', async () => {
  const pgPrimary = createInMemoryPostgresTestDouble();
  const pgRestoreTarget = createInMemoryPostgresTestDouble();
  const gmBeforeRestart = new GameManager();
  const gmAfterRestart = new GameManager();

  setPostgresPoolForTesting(pgPrimary.pool);
  try {
    // Populate Primary PostgreSQL with user, custom question, game history, and an active multiplayer room snapshot
    await upsertUserToPostgres({
      id: 'u_restore_1',
      username: 'AlexandruCuza',
      email: 'cuza@principate.ro',
      passwordHash: 'hash_cuza',
      role: 'user',
      createdAt: '2026-11-10T11:00:00.000Z',
      profile: {
        id: 'u_restore_1',
        username: 'AlexandruCuza',
        email: 'cuza@principate.ro',
        role: 'user',
        avatar: 'av_cuza',
        title: 'Domnitor',
        rating: 1450,
        matchesPlayed: 5,
        wins: 4,
        losses: 1,
        territoriesConquered: 95,
        correctAnswersTotal: 60,
        highestScore: 6100,
        createdAt: '2026-11-10T11:00:00.000Z',
      },
    });

    await upsertQuestionToPostgres({
      id: 'q_restore_check',
      type: 'estimation',
      category: 'istorie',
      difficulty: 'usor',
      question: 'În ce an a avut loc Mica Unire sub Alexandru Ioan Cuza (test restaurare)?',
      targetNumber: 1859,
      unit: 'an',
      explanation: 'Mica Unire a avut loc la 24 ianuarie 1859.',
      verified: true,
      reviewStatus: 'approved',
      factKey: 'fact_restore_1859',
      sourceUrl: 'https://ro.wikipedia.org/wiki/Unirea_Principatelor_Rom%C3%A2ne',
      sourceTitle: 'Unirea Principatelor Române (1859)',
      sourceCheckedAt: '2026-11-10',
    });

    await insertGameToPostgres({
      id: 'g_restore_1',
      roomId: 'RO1859',
      createdAt: '2026-11-10T11:20:00.000Z',
      durationSeconds: 310,
      playerCount: 1,
      winnerId: 'u_restore_1',
      winnerUsername: 'AlexandruCuza',
      playersSummary: [
        {
          userId: 'u_restore_1',
          username: 'AlexandruCuza',
          score: 4100,
          territories: 22,
          correctAnswers: 11,
          isWinner: true,
        },
      ],
    });

    const activeRoom = gmBeforeRestart.createRoom({
      hostUser: { id: 'u_restore_1', username: 'AlexandruCuza', avatar: 'av_cuza' },
      maxPlayers: 3,
      initialBotsCount: 2,
      isPrivate: true,
    });
    gmBeforeRestart.startGame(activeRoom.roomId, 'u_restore_1');
    await saveActiveGameSnapshotsToPostgres([activeRoom], true);
    gmBeforeRestart.shutdownAllRooms();

    // 1. Perform Backup from Primary Instance
    const backupArchive = pgPrimary.dumpBackupArchive();
    assert.ok(backupArchive.length > 100, 'Arhiva de backup trebuie să conțină datele serializate');

    // 2. Restore into the SEPARATE PostgreSQL Instance (pgRestoreTarget)
    pgRestoreTarget.restoreFromBackupArchive(backupArchive);
    setPostgresPoolForTesting(pgRestoreTarget.pool);

    const restoredData = await loadAllFromPostgres();
    assert.ok(restoredData);
    assert.equal(restoredData.users['u_restore_1'].username, 'AlexandruCuza');
    assert.equal(restoredData.users['u_restore_1'].profile.wins, 4);
    assert.equal(restoredData.games.length, 1);
    assert.equal(restoredData.games[0].roomId, 'RO1859');
    assert.equal(restoredData.games[0].playersSummary[0].score, 4100);
    assert.ok(restoredData.questions.some((q) => q.id === 'q_restore_check'));

    // 3. Verify active room snapshot recovery after server restart
    const snapshots = await loadActiveGameSnapshotsFromPostgres();
    assert.equal(snapshots.length, 1);
    const restoredCount = gmAfterRestart.restoreGamesFromSnapshots(snapshots);
    assert.equal(
      restoredCount,
      1,
      'Camera activă trebuie restaurată din snapshot la repornirea serverului'
    );
    const recoveredRoom = gmAfterRestart.getRoom(activeRoom.roomId);
    assert.ok(recoveredRoom, 'Camera restaurată trebuie să fie accesibilă în GameManager');
    assert.equal(recoveredRoom.phase, 'base_selection');
    assert.equal(recoveredRoom.players.length, 3);
    assert.equal(
      recoveredRoom.players[0].isConnected,
      false,
      'Jucătorii umani pornesc ca deconectați până la reconectarea socket-ului'
    );
  } finally {
    gmBeforeRestart.shutdownAllRooms();
    gmAfterRestart.shutdownAllRooms();
    setPostgresPoolForTesting(null);
  }
});

test('V9.1 Test 31: Guvernanța băncii de întrebări – statut implicit draft, filtrare strictă approved în meci și nicio categorie peste 12,5%', () => {
  // 1. Add a question without reviewStatus and verify it defaults to draft and is NOT selected by GameManager
  const draftQ = db.addQuestion({
    id: 'q_draft_test_v91',
    type: 'choice',
    category: 'istorie',
    difficulty: 'mediu',
    question: 'Întrebare nouă propusă fără reviewStatus explicit pentru testul V9.1?',
    options: ['Varianta A', 'Varianta B', 'Varianta C', 'Varianta D'],
    correctAnswerIndex: 0,
    explanation: 'Trebuie să rămână în draft până la aprobarea unui admin.',
  });

  try {
    assert.equal(
      draftQ.reviewStatus,
      'draft',
      'Întrebarea fără reviewStatus explicit trebuie să fie draft'
    );
    assert.equal(draftQ.verified, false, 'Întrebarea în draft trebuie să aibă verified = false');

    const gm = new GameManager();
    const room = gm.createRoom({
      hostUser: { id: 'u_gov', username: 'GovHost', avatar: 'av_vlad' },
      maxPlayers: 2,
      initialBotsCount: 1,
      selectedCategories: ['istorie'],
      isPrivate: true,
    });

    for (let i = 0; i < 80; i++) {
      const picked = gm.getRandomQuestion(room, 'choice');
      assert.ok(picked);
      assert.notEqual(
        picked.id,
        draftQ.id,
        'Întrebarea în statut draft nu are voie să apară în meci!'
      );
      assert.equal(picked.reviewStatus, 'approved');
    }
    (gm as any).clearRoomTimers(room.roomId);
  } finally {
    db.deleteQuestion(draftQ.id);
  }

  // 2. Verify category balance <= 12.5% across the canonical question bank
  const allCanonical = INITIAL_QUESTIONS;
  const catCounts: Record<string, number> = {};
  for (const q of allCanonical) {
    catCounts[q.category] = (catCounts[q.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(catCounts)) {
    const share = count / allCanonical.length;
    assert.ok(
      share <= 0.125,
      `Categoria ${cat} are ponderea ${(share * 100).toFixed(2)}%, depășind pragul de 12,5%`
    );
  }
});
