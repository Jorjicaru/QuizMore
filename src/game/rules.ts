import {
  Territory,
  Player,
  GameState,
  RoundDisplayModel,
  RoundTrackerMarkerItem,
  RoundTrackerBattlePair,
  RoundTrackerMarkerState,
} from '../types/game';

/**
 * Constantele oficiale de punctaj CONQUIZ
 */
export const SCORING = {
  BASE: 1000,
  CONQUEST: 200,
  ALLOCATION: 300,
  WAR_DUEL: 400,
  DEFENSIVE_BONUS: 100,
} as const;

/**
 * Numărul dedicat de teritorii pentru fiecare număr de jucători (2..10) conform V3.0 / V5.0:
 * - 2 jucători: 10 teritorii (2 baze + 8 neutre)
 * - 3 jucători: 15 teritorii (3 baze + 12 neutre)
 * - 4 jucători: 20 teritorii (4 baze + 16 neutre)
 * - 5 jucători: 23 teritorii (5 baze + 18 neutre)
 * - 6 jucători: 26 teritorii (6 baze + 20 neutre)
 * - 7 jucători: 29 teritorii (7 baze + 22 neutre)
 * - 8 jucători: 32 teritorii (8 baze + 24 neutre)
 * - 9 jucători: 35 teritorii (9 baze + 26 neutre)
 * - 10 jucători: 38 teritorii (10 baze + 28 neutre)
 */
