import { Territory, Player, Question } from '../types/game';

export const SCORING = {
  BASE: 1000,
  CONQUEST: 200,
  ALLOCATION: 300,
  WAR_DUEL: 400,
  DEFENSIVE_BONUS: 100,
};

/**
 * Standard territory count distribution per player count (Section 1.1)
 */
export const PLAYER_COUNT_TERRITORIES: Record<number, number> = {
  2: 10,
  3: 15,
  4: 25,
  5: 25,
  6: 29,
  7: 29,
  8: 29,
  9: 29,
  10: 29,
};

export function getTerritoryCountForPlayers(playerCount: number): number {
  const clamped = Math.max(2, Math.min(10, playerCount));
  return PLAYER_COUNT_TERRITORIES[clamped] || 15;
}

/**
 * roundsPerPlayer = clamp(ceil((territoryCount - playerCount) / playerCount), 4, 5)
 */
export function calculateConquestRounds(territoryCount: number, playerCount: number): number {
  const calculated = Math.ceil((territoryCount - playerCount) / Math.max(1, playerCount));
  return Math.max(4, Math.min(5, calculated));
}

/**
 * Checks if a territory is adjacent to any of the player's owned territories.
 */
export function isAdjacentToPlayer(
  targetTerritoryId: string,
  playerId: string,
  territories: Record<string, Territory>
): boolean {
  const target = territories[targetTerritoryId];
  if (!target) return false;

  for (const neighborId of target.neighbors) {
    const neighbor = territories[neighborId];
    if (neighbor && neighbor.ownerId === playerId) {
      return true;
    }
  }
  return false;
}

/**
 * Enforces rule: Bases cannot be adjacent to any existing base!
 * At least 1 buffer territory must exist between bases.
 */
export function canSelectBase(
  targetTerritoryId: string,
  territories: Record<string, Territory>
): boolean {
  const target = territories[targetTerritoryId];
  if (!target || target.ownerId !== null || target.isBase) {
    return false;
  }

  // Check if any neighboring territory is already a base
  for (const neighborId of target.neighbors) {
    const neighbor = territories[neighborId];
    if (neighbor && neighbor.isBase) {
      return false; // Forbidden: directly adjacent to an existing base
    }
  }

  return true;
}


/**
 * Returns true only if choosing this base leaves enough pairwise non-adjacent
 * legal base positions for the players who still have to choose.
 * The bounded map sizes (maximum 29 territories) make this backtracking search small.
 */
export function canCompleteBaseSelection(
  targetTerritoryId: string,
  territories: Record<string, Territory>,
  remainingPlayers: number
): boolean {
  if (!canSelectBase(targetTerritoryId, territories)) return false;
  if (remainingPlayers <= 0) return true;

  const target = territories[targetTerritoryId];
  const blocked = new Set([targetTerritoryId, ...target.neighbors]);
  const candidates = Object.values(territories).filter(t =>
    !blocked.has(t.id) && t.ownerId === null && !t.isBase && canSelectBase(t.id, territories)
  );
  if (candidates.length < remainingPlayers) return false;

  const search = (available: Territory[], needed: number): boolean => {
    if (needed <= 0) return true;
    if (available.length < needed) return false;
    // Include-first tends to find a legal arrangement quickly on a sparse map.
    const [candidate, ...rest] = available;
    const compatible = rest.filter(t => !candidate.neighbors.includes(t.id) && !t.neighbors.includes(candidate.id));
    return search(compatible, needed - 1) || search(rest, needed);
  };
  return search(candidates, remainingPlayers);
}

/**
 * Determines whether a player can attack or select a territory based on current phase and rules.
 */
