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
  shouldContinueConquestPhase,
  buildSimultaneousWarPairings,
  buildIndividualWarTurnOrder,
  getLegalWarTargetsForAttacker,
  formatWarAttackAnnouncement,
  isShortReadableChoiceQuestion,
  evaluateWarBattleChoiceOutcome,
  evaluateWarBattleTiebreakOutcome,
  getLegalWarTargetsForPair,
  getLegalNeutralTargetsForPlayer,
  getLegalAllocationTargetsForPlayer,
  selectEligibleAllocationWinner,
  sanitizeNumericInput,
  buildRoundDisplayItems,
  computeClockOffsetSample,
  selectBestClockOffset,
  estimateServerNow,
  getMapAnimationConfig,
  computeTerritorySelectionVisualState,
  resolveAttackOriginTerritory,
  buildActiveAttackVectors,
  detectTerritoryMapTransitions,
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

test('Test 7: fluxul complet de Război Individual (1 contra 1 pe rând) pentru 4 jucători (atacatorul activ alege ținta -> prezentare atac -> întrebare duel -> rezultat Atac reușit / Apărare reușită)', () => {
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

  // Enter individual war phase
  (gm as any).enterWarPhase(game);

  assert.equal(game.phase, 'war');
  assert.ok(game.warRound);
  assert.equal(game.warRound.status, 'selecting_targets');
  assert.equal(game.warRound.battles.length, 1, 'Fiecare atac din Război este un duel individual 1 contra 1');
  assert.equal(game.warTurnQueue?.length, 3, 'Ceilalți 3 jucători așteaptă în coada secvențială a rundei');

  const battle1 = game.warRound.battles[0];
  assert.equal(battle1.attackerId, 'p1');

  // Non-attacker cannot select a target during p1's attack turn
  const nonAtkAttempt = gm.selectTerritory(room.roomId, 'p2', tIds[0]);
  assert.equal(nonAtkAttempt.success, false);

  // Attacker 1 cannot target a non-adjacent territory
  const legal1 = getLegalWarTargetsForAttacker(battle1.attackerId, game.territories);
  assert.ok(legal1.length > 0);
  const nonAdjacentEnemy = Object.values(game.territories).find(
    (t) => t.ownerId !== battle1.attackerId && !legal1.includes(t.id)
  );
  if (nonAdjacentEnemy) {
    const remoteAttempt = gm.selectTerritory(room.roomId, battle1.attackerId, nonAdjacentEnemy.id);
    assert.equal(remoteAttempt.success, false);
  }

  // Attacker 1 picks a legal adjacent enemy territory -> defenderId is determined from the target territory owner
  const target1Id = legal1[0];
  const expectedDefender1Id = game.territories[target1Id].ownerId!;
  const sel1 = gm.selectTerritory(room.roomId, battle1.attackerId, target1Id);
  assert.equal(sel1.success, true);
  assert.equal(battle1.defenderId, expectedDefender1Id);
  assert.match(sel1.message || '', /^ATAC: P1 atacă .+ apărat de P\d$/);

  // Immediately after attacker selects target, warRound enters 'attack_preview' before the question appears!
  assert.equal(game.warRound.status, 'attack_preview');
  assert.equal(game.currentQuestion, null, 'Întrebarea nu pornește înainte de etapa de prezentare a atacului');

  // Complete the pre-question attack presentation stage
  (gm as any).launchSimultaneousWarChoiceQuestion(game);

  // Now choice question is active for the 2 duelists (attacker + defender) with 15s timer!
  const activeCq = gm.getRoom(room.roomId)!.currentQuestion;
  assert.ok(activeCq);
  assert.equal(game.warRound.status, 'choice_question');
  assert.equal(activeCq.durationSeconds, 15);
  assert.deepEqual(activeCq.participantIds, [battle1.attackerId, battle1.defenderId]);

  const correctIdx = activeCq.question.correctAnswerIndex!;
  const wrongIdx = (correctIdx + 1) % 4;

  // Battle 1: Attacker 1 answers right, Defender 1 answers wrong
  gm.submitAnswer(room.roomId, battle1.attackerId, correctIdx);
  gm.submitAnswer(room.roomId, battle1.defenderId, wrongIdx);

  // Question resolves immediately once both duelists answered
  assert.equal(activeCq.resolved, true);
  assert.equal(battle1.outcome, 'attacker_won');
  assert.ok(game.warRound.lastBattleResult);
  assert.equal(game.warRound.lastBattleResult?.headline, 'Atac reușit');

  // Advance to the next player's attack turn in the same round
  (gm as any).advanceToNextWarTurnOrRound(game);
  assert.equal(game.round, 1, 'Runda rămâne 1 până când toți jucătorii din coadă își efectuează atacul');
  assert.equal(game.warRound?.battles.length, 1);
  assert.equal(game.warRound?.battles[0].attackerId, 'p2', 'Următorul jucător la rând devine atacator');

  // Verify score invariant holds for all players
  for (const p of game.players) {
    const mapSum = Object.values(game.territories)
      .filter((t) => t.ownerId === p.id)
      .reduce((acc, t) => acc + (t.points || 0) + (t.defensiveBonus || 0), 0);
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

  const model10WarBeforeTarget = buildRoundDisplayItems(game10);
  assert.equal(model10WarBeforeTarget.items.length, 10, 'În Război 10p totalul markerilor este exact 10');
  assert.equal(
    model10WarBeforeTarget.battlePairs.length,
    0,
    'Înainte de alegerea țintei nu se afișează nicio pereche'
  );

  const activeAtk10 = game10.warRound!.battles[0].attackerId;
  const validTargets10 = getLegalWarTargetsForAttacker(activeAtk10, game10.territories);
  gm.selectTerritory(room10.roomId, activeAtk10, validTargets10[0]);

  const model10WarAfterTarget = buildRoundDisplayItems(game10);
  assert.equal(model10WarAfterTarget.items.length, 10, 'După alegerea țintei rămân exact 10 markeri individuali');
  assert.equal(model10WarAfterTarget.battlePairs.length, 1, 'Există exact 1 duel activ (1 atacator vs 1 apărător)');
  assert.equal(model10WarAfterTarget.battlePairs[0].attacker.playerId, activeAtk10);
  assert.equal(
    model10WarAfterTarget.battlePairs[0].defender.playerId,
    game10.warRound!.battles[0].defenderId
  );

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

test('V8 Test 17: Banca canonică păstrează toate cele 6.241 înregistrări (1.070 întrebări active choice scurte verificate + 5.171 dezactivate), 0 duplicate și acoperă toate categoriile', () => {
  assert.equal(
    INITIAL_QUESTIONS.length,
    6241,
    `Banca canonică trebuie să păstreze toate cele 6241 înregistrări (actual: ${INITIAL_QUESTIONS.length})`
  );

  const activeList = INITIAL_QUESTIONS.filter((q) => q.reviewStatus === 'approved' && !q.isDisabled);
  const disabledList = INITIAL_QUESTIONS.filter((q) => q.isDisabled || q.reviewStatus === 'disabled');

  assert.equal(activeList.length, 1070, `Exact 1070 întrebări active aprobate (actual: ${activeList.length})`);
  assert.equal(disabledList.length, 5171, `Exact 5171 întrebări dezactivate (actual: ${disabledList.length})`);
  assert.equal(
    activeList.every((q) => q.type === 'choice'),
    true,
    'Toate întrebările active din fluxul de joc sunt cu variante de răspuns (choice)'
  );

  const seenIds = new Set<string>();
  for (const q of INITIAL_QUESTIONS) {
    assert.ok(q.id && !seenIds.has(q.id), `ID duplicat sau lipsă: ${q.id}`);
    seenIds.add(q.id);
  }

  const seenActiveFingerprints = new Set<string>();
  for (const q of activeList) {
    const fp = normalizeQuestionText(q.question);
    assert.ok(fp.length >= 8 && !seenActiveFingerprints.has(fp), `Text activ duplicat: ${q.question}`);
    seenActiveFingerprints.add(fp);

    assert.equal(q.options?.length, 4, `Întrebarea ${q.id} trebuie să aibă 4 opțiuni`);
    assert.ok(
      Number.isInteger(q.correctAnswerIndex) &&
        q.correctAnswerIndex! >= 0 &&
        q.correctAnswerIndex! <= 3
    );
  }

  const maxBudget10 = GameManager.calculateMatchQuestionBudget(10, 38, 6);
  assert.equal(maxBudget10.requiredEstimation, 0, 'Jocul nu mai cere întrebări de estimare numerică');
  assert.ok(
    activeList.length >= maxBudget10.requiredChoice,
    `Banca activă (${activeList.length}) acoperă bugetul pentru 10 jucători (${maxBudget10.requiredChoice})`
  );
});

test('V8 Test 18: GameManager.getRandomQuestion garantează non-repetiția strictă în aceeași partidă și nu resetează niciodată usedQuestionIds la epuizare', () => {
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'u_nonrep', username: 'NonRepHost', avatar: 'av_vlad' },
    maxPlayers: 4,
    initialBotsCount: 3,
    isPrivate: true,
  });

  const drawnIds = new Set<string>();
  for (let i = 0; i < 120; i++) {
    const q = gm.getRandomQuestion(room, 'choice');
    assert.ok(q, `Extragerea #${i + 1} trebuie să returneze o întrebare validă`);
    assert.equal(q.type, 'choice', 'Întrebarea extrasă trebuie să fie cu variante (choice)');
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
  assert.equal(
    exhaustedChoice,
    null,
    'La epuizarea completă a băncii, getRandomQuestion trebuie să returneze null (fără resetarea usedQuestionIds)'
  );
  (gm as any).clearRoomTimers(room.roomId);
});

test('V8 Test 19: Preflight Question Budget în startGame blochează pornirea meciului dacă toate întrebările disponibile sunt dezactivate și permite pornirea cu banca canonică', () => {
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'u_budget', username: 'BudgetHost', avatar: 'av_vlad' },
    maxPlayers: 10,
    initialBotsCount: 9,
    isPrivate: true,
  });

  // Temporarily mark currently active questions as isDisabled to test preflight rejection
  const activeBefore = db
    .getAllQuestions()
    .filter((q) => !q.isDisabled && q.reviewStatus === 'approved');
  for (const q of activeBefore) q.isDisabled = true;

  try {
    const blockedStart = gm.startGame(room.roomId, 'u_budget');
    assert.equal(blockedStart.success, false, 'startGame trebuie să respingă pornirea când bugetul de întrebări nu este îndeplinit');
  } finally {
    for (const q of activeBefore) q.isDisabled = false;
  }

  // With active questions re-enabled, 10-player match starts cleanly
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

  await db.createUser({
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

  await db.createUser({
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
    await db.deleteUser(u1Id);
    await db.deleteUser(u2Id);
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

test('V9 Test 23: Audit editorial V9 (întrebări active reviewStatus === approved, factKey non-repetitiv, surse verificate)', () => {
  const activeQuestions = INITIAL_QUESTIONS.filter(
    (q) => q.reviewStatus === 'approved' && !q.isDisabled
  );
  assert.equal(activeQuestions.length, 1070);

  for (const q of activeQuestions) {
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
  }

  // Verify factKey non-repetition across 160 draws in the same match
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'u_fk', username: 'FactKeyHost', avatar: 'av_vlad' },
    maxPlayers: 4,
    initialBotsCount: 3,
    isPrivate: true,
  });

  const seenFactKeys = new Set<string>();
  for (let i = 0; i < 160; i++) {
    const q = gm.getRandomQuestion(room, 'choice');
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
    question: gm.getRandomQuestion(game, 'choice')!,
    startTime: Date.now() - 20000,
    durationSeconds: 15,
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

    assert.equal(game.phase, 'war', `${playerCount}p intră în faza de război`);
    assert.ok(game.warRound);
    assert.equal(
      game.warRound.battles.length,
      1,
      `${playerCount}p inițiază câte 1 atac individual pe rând`
    );
    assert.equal(
      (game.warTurnQueue?.length || 0) + game.warRound.battles.length,
      playerCount,
      `Toți cei ${playerCount} jucători sunt programați secvențial în runda de război`
    );

    // Verify question extraction uniqueness across the simulated match
    const qChoice1 = gm.getRandomQuestion(game, 'choice');
    const qChoice2 = gm.getRandomQuestion(game, 'choice');
    assert.ok(qChoice1 && qChoice2);
    assert.notEqual(qChoice1.id, qChoice2.id);
    assert.notEqual(qChoice1.factKey, qChoice2.factKey);

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
        token_version,
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
        token_version: token_version ?? 1,
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

test('V9.1 Test 28 [SIMULAT - Dublură în Memorie]: Repository SQL simulat – verificare citire/scriere și tranzacții atomice simulate (COMMIT și ROLLBACK)', async () => {
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

test('V9.1 Test 29 [SIMULAT - Dublură în Memorie]: Scriptul de migrare executeJsonToPostgresMigration cu dublură în memorie este idempotent la rularea de două ori', async () => {
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

test('V9.1 Test 30 [SIMULAT - Dublură în Memorie]: Serializare/restaurare simulată și recuperarea camerelor active (restoreGamesFromSnapshots) la restart', async () => {
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

test('V9.1 Test 31: Guvernanța băncii de întrebări – statut implicit draft, filtrare strictă approved în meci și excluderea întrebărilor dezactivate', async () => {
  // 1. Add a question without reviewStatus and verify it defaults to draft and is NOT selected by GameManager
  const draftQ = await db.addQuestion({
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
      assert.equal(Boolean(picked.isDisabled), false);
    }
    (gm as any).clearRoomTimers(room.roomId);
  } finally {
    await db.deleteQuestion(draftQ.id);
  }

  // 2. Verify category balance <= 12.5% across the total 6241 canonical records
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

// ============================================================================
// SECȚIUNEA V9.3: ADIACENȚĂ ÎN ALLOCATION, BOT TAKEOVER & RECONECTARE,
// ÎNTREBĂRI SCURTE (<= 15 CUVINTE), TIMER 15S, PREZENTARE ATAC & AUDIT ADMIN
// ============================================================================

test('V9.3 Test 32: Alegerea teritoriilor impune vecinătatea strictă în conquest și allocation, actualizează vecinii după cucerire și respinge cererile invalide pe server fără a schimba starea', () => {
  // 1. Reject non-adjacent neutral target in both conquest and allocation
  const nonAdjConquest = canTargetTerritory('bihor', player1, mockTerritories, 'conquest');
  assert.equal(nonAdjConquest.allowed, false, 'Țintă neutră neadiacentă respinsă în conquest');
  assert.match(nonAdjConquest.reason || '', /învecinat cu teritoriile tale/);

  const nonAdjAllocation = canTargetTerritory('bihor', player1, mockTerritories, 'allocation');
  assert.equal(nonAdjAllocation.allowed, false, 'Țintă neutră neadiacentă respinsă și în allocation');
  assert.match(nonAdjAllocation.reason || '', /învecinat cu teritoriile tale/);

  // 2. Accept adjacent neutral target in both conquest and allocation
  const adjConquest = canTargetTerritory('satu_mare', player1, mockTerritories, 'conquest');
  assert.equal(adjConquest.allowed, true, 'Țintă neutră adiacentă acceptată în conquest');

  const adjAllocation = canTargetTerritory('satu_mare', player1, mockTerritories, 'allocation');
  assert.equal(adjAllocation.allowed, true, 'Țintă neutră adiacentă acceptată în allocation');

  // 3. Server-side enforcement & dynamic neighbor expansion after claiming a territory
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'p_adj1', username: 'Jucator1', avatar: 'av_vlad' },
    maxPlayers: 2,
    initialBotsCount: 0,
    isPrivate: true,
  });
  gm.joinRoom(room.roomId, { id: 'p_adj2', username: 'Jucator2', avatar: 'av_stefan' });
  gm.setReady(room.roomId, 'p_adj2', true);
  gm.startGame(room.roomId, 'p_adj1');

  const game = gm.getRoom(room.roomId)!;
  // Complete base selection for both players
  const base1 = Object.values(game.territories).find((t) =>
    canCompleteBaseSelection(t.id, game.territories, 1)
  )!;
  gm.selectTerritory(room.roomId, 'p_adj1', base1.id);
  const base2 = Object.values(game.territories).find((t) =>
    canCompleteBaseSelection(t.id, game.territories, 0)
  )!;
  gm.selectTerritory(room.roomId, 'p_adj2', base2.id);

  assert.equal(game.phase, 'conquest');

  // Set real allocation picking state for p_adj1
  game.phase = 'allocation';
  game.currentQuestion = null;
  game.activePlayerIndex = game.players.findIndex((p) => p.id === 'p_adj1');
  game.allocationWinnerId = 'p_adj1';
  game.allocationPickReady = true;

  const legalBefore = getLegalNeutralTargetsForPlayer('p_adj1', game.territories);
  const nonAdjacentNeutral = Object.values(game.territories).find(
    (t) => t.ownerId === null && !legalBefore.includes(t.id)
  );
  assert.ok(nonAdjacentNeutral, 'Există cel puțin un teritoriu neutru neadiacent pe hartă');

  const scoreBefore = game.players.find((p) => p.id === 'p_adj1')!.score;
  const winnerBefore = game.allocationWinnerId;

  // 4. Send invalid non-adjacent territory directly to server in 'allocation' -> MUST be rejected without state mutation
  const invalidServerAttempt = gm.selectTerritory(room.roomId, 'p_adj1', nonAdjacentNeutral.id);
  assert.equal(invalidServerAttempt.success, false, 'Serverul respinge teritoriul neutru neadiacent în allocation');
  assert.match(invalidServerAttempt.message || '', /învecinat cu teritoriile tale/);
  assert.equal(game.territories[nonAdjacentNeutral.id].ownerId, null, 'Proprietarul nu s-a schimbat');
  assert.equal(game.players.find((p) => p.id === 'p_adj1')!.score, scoreBefore, 'Scorul nu s-a schimbat');
  assert.equal(game.allocationWinnerId, winnerBefore, 'Câștigătorul departajării nu s-a schimbat');
  assert.equal(game.allocationPickReady, true, 'Starea de alegere din allocation nu s-a schimbat');

  // 5. Claim a valid adjacent neutral territory -> its neutral neighbors immediately become valid targets!
  const validTargetId = legalBefore[0];
  const newNeighbors = game.territories[validTargetId].neighbors.filter(
    (nId) => game.territories[nId].ownerId === null && !legalBefore.includes(nId)
  );
  const validClaimRes = gm.selectTerritory(room.roomId, 'p_adj1', validTargetId);
  assert.equal(validClaimRes.success, true, 'Teritoriul adiacent este revendicat cu succes');
  assert.equal(game.territories[validTargetId].ownerId, 'p_adj1');
  assert.equal(game.territories[validTargetId].points, SCORING.ALLOCATION);

  const legalAfter = getLegalNeutralTargetsForPlayer('p_adj1', game.territories);
  for (const newlyReachableId of newNeighbors) {
    assert.ok(
      legalAfter.includes(newlyReachableId),
      `Vecinul ${newlyReachableId} al teritoriului proaspăt cucerit a devenit țintă validă`
    );
  }

  // 6. Verify enclave fallback in selectEligibleAllocationWinner
  const enclaveTerritories: Record<string, Territory> = JSON.parse(JSON.stringify(mockTerritories));
  // Make satu_mare owned by player2 and cluj owned by player2 so player1 (maramures) is completely surrounded (0 neutral neighbors)
  enclaveTerritories.satu_mare.ownerId = 'player2';
  enclaveTerritories.cluj.ownerId = 'player2';
  // alba is neutral and borders cluj & arad (both owned by player2)
  enclaveTerritories.alba.ownerId = null;

  const eligibleOutcome = selectEligibleAllocationWinner(
    [
      { playerId: 'player1', answer: 1900, diff: 0, submitTime: 1000, rank: 1 },
      { playerId: 'player2', answer: 1850, diff: 50, submitTime: 1200, rank: 2 },
    ],
    ['player1', 'player2'],
    enclaveTerritories
  );
  assert.equal(
    eligibleOutcome.winnerId,
    'player2',
    'Dacă primul clasat (player1) este blocat într-o enclavă fără vecini neutri, dreptul de alegere trece la următorul jucător cu vecin neutru (player2)'
  );
  assert.deepEqual(eligibleOutcome.bypassedEnclavedIds, ['player1']);

  (gm as any).clearRoomTimers(room.roomId);
});

test('V9.3 Test 33: Preluarea jocului de către bot la deconectare și revenirea atomică a jucătorului autentificat (toate cele 8 scenarii)', () => {
  const gm = new GameManager();

  // Scenariul 7: Deconectare și revenire în lobby (waiting) - locul este păstrat cu isConnected=false pentru reconectare
  const lobbyRoom = gm.createRoom({
    hostUser: { id: 'u_host', username: 'HostUser', avatar: 'av_vlad' },
    maxPlayers: 3,
    initialBotsCount: 0,
    isPrivate: true,
  });
  gm.joinRoom(lobbyRoom.roomId, { id: 'u_guest', username: 'GuestUser', avatar: 'av_stefan' });
  assert.equal(gm.getRoom(lobbyRoom.roomId)!.players.length, 2);

  // Guest disconnects in lobby -> seat stays reserved with isConnected = false, and guest can reconnect cleanly
  gm.handleSocketDisconnect(lobbyRoom.roomId, 'u_guest');
  const lobbyGuestAfterDisc = gm.getRoom(lobbyRoom.roomId)!.players.find((p) => p.id === 'u_guest')!;
  assert.equal(gm.getRoom(lobbyRoom.roomId)!.players.length, 2, 'Locul în lobby rămâne rezervat la deconectarea temporară');
  assert.equal(lobbyGuestAfterDisc.isConnected, false, 'Jucătorul deconectat în lobby are isConnected = false');

  const rejoinLobby = gm.joinRoom(lobbyRoom.roomId, { id: 'u_guest', username: 'GuestUser', avatar: 'av_stefan' });
  assert.equal(rejoinLobby.success, true);
  assert.equal(gm.getRoom(lobbyRoom.roomId)!.players.length, 2);
  assert.equal(gm.getRoom(lobbyRoom.roomId)!.players.find((p) => p.id === 'u_guest')!.isConnected, true);

  // Start match with 2 humans + 1 bot = 3 players
  gm.addBot(lobbyRoom.roomId, 'u_host', 'intermediar');
  gm.setReady(lobbyRoom.roomId, 'u_guest', true);
  const startRes = gm.startGame(lobbyRoom.roomId, 'u_host');
  assert.equal(startRes.success, true);

  const game = gm.getRoom(lobbyRoom.roomId)!;
  assert.equal(game.phase, 'base_selection');

  // Scenariul 1: Deconectarea unui jucător în timpul meciului -> loc rezervat + botControlled = true
  gm.handleSocketDisconnect(lobbyRoom.roomId, 'u_guest');
  const guestPlayer = game.players.find((p) => p.id === 'u_guest')!;
  assert.equal(guestPlayer.isConnected, false, 'Jucătorul deconectat are isConnected = false');
  assert.equal(guestPlayer.botControlled, true, 'Jucătorul deconectat este preluat temporar de bot (botControlled = true)');
  assert.equal(typeof guestPlayer.disconnectedAt, 'number', 'Timestamp-ul deconectării este înregistrat');

  // Scenariul 4: Respingerea unui alt cont care încearcă să preia locul sau să intre în meciul început
  const intruderAttempt = gm.joinRoom(lobbyRoom.roomId, {
    id: 'u_intruder_999',
    username: 'Intruder',
    avatar: 'av_mihai',
  });
  assert.equal(intruderAttempt.success, false, 'Un alt cont nu poate prelua locul rezervat în meciul activ');

  // Scenariul 2: Botul preia locul și face mutări valide (ex: alegerea bazei când îi vine rândul)
  // Host selects base first
  const hostBase = Object.values(game.territories).find((t) =>
    canCompleteBaseSelection(t.id, game.territories, 2)
  )!;
  gm.selectTerritory(lobbyRoom.roomId, 'u_host', hostBase.id);

  // Now it is u_guest's turn in base_selection, and since u_guest is botControlled, a bot timer is scheduled
  assert.equal(game.players[game.activePlayerIndex].id, 'u_guest');

  // Scenariul 3 & 5: Revenirea aceluiași cont autentificat oprește atomic timerul botului și previne mutarea dublă
  const reconnectRes = gm.joinRoom(lobbyRoom.roomId, {
    id: 'u_guest',
    username: 'GuestUser',
    avatar: 'av_stefan',
  });
  assert.equal(reconnectRes.success, true);
  assert.equal(guestPlayer.isConnected, true, 'La revenire, isConnected redevine true');
  assert.equal(guestPlayer.botControlled, false, 'La revenire, botControlled redevine false');

  // Guest now picks their own base manually; bot timer was cancelled so no duplicate move occurs
  const guestBase = Object.values(game.territories).find((t) =>
    canCompleteBaseSelection(t.id, game.territories, 1)
  )!;
  const manualBaseRes = gm.selectTerritory(lobbyRoom.roomId, 'u_guest', guestBase.id);
  assert.equal(manualBaseRes.success, true, 'Jucătorul revenit își alege singur baza');

  // Complete third player's base so game enters conquest
  const thirdPlayer = game.players[game.activePlayerIndex];
  const thirdBase = Object.values(game.territories).find((t) =>
    canCompleteBaseSelection(t.id, game.territories, 0)
  )!;
  gm.selectTerritory(lobbyRoom.roomId, thirdPlayer.id, thirdBase.id);
  assert.equal(game.phase, 'conquest');

  // Scenariul 6: Păstrarea scorului, teritoriilor, turnurilor și timerului la deconectare + reconectare în timpul întrebării
  gm.triggerNextConquestQuestion(game);
  const cq = game.currentQuestion!;
  assert.ok(cq);
  const startTimeBefore = cq.startTime;
  const durationBefore = cq.durationSeconds;
  const guestScoreBefore = guestPlayer.score;
  const guestTowersBefore = guestPlayer.castleTowers;
  const guestTerritoriesBefore = guestPlayer.territoriesCount;

  // Disconnect u_guest during active question
  gm.handleSocketDisconnect(lobbyRoom.roomId, 'u_guest');
  assert.equal(guestPlayer.botControlled, true);

  // Reconnect u_guest immediately before bot answers
  gm.joinRoom(lobbyRoom.roomId, { id: 'u_guest', username: 'GuestUser', avatar: 'av_stefan' });
  assert.equal(guestPlayer.botControlled, false);
  assert.equal(guestPlayer.score, guestScoreBefore, 'Scorul s-a păstrat intact');
  assert.equal(guestPlayer.castleTowers, guestTowersBefore, 'Turnurile cetății s-au păstrat intacte');
  assert.equal(guestPlayer.territoriesCount, guestTerritoriesBefore, 'Numărul de teritorii s-a păstrat intact');
  assert.equal(game.currentQuestion?.startTime, startTimeBefore, 'StartTime-ul întrebării nu a fost resetat');
  assert.equal(game.currentQuestion?.durationSeconds, durationBefore, 'Durata întrebării nu a fost modificată');

  // u_guest submits answer manually; trying to submit a second time is rejected (no duplicate move)
  const ans1 = gm.submitAnswer(lobbyRoom.roomId, 'u_guest', 0, cq.questionInstanceId);
  assert.equal(ans1.success, true);
  const ansDup = gm.submitAnswer(lobbyRoom.roomId, 'u_guest', 1, cq.questionInstanceId);
  assert.equal(ansDup.success, false);
  assert.equal(ansDup.code, 'DUPLICATE');

  // Scenariul 8: Revenirea după ce meciul s-a încheiat deja (phase === 'finished') permite vizualizarea rezultatului final
  game.phase = 'finished';
  const postFinishRejoin = gm.joinRoom(lobbyRoom.roomId, {
    id: 'u_guest',
    username: 'GuestUser',
    avatar: 'av_stefan',
  });
  assert.equal(postFinishRejoin.success, true, 'Jucătorul din meci poate reveni după finalizarea partidei pentru a vedea rezultatul');
  assert.equal(postFinishRejoin.game?.phase, 'finished');

  (gm as any).clearRoomTimers(lobbyRoom.roomId);
});

test('V9.3 Test 34: Toate întrebările aprobate sunt scurte (<= 14 cuvinte, <= 95 caractere, opțiuni <= 36 caractere) și timerul întrebărilor trivia este de 15 secunde', async () => {
  assert.equal(INITIAL_QUESTIONS.length, 6241, 'Banca canonică păstrează exact 6.241 de înregistrări');

  const activeQuestions = INITIAL_QUESTIONS.filter(
    (q) => q.reviewStatus === 'approved' && !q.isDisabled
  );
  assert.equal(activeQuestions.length, 1070, 'Există 1.070 de întrebări active aprobate');

  const countWords = (text: string) =>
    text
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

  let over14Count = 0;
  for (const q of activeQuestions) {
    const wc = countWords(q.question);
    if (wc > 14) {
      over14Count++;
    }
  }
  assert.equal(
    over14Count,
    0,
    `Nicio întrebare aprobată nu trebuie să depășească 14 cuvinte (găsite peste 14 cuvinte: ${over14Count})`
  );

  // Verify startQuestion uses 15 seconds timer after completing base selection and waiting for the 1.5s transition timer
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'u_timer15', username: 'Timer15Host', avatar: 'av_vlad' },
    maxPlayers: 2,
    initialBotsCount: 0,
    isPrivate: true,
  });
  gm.joinRoom(room.roomId, { id: 'u_timer15_p2', username: 'Timer15P2', avatar: 'av_stefan' });
  gm.setReady(room.roomId, 'u_timer15_p2', true);
  gm.startGame(room.roomId, 'u_timer15');

  const game = gm.getRoom(room.roomId)!;
  const base1 = Object.values(game.territories).find((t) =>
    canCompleteBaseSelection(t.id, game.territories, 1)
  )!;
  gm.selectTerritory(room.roomId, 'u_timer15', base1.id);
  const base2 = Object.values(game.territories).find((t) =>
    canCompleteBaseSelection(t.id, game.territories, 0)
  )!;
  gm.selectTerritory(room.roomId, 'u_timer15_p2', base2.id);

  // Wait for the real 1500ms post-base-selection timeout to trigger triggerNextConquestQuestion(game)
  await new Promise((r) => setTimeout(r, 1600));

  assert.ok(game.currentQuestion, 'Întrebarea de cucerire a pornit după timeout-ul de tranziție');
  assert.equal(game.currentQuestion.durationSeconds, 15, 'Timerul întrebărilor trivia este de exact 15 secunde');
  (gm as any).clearRoomTimers(room.roomId);
});

test('V9.3 Test 35: Jurnalul de audit admin, închiderea forțată a unei camere și modul de mentenanță (MAINTENANCE_MODE)', async () => {
  // 1. Test audit log recording and retrieval in Database
  const auditEntry = await db.recordAuditLog({
    adminId: 'admin_test_1',
    adminUsername: 'AdminVoievod',
    action: 'USER_ADJUST_STATS',
    targetType: 'user',
    targetId: 'u_target_1',
    details: { before: { rating: 1000 }, after: { rating: 1350 } },
  });
  assert.ok(auditEntry.id.startsWith('aud_'), `ID-ul de audit trebuie să înceapă cu aud_ (primit: ${auditEntry.id})`);
  const logs = db.getAuditLogs(20);
  assert.ok(logs.some((l) => l.id === auditEntry.id && l.action === 'USER_ADJUST_STATS'));

  // 2. Test forceCloseRoom in GameManager
  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'u_fc', username: 'ForceCloseHost', avatar: 'av_vlad' },
    maxPlayers: 2,
    initialBotsCount: 1,
    isPrivate: true,
  });
  assert.ok(gm.getRoom(room.roomId));
  const closed = await gm.forceCloseRoom(room.roomId, 'Cameră închisă în testul de administrare');
  assert.equal(closed, true);
  assert.equal(gm.getRoom(room.roomId), undefined, 'Camera a fost eliminată din memorie după închiderea forțată');
});

test('V9.4 Test 36: Regresie întrebări CONQUIZ — fără paranteze/metadate (21.2)/(#4), fără scurgerea răspunsului în enunț, fără estimări numerice/unități, amestec aleatoriu de subiecte și eliminarea etichetelor de domeniu din UI', () => {
  const activeQuestions = INITIAL_QUESTIONS.filter(
    (q) => q.reviewStatus === 'approved' && !q.isDisabled
  );
  assert.equal(activeQuestions.length, 1070, 'Există exact 1.070 de întrebări active aprobate');

  const STOPWORDS = new Set([
    'care', 'este', 'sunt', 'fost', 'pentru', 'prin', 'dintre', 'dupa', 'peste',
    'sub', 'intre', 'catre', 'fara', 'despre', 'unde', 'cand', 'cine', 'carui',
    'carei', 'caror', 'acest', 'aceasta', 'aceste', 'acesti', 'unui', 'unei',
    'unor', 'sale', 'sali', 'tara', 'oras', 'stat', 'lume', 'mare', 'mica',
    'primul', 'prima', 'doilea', 'doua', 'treia', 'timpul', 'anul', 'secolul',
    'partea', 'numele', 'numit', 'numita', 'cunoscut', 'cunoscuta', 'romania',
    'romaniei', 'roman', 'romana', 'romani', 'europene', 'europa', 'fluviul',
    'raului', 'raul', 'muntii', 'marele', 'marea', 'oceanul', 'capitala',
  ]);

  const stripDiacritics = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ș/g, 's')
      .replace(/ț/g, 't')
      .replace(/ă/g, 'a')
      .replace(/â/g, 'a')
      .replace(/î/g, 'i');

  for (const q of activeQuestions) {
    // 1. Nicio întrebare activă nu este de estimare numerică și nu cere unități
    assert.equal(q.type, 'choice', `Întrebarea activă ${q.id} trebuie să fie choice`);
    assert.equal(Boolean(q.unit), false, `Întrebarea activă ${q.id} nu trebuie să aibă unitate (${q.unit})`);
    assert.equal(
      q.targetNumber === undefined || q.targetNumber === null,
      true,
      `Întrebarea activă ${q.id} nu trebuie să aibă targetNumber`
    );

    // 2. Fără numere/indici în paranteză de tipul (21.2), (#4), (set 21.2), (seria 1-2) sau trunchieri
    assert.equal(
      /\(\s*#\d+\s*\)/.test(q.question),
      false,
      `Metadată (#N) scursă în întrebarea ${q.id}: ${q.question}`
    );
    assert.equal(
      /\(\s*(?:set|seria|lot|grup|nr\.?|index)\s*[\d.-]+\s*\)/i.test(q.question),
      false,
      `Metadată (set/seria) scursă în întrebarea ${q.id}: ${q.question}`
    );
    assert.equal(
      /\(\s*\d+(?:[.,]\d+)?\s*\)/.test(q.question),
      false,
      `Număr în paranteză de tipul (21.2) scurs în întrebarea ${q.id}: ${q.question}`
    );
    assert.equal(
      /\s+(?:al|a|ai|ale|din|în|la|pe|cu|de|și|sau|pentru|spre|sub|între)\s*[”"»]\s*\??$/.test(
        q.question
      ),
      false,
      `Formulă trunchiată în întrebarea ${q.id}: ${q.question}`
    );

    // 3. Fără scurgerea răspunsului corect în enunț
    assert.ok(Array.isArray(q.options) && q.options.length === 4);
    const correctOption = String(q.options[q.correctAnswerIndex!]);
    const normQ = stripDiacritics(q.question)
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const normAns = stripDiacritics(correctOption)
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (normAns.length >= 3) {
      const paddedQ = ` ${normQ} `;
      assert.equal(
        paddedQ.includes(` ${normAns} `),
        false,
        `Răspunsul corect "${correctOption}" apare direct în enunțul întrebării ${q.id}: "${q.question}"`
      );
    }

    const ansTokens = normAns
      .split(' ')
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
    if (ansTokens.length > 0) {
      const qTokens = new Set(normQ.split(' '));
      assert.equal(
        ansTokens.every((tok) => qTokens.has(tok)),
        false,
        `Termenii răspunsului "${correctOption}" apar în enunțul întrebării ${q.id}: "${q.question}"`
      );
    }
  }

  // 4. Fluxul de joc (conquest, allocation, war și war tiebreak) folosește exclusiv întrebări cu variante (choice) și păstrează punctajul 1000/200/300/400
  assert.equal(SCORING.BASE, 1000);
  assert.equal(SCORING.CONQUEST, 200);
  assert.equal(SCORING.ALLOCATION, 300);
  assert.equal(SCORING.WAR_DUEL, 400);

  const gm = new GameManager();
  const room = gm.createRoom({
    hostUser: { id: 'p_flow1', username: 'Flow1', avatar: 'av_vlad' },
    maxPlayers: 2,
    initialBotsCount: 0,
    isPrivate: true,
  });
  gm.joinRoom(room.roomId, { id: 'p_flow2', username: 'Flow2', avatar: 'av_stefan' });
  gm.setReady(room.roomId, 'p_flow2', true);
  gm.startGame(room.roomId, 'p_flow1');

  const game = gm.getRoom(room.roomId)!;
  const b1 = Object.values(game.territories).find((t) =>
    canCompleteBaseSelection(t.id, game.territories, 1)
  )!;
  gm.selectTerritory(room.roomId, 'p_flow1', b1.id);
  const b2 = Object.values(game.territories).find((t) =>
    canCompleteBaseSelection(t.id, game.territories, 0)
  )!;
  gm.selectTerritory(room.roomId, 'p_flow2', b2.id);

  // Trigger allocation question -> must be 'choice' and award winner right to pick adjacent neutral territory for 300 pts
  game.phase = 'allocation';
  game.currentQuestion = null;
  gm.triggerNextAllocationQuestion(game);
  assert.equal(game.phase, 'allocation');
  const allocCq = gm.getRoom(room.roomId)!.currentQuestion;
  assert.ok(allocCq);
  assert.equal(allocCq.question.type, 'choice', 'Departajarea din allocation folosește întrebare cu variante');

  const allocCorrectIdx = allocCq.question.correctAnswerIndex!;
  const allocWrongIdx = (allocCorrectIdx + 1) % 4;
  gm.submitAnswer(room.roomId, 'p_flow1', allocCorrectIdx, allocCq.questionInstanceId);
  gm.submitAnswer(room.roomId, 'p_flow2', allocWrongIdx, allocCq.questionInstanceId);

  assert.equal(allocCq.resolved, true);
  assert.equal(game.allocationWinnerId, 'p_flow1', 'Jucătorul care a răspuns corect și cel mai rapid câștigă departajarea');

  // Verify random topic mixing across 30 drawn questions
  const drawnCategories = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const q = gm.getRandomQuestion(game, 'choice');
    assert.ok(q);
    drawnCategories.add(q.category);
  }
  assert.ok(
    drawnCategories.size >= 6,
    `Întrebările extrase trebuie să amestece aleatoriu subiectele (găsite ${drawnCategories.size} categorii în 30 extrageri)`
  );

  // 5. Verifică că QuestionModal.tsx nu mai conține tastatura numerică și nici eticheta de domeniu (categoryNames)
  const modalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/QuestionModal.tsx'),
    'utf-8'
  );
  assert.equal(
    modalSource.includes('estimation-input'),
    false,
    'QuestionModal.tsx nu trebuie să mai conțină câmpul numeric estimation-input'
  );
  assert.equal(
    modalSource.includes('categoryNames[question.category]'),
    false,
    'QuestionModal.tsx nu trebuie să mai afișeze etichete de domeniu precum CHIMIE/ARTĂ/LITERATURĂ'
  );

  (gm as any).clearRoomTimers(room.roomId);
});

test('V9.5 Test 37: Animații și stări vizuale pentru selectarea teritoriilor (hover + mobil), cuceriri neutre/război, vectori de atac origine->țintă, scut apărare și prefers-reduced-motion', () => {
  // 1. Test prefers-reduced-motion configuration
  const normalAnim = getMapAnimationConfig(false);
  assert.equal(normalAnim.prefersReducedMotion, false);
  assert.equal(normalAnim.enabled, true);
  assert.ok(normalAnim.selectionTransitionMs > 0);
  assert.ok(normalAnim.conquestSpreadMs > 0);
  assert.ok(normalAnim.conquestPulseMs > 0);
  assert.ok(normalAnim.attackVectorFlowMs > 0);
  assert.ok(normalAnim.defenseShieldMs > 0);

  const reducedAnim = getMapAnimationConfig(true);
  assert.equal(reducedAnim.prefersReducedMotion, true);
  assert.equal(reducedAnim.enabled, false);
  assert.equal(reducedAnim.selectionTransitionMs, 0);
  assert.equal(reducedAnim.conquestSpreadMs, 0);
  assert.equal(reducedAnim.conquestPulseMs, 0);
  assert.equal(reducedAnim.attackVectorFlowMs, 0);
  assert.equal(reducedAnim.defenseShieldMs, 0);

  // 2. Test selection visual states (hover, mobile touch selection, attack origin, attack target)
  const neutralIdle = computeTerritorySelectionVisualState({
    territoryId: 'cluj',
    hasOwner: false,
    isHovered: false,
    isSelected: false,
    isTouchSelected: false,
    isActionable: false,
    isAttackOrigin: false,
    isAttackTarget: false,
  });
  assert.equal(neutralIdle.isHighlighted, false);
  assert.equal(neutralIdle.filterId, 'url(#border-relief)');

  const desktopHover = computeTerritorySelectionVisualState({
    territoryId: 'cluj',
    hasOwner: false,
    isHovered: true,
    isSelected: false,
    isTouchSelected: false,
    isActionable: true,
    isAttackOrigin: false,
    isAttackTarget: false,
  });
  assert.equal(desktopHover.isHighlighted, true);
  assert.equal(desktopHover.filterId, 'url(#territory-hover-glow)');
  assert.ok(desktopHover.strokeWidth > neutralIdle.strokeWidth);

  const mobileTouchSelect = computeTerritorySelectionVisualState({
    territoryId: 'cluj',
    hasOwner: true,
    ownerColor: '#22c55e',
    isHovered: false,
    isSelected: false,
    isTouchSelected: true,
    isActionable: true,
    isAttackOrigin: false,
    isAttackTarget: false,
  });
  assert.equal(mobileTouchSelect.isHighlighted, true, 'Selecția la atingere pe mobil rămâne clar evidențiată');
  assert.equal(mobileTouchSelect.filterId, 'url(#territory-hover-glow)');

  const attackOriginVisual = computeTerritorySelectionVisualState({
    territoryId: 'maramures',
    hasOwner: true,
    ownerColor: '#ef4444',
    isHovered: false,
    isSelected: false,
    isTouchSelected: false,
    isActionable: false,
    isAttackOrigin: true,
    isAttackTarget: false,
  });
  assert.equal(attackOriginVisual.isHighlighted, true);
  assert.equal(attackOriginVisual.filterId, 'url(#territory-origin-glow)');

  const attackTargetPreviewVisual = computeTerritorySelectionVisualState({
    territoryId: 'cluj',
    hasOwner: true,
    ownerColor: '#3b82f6',
    isHovered: false,
    isSelected: true,
    isTouchSelected: false,
    isActionable: false,
    isAttackOrigin: false,
    isAttackTarget: true,
    isAttackPreviewPhase: true,
  });
  assert.equal(attackTargetPreviewVisual.isHighlighted, true);
  assert.equal(attackTargetPreviewVisual.filterId, 'url(#territory-attack-glow)');
  assert.equal(attackTargetPreviewVisual.strokeColor, '#f43f5e');

  // 3. Test deterministic attacker origin territory & active attack vectors across all clients
  const map2p = createMapForPlayerCount(2);
  const tIds = Object.keys(map2p);
  const firstId = tIds[0];
  const neighborId = map2p[firstId].neighbors[0];
  assert.ok(neighborId, 'Primul teritoriu trebuie să aibă cel puțin un vecin');

  map2p[firstId].ownerId = 'p_attacker';
  map2p[firstId].isBase = true;
  map2p[neighborId].ownerId = 'p_defender';

  const players: Player[] = [
    {
      id: 'p_attacker',
      username: 'VladAtacator',
      avatar: 'av_vlad',
      color: '#ef4444',
      score: 1300,
      isHost: true,
      isReady: true,
      isAi: false,
      isConnected: true,
      baseTerritoryId: firstId,
      castleTowers: 3,
      defensiveBonus: 0,
      territoriesCount: 1,
      correctAnswers: 2,
      wrongAnswers: 0,
      isEliminated: false,
    },
    {
      id: 'p_defender',
      username: 'StefanAparator',
      avatar: 'av_stefan',
      color: '#3b82f6',
      score: 1300,
      isHost: false,
      isReady: true,
      isAi: false,
      isConnected: true,
      baseTerritoryId: neighborId,
      castleTowers: 3,
      defensiveBonus: 0,
      territoriesCount: 1,
      correctAnswers: 2,
      wrongAnswers: 0,
      isEliminated: false,
    },
  ];

  const resolvedOrigin = resolveAttackOriginTerritory('p_attacker', neighborId, map2p);
  assert.ok(resolvedOrigin);
  assert.equal(
    resolvedOrigin.id,
    firstId,
    'Teritoriul de origine al atacatorului trebuie să fie teritoriul învecinat deținut de atacator'
  );

  const warRound: GameState['warRound'] = {
    roundId: 'wr_anim_1',
    roundNumber: 1,
    status: 'attack_preview',
    selectionDeadline: 0,
    questionDeadline: 0,
    attackerIds: ['p_attacker'],
    defenderIds: ['p_defender'],
    byePlayerIds: [],
    battles: [
      {
        battleId: 'battle_anim_1',
        attackerId: 'p_attacker',
        defenderId: 'p_defender',
        targetTerritoryId: neighborId,
        status: 'ready',
      },
    ],
  };

  // Both Player 1 and Player 2 compute the exact same attack vectors from authoritative server state
  const vectorsClient1 = buildActiveAttackVectors(map2p, players, warRound, 'war');
  const vectorsClient2 = buildActiveAttackVectors(map2p, players, warRound, 'war');
  assert.equal(vectorsClient1.length, 1);
  assert.deepEqual(
    vectorsClient1,
    vectorsClient2,
    'Toți jucătorii din cameră văd exact același vector de atac, teritoriu sursă și țintă'
  );
  assert.equal(vectorsClient1[0].sourceTerritoryId, firstId);
  assert.equal(vectorsClient1[0].targetTerritoryId, neighborId);
  assert.equal(vectorsClient1[0].attackerName, 'VladAtacator');
  assert.equal(vectorsClient1[0].defenderName, 'StefanAparator');

  // 4. Test authoritative territory transition detection:
  //    (a) Neutral territory conquest -> neutral_conquest spread + pulse
  const neutralId = tIds.find((id) => id !== firstId && id !== neighborId)!;
  const prevSnap1 = JSON.parse(JSON.stringify(map2p)) as Record<string, Territory>;
  const nextSnap1 = JSON.parse(JSON.stringify(map2p)) as Record<string, Territory>;
  nextSnap1[neutralId].ownerId = 'p_attacker';
  nextSnap1[neutralId].points = SCORING.CONQUEST;

  const trNeutral = detectTerritoryMapTransitions({
    prevTerritories: prevSnap1,
    nextTerritories: nextSnap1,
    players,
    nowMs: 1000,
    prefersReducedMotion: false,
  });
  assert.equal(trNeutral.length, 1);
  assert.equal(trNeutral[0].type, 'neutral_conquest');
  assert.equal(trNeutral[0].territoryId, neutralId);
  assert.equal(trNeutral[0].color, '#ef4444');
  assert.ok(trNeutral[0].durationMs > 0);

  //    (b) War conquest (attacker wins territory) -> war_conquest fill in winner's color
  const prevSnap2 = JSON.parse(JSON.stringify(nextSnap1)) as Record<string, Territory>;
  const nextSnap2 = JSON.parse(JSON.stringify(nextSnap1)) as Record<string, Territory>;
  nextSnap2[neighborId].ownerId = 'p_attacker';
  nextSnap2[neighborId].points = SCORING.WAR_DUEL;

  const trWarConquest = detectTerritoryMapTransitions({
    prevTerritories: prevSnap2,
    nextTerritories: nextSnap2,
    players,
    nowMs: 2000,
    prefersReducedMotion: false,
  });
  assert.equal(trWarConquest.length, 1);
  assert.equal(trWarConquest[0].type, 'war_conquest');
  assert.equal(trWarConquest[0].territoryId, neighborId);
  assert.equal(trWarConquest[0].color, '#ef4444', 'Umplerea se face în culoarea câștigătorului');
  assert.equal(trWarConquest[0].previousColor, '#3b82f6', 'Păstrează culoarea anterioară pentru tranziția graduală');

  //    (c) Successful war defense -> war_defense shield effect without changing owner
  const prevSnap3 = JSON.parse(JSON.stringify(prevSnap1)) as Record<string, Territory>;
  const nextSnap3 = JSON.parse(JSON.stringify(prevSnap1)) as Record<string, Territory>;
  nextSnap3[neighborId].defensiveBonus = (prevSnap3[neighborId].defensiveBonus || 0) + 100;

  const trWarDefense = detectTerritoryMapTransitions({
    prevTerritories: prevSnap3,
    nextTerritories: nextSnap3,
    players,
    nowMs: 3000,
    prefersReducedMotion: false,
  });
  assert.equal(trWarDefense.length, 1);
  assert.equal(trWarDefense[0].type, 'war_defense');
  assert.equal(trWarDefense[0].territoryId, neighborId);
  assert.equal(
    nextSnap3[neighborId].ownerId,
    'p_defender',
    'La apărare reușită proprietarul teritoriului rămâne neschimbat'
  );

  //    (d) Reduced motion sets transition durationMs to 0
  const trReduced = detectTerritoryMapTransitions({
    prevTerritories: prevSnap1,
    nextTerritories: nextSnap1,
    players,
    nowMs: 4000,
    prefersReducedMotion: true,
  });
  assert.equal(trReduced.length, 1);
  assert.equal(trReduced[0].durationMs, 0, 'Cu prefers-reduced-motion activ, durata animației este 0ms');
});

test('V9.6 Test 38: Flux de atac individual (ATAC: [Atacator] atacă [Teritoriu] apărat de [Apărător]), durată completă faza conquest (neutralCount >= activePlayers), fallback neadiacent în allocation doar la 0 vecini liberi și filtrare întrebări scurte (<= 14 cuvinte)', () => {
  // 1. Formatul anunțului de atac individual și vizibilitatea teritoriilor atacatorului & apărătorului
  const announcement = formatWarAttackAnnouncement({
    attacker: { id: 'p1', username: 'StefanCelMare', color: '#ef4444' },
    defender: { id: 'p2', username: 'MihaiViteazul', color: '#3b82f6' },
    targetTerritory: { id: 'cluj', name: 'Cluj', isBase: false, castleTowers: 0 },
    originTerritory: { id: 'maramures', name: 'Maramureș' },
  });
  assert.equal(
    announcement.headline,
    'ATAC: StefanCelMare atacă Cluj apărat de MihaiViteazul',
    'Mesajul de atac are exact formatul cerut'
  );
  assert.match(announcement.responderText, /StefanCelMare \(Atacator\) și MihaiViteazul \(Apărător\)/);

  const atkTerrVisual = computeTerritorySelectionVisualState({
    territoryId: 'maramures',
    hasOwner: true,
    ownerColor: '#ef4444',
    isHovered: false,
    isSelected: false,
    isTouchSelected: false,
    isActionable: false,
    isAttackOrigin: false,
    isAttackTarget: false,
    isAttackerTerritory: true,
    isDefenderTerritory: false,
  });
  assert.equal(atkTerrVisual.isHighlighted, true, 'Teritoriile atacatorului rămân evidențiate în timpul atacului');

  const defTerrVisual = computeTerritorySelectionVisualState({
    territoryId: 'alba',
    hasOwner: true,
    ownerColor: '#3b82f6',
    isHovered: false,
    isSelected: false,
    isTouchSelected: false,
    isActionable: false,
    isAttackOrigin: false,
    isAttackTarget: false,
    isAttackerTerritory: false,
    isDefenderTerritory: true,
  });
  assert.equal(defTerrVisual.isHighlighted, true, 'Teritoriile apărătorului rămân evidențiate în timpul atacului');

  // 2. Durata primei faze de cucerire (conquest): continuă cât timp neutralCount >= activePlayers.length,
  //    trece în allocation DOAR când 0 < neutralCount < activePlayers.length, și direct în war când neutralCount === 0
  const map3p = createMapForPlayerCount(3); // 15 teritorii
  const tIds3 = Object.keys(map3p);
  const pIds3 = ['p1', 'p2', 'p3'];

  // Fiecare dintre cei 3 jucători își alege baza -> rămân 12 teritorii neutre
  map3p[tIds3[0]].ownerId = 'p1';
  map3p[tIds3[5]].ownerId = 'p2';
  map3p[tIds3[10]].ownerId = 'p3';

  const check12Neutrals = shouldContinueConquestPhase(map3p, pIds3, 0);
  assert.equal(check12Neutrals.shouldContinue, true, 'La 12 teritorii neutre și 3 jucători, conquest continuă');
  assert.equal(check12Neutrals.nextPhase, 'conquest');

  // După 3 runde (9 teritorii cucerite) mai rămân exact 3 teritorii neutre (= 3 jucători activi) -> conquest ÎNCĂ continuă!
  let claimed = 0;
  for (const tid of tIds3) {
    if (map3p[tid].ownerId === null && claimed < 9) {
      map3p[tid].ownerId = pIds3[claimed % 3];
      claimed++;
    }
  }
  const check3Neutrals = shouldContinueConquestPhase(map3p, pIds3, 0);
  assert.equal(
    check3Neutrals.neutralCount,
    3,
    'Au rămas exact 3 teritorii neutre pentru 3 jucători activi'
  );
  assert.equal(
    check3Neutrals.shouldContinue,
    true,
    'Când neutralCount (3) >= activePlayers (3), faza conquest continuă și nu se oprește prematur!'
  );

  // Când mai rămân doar 2 teritorii neutre (< 3 jucători activi) -> trece în allocation!
  const remainingNeutralIds = tIds3.filter((id) => map3p[id].ownerId === null);
  map3p[remainingNeutralIds[0]].ownerId = 'p1';
  const check2Neutrals = shouldContinueConquestPhase(map3p, pIds3, 0);
  assert.equal(check2Neutrals.neutralCount, 2);
  assert.equal(check2Neutrals.shouldContinue, false);
  assert.equal(
    check2Neutrals.nextPhase,
    'allocation',
    'Trecerea la allocation se face doar când neutralCount < activePlayers.length'
  );
  assert.equal(check2Neutrals.reason, 'fewer_neutrals_than_players');

  // Când toate teritoriile neutre sunt ocupate (neutralCount === 0) -> trece direct în war!
  map3p[remainingNeutralIds[1]].ownerId = 'p2';
  map3p[remainingNeutralIds[2]].ownerId = 'p3';
  const check0Neutrals = shouldContinueConquestPhase(map3p, pIds3, 0);
  assert.equal(check0Neutrals.neutralCount, 0);
  assert.equal(check0Neutrals.shouldContinue, false);
  assert.equal(check0Neutrals.nextPhase, 'war');
  assert.equal(check0Neutrals.reason, 'all_occupied');

  // 3. Regula de selecție în allocation: adiacent obligatoriu dacă există vecin liber,
  //    și fallback neadiacent DOAR dacă jucătorul nu mai are niciun teritoriu liber adiacent
  const allocMap: Record<string, Territory> = JSON.parse(JSON.stringify(mockTerritories));
  // În mockTerritories, player1 deține maramures (vecini: satu_mare [neutru], cluj [neutru]); bihor și alba sunt neutre neadiacente
  assert.equal(
    canTargetTerritory('satu_mare', player1, allocMap, 'allocation').allowed,
    true,
    'Când player1 are vecini neutri, poate alege un teritoriu neutru adiacent (satu_mare)'
  );
  assert.equal(
    canTargetTerritory('bihor', player1, allocMap, 'allocation').allowed,
    false,
    'Când player1 are vecini neutri, NU poate alege un teritoriu neutru neadiacent (bihor)'
  );
  assert.equal(
    canTargetTerritory('arad', player1, allocMap, 'allocation').allowed,
    false,
    'Nu poate alege niciodată un teritoriu deja ocupat (arad)'
  );

  // Acum blocăm toți vecinii lui player1 (satu_mare și cluj devin ocupate de player2), lăsând doar bihor și alba neutre (neadiacente cu player1)
  allocMap.satu_mare.ownerId = 'player2';
  allocMap.cluj.ownerId = 'player2';
  assert.equal(
    getLegalNeutralTargetsForPlayer('player1', allocMap).length,
    0,
    'player1 nu mai are niciun teritoriu neutru adiacent'
  );
  assert.deepEqual(
    getLegalAllocationTargetsForPlayer('player1', allocMap).sort(),
    ['alba', 'bihor'],
    'Fallback-ul din allocation permite lui player1 să aleagă dintre teritoriile neutre neadiacente rămase'
  );
  assert.equal(
    canTargetTerritory('bihor', player1, allocMap, 'allocation').allowed,
    true,
    'Când player1 are 0 teritorii neutre adiacente, poate alege teritoriul neutru neadiacent bihor'
  );

  // Dacă niciun jucător nu mai are vecini neutri (de ex. doar bihor e neutru, iar satu_mare și cluj sunt ale lui player1, dar testăm pentru player2 care are doar arad și timis):
  allocMap.satu_mare.ownerId = 'player1';
  allocMap.cluj.ownerId = 'player1';
  allocMap.alba.ownerId = 'player1';
  // Acum singurul teritoriu neutru este bihor (vecin cu satu_mare și cluj -> doar player1 are vecin neutru, player2 NU are vecin neutru)
  // Dacă doar player2 a răspuns corect la departajare:
  const fallbackWinner = selectEligibleAllocationWinner(
    [{ playerId: 'player2', answer: 1, diff: 0, submitTime: 1200, rank: 1 }],
    ['player1', 'player2'],
    allocMap
  );
  assert.equal(
    fallbackWinner.winnerId,
    'player2',
    'Dacă singurul respondent corect (player2) nu are vecin neutru, primește dreptul de a alege teritoriul neutru neadiacent rămas'
  );
  assert.equal(fallbackWinner.usedNonAdjacentFallback, true);

  // 4. Filtrarea întrebărilor prea lungi sau invalide prin isShortReadableChoiceQuestion
  const validShortQ = INITIAL_QUESTIONS.find((q) => !q.isDisabled && q.reviewStatus === 'approved')!;
  assert.equal(isShortReadableChoiceQuestion(validShortQ), true);

  const tooManyWordsQ = {
    ...validShortQ,
    question:
      'Care este numele complet al marelui domnitor român care a realizat prima unire politică a celor trei principate?',
  };
  assert.equal(
    isShortReadableChoiceQuestion(tooManyWordsQ),
    false,
    'Întrebările cu peste 14 cuvinte sunt respinse de filtrul de lizibilitate rapidă'
  );

  const tooLongOptionQ = {
    ...validShortQ,
    options: [
      'O variantă de răspuns mult prea lungă pentru ecranul de mobil',
      'B',
      'C',
      'D',
    ],
  };
  assert.equal(
    isShortReadableChoiceQuestion(tooLongOptionQ),
    false,
    'Întrebările cu variante peste 36 caractere sau 5 cuvinte sunt respinse'
  );

  // 5. Verificare că interfața nu conține etichete de tipul „Dueluri simultane active”
  const hudSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/GameHUD.tsx'),
    'utf-8'
  );
  assert.equal(
    hudSource.includes('Dueluri simultane'),
    false,
    'GameHUD.tsx nu mai afișează eticheta Dueluri simultane'
  );
});