export const PLAYER_COUNT_TERRITORIES: Record<number, number> = {
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

export function getTerritoryCountForPlayers(playerCount: number): number {
  const clamped = Math.max(2, Math.min(10, Math.round(playerCount || 4)));
  return PLAYER_COUNT_TERRITORIES[clamped] || 20;
}

export function calculateConquestRounds(territoryCount: number, playerCount: number): number {
  const clampedPlayers = Math.max(2, playerCount);
  const raw = Math.ceil((territoryCount - clampedPlayers) / clampedPlayers);
  return Math.max(4, Math.min(5, raw));
}

/**
 * Verifică dacă două teritorii sunt direct învecinate conform grafului de vecinătăți simetric.
 */
export function areTerritoriesAdjacent(
  territoryAId: string,
  territoryBId: string,
  territories: Record<string, Pick<Territory, 'id' | 'neighbors'>>
): boolean {
  if (!territoryAId || !territoryBId || territoryAId === territoryBId) return false;
  const a = territories[territoryAId];
  const b = territories[territoryBId];
  if (!a || !b) return false;
  return a.neighbors.includes(territoryBId) && b.neighbors.includes(territoryAId);
}

/**
 * Verifică dacă un teritoriu este direct învecinat cu cel puțin un teritoriu deținut de playerId
 */
export function isAdjacentToPlayer(
  territoryId: string,
  playerId: string,
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'neighbors'>>
): boolean {
  const target = territories[territoryId];
  if (!target) return false;
  return target.neighbors.some((nId) => territories[nId]?.ownerId === playerId);
}

/**
 * Verifică dacă o regiune poate fi selectată ca Bază:
 * - Trebuie să fie neutră
 * - NU poate fi direct învecinată cu o altă bază existentă
 */
export function canSelectBase(
  territoryId: string,
  territories: Record<string, Territory>
): boolean {
  const target = territories[territoryId];
  if (!target || target.ownerId !== null) return false;
  const adjacentBase = target.neighbors.some((nId) => territories[nId]?.isBase);
  return !adjacentBase;
}

/**
 * Verifică prin backtracking dacă alegerea teritoriului ca bază lasă suficiente poziții neadiacente
 * pentru ca toți jucătorii rămași să își poată amplasa bazele.
 */
export function canCompleteBaseSelection(
  territoryId: string,
  territories: Record<string, Territory>,
  remainingBasesToPick: number
): boolean {
  if (!canSelectBase(territoryId, territories)) return false;
  if (remainingBasesToPick <= 0) return true;

  // Simulăm alegerea acestui teritoriu ca bază
  const existingBaseIds = new Set<string>();
  for (const t of Object.values(territories)) {
    if (t.isBase) existingBaseIds.add(t.id);
  }
  existingBaseIds.add(territoryId);

  const allIds = Object.keys(territories);

  function canPickMore(needed: number, currentBases: Set<string>, startIndex: number): boolean {
    if (needed <= 0) return true;

    // Numărăm rapid candidații valizi rămași
    const validCandidates: string[] = [];
    for (let i = startIndex; i < allIds.length; i++) {
      const id = allIds[i];
      const t = territories[id];
      if (!t || t.ownerId !== null || currentBases.has(id)) continue;
      const touchesBase = t.neighbors.some((nId) => currentBases.has(nId));
      if (!touchesBase) {
        validCandidates.push(id);
      }
    }

    if (validCandidates.length < needed) return false;

    for (let i = 0; i < validCandidates.length; i++) {
      const candId = validCandidates[i];
      currentBases.add(candId);
      const nextIdx = allIds.indexOf(candId) + 1;
      if (canPickMore(needed - 1, currentBases, nextIdx)) {
        currentBases.delete(candId);
        return true;
      }
      currentBases.delete(candId);
    }

    return false;
  }

  return canPickMore(remainingBasesToPick, existingBaseIds, 0);
}

/**
 * Verifică dacă un jucător poate ținti un teritoriu în faza curentă:
 * - base_selection: neutru și neadiacent cu alte baze
 * - conquest: neutru și OBLIGATORIU adiacent cu un teritoriu deținut de jucător
 * - allocation: neutru
 * - war: REGULĂ V4.0 / V5.0 ABSOLUTĂ:
 *   1. teritoriul aparține unui inamic (`target.ownerId !== null && target.ownerId !== player.id`)
 *   2. dacă există `assignedDefenderId`, teritoriul aparține apărătorului desemnat (`target.ownerId === assignedDefenderId`)
 *   3. teritoriul este OBLIGATORIU direct învecinat cu cel puțin un teritoriu deținut de atacator (`isAdjacentToPlayer === true`),
 *      inclusiv pentru Cetăți/Baze (`isBase`). Niciun atac la distanță nu este permis!
 */
export function canTargetTerritory(
  territoryId: string,
  player: Player,
  territories: Record<string, Territory>,
  phase: 'base_selection' | 'conquest' | 'allocation' | 'war',
  assignedDefenderId?: string | null
): { allowed: boolean; reason?: string } {
  const target = territories[territoryId];
  if (!target) {
    return { allowed: false, reason: 'Teritoriul nu există.' };
  }

  if (phase === 'base_selection') {
    if (target.ownerId !== null) {
      return { allowed: false, reason: 'Teritoriul este deja ocupat.' };
    }
    if (!canSelectBase(territoryId, territories)) {
      return { allowed: false, reason: 'Baza nu poate fi lipită de baza altui jucător!' };
    }
    return { allowed: true };
  }

  if (phase === 'conquest') {
    if (target.ownerId !== null) {
      return { allowed: false, reason: 'Poți cuceri doar teritorii neutre (libere).' };
    }
    if (!isAdjacentToPlayer(territoryId, player.id, territories)) {
      return { allowed: false, reason: 'Trebuie să alegi un teritoriu liber învecinat cu teritoriile tale!' };
    }
    return { allowed: true };
  }

  if (phase === 'allocation') {
    if (target.ownerId !== null) {
      return { allowed: false, reason: 'Poți alege doar un teritoriu neutru (liber).' };
    }
    return { allowed: true };
  }

  if (phase === 'war') {
    if (!target.ownerId || target.ownerId === player.id) {
      return { allowed: false, reason: 'Poți ataca doar teritoriile inamice!' };
    }

    if (assignedDefenderId && target.ownerId !== assignedDefenderId) {
      return {
        allowed: false,
        reason: 'În această rundă poți ataca doar teritoriile apărătorului desemnat!',
      };
    }

    const isAdjacent = isAdjacentToPlayer(territoryId, player.id, territories);
    if (!isAdjacent) {
      return {
        allowed: false,
        reason: 'Nu poți ataca un teritoriu care nu este vecin cu teritoriile tale.',
      };
    }

    return { allowed: true };
  }

  return { allowed: false, reason: 'Fază inactivă.' };
}

/**
 * Rezolvă rezultatul unui duel în faza Război
 */
export function resolveBattle(params: {
  targetTerritory: Territory;
  attackerCorrect: boolean;
  defenderCorrect: boolean;
  attackerTimeMs: number;
  defenderTimeMs: number;
}): {
  conquered: boolean;
  attackerWon: boolean;
  pointsAwarded: number;
  defensiveBonusAwarded: number;
  message: string;
} {
  const { targetTerritory, attackerCorrect, defenderCorrect } = params;

  if (attackerCorrect && !defenderCorrect) {
    return {
      conquered: !targetTerritory.isBase || (targetTerritory.castleTowers ?? 3) <= 1,
      attackerWon: true,
      pointsAwarded: SCORING.WAR_DUEL,
      defensiveBonusAwarded: 0,
      message: `Atac reușit asupra ${targetTerritory.name}! (+${SCORING.WAR_DUEL} pct)`,
    };
  }

  if (!attackerCorrect && defenderCorrect) {
    return {
      conquered: false,
      attackerWon: false,
      pointsAwarded: 0,
      defensiveBonusAwarded: SCORING.DEFENSIVE_BONUS,
      message: `Apărare reușită în ${targetTerritory.name}! (+${SCORING.DEFENSIVE_BONUS} bonus defensiv)`,
    };
  }

  return {
    conquered: false,
    attackerWon: false,
    pointsAwarded: 0,
    defensiveBonusAwarded: 0,
    message: `Niciun războinic nu a câștigat duelul pentru ${targetTerritory.name}. Teritoriul rămâne la apărător fără bonus.`,
  };
}

/**
 * Determină câștigătorul la o întrebare numerică (departajare / estimare):
 * - Cea mai mică diferență absolută față de targetNumber câștigă
 * - La egalitate de diferență, cel mai rapid timp (submitTime) câștigă
 */
export function determineEstimationWinner(
  targetNumber: number,
  submissions: Record<string, { answer: number; submitTime: number }>
): {
  winnerId: string | null;
  rankings: Array<{ playerId: string; answer: number; diff: number; submitTime: number; rank: number }>;
} {
  const validEntries = Object.entries(submissions)
    .filter(([, sub]) => sub && typeof sub.answer === 'number' && Number.isFinite(sub.answer))
    .map(([playerId, sub]) => ({
      playerId,
      answer: sub.answer,
      diff: Math.abs(sub.answer - targetNumber),
      submitTime: sub.submitTime,
    }))
    .sort((a, b) => {
      if (a.diff !== b.diff) return a.diff - b.diff;
      return a.submitTime - b.submitTime;
    });

  const rankings = validEntries.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));

  return {
    winnerId: rankings.length > 0 ? rankings[0].playerId : null,
    rankings,
  };
}

