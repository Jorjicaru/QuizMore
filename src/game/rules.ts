import { Territory, Player } from '../types/game';

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
 * Numărul dedicat de teritorii pentru fiecare număr de jucători (2..10) conform V3.0:
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
 * Verifică dacă un teritoriu este direct învecinat cu cel puțin un teritoriu deținut de playerId
 */
export function isAdjacentToPlayer(
  territoryId: string,
  playerId: string,
  territories: Record<string, Territory>
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
 * - allocation: neutru (preferabil adiacent dacă jucătorul are teritorii neutre adiacente, altfel orice neutru)
 * - war: teritoriu inamic; dacă este specificat assignedDefenderId, trebuie să aparțină acelui apărător desemnat!
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

    // Dacă avem un apărător desemnat în runda simultană de război:
    if (assignedDefenderId) {
      const defenderTerritories = Object.values(territories).filter(
        (t) => t.ownerId === assignedDefenderId
      );
      const hasAdjacentToDefender = defenderTerritories.some((t) =>
        isAdjacentToPlayer(t.id, player.id, territories)
      );
      if (hasAdjacentToDefender && !isAdjacent) {
        if (target.isBase) {
          const used = player.baseAttackAttemptsUsed?.[target.ownerId] || 0;
          if (used >= 1) {
            return {
              allowed: false,
              reason: 'Ai folosit deja singura încercare de atac la distanță asupra acestei baze!',
            };
          }
          return { allowed: true };
        }
        return {
          allowed: false,
          reason: 'Trebuie să ataci un teritoriu învecinat al apărătorului desemnat!',
        };
      }
      return { allowed: true };
    }

    if (isAdjacent) {
      return { allowed: true };
    }

    // Regula specială pentru atacul la distanță asupra unei baze: permis o singură dată per bază inamică
    if (target.isBase) {
      const used = player.baseAttackAttemptsUsed?.[target.ownerId] || 0;
      if (used >= 1) {
        return {
          allowed: false,
          reason: 'Ai folosit deja singura încercare de atac la distanță asupra acestei baze!',
        };
      }
      return { allowed: true };
    }

    // Fallback dacă jucătorul nu are niciun vecin inamic direct (de ex. izolat)
    const hasAnyAdjacentEnemy = Object.values(territories).some(
      (t) =>
        t.ownerId !== null &&
        t.ownerId !== player.id &&
        isAdjacentToPlayer(t.id, player.id, territories)
    );
    if (!hasAnyAdjacentEnemy) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Poți ataca doar teritorii inamice direct învecinate cu ale tale!',
    };
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
  const aTerritories = Object.values(territories).filter((t) => t.ownerId === playerA);
  return aTerritories.some((t) =>
    t.neighbors.some((nId) => territories[nId]?.ownerId === playerB)
  );
}

/**
 * Returnează teritoriile valide pe care attackerId le poate ataca de la defenderId în runda de război
 */
export function getLegalWarTargetsForPair(
  attackerId: string,
  defenderId: string,
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'neighbors'>>
): string[] {
  const myTerritories = Object.values(territories).filter((t) => t.ownerId === attackerId);
  const defenderTerritories = Object.values(territories).filter((t) => t.ownerId === defenderId);
  if (defenderTerritories.length === 0 || myTerritories.length === 0) return [];

  const adjacentTargets = defenderTerritories.filter((dt) =>
    myTerritories.some((mt) => mt.neighbors.includes(dt.id))
  );
  if (adjacentTargets.length > 0) {
    return adjacentTargets.map((t) => t.id);
  }
  return defenderTerritories.map((t) => t.id);
}

/**
 * Construiește împerecherile simultane Atacator vs Apărător pentru o rundă de Război (2..10 jucători).
 * Reguli:
 * - La N jucători activi, se formează exact floor(N / 2) bătălii simultane (1 la 2-3p, 2 la 4-5p, 3 la 6-7p, 4 la 8-9p, 5 la 10p).
 * - Dacă N este impar, exact 1 jucător primește BYE în runda curentă, rotit echitabil (fără 2 BYE consecutive).
 * - Rolurile Atacator / Apărător alternează echitabil de la o rundă la alta.
 * - Se maximizează numărul de perechi (Atacator, Apărător) care au graniță comună directă pe hartă.
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

  let pool = [...activePlayerIds];
  const byePlayerIds: string[] = [];

  if (n % 2 === 1) {
    const candidates = [...pool].sort((a, b) => {
      const histA = roleHistory[a] || [];
      const histB = roleHistory[b] || [];
      const lastWasByeA = histA[histA.length - 1] === 'bye' ? 1 : 0;
      const lastWasByeB = histB[histB.length - 1] === 'bye' ? 1 : 0;
      if (lastWasByeA !== lastWasByeB) return lastWasByeA - lastWasByeB;
      const totalByesA = histA.filter((r) => r === 'bye').length;
      const totalByesB = histB.filter((r) => r === 'bye').length;
      if (totalByesA !== totalByesB) return totalByesA - totalByesB;
      const idxA = (activePlayerIds.indexOf(a) + roundNumber) % n;
      const idxB = (activePlayerIds.indexOf(b) + roundNumber) % n;
      return idxB - idxA;
    });

    const byePlayer = candidates[0];
    byePlayerIds.push(byePlayer);
    pool = pool.filter((id) => id !== byePlayer);
  }

  const pairCount = Math.floor(pool.length / 2);

  const attackerPriorityScore = (pid: string, idx: number): number => {
    const hist = roleHistory[pid] || [];
    const lastRole = hist[hist.length - 1];
    const attackerCount = hist.filter((r) => r === 'attacker').length;
    const defenderCount = hist.filter((r) => r === 'defender').length;
    let score = (defenderCount - attackerCount) * 10;
    if (lastRole === 'defender') score += 25;
    else if (lastRole === 'bye') score += 20;
    else if (lastRole === 'attacker') score -= 25;
    else {
      score += (idx + roundNumber) % 2 === 0 ? 10 : -10;
    }
    return score;
  };

  const sortedForAttacker = [...pool].sort((a, b) => {
    const diff =
      attackerPriorityScore(b, pool.indexOf(b)) - attackerPriorityScore(a, pool.indexOf(a));
    if (diff !== 0) return diff;
    return pool.indexOf(a) - pool.indexOf(b);
  });

  const attackerIds = sortedForAttacker.slice(0, pairCount);
  const defenderIds = sortedForAttacker.slice(pairCount, pairCount * 2);

  let bestScore = -1;
  let bestPerm: string[] = [...defenderIds];

  function permute(arr: string[], l: number) {
    if (l === arr.length) {
      let score = 0;
      for (let i = 0; i < attackerIds.length; i++) {
        if (playersShareBorder(attackerIds[i], arr[i], territories)) {
          score += 100;
        } else {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestPerm = [...arr];
      }
      return;
    }
    for (let i = l; i < arr.length; i++) {
      [arr[l], arr[i]] = [arr[i], arr[l]];
      permute(arr, l + 1);
      [arr[l], arr[i]] = [arr[i], arr[l]];
    }
  }

  permute([...defenderIds], 0);

  const pairs = attackerIds.map((atk, i) => ({
    attackerId: atk,
    defenderId: bestPerm[i],
    sharesBorder: playersShareBorder(atk, bestPerm[i], territories),
  }));

  return {
    attackerIds,
    defenderIds: pairs.map((p) => p.defenderId),
    byePlayerIds,
    pairs,
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
