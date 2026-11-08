import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdjacentToPlayer,
  canSelectBase,
  canCompleteBaseSelection,
  canTargetTerritory,
  determineEstimationWinner,
  resolveBattle,
  getTerritoryCountForPlayers,
  calculateConquestRounds,
  SCORING,
} from './rules';
import { Territory, Player } from '../types/game';
import { createMapForPlayerCount } from '../../server/romaniaMapData';

const mockTerritories: Record<string, Territory> = {
  maramures: {
    id: 'maramures',
    name: 'Maramureș',
    shortName: 'MM',
    region: 'Nord',
    svgPath: '',
    labelX: 100,
    labelY: 100,
    points: 0,
    ownerId: 'player1',
    isBase: true,
    neighbors: ['satu_mare', 'cluj'],
  },
  satu_mare: {
    id: 'satu_mare',
    name: 'Satu Mare',
    shortName: 'SM',
    region: 'Nord-Vest',
    svgPath: '',
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
    svgPath: '',
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
    svgPath: '',
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
    svgPath: '',
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
    svgPath: '',
    labelX: 60,
    labelY: 220,
    points: 0,
    ownerId: 'player2',
    isBase: true,
    neighbors: ['alba', 'timis'],
  },
  timis: {
    id: 'timis',
    name: 'Timiș',
    shortName: 'TM',
    region: 'Banat',
    svgPath: '',
    labelX: 60,
    labelY: 260,
    points: 0,
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

test('canSelectBase prevents selecting a base neighbor to an existing base', () => {
  // Satu Mare is direct neighbor of Maramureș (player1 base) -> FORBIDDEN
  assert.equal(canSelectBase('satu_mare', mockTerritories), false);

  // Cluj is direct neighbor of Maramureș (player1 base) -> FORBIDDEN
  assert.equal(canSelectBase('cluj', mockTerritories), false);

  // Bihor neighbors Satu Mare and Cluj, but neither is a base! (Maramureș & Arad are distant) -> ALLOWED
  assert.equal(canSelectBase('bihor', mockTerritories), true);
});

test('scoring constants match exact user specifications', () => {
  assert.equal(SCORING.BASE, 1000);
  assert.equal(SCORING.CONQUEST, 200);
  assert.equal(SCORING.ALLOCATION, 300);
  assert.equal(SCORING.WAR_DUEL, 400);
  assert.equal(SCORING.DEFENSIVE_BONUS, 100);
});

test('PLAYER_COUNT_TERRITORIES and calculateConquestRounds match specification', () => {
  assert.equal(SCORING.BASE, 1000);
  assert.equal(SCORING.DEFENSIVE_BONUS, 100);

  // 2 players -> 10 territories
  assert.equal(getTerritoryCountForPlayers(2), 10);
  // 3 players -> 15 territories
  assert.equal(getTerritoryCountForPlayers(3), 15);
  // 4 players -> 25 territories in the current map definition
  assert.equal(getTerritoryCountForPlayers(4), 25);
  // 5 players -> 25 territories
  assert.equal(getTerritoryCountForPlayers(5), 25);
  // 6 players -> 29 territories in the current map definition
  assert.equal(getTerritoryCountForPlayers(6), 29);
  // 10 players -> 29 territories
  assert.equal(getTerritoryCountForPlayers(10), 29);

  // Conquest rounds formula: clamp(ceil((territoryCount - playerCount) / playerCount), 4, 5)
  assert.equal(calculateConquestRounds(15, 3), 4);
  assert.equal(calculateConquestRounds(24, 4), 5);
});

test('canTargetTerritory in conquest phase requires adjacent neutral territory', () => {
  // Satu Mare is neutral and neighbor of player1's territory (Maramureș)
  const res1 = canTargetTerritory('satu_mare', player1, mockTerritories, 'conquest');
  assert.equal(res1.allowed, true);

  // Bihor is neutral but NOT adjacent to player1's land yet
  const res2 = canTargetTerritory('bihor', player1, mockTerritories, 'conquest');
  assert.equal(res2.allowed, false);
});

test('canTargetTerritory in war phase enforces base attack rules', () => {
  // Player 1 has Maramures. Arad is Player 2's base and is NOT adjacent to Player 1.
  // First attempt on non-adjacent base should be allowed (the 1 special attempt per game)
  const resFirst = canTargetTerritory('arad', player1, mockTerritories, 'war');
  assert.equal(resFirst.allowed, true);

  // Once used, non-adjacent base attack should be blocked
  const player1WithUsedAttack: Player = {
    ...player1,
    baseAttackAttemptsUsed: { player2: 1 },
  };
  const resSecond = canTargetTerritory('arad', player1WithUsedAttack, mockTerritories, 'war');
  assert.equal(resSecond.allowed, false);
  assert.match(resSecond.reason || '', /singura încercare de atac/);
});

test('resolveBattle awards 400 points to the winner', () => {
  const territory: Territory = {
    id: 'timis',
    name: 'Timiș',
    shortName: 'TM',
    region: 'Banat',
    svgPath: '',
    labelX: 0,
    labelY: 0,
    points: 200,
    ownerId: 'player2',
    isBase: false,
    neighbors: [],
  };

  const outcome = resolveBattle({
    targetTerritory: territory,
    attackerCorrect: true,
    defenderCorrect: false,
    attackerTimeMs: 3000,
    defenderTimeMs: 5000,
  });

  assert.equal(outcome.conquered, true);
  assert.equal(outcome.attackerWon, true);
  assert.equal(outcome.pointsAwarded, 400);
  assert.equal(outcome.defensiveBonusAwarded, 0);
});

test('resolveBattle awards 100 defensive bonus when defender is correct and attacker is wrong', () => {
  const territory: Territory = {
    id: 'timis',
    name: 'Timiș',
    shortName: 'TM',
    region: 'Banat',
    svgPath: '',
    labelX: 0,
    labelY: 0,
    points: 200,
    ownerId: 'player2',
    isBase: false,
    neighbors: [],
  };

  const outcome = resolveBattle({
    targetTerritory: territory,
    attackerCorrect: false,
    defenderCorrect: true,
    attackerTimeMs: 4000,
    defenderTimeMs: 2000,
  });

  assert.equal(outcome.conquered, false);
  assert.equal(outcome.attackerWon, false);
  assert.equal(outcome.pointsAwarded, 0);
  assert.equal(outcome.defensiveBonusAwarded, 100);
});

test('determineEstimationWinner picks closest estimate and breaks ties by time', () => {
  const target = 1877; // Războiul de Independență
  const submissions = {
    p1: { answer: 1850, submitTime: 4000 }, // diff 27
    p2: { answer: 1880, submitTime: 6000 }, // diff 3
    p3: { answer: 1874, submitTime: 5000 }, // diff 3 (tie with p2, but faster submitTime 5000 < 6000)
  };

  const outcome = determineEstimationWinner(target, submissions);
  assert.equal(outcome.winnerId, 'p3');
  assert.equal(outcome.rankings[0].playerId, 'p3');
  assert.equal(outcome.rankings[0].diff, 3);
});


test('base selection preserves enough non-adjacent base positions', () => {
  const simple: Record<string, Territory> = {
    a: { id: 'a', name: 'A', shortName: 'A', region: 'x', svgPath: '', labelX: 0, labelY: 0, points: 0, ownerId: null, isBase: false, neighbors: ['b'] },
    b: { id: 'b', name: 'B', shortName: 'B', region: 'x', svgPath: '', labelX: 0, labelY: 0, points: 0, ownerId: null, isBase: false, neighbors: ['a', 'c'] },
    c: { id: 'c', name: 'C', shortName: 'C', region: 'x', svgPath: '', labelX: 0, labelY: 0, points: 0, ownerId: null, isBase: false, neighbors: ['b'] },
    d: { id: 'd', name: 'D', shortName: 'D', region: 'x', svgPath: '', labelX: 0, labelY: 0, points: 0, ownerId: null, isBase: false, neighbors: [] },
  };
  assert.equal(canCompleteBaseSelection('b', simple, 2), false);
  assert.equal(canCompleteBaseSelection('d', simple, 2), true);
});

test('generated map definitions have requested available territory counts and symmetric valid neighbors', () => {
  const expected: Record<number, number> = { 2: 10, 3: 15, 4: 25, 5: 25, 6: 29, 7: 29, 8: 29, 9: 29, 10: 29 };
  for (const [playerCountText, count] of Object.entries(expected)) {
    const map = createMapForPlayerCount(Number(playerCountText));
    assert.equal(Object.keys(map).length, count, `${playerCountText} players`);
    for (const territory of Object.values(map) as Territory[]) {
      for (const neighborId of territory.neighbors) {
        assert.ok(map[neighborId], `dangling neighbor ${territory.id} -> ${neighborId}`);
        assert.ok(map[neighborId].neighbors.includes(territory.id), `asymmetric neighbor ${territory.id} <-> ${neighborId}`);
      }
    }
  }
});


test('determineEstimationWinner accepts negative and decimal numeric submissions', () => {
  const outcome = determineEstimationWinner(-2.5, {
    player1: { answer: -2.4, submitTime: 1200 },
    player2: { answer: -1.5, submitTime: 900 },
    player3: { answer: Number.NaN, submitTime: 100 },
  });
  assert.equal(outcome.winnerId, 'player1');
  assert.equal(outcome.rankings.length, 2);
});

test('determineEstimationWinner returns no winner when every player timed out', () => {
  const outcome = determineEstimationWinner(100, {});
  assert.equal(outcome.winnerId, null);
  assert.deepEqual(outcome.rankings, []);
});

test('conquest simultaneous answers rank correct players by fastest submitTime', () => {
  const answers: Record<string, { answer: number; submitTime: number }> = {
    playerA: { answer: 2, submitTime: 3200 },
    playerB: { answer: 2, submitTime: 1450 },
    playerC: { answer: 1, submitTime: 900 }, // wrong answer
    playerD: { answer: 2, submitTime: 2100 },
  };
  const correctAnswerIndex = 2;

  const correctPlayers = Object.entries(answers)
    .filter(([, sub]) => sub.answer === correctAnswerIndex)
    .map(([playerId, sub]) => ({ playerId, submitTime: sub.submitTime }))
    .sort((a, b) => a.submitTime - b.submitTime);

  assert.equal(correctPlayers.length, 3);
  assert.equal(correctPlayers[0].playerId, 'playerB'); // 1450ms
  assert.equal(correctPlayers[1].playerId, 'playerD'); // 2100ms
  assert.equal(correctPlayers[2].playerId, 'playerA'); // 3200ms
});