/**
 * Verifică dacă doi jucători împart o graniță directă între teritoriile lor
 */
export function playersShareBorder(
  playerA: string,
  playerB: string,
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'neighbors'>>
): boolean {
  if (!playerA || !playerB || playerA === playerB) return false;
  const aTerritories = Object.values(territories).filter((t) => t.ownerId === playerA);
  return aTerritories.some((t) =>
    t.neighbors.some((nId) => territories[nId]?.ownerId === playerB)
  );
}

/**
 * Returnează teritoriile valide pe care attackerId le poate ataca de la defenderId în runda de război.
 * REGULĂ V4.0 / V5.0 ABSOLUTĂ:
 * Returnează DOAR teritoriile apărătorului care sunt direct învecinate cu cel puțin un teritoriu al atacatorului.
 * Dacă nu există nicio țintă adiacentă, returnează `[]` (NICIODATĂ fallback la toate teritoriile apărătorului!).
 */
export function getLegalWarTargetsForPair(
  attackerId: string,
  defenderId: string,
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'neighbors'>>
): string[] {
  if (!attackerId || !defenderId || attackerId === defenderId) return [];
  const myTerritories = Object.values(territories).filter((t) => t.ownerId === attackerId);
  const defenderTerritories = Object.values(territories).filter((t) => t.ownerId === defenderId);
  if (defenderTerritories.length === 0 || myTerritories.length === 0) return [];

  const adjacentTargets = defenderTerritories.filter((dt) =>
    myTerritories.some((mt) => mt.neighbors.includes(dt.id))
  );
  return adjacentTargets.map((t) => t.id);
}

/**
 * Construiește împerecherile simultane Atacator vs Apărător pentru o rundă de Război (2..10 jucători).
 * Reguli V4.0 / V5.0:
 * - Un duel (attacker, defender) este permis DOAR dacă cei doi jucători împart graniță directă
 *   (`playersShareBorder(attacker, defender, territories) === true`) și există cel puțin o țintă adiacentă legală!
 * - Caută cuplajul maxim (maximum matching) de perechi disjuncte cu graniță comună, optimizând totodată
 *   alternanța echitabilă a rolurilor (Atacator / Apărător / BYE) de la o rundă la alta.
 * - Jucătorii care nu pot fi cuplați cu un adversar vecin intră în `byePlayerIds` (fără atacuri la distanță!).
 */
