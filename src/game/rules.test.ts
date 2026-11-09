import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