export function canTargetTerritory(
  targetId: string,
  player: Player,
  territories: Record<string, Territory>,
  phase: 'base_selection' | 'conquest' | 'allocation' | 'war'
): { allowed: boolean; reason?: string } {
  const target = territories[targetId];
  if (!target) return { allowed: false, reason: 'Teritoriul nu există.' };

  if (phase === 'base_selection') {
    if (!canSelectBase(targetId, territories)) {
      return {
        allowed: false,
        reason: 'Nu poți alege o bază lipită de baza altui jucător. Păstrează cel puțin o zonă de distanță!',
      };
    }
    return { allowed: true };
  }

  if (phase === 'conquest') {
    // Only neutral territories adjacent to player's land
    if (target.ownerId !== null) {
      return { allowed: false, reason: 'În faza de cucerire nu poți ataca teritorii deja ocupate.' };
    }
    if (!isAdjacentToPlayer(targetId, player.id, territories)) {
      return { allowed: false, reason: 'Poți cuceri doar teritorii neutre adiacente teritoriului tău.' };
    }
    return { allowed: true };
  }

  if (phase === 'allocation') {
    // Handled globally territory-by-territory in departajare
    return { allowed: target.ownerId === null };
  }

  if (phase === 'war') {
    // Can only attack enemy territory
    if (target.ownerId === null) {
      return { allowed: false, reason: 'Toate teritoriile sunt ocupate în faza de război.' };
    }
    if (target.ownerId === player.id) {
      return { allowed: false, reason: 'Nu poți ataca propriul tău teritoriu.' };
    }

    const isDirectNeighbor = isAdjacentToPlayer(targetId, player.id, territories);

    // If attacking a base
    if (target.isBase) {
      if (isDirectNeighbor) {
        // Direct neighbor can attack base repeatedly!
        return { allowed: true };
      } else {
        // Non-neighboring base attack: only 1 attempt allowed per game
        const usedAttempts = player.baseAttackAttemptsUsed?.[target.ownerId] || 0;
        if (usedAttempts >= 1) {
          return {
            allowed: false,
            reason: 'Ai folosit deja singura încercare de atac la distanță pe baza acestui jucător!',
          };
        }
        return { allowed: true };
      }
    }

    // For normal territories, must be adjacent
    if (!isDirectNeighbor) {
      return { allowed: false, reason: 'Poți ataca doar teritorii vecine cu stăpânirea ta.' };
    }

    return { allowed: true };
  }

  return { allowed: false, reason: 'Acțiune nepermisă în această fază.' };
}

/**
 * Evaluates estimation question submissions.
 * Closest number wins. In case of identical difference, faster submitTime wins.
 */
export function determineEstimationWinner(
  targetNumber: number,
  submissions: Record<string, { answer: number; submitTime: number }>
): { winnerId: string | null; rankings: Array<{ playerId: string; diff: number; submitTime: number }> } {
  if (!Number.isFinite(targetNumber)) return { winnerId: null, rankings: [] };
  const entries = Object.entries(submissions).filter(([, data]) =>
    Number.isFinite(Number(data.answer)) && Number.isFinite(data.submitTime) && data.submitTime >= 0
  );
  if (entries.length === 0) return { winnerId: null, rankings: [] };

  const rankings = entries.map(([playerId, data]) => ({
    playerId,
    diff: Math.abs(Number(data.answer) - targetNumber),
    submitTime: data.submitTime,
  }));

  rankings.sort((a, b) => {
    if (a.diff !== b.diff) {
      return a.diff - b.diff;
    }
    return a.submitTime - b.submitTime;
  });

  return {
    winnerId: rankings[0]?.playerId || null,
    rankings,
  };
}

export interface BattleOutcome {
  conquered: boolean;
  attackerWon: boolean;
  pointsAwarded: number;
  defensiveBonusAwarded: number;
  message: string;
}

/**
 * Resolves a battle duel between attacker and defender.
 * Winner receives 400 points.
 * Successful defense when attacker fails receives +100 defensive bonus.
 */
export function resolveBattle(params: {
  targetTerritory: Territory;
  attackerCorrect: boolean;
  defenderCorrect: boolean;
  attackerTimeMs: number;
  defenderTimeMs: number;
}): BattleOutcome {
  const { targetTerritory, attackerCorrect, defenderCorrect, attackerTimeMs, defenderTimeMs } = params;

  if (attackerCorrect && defenderCorrect) {
    if (attackerTimeMs < defenderTimeMs) {
      return {
        conquered: true,
        attackerWon: true,
        pointsAwarded: SCORING.WAR_DUEL, // 400 points
        defensiveBonusAwarded: 0,
        message: 'Atacatorul a răspuns corect și mai rapid! Teritoriul a fost cucerit!',
      };
    } else {
      return {
        conquered: false,
        attackerWon: false,
        pointsAwarded: 0,
        defensiveBonusAwarded: 0,
        message: 'Apărătorul a răspuns corect și mai rapid, apărându-și pământul!',
      };
    }
  }

  if (attackerCorrect && !defenderCorrect) {
    return {
      conquered: true,
      attackerWon: true,
      pointsAwarded: SCORING.WAR_DUEL, // 400 points
      defensiveBonusAwarded: 0,
      message: 'Atacatorul a răspuns corect, iar apărătorul a greșit! Teritoriul a fost cucerit!',
    };
  }

  if (!attackerCorrect && defenderCorrect) {
    return {
      conquered: false,
      attackerWon: false,
      pointsAwarded: 0,
      defensiveBonusAwarded: SCORING.DEFENSIVE_BONUS, // +100 defensive bonus
      message: 'Apărătorul a răspuns corect și a rezistat asediului (+100 bonus defensiv)!',
    };
  }

  // Both wrong or both no-response
  return {
    conquered: false,
    attackerWon: false,
    pointsAwarded: 0,
    defensiveBonusAwarded: 0,
    message: 'Ambii jucători au greșit întrebarea. Teritoriul rămâne apărat fără bonus.',
  };
}