export function buildSimultaneousWarPairings(
  activePlayerIds: string[],
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'neighbors'>>,
  roundNumber: number,
  roleHistory: Record<string, Array<'attacker' | 'defender' | 'bye'>> = {}
): {
  attackerIds: string[];
  defenderIds: string[];
  byePlayerIds: string[];
  pairs: Array<{ attackerId: string; defenderId: string; sharesBorder: boolean }>;
} {
  const n = activePlayerIds.length;
  if (n < 2) {
    return { attackerIds: [], defenderIds: [], byePlayerIds: [...activePlayerIds], pairs: [] };
  }

  const attackerPriorityScore = (pid: string, idx: number): number => {
    const hist = roleHistory[pid] || [];
    const lastRole = hist[hist.length - 1];
    const attackerCount = hist.filter((r) => r === 'attacker').length;
    const defenderCount = hist.filter((r) => r === 'defender').length;
    const byeCount = hist.filter((r) => r === 'bye').length;
    let score = (defenderCount - attackerCount) * 12 + byeCount * 8;
    if (lastRole === 'defender') score += 25;
    else if (lastRole === 'bye') score += 22;
    else if (lastRole === 'attacker') score -= 25;
    else {
      score += (idx + roundNumber) % 2 === 0 ? 10 : -10;
    }
    return score;
  };

  const byePenaltyScore = (pid: string, idx: number): number => {
    const hist = roleHistory[pid] || [];
    const lastWasBye = hist[hist.length - 1] === 'bye';
    const totalByes = hist.filter((r) => r === 'bye').length;
    return (lastWasBye ? 200 : 0) + totalByes * 40 + ((idx + roundNumber) % n);
  };

  const priorityById = new Map<string, number>();
  const byePenaltyById = new Map<string, number>();
  activePlayerIds.forEach((pid, idx) => {
    priorityById.set(pid, attackerPriorityScore(pid, idx));
    byePenaltyById.set(pid, byePenaltyScore(pid, idx));
  });

  // Sort candidate players so players who should NOT get a bye (high byePenalty) are matched first
  const orderedIds = [...activePlayerIds].sort(
    (a, b) => (byePenaltyById.get(b) || 0) - (byePenaltyById.get(a) || 0)
  );

  // Precompute valid adjacent opponent pairs
  const adjMap = new Map<string, Set<string>>();
  for (const id of orderedIds) {
    adjMap.set(id, new Set<string>());
  }
  for (let i = 0; i < orderedIds.length; i++) {
    for (let j = i + 1; j < orderedIds.length; j++) {
      const a = orderedIds[i];
      const b = orderedIds[j];
      if (
        playersShareBorder(a, b, territories) &&
        getLegalWarTargetsForPair(a, b, territories).length > 0 &&
        getLegalWarTargetsForPair(b, a, territories).length > 0
      ) {
        adjMap.get(a)!.add(b);
        adjMap.get(b)!.add(a);
      }
    }
  }

  let bestPairs: Array<{ attackerId: string; defenderId: string; sharesBorder: boolean }> = [];
  let bestScore = Number.NEGATIVE_INFINITY;

  const used = new Set<string>();
  const currentPairs: Array<{ attackerId: string; defenderId: string; sharesBorder: boolean }> = [];

  function search(startIdx: number, currentRoleScore: number) {
    const remaining = orderedIds.length - used.size;
    const maxPossiblePairs = currentPairs.length + Math.floor(remaining / 2);
    if (maxPossiblePairs < bestPairs.length) {
      return;
    }

    // Find next unmatched player
    let uIdx = -1;
    for (let i = startIdx; i < orderedIds.length; i++) {
      if (!used.has(orderedIds[i])) {
        uIdx = i;
        break;
      }
    }

    if (uIdx === -1) {
      // Evaluate complete assignment: penalize leaving someone with high byePenalty unmatched
      let totalScore = currentRoleScore;
      for (const pid of orderedIds) {
        if (!used.has(pid)) {
          totalScore -= byePenaltyById.get(pid) || 0;
        }
      }
      if (
        currentPairs.length > bestPairs.length ||
        (currentPairs.length === bestPairs.length && totalScore > bestScore)
      ) {
        bestPairs = currentPairs.map((p) => ({ ...p }));
        bestScore = totalScore;
      }
      return;
    }

    const u = orderedIds[uIdx];
    const uNeighbors = adjMap.get(u)!;

    for (let vIdx = uIdx + 1; vIdx < orderedIds.length; vIdx++) {
      const v = orderedIds[vIdx];
      if (used.has(v) || !uNeighbors.has(v)) continue;

      const uPrio = priorityById.get(u) || 0;
      const vPrio = priorityById.get(v) || 0;
      const attackerId = uPrio >= vPrio ? u : v;
      const defenderId = uPrio >= vPrio ? v : u;
      const pairGain = (priorityById.get(attackerId) || 0) - (priorityById.get(defenderId) || 0);

      used.add(u);
      used.add(v);
      currentPairs.push({ attackerId, defenderId, sharesBorder: true });

      search(uIdx + 1, currentRoleScore + pairGain);

      currentPairs.pop();
      used.delete(u);
      used.delete(v);
    }

    // Option to leave u unmatched (BYE)
    if (orderedIds.length - (uIdx + 1) >= (bestPairs.length - currentPairs.length) * 2) {
      search(uIdx + 1, currentRoleScore);
    }
  }

  search(0, 0);

  // Order pairs deterministically by attacker priority
  bestPairs.sort(
    (a, b) => (priorityById.get(b.attackerId) || 0) - (priorityById.get(a.attackerId) || 0)
  );

  const matched = new Set<string>();
  const attackerIds: string[] = [];
  const defenderIds: string[] = [];
  for (const p of bestPairs) {
    attackerIds.push(p.attackerId);
    defenderIds.push(p.defenderId);
    matched.add(p.attackerId);
    matched.add(p.defenderId);
  }

  const byePlayerIds = activePlayerIds.filter((id) => !matched.has(id));

  return {
    attackerIds,
    defenderIds,
    byePlayerIds,
    pairs: bestPairs,
  };
}

/**
 * Evaluează rezultatul întrebării grilă (choice) pentru o bătălie din faza Război
 */
export function evaluateWarBattleChoiceOutcome(
  attackerId: string,
  defenderId: string,
  playerAnswers: Record<string, { answer: number | string | null; submitTime: number }>,
  correctOptionIndex: number
): {
  attackerChoiceCorrect: boolean;
  defenderChoiceCorrect: boolean;
  attackerChoiceAnswer: number | null;
  defenderChoiceAnswer: number | null;
  outcome: 'attacker_won' | 'defender_won' | 'draw_no_bonus' | 'needs_tiebreak';
  winnerId: string | null;
} {
  const atkSub = playerAnswers[attackerId];
  const defSub = playerAnswers[defenderId];

  const attackerChoiceAnswer =
    atkSub !== undefined && atkSub.answer !== null && atkSub.answer !== undefined
      ? Number(atkSub.answer)
      : null;
  const defenderChoiceAnswer =
    defSub !== undefined && defSub.answer !== null && defSub.answer !== undefined
      ? Number(defSub.answer)
      : null;

  const attackerChoiceCorrect =
    attackerChoiceAnswer !== null && attackerChoiceAnswer === correctOptionIndex;
  const defenderChoiceCorrect =
    defenderChoiceAnswer !== null && defenderChoiceAnswer === correctOptionIndex;

  if (attackerChoiceCorrect && !defenderChoiceCorrect) {
    return {
      attackerChoiceCorrect,
      defenderChoiceCorrect,
      attackerChoiceAnswer,
      defenderChoiceAnswer,
      outcome: 'attacker_won',
      winnerId: attackerId,
    };
  }
  if (!attackerChoiceCorrect && defenderChoiceCorrect) {
    return {
      attackerChoiceCorrect,
      defenderChoiceCorrect,
      attackerChoiceAnswer,
      defenderChoiceAnswer,
      outcome: 'defender_won',
      winnerId: defenderId,
    };
  }
  if (!attackerChoiceCorrect && !defenderChoiceCorrect) {
    return {
      attackerChoiceCorrect,
      defenderChoiceCorrect,
      attackerChoiceAnswer,
      defenderChoiceAnswer,
      outcome: 'draw_no_bonus',
      winnerId: defenderId,
    };
  }
  return {
    attackerChoiceCorrect,
    defenderChoiceCorrect,
    attackerChoiceAnswer,
    defenderChoiceAnswer,
    outcome: 'needs_tiebreak',
    winnerId: null,
  };
}

/**
 * Evaluează departajarea numerică pentru o bătălie din faza Război în care ambii au răspuns corect la grilă
 */
export function evaluateWarBattleTiebreakOutcome(
  attackerId: string,
  defenderId: string,
  playerAnswers: Record<string, { answer: number | string | null; submitTime: number }>,
  targetNumber: number
): {
  attackerNumericAnswer: number | null;
  defenderNumericAnswer: number | null;
  attackerNumericDiff: number | null;
  defenderNumericDiff: number | null;
  attackerSubmitTime: number | null;
  defenderSubmitTime: number | null;
  outcome: 'attacker_won' | 'defender_won' | 'draw_no_bonus';
  winnerId: string;
} {
  const atkSub = playerAnswers[attackerId];
  const defSub = playerAnswers[defenderId];

  const atkVal = atkSub && atkSub.answer !== null ? Number(atkSub.answer) : NaN;
  const defVal = defSub && defSub.answer !== null ? Number(defSub.answer) : NaN;

  const atkAnswered = Number.isFinite(atkVal);
  const defAnswered = Number.isFinite(defVal);

  const attackerNumericAnswer = atkAnswered ? atkVal : null;
  const defenderNumericAnswer = defAnswered ? defVal : null;

  const attackerNumericDiff = atkAnswered ? Math.abs(atkVal - targetNumber) : null;
  const defenderNumericDiff = defAnswered ? Math.abs(defVal - targetNumber) : null;

  const attackerSubmitTime = atkAnswered ? atkSub.submitTime : null;
  const defenderSubmitTime = defAnswered ? defSub.submitTime : null;

  if (atkAnswered && !defAnswered) {
    return {
      attackerNumericAnswer,
      defenderNumericAnswer,
      attackerNumericDiff,
      defenderNumericDiff,
      attackerSubmitTime,
      defenderSubmitTime,
      outcome: 'attacker_won',
      winnerId: attackerId,
    };
  }
  if (!atkAnswered && defAnswered) {
    return {
      attackerNumericAnswer,
      defenderNumericAnswer,
      attackerNumericDiff,
      defenderNumericDiff,
      attackerSubmitTime,
      defenderSubmitTime,
      outcome: 'defender_won',
      winnerId: defenderId,
    };
  }
  if (!atkAnswered && !defAnswered) {
    return {
      attackerNumericAnswer: null,
      defenderNumericAnswer: null,
      attackerNumericDiff: null,
      defenderNumericDiff: null,
      attackerSubmitTime: null,
      defenderSubmitTime: null,
      outcome: 'draw_no_bonus',
      winnerId: defenderId,
    };
  }

  if ((attackerNumericDiff as number) < (defenderNumericDiff as number)) {
    return {
      attackerNumericAnswer,
      defenderNumericAnswer,
      attackerNumericDiff,
      defenderNumericDiff,
      attackerSubmitTime,
      defenderSubmitTime,
      outcome: 'attacker_won',
      winnerId: attackerId,
    };
  }
  if ((defenderNumericDiff as number) < (attackerNumericDiff as number)) {
    return {
      attackerNumericAnswer,
      defenderNumericAnswer,
      attackerNumericDiff,
      defenderNumericDiff,
      attackerSubmitTime,
      defenderSubmitTime,
      outcome: 'defender_won',
      winnerId: defenderId,
    };
  }

  if ((attackerSubmitTime as number) < (defenderSubmitTime as number)) {
    return {
      attackerNumericAnswer,
      defenderNumericAnswer,
      attackerNumericDiff,
      defenderNumericDiff,
      attackerSubmitTime,
      defenderSubmitTime,
      outcome: 'attacker_won',
      winnerId: attackerId,
    };
  }

  if ((defenderSubmitTime as number) < (attackerSubmitTime as number)) {
    return {
      attackerNumericAnswer,
      defenderNumericAnswer,
      attackerNumericDiff,
      defenderNumericDiff,
      attackerSubmitTime,
      defenderSubmitTime,
      outcome: 'defender_won',
      winnerId: defenderId,
    };
  }

  return {
    attackerNumericAnswer,
    defenderNumericAnswer,
    attackerNumericDiff,
    defenderNumericDiff,
    attackerSubmitTime,
    defenderSubmitTime,
    outcome: 'draw_no_bonus',
    winnerId: defenderId,
  };
}

/**
 * Sanitizează inputul numeric: păstrează doar cifrele, punctul zecimal și semnul minus la început
 */
export function sanitizeNumericInput(raw: string): string {
  const normalized = raw.replace(/,/g, '.');
  let sign = '';
  let body = normalized;
  if (body.startsWith('-')) {
    sign = '-';
    body = body.slice(1);
  }
  body = body.replace(/[^0-9.]/g, '');
  const parts = body.split('.');
  if (parts.length > 2) {
    body = parts[0] + '.' + parts.slice(1).join('');
  }
  return sign + body;
}

/**
 * Construiește modelul pur și testabil pentru RoundTracker (Secțiunea 46 din TODO V5.0).
 * REGULĂ ABSOLUTĂ:
 * - Fiecare jucător apare CEL MULT O SINGURĂ DATĂ în lista de markeri ai rundei curente
 *   (pentru 4 jucători -> 4 markeri; pentru 10 jucători -> 10 markeri; NICIODATĂ N x N = 16 sau 100!).
 * - Ordinea markerilor reflectă exact ordinea autoritativă de joc din server:
 *   1. base_selection: ordinea de alegere a bazei (players[] + activePlayerIndex)
 *   2. conquest (întrebare): participanții simultani + starea răspunsului (answered / pending / correct / wrong / no_response)
 *   3. conquest (alegere teritoriu): ordinea exactă din `conquestPickQueue` (cu `conquestPickerId` activ)
 *   4. allocation: participanții la estimare sau câștigătorul departajării (`allocationWinnerId`)
 *   5. war: perechile reale din `warRound.battles` în ordinea exactă de pe server (`[Atacator ⚔️ Apărător]`) + `byePlayerIds`
 */
export function buildRoundDisplayItems(game: GameState): RoundDisplayModel {
  const playersById = new Map<string, Player>();
  for (const p of game.players) {
    playersById.set(p.id, p);
  }

  const basesPlacedCount = game.players.filter((p) => Boolean(p.baseTerritoryId)).length;
  const totalBasePicks = game.players.length;

  // 1. BASE SELECTION
  if (game.phase === 'base_selection') {
    const items: RoundTrackerMarkerItem[] = game.players.map((p, idx) => {
      const hasBase = Boolean(p.baseTerritoryId);
      const isActive = idx === game.activePlayerIndex && !hasBase;
      const state: RoundTrackerMarkerState = hasBase ? 'done' : isActive ? 'active' : 'pending';
      return {
        playerId: p.id,
        username: p.username,
        color: p.color,
        state,
        label: hasBase ? 'Bază aleasă' : isActive ? 'Alege baza acum' : 'În așteptare',
        orderIndex: idx + 1,
      };
    });

    return {
      phase: game.phase,
      phaseLabel: 'ALEGEREA BAZEI',
      subMode: 'base_selection',
      subModeLabel: `${Math.max(0, totalBasePicks - basesPlacedCount)} alegeri rămase`,
      currentRound: Math.min(totalBasePicks, basesPlacedCount + 1),
      totalRounds: Math.max(1, totalBasePicks),
      remainingSteps: Math.max(0, totalBasePicks - basesPlacedCount),
      items,
      battlePairs: [],
      byeItems: [],
    };
  }

  // 2. CONQUEST
  if (game.phase === 'conquest') {
    const cq = game.currentQuestion;
    const pickQueue = game.conquestPickQueue || [];
    const pickerId = game.conquestPickerId || null;

    if (!cq && (pickerId || pickQueue.length > 0)) {
      const orderedQueueIds: string[] = [];
      if (pickerId && !orderedQueueIds.includes(pickerId)) {
        orderedQueueIds.push(pickerId);
      }
      for (const id of pickQueue) {
        if (!orderedQueueIds.includes(id)) {
          orderedQueueIds.push(id);
        }
      }

      const items: RoundTrackerMarkerItem[] = [];
      orderedQueueIds.forEach((id, idx) => {
        const p = playersById.get(id);
        if (!p) return;
        const isCurrentPicker = id === pickerId;
        items.push({
          playerId: p.id,
          username: p.username,
          color: p.color,
          state: isCurrentPicker ? 'active' : 'pending',
          label: isCurrentPicker ? 'Alege teritoriu acum' : `Urmează (#${idx + 1})`,
          orderIndex: idx + 1,
        });
      });

      for (const p of game.players) {
        if (orderedQueueIds.includes(p.id)) continue;
        items.push({
          playerId: p.id,
          username: p.username,
          color: p.color,
          state: 'done',
          label: 'Fără alegere rămasă',
          orderIndex: items.length + 1,
        });
      }

      return {
        phase: game.phase,
        phaseLabel: 'CUCERIRE',
        subMode: 'picking',
        subModeLabel: `${orderedQueueIds.length} alegeri pe hartă`,
        currentRound: game.round,
        totalRounds: Math.max(1, game.maxRounds),
        remainingSteps: orderedQueueIds.length,
        items,
        battlePairs: [],
        byeItems: [],
      };
    }

    const items: RoundTrackerMarkerItem[] = game.players.map((p, idx) => {
      const sub = cq?.playerAnswers?.[p.id];
      let state: RoundTrackerMarkerState = 'pending';
      let label = 'Gândește...';

      if (cq?.resolved) {
        if (sub?.answerStatus === 'CORRECT' || sub?.isCorrect) {
          state = 'correct';
          label = 'Corect';
        } else if (sub?.answerStatus === 'NO_RESPONSE') {
          state = 'no_response';
          label = 'Fără răspuns';
        } else {
          state = 'wrong';
          label = 'Greșit';
        }
      } else if (sub !== undefined && sub.answer !== null && sub.answer !== undefined) {
        state = 'answered';
        label = 'A răspuns';
      }

      return {
        playerId: p.id,
        username: p.username,
        color: p.color,
        state,
        label,
        orderIndex: idx + 1,
      };
    });

    return {
      phase: game.phase,
      phaseLabel: 'CUCERIRE',
      subMode: 'question',
      subModeLabel: `Runda ${game.round}/${game.maxRounds}`,
      currentRound: game.round,
      totalRounds: Math.max(1, game.maxRounds),
      remainingSteps: Math.max(0, game.maxRounds - game.round + 1),
      items,
      battlePairs: [],
      byeItems: [],
    };
  }

  // 3. ALLOCATION (DEPARTAJARE NUMERICĂ)
  if (game.phase === 'allocation') {
    const cq = game.currentQuestion;
    const winnerId = game.allocationWinnerId || null;
    const unownedCount = Object.values(game.territories).filter((t) => t.ownerId === null).length;

    if (!cq && winnerId && game.allocationPickReady) {
      const items: RoundTrackerMarkerItem[] = [];
      const winner = playersById.get(winnerId);
      if (winner) {
        items.push({
          playerId: winner.id,
          username: winner.username,
          color: winner.color,
          state: 'active',
          label: 'Câștigător – Alege teritoriu',
          orderIndex: 1,
        });
      }
      for (const p of game.players) {
        if (p.id === winnerId) continue;
        items.push({
          playerId: p.id,
          username: p.username,
          color: p.color,
          state: 'done',
          label: 'Așteaptă alegerea',
          orderIndex: items.length + 1,
        });
      }

      return {
        phase: game.phase,
        phaseLabel: 'DEPARTAJARE',
        subMode: 'picking',
        subModeLabel: `${unownedCount} zone libere`,
        currentRound: 1,
        totalRounds: Math.max(1, unownedCount),
        remainingSteps: unownedCount,
        items,
        battlePairs: [],
        byeItems: [],
      };
    }

    const items: RoundTrackerMarkerItem[] = game.players.map((p, idx) => {
      const sub = cq?.playerAnswers?.[p.id];
      let state: RoundTrackerMarkerState = 'pending';
      let label = 'Estimează...';

      if (cq?.resolved) {
        if (cq.winnerIds?.includes(p.id) || p.id === winnerId) {
          state = 'winner';
          label = 'Cel mai aproape!';
        } else if (sub?.answerStatus === 'NO_RESPONSE') {
          state = 'no_response';
          label = 'Fără răspuns';
        } else {
          state = 'done';
          label = sub?.rank ? `Locul #${sub.rank}` : 'Evaluat';
        }
      } else if (sub !== undefined && sub.answer !== null && sub.answer !== undefined) {
        state = 'answered';
        label = 'A trimis număr';
      }

      return {
        playerId: p.id,
        username: p.username,
        color: p.color,
        state,
        label,
        orderIndex: idx + 1,
      };
    });

    return {
      phase: game.phase,
      phaseLabel: 'DEPARTAJARE',
      subMode: 'question',
      subModeLabel: `${unownedCount} zone libere`,
      currentRound: 1,
      totalRounds: Math.max(1, unownedCount),
      remainingSteps: unownedCount,
      items,
      battlePairs: [],
      byeItems: [],
    };
  }

  // 4. WAR (RĂZBOI SIMULTAN)
  if (game.phase === 'war') {
    const wr = game.warRound;
    const battlePairs: RoundTrackerBattlePair[] = [];
    const byeItems: RoundTrackerMarkerItem[] = [];
    const items: RoundTrackerMarkerItem[] = [];

    if (wr) {
      wr.battles.forEach((b, idx) => {
        const atk = playersById.get(b.attackerId);
        const def = playersById.get(b.defenderId);
        if (!atk || !def) return;

        const atkItem: RoundTrackerMarkerItem = {
          playerId: atk.id,
          username: atk.username,
          color: atk.color,
          state:
            b.status === 'skipped'
              ? 'bye'
              : wr.status === 'selecting_targets' && !b.targetTerritoryId
              ? 'active'
              : 'attacker',
          label:
            b.status === 'skipped'
              ? 'Fără graniță comună'
              : b.targetTerritoryId
              ? 'Țintă fixată'
              : 'Alege ținta de atac',
          orderIndex: idx * 2 + 1,
        };

        const defItem: RoundTrackerMarkerItem = {
          playerId: def.id,
          username: def.username,
          color: def.color,
          state: b.status === 'skipped' ? 'bye' : 'defender',
          label: `Apără împotriva ${atk.username}`,
          orderIndex: idx * 2 + 2,
        };

        battlePairs.push({
          battleId: b.battleId,
          attacker: atkItem,
          defender: defItem,
          targetTerritoryId: b.targetTerritoryId,
          status: b.status,
        });

        items.push(atkItem, defItem);
      });

      wr.byePlayerIds.forEach((id) => {
        const p = playersById.get(id);
        if (!p) return;
        const byeItem: RoundTrackerMarkerItem = {
          playerId: p.id,
          username: p.username,
          color: p.color,
          state: 'bye',
          label: 'Rămas fără duel în această rundă',
          orderIndex: items.length + 1,
        };
        byeItems.push(byeItem);
        items.push(byeItem);
      });
    } else {
      game.players
        .filter((p) => !p.isEliminated)
        .forEach((p, idx) => {
          items.push({
            playerId: p.id,
            username: p.username,
            color: p.color,
            state: idx === game.activePlayerIndex ? 'active' : 'pending',
            label: idx === game.activePlayerIndex ? 'La rând' : 'Activ',
            orderIndex: idx + 1,
          });
        });
    }

    const subMode =
      wr?.status === 'selecting_targets'
        ? 'war_selecting'
        : wr?.status === 'choice_question' || wr?.status === 'numeric_tiebreak'
        ? 'war_question'
        : 'war_resolving';

    const subModeLabel =
      wr?.status === 'selecting_targets'
        ? 'Alegere ținte'
        : wr?.status === 'numeric_tiebreak'
        ? 'Departajare duel'
        : `Runda ${game.round}/${game.maxRounds}`;

    return {
      phase: game.phase,
      phaseLabel: 'RĂZBOI',
      subMode,
      subModeLabel,
      currentRound: game.round,
      totalRounds: Math.max(1, game.maxRounds),
      remainingSteps: Math.max(0, game.maxRounds - game.round + 1),
      items,
      battlePairs,
      byeItems,
    };
  }

  // 5. FINISHED / WAITING
  const items: RoundTrackerMarkerItem[] = game.players.map((p, idx) => ({
    playerId: p.id,
    username: p.username,
    color: p.color,
    state: game.winner?.id === p.id ? 'winner' : p.isEliminated ? 'eliminated' : 'done',
    label: game.winner?.id === p.id ? 'Câștigător' : p.isEliminated ? 'Eliminat' : 'Finalizat',
    orderIndex: idx + 1,
  }));

  return {
    phase: game.phase,
    phaseLabel: game.phase === 'finished' ? 'FINAL MECI' : 'PREGĂTIRE',
    subMode: 'finished',
    subModeLabel: `Runda ${game.round}/${game.maxRounds}`,
    currentRound: game.round,
    totalRounds: Math.max(1, game.maxRounds),
    remainingSteps: 0,
    items,
    battlePairs: [],
    byeItems: [],
  };
}

export interface ClockOffsetSample {
  rttMs: number;
  offsetMs: number;
}

/**
 * Calculează o probă de offset între ceasul clientului și ceasul serverului (Cristian's algorithm).
 */
export function computeClockOffsetSample(params: {
  clientSentAtPerfMs: number;
  clientReceivedAtPerfMs: number;
  clientReceivedWallClockMs: number;
  serverNowMs: number;
}): ClockOffsetSample {
  const rttMs = Math.max(0, params.clientReceivedAtPerfMs - params.clientSentAtPerfMs);
  const estimatedServerNowAtReceipt = params.serverNowMs + rttMs / 2;
  const offsetMs = Math.round(estimatedServerNowAtReceipt - params.clientReceivedWallClockMs);
  return { rttMs, offsetMs };
}

/**
 * Alege proba cu cel mai mic RTT (cea mai puțin afectată de jitter-ul rețelei).
 */
export function selectBestClockOffset(samples: ClockOffsetSample[]): ClockOffsetSample {
  if (!samples.length) return { rttMs: 0, offsetMs: 0 };
  const valid = samples.filter(
    (s) => Number.isFinite(s.rttMs) && s.rttMs >= 0 && Number.isFinite(s.offsetMs)
  );
  if (!valid.length) return { rttMs: 0, offsetMs: 0 };
  return [...valid].sort((a, b) => a.rttMs - b.rttMs)[0];
}

/**
 * Estimează timpul curent al serverului pe baza ceasului clientului și a offsetului sincronizat.
 */
export function estimateServerNow(clientWallClockMs: number, offsetMs: number): number {
  return clientWallClockMs + (Number.isFinite(offsetMs) ? offsetMs : 0);
}


