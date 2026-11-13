import {
  Territory,
  Player,
  GameState,
  GamePhase,
  Question,
  WarRoundState,
  WarBattleAssignment,
  WarBattleResultSummary,
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

/**
 * Calculează numărul minim teoretic de runde complete de cucerire în care toți jucătorii activi
 * pot primi câte un teritoriu neutru (`floor((territoryCount - playerCount) / playerCount)`).
 * Faza de cucerire NU se oprește însă artificial la o limită fixă de 4–5 runde dacă mai există
 * cel puțin `activePlayers.length` teritorii neutre disponibile (vezi `shouldContinueConquestPhase`).
 */
export function calculateConquestRounds(territoryCount: number, playerCount: number): number {
  const clampedPlayers = Math.max(2, playerCount);
  const raw = Math.floor(Math.max(0, territoryCount - clampedPlayers) / clampedPlayers);
  return Math.max(1, raw);
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
 * Returnează toate teritoriile neutre (libere) care sunt direct învecinate cu cel puțin un teritoriu deținut de playerId.
 */
export function getLegalNeutralTargetsForPlayer(
  playerId: string,
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'neighbors'>>
): string[] {
  if (!playerId) return [];
  return Object.values(territories)
    .filter((t) => t.ownerId === null && isAdjacentToPlayer(t.id, playerId, territories))
    .map((t) => t.id);
}

/**
 * Returnează teritoriile neutre eligibile pentru `playerId` în faza de departajare (`allocation`):
 * - Dacă jucătorul are cel puțin un teritoriu neutru adiacent, returnează DOAR acele teritorii neutre adiacente.
 * - Numai dacă jucătorul NU mai are niciun teritoriu neutru adiacent propriilor teritorii,
 *   returnează toate teritoriile neutre rămase pe hartă.
 */
export function getLegalAllocationTargetsForPlayer(
  playerId: string,
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'neighbors'>>
): string[] {
  if (!playerId) return [];
  const adjacentNeutrals = getLegalNeutralTargetsForPlayer(playerId, territories);
  if (adjacentNeutrals.length > 0) {
    return adjacentNeutrals;
  }
  return Object.values(territories)
    .filter((t) => t.ownerId === null)
    .map((t) => t.id);
}

/**
 * Decide dacă faza inițială de cucerire (`conquest`) trebuie să continue sau să treacă în `allocation` / `war`:
 * - Dacă nu mai există teritorii neutre (`neutralCount === 0`), trece direct în `war`.
 * - Dacă numărul de teritorii neutre rămase este strict mai mic decât numărul de jucători activi
 *   (`neutralCount < activePlayerCount`), trece în `allocation`.
 * - Dacă niciun jucător activ nu mai are vreun teritoriu neutru adiacent sau s-a atins limita de runde fără progres,
 *   trece în `allocation` (unde regula de fallback neadiacent permite alocarea ultimelor teritorii izolate).
 * - Altfel (`neutralCount >= activePlayerCount`), faza `conquest` continuă!
 */
export function shouldContinueConquestPhase(
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'neighbors'>>,
  activePlayerIds: string[],
  consecutiveStallRounds: number = 0
): {
  shouldContinue: boolean;
  nextPhase: 'conquest' | 'allocation' | 'war';
  neutralCount: number;
  activePlayerCount: number;
  anyPlayerHasAdjacentNeutral: boolean;
  reason:
    | 'all_occupied'
    | 'fewer_neutrals_than_players'
    | 'no_adjacent_neutrals'
    | 'stall_limit_reached'
    | 'continue_conquest';
} {
  const neutralCount = Object.values(territories).filter((t) => t.ownerId === null).length;
  const activePlayerCount = Math.max(1, activePlayerIds.length);
  const anyPlayerHasAdjacentNeutral = activePlayerIds.some(
    (pid) => getLegalNeutralTargetsForPlayer(pid, territories).length > 0
  );

  if (neutralCount === 0) {
    return {
      shouldContinue: false,
      nextPhase: 'war',
      neutralCount,
      activePlayerCount,
      anyPlayerHasAdjacentNeutral,
      reason: 'all_occupied',
    };
  }

  if (neutralCount < activePlayerCount) {
    return {
      shouldContinue: false,
      nextPhase: 'allocation',
      neutralCount,
      activePlayerCount,
      anyPlayerHasAdjacentNeutral,
      reason: 'fewer_neutrals_than_players',
    };
  }

  if (!anyPlayerHasAdjacentNeutral) {
    return {
      shouldContinue: false,
      nextPhase: 'allocation',
      neutralCount,
      activePlayerCount,
      anyPlayerHasAdjacentNeutral,
      reason: 'no_adjacent_neutrals',
    };
  }

  if (consecutiveStallRounds >= 3) {
    return {
      shouldContinue: false,
      nextPhase: 'allocation',
      neutralCount,
      activePlayerCount,
      anyPlayerHasAdjacentNeutral,
      reason: 'stall_limit_reached',
    };
  }

  return {
    shouldContinue: true,
    nextPhase: 'conquest',
    neutralCount,
    activePlayerCount,
    anyPlayerHasAdjacentNeutral,
    reason: 'continue_conquest',
  };
}

/**
 * Verifică dacă un jucător poate ținti un teritoriu în faza curentă:
 * - base_selection: neutru și neadiacent cu alte baze
 * - conquest: neutru și OBLIGATORIU adiacent cu un teritoriu deținut de jucător
 * - allocation: neutru; OBLIGATORIU adiacent dacă jucătorul are cel puțin un teritoriu neutru adiacent,
 *   sau orice teritoriu neutru NUMAI dacă jucătorul nu mai are niciun teritoriu neutru adiacent propriilor teritorii.
 * - war:
 *   1. teritoriul aparține unui inamic (`target.ownerId !== null && target.ownerId !== player.id`)
 *   2. dacă există `assignedDefenderId` nevid, teritoriul aparține apărătorului desemnat (`target.ownerId === assignedDefenderId`)
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

  if (phase === 'conquest' || phase === 'allocation') {
    if (target.ownerId !== null) {
      return {
        allowed: false,
        reason:
          phase === 'conquest'
            ? 'Poți cuceri doar teritorii neutre (libere).'
            : 'Poți alege doar un teritoriu neutru (liber).',
      };
    }
    const adjacentNeutrals = getLegalNeutralTargetsForPlayer(player.id, territories);
    if (adjacentNeutrals.length > 0 && !isAdjacentToPlayer(territoryId, player.id, territories)) {
      return {
        allowed: false,
        reason: 'Trebuie să alegi un teritoriu liber învecinat cu teritoriile tale!',
      };
    }
    return { allowed: true };
  }

  if (phase === 'war') {
    if (!target.ownerId || target.ownerId === player.id) {
      return { allowed: false, reason: 'Poți ataca doar teritoriile inamice!' };
    }

    if (
      typeof assignedDefenderId === 'string' &&
      assignedDefenderId.trim().length > 0 &&
      target.ownerId !== assignedDefenderId
    ) {
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
    message: `Apărare reușită în ${targetTerritory.name}! Teritoriul rămâne la apărător fără bonus.`,
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
 * Selectează câștigătorul eligibil din clasamentul departajării (`rankings`):
 * - Preferă primul participant din clasament care are cel puțin un teritoriu neutru adiacent.
 * - Dacă NICIUN participant din `rankings` nu mai are vreun teritoriu neutru adiacent, dar există
 *   încă teritorii neutre pe hartă, permite câștigătorului de pe locul 1 (`rankings[0].playerId`)
 *   să revendice un teritoriu neutru neadiacent (`usedNonAdjacentFallback: true`), astfel încât
 *   jocul să nu se blocheze și să nu rămână teritorii nealocate.
 */
export function selectEligibleAllocationWinner(
  rankings: Array<{ playerId: string; answer: number; diff: number; submitTime: number; rank: number }>,
  activePlayerIds: string[],
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'neighbors'>>
): {
  winnerId: string | null;
  bypassedEnclavedIds: string[];
  noAdjacentNeutralInMatch: boolean;
  usedNonAdjacentFallback?: boolean;
} {
  const neutralCount = Object.values(territories).filter((t) => t.ownerId === null).length;
  const anyPlayerHasAdjacentNeutral = activePlayerIds.some(
    (pid) => getLegalNeutralTargetsForPlayer(pid, territories).length > 0
  );

  if (neutralCount === 0 || rankings.length === 0) {
    return {
      winnerId: null,
      bypassedEnclavedIds: [],
      noAdjacentNeutralInMatch: !anyPlayerHasAdjacentNeutral,
      usedNonAdjacentFallback: false,
    };
  }

  const bypassedEnclavedIds: string[] = [];

  for (const entry of rankings) {
    const legalTargets = getLegalNeutralTargetsForPlayer(entry.playerId, territories);
    if (legalTargets.length > 0) {
      return {
        winnerId: entry.playerId,
        bypassedEnclavedIds,
        noAdjacentNeutralInMatch: !anyPlayerHasAdjacentNeutral,
        usedNonAdjacentFallback: false,
      };
    }
    bypassedEnclavedIds.push(entry.playerId);
  }

  // Fallback: nenhum respondent nu are teritoriu neutru adiacent -> primul clasat poate alege un teritoriu neutru neadiacent
  return {
    winnerId: rankings[0].playerId,
    bypassedEnclavedIds: [],
    noAdjacentNeutralInMatch: !anyPlayerHasAdjacentNeutral,
    usedNonAdjacentFallback: true,
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
 * Returnează toate teritoriile inamice direct învecinate cu teritoriile deținute de `attackerId`.
 * Folosit în fluxul de atac individual (1 atacator -> 1 apărător -> 1 teritoriu țintă).
 */
export function getLegalWarTargetsForAttacker(
  attackerId: string,
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'neighbors'>>
): string[] {
  if (!attackerId) return [];
  const myTerritories = Object.values(territories).filter((t) => t.ownerId === attackerId);
  if (myTerritories.length === 0) return [];

  return Object.values(territories)
    .filter(
      (t) =>
        t.ownerId !== null &&
        t.ownerId !== attackerId &&
        myTerritories.some((mt) => mt.neighbors.includes(t.id))
    )
    .map((t) => t.id);
}

/**
 * Verifică dacă un jucător își poate regenera un turn al bazei proprii în faza Război:
 * - Jucătorul trebuie să dețină propria bază (`isBase && ownerId === playerId`)
 * - Baza trebuie să aibă cel puțin 1 turn și mai puțin de 3 turnuri (`0 < castleTowers < 3`)
 */
export function canPlayerRegenerateTower(
  playerId: string,
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'isBase' | 'castleTowers'>>
): boolean {
  if (!playerId) return false;
  const base = Object.values(territories).find((t) => t.isBase && t.ownerId === playerId);
  if (!base) return false;
  const towers = base.castleTowers ?? 3;
  return towers > 0 && towers < 3;
}

/**
 * Construiește ordinea secvențială de atacuri individuale pentru o rundă de Război:
 * - Fiecare jucător activ care deține teritorii și are cel puțin un teritoriu inamic adiacent
 *   (sau își poate regenera un turn la bază) primește rândul în runda de război.
 * - Ordinea de start se rotește echitabil în funcție de `roundNumber`.
 */
export function buildIndividualWarTurnOrder(
  activePlayerIds: string[],
  territories: Record<string, Pick<Territory, 'id' | 'ownerId' | 'neighbors' | 'isBase' | 'castleTowers'>>,
  roundNumber: number
): string[] {
  const n = activePlayerIds.length;
  if (n < 2) return [];
  const shift = Math.max(0, (roundNumber - 1) % n);
  const rotated = [...activePlayerIds.slice(shift), ...activePlayerIds.slice(0, shift)];
  return rotated.filter(
    (pid) =>
      getLegalWarTargetsForAttacker(pid, territories).length > 0 ||
      canPlayerRegenerateTower(pid, territories)
  );
}

export interface WarAttackAnnouncement {
  headline: string;
  originSubtext: string;
  responderText: string;
  observerText: string;
  targetName: string;
  attackerName: string;
  defenderName: string;
  isBaseTarget: boolean;
  resultHeadline: string | null;
  resultDetails: string | null;
}

/**
 * Construiește mesajul autoritativ și clar al atacului curent, afișat identic tuturor jucătorilor din cameră:
 * „ATAC: [numele atacatorului] atacă [teritoriul] apărat de [numele apărătorului]”
 */
export function formatWarAttackAnnouncement(params: {
  attacker?: Pick<Player, 'id' | 'username' | 'color'> | null;
  defender?: Pick<Player, 'id' | 'username' | 'color'> | null;
  targetTerritory?: Pick<Territory, 'id' | 'name' | 'isBase' | 'castleTowers'> | null;
  originTerritory?: Pick<Territory, 'id' | 'name'> | null;
  lastBattleResult?: WarBattleResultSummary | null;
}): WarAttackAnnouncement {
  const attackerName = params.attacker?.username || params.lastBattleResult?.attackerName || 'Atacator';
  const defenderName = params.defender?.username || params.lastBattleResult?.defenderName || 'Apărător';
  const targetName =
    params.targetTerritory?.name || params.lastBattleResult?.territoryName || 'teritoriul vizat';
  const isBaseTarget = Boolean(
    params.targetTerritory?.isBase ?? params.lastBattleResult?.isBaseTarget
  );

  const headline = `ATAC: ${attackerName} atacă ${targetName} apărat de ${defenderName}`;
  const originSubtext = params.originTerritory
    ? `Asediu lansat din ${params.originTerritory.name} asupra ${isBaseTarget ? `Cetății ${targetName}` : targetName}`
    : isBaseTarget
    ? `Țintă: Cetatea de bază ${targetName}`
    : `Țintă: Teritoriul ${targetName}`;

  const responderText = `Trebuie să răspundă la întrebare: ${attackerName} (Atacator) și ${defenderName} (Apărător).`;
  const observerText = `Ceilalți jucători din cameră urmăresc în direct acest duel.`;

  return {
    headline,
    originSubtext,
    responderText,
    observerText,
    targetName,
    attackerName,
    defenderName,
    isBaseTarget,
    resultHeadline: params.lastBattleResult ? params.lastBattleResult.headline : null,
    resultDetails: params.lastBattleResult ? params.lastBattleResult.details : null,
  };
}

/**
 * Verifică dacă o întrebare grilă respectă toate regulile de lizibilitate rapidă (15 secunde) și pe mobil:
 * - tip 'choice', aprobată și activă
 * - enunț între 4 și 14 cuvinte, maximum 95 de caractere, terminat cu '?'
 * - fără scurgeri de metadate/numere în paranteză
 * - 4 variante distincte, fiecare de maximum 36 de caractere și maximum 5 cuvinte
 */
export function isShortReadableChoiceQuestion(q: Question | null | undefined): boolean {
  if (!q) return false;
  if (q.isDisabled || q.reviewStatus !== 'approved') return false;
  if (q.type !== 'choice') return false;
  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  if (
    typeof q.correctAnswerIndex !== 'number' ||
    !Number.isInteger(q.correctAnswerIndex) ||
    q.correctAnswerIndex < 0 ||
    q.correctAnswerIndex > 3
  ) {
    return false;
  }
  const text = String(q.question || '').trim();
  if (text.length < 10 || text.length > 95 || !text.endsWith('?')) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 4 || wordCount > 14) return false;
  if (
    /\(\d+(?:\.\d+)?\)/.test(text) ||
    /\(#\d+\)/.test(text) ||
    /\(set\s+/i.test(text) ||
    /\(seria\s+/i.test(text)
  ) {
    return false;
  }
  for (const opt of q.options) {
    const optText = String(opt || '').trim();
    const optWords = optText.split(/\s+/).filter(Boolean).length;
    if (!optText || optText.length > 36 || optWords > 5) {
      return false;
    }
  }
  return true;
}

/**
 * Verifică dacă o întrebare numerică (estimation) este validă pentru departajare (tiebreak):
 * - tip 'estimation', aprobată și activă
 * - targetNumber numeric finit, unitate nevidă
 * - fără scurgeri de metadate/numere în paranteză sau scurgerea răspunsului în enunț
 */
export function isValidNumericTiebreakQuestion(q: Question | null | undefined): boolean {
  if (!q) return false;
  if (q.isDisabled || q.reviewStatus !== 'approved') return false;
  if (q.type !== 'estimation') return false;
  if (typeof q.targetNumber !== 'number' || !Number.isFinite(q.targetNumber)) return false;
  if (!q.unit || typeof q.unit !== 'string' || q.unit.trim().length === 0) return false;
  const text = String(q.question || '').trim();
  if (text.length < 10 || text.length > 95 || !text.endsWith('?')) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 4 || wordCount > 14) return false;
  if (
    /\(\d+(?:\.\d+)?\)/.test(text) ||
    /\(#\d+\)/.test(text) ||
    /\(set\s+/i.test(text) ||
    /\(seria\s+/i.test(text)
  ) {
    return false;
  }
  const targetStr = String(q.targetNumber);
  const normText = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  if (` ${normText} `.includes(` ${targetStr} `)) {
    return false;
  }
  return true;
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
    const totalRounds = Math.max(1, game.maxRounds, game.round);
    const fixedSchedule =
      Array.isArray(game.conquestTurnSchedule) && game.conquestTurnSchedule.length >= totalRounds
        ? game.conquestTurnSchedule
        : buildConquestTurnSchedule(
            game.turnOrder && game.turnOrder.length > 0
              ? game.turnOrder
              : game.players.map((p) => p.id),
            totalRounds
          );
    const roundTurnOrder = getRoundFixedTurnOrder(game, game.round);

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

      for (const pid of roundTurnOrder) {
        if (orderedQueueIds.includes(pid)) continue;
        const p = playersById.get(pid);
        if (!p) continue;
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
        totalRounds,
        remainingSteps: orderedQueueIds.length,
        items,
        battlePairs: [],
        byeItems: [],
        conquestTurnSchedule: fixedSchedule,
      };
    }

    const orderedPlayersForRound = roundTurnOrder
      .map((pid) => playersById.get(pid))
      .filter((p): p is Player => Boolean(p));

    const items: RoundTrackerMarkerItem[] = orderedPlayersForRound.map((p, idx) => {
      const sub = cq?.playerAnswers?.[p.id];
      let state: RoundTrackerMarkerState = 'pending';
      let label = `Ordinea #${idx + 1} în rundă`;

      if (cq?.resolved) {
        if (sub?.answerStatus === 'CORRECT' || sub?.isCorrect) {
          state = 'correct';
          label = `Corect (Ordinea #${idx + 1})`;
        } else if (sub?.answerStatus === 'NO_RESPONSE') {
          state = 'no_response';
          label = 'Fără răspuns';
        } else {
          state = 'wrong';
          label = 'Greșit';
        }
      } else if (sub !== undefined && sub.answer !== null && sub.answer !== undefined) {
        state = 'answered';
        label = `A răspuns (Ordinea #${idx + 1})`;
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
      subModeLabel: `Runda ${game.round}/${totalRounds}`,
      currentRound: game.round,
      totalRounds,
      remainingSteps: Math.max(0, totalRounds - game.round + 1),
      items,
      battlePairs: [],
      byeItems: [],
      conquestTurnSchedule: fixedSchedule,
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

  // 4. WAR (ATAC INDIVIDUAL 1 CONTRA 1)
  if (game.phase === 'war') {
    const wr = game.warRound;
    const battlePairs: RoundTrackerBattlePair[] = [];
    const byeItems: RoundTrackerMarkerItem[] = [];
    const items: RoundTrackerMarkerItem[] = [];
    const seenPlayerIds = new Set<string>();

    if (wr) {
      wr.battles.forEach((b) => {
        const atk = playersById.get(b.attackerId);
        const def = b.defenderId ? playersById.get(b.defenderId) : undefined;
        if (!atk) return;

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
              ? 'Atacă acum'
              : 'Alege ținta de atac',
          orderIndex: items.length + 1,
        };

        if (!seenPlayerIds.has(atk.id)) {
          seenPlayerIds.add(atk.id);
          items.push(atkItem);
        }

        if (def) {
          const defItem: RoundTrackerMarkerItem = {
            playerId: def.id,
            username: def.username,
            color: def.color,
            state: b.status === 'skipped' ? 'bye' : 'defender',
            label: `Apără împotriva ${atk.username}`,
            orderIndex: items.length + 1,
          };

          battlePairs.push({
            battleId: b.battleId,
            attacker: atkItem,
            defender: defItem,
            targetTerritoryId: b.targetTerritoryId,
            status: b.status,
          });

          if (!seenPlayerIds.has(def.id)) {
            seenPlayerIds.add(def.id);
            items.push(defItem);
          }
        }
      });

      wr.byePlayerIds.forEach((id) => {
        const p = playersById.get(id);
        if (!p || seenPlayerIds.has(p.id)) return;
        seenPlayerIds.add(p.id);
        const byeItem: RoundTrackerMarkerItem = {
          playerId: p.id,
          username: p.username,
          color: p.color,
          state: 'bye',
          label: 'În așteptarea rândului',
          orderIndex: items.length + 1,
        };
        byeItems.push(byeItem);
        items.push(byeItem);
      });

      const queueSet = new Set(game.warTurnQueue || []);
      for (const p of game.players) {
        if (p.isEliminated || seenPlayerIds.has(p.id)) continue;
        seenPlayerIds.add(p.id);
        items.push({
          playerId: p.id,
          username: p.username,
          color: p.color,
          state: queueSet.has(p.id) ? 'pending' : 'done',
          label: queueSet.has(p.id) ? 'Urmează la atac' : 'Activ în rundă',
          orderIndex: items.length + 1,
        });
      }
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
        : wr?.status === 'attack_preview'
        ? 'war_preview'
        : wr?.status === 'choice_question' || wr?.status === 'numeric_tiebreak'
        ? 'war_question'
        : 'war_resolving';

    const subModeLabel =
      wr?.status === 'selecting_targets'
        ? 'Alegere țintă atac'
        : wr?.status === 'attack_preview'
        ? 'Prezentare atac'
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

// ============================================================================
// SECȚIUNEA V9.5: ANIMAȚII DETERMINISTE PENTRU SELECȚIE, CUCERIRI ȘI ATACURI
// ============================================================================

export interface MapAnimationConfig {
  prefersReducedMotion: boolean;
  enabled: boolean;
  selectionTransitionMs: number;
  conquestSpreadMs: number;
  conquestPulseMs: number;
  attackVectorFlowMs: number;
  defenseShieldMs: number;
}

/**
 * Returnează configurația duratelor de animație în funcție de setarea `prefers-reduced-motion`.
 */
export function getMapAnimationConfig(prefersReducedMotion: boolean): MapAnimationConfig {
  if (prefersReducedMotion) {
    return {
      prefersReducedMotion: true,
      enabled: false,
      selectionTransitionMs: 0,
      conquestSpreadMs: 0,
      conquestPulseMs: 0,
      attackVectorFlowMs: 0,
      defenseShieldMs: 0,
    };
  }
  return {
    prefersReducedMotion: false,
    enabled: true,
    selectionTransitionMs: 180,
    conquestSpreadMs: 680,
    conquestPulseMs: 320,
    attackVectorFlowMs: 1100,
    defenseShieldMs: 850,
  };
}

export interface TerritorySelectionVisualState {
  territoryId: string;
  isHovered: boolean;
  isSelected: boolean;
  isTouchSelected: boolean;
  isActionable: boolean;
  isAttackOrigin: boolean;
  isAttackTarget: boolean;
  isAttackerTerritory: boolean;
  isDefenderTerritory: boolean;
  isHighlighted: boolean;
  strokeColor: string;
  strokeWidth: number;
  filterId: string;
  glowColor: string | null;
}

/**
 * Calculează starea vizuală de evidențiere a unui teritoriu la hover, atingere (mobil),
 * selectare sau implicare într-un atac (origine atacator / țintă / teritorii atacator & apărător).
 */
export function computeTerritorySelectionVisualState(params: {
  territoryId: string;
  hasOwner: boolean;
  ownerColor?: string;
  isHovered: boolean;
  isSelected: boolean;
  isTouchSelected: boolean;
  isActionable: boolean;
  isAttackOrigin: boolean;
  isAttackTarget: boolean;
  isAttackerTerritory?: boolean;
  isDefenderTerritory?: boolean;
  isAttackPreviewPhase?: boolean;
}): TerritorySelectionVisualState {
  const {
    territoryId,
    hasOwner,
    ownerColor,
    isHovered,
    isSelected,
    isTouchSelected,
    isActionable,
    isAttackOrigin,
    isAttackTarget,
    isAttackerTerritory = false,
    isDefenderTerritory = false,
    isAttackPreviewPhase = false,
  } = params;

  const isHighlighted =
    isHovered ||
    isSelected ||
    isTouchSelected ||
    isAttackOrigin ||
    isAttackTarget ||
    isAttackerTerritory ||
    isDefenderTerritory;

  let strokeColor = hasOwner ? '#fef08a' : '#6b4c28';
  let strokeWidth = hasOwner ? 2.4 : 2.1;
  let filterId = 'url(#border-relief)';
  let glowColor: string | null = null;

  if (isAttackTarget && isAttackPreviewPhase) {
    strokeColor = '#f43f5e';
    strokeWidth = 4.6;
    filterId = 'url(#territory-attack-glow)';
    glowColor = '#f43f5e';
  } else if (isAttackTarget) {
    strokeColor = '#38bdf8';
    strokeWidth = 4.2;
    filterId = 'url(#territory-select-glow)';
    glowColor = '#38bdf8';
  } else if (isAttackOrigin) {
    strokeColor = '#fb923c';
    strokeWidth = 3.8;
    filterId = 'url(#territory-origin-glow)';
    glowColor = ownerColor || '#fb923c';
  } else if (isSelected) {
    strokeColor = '#38bdf8';
    strokeWidth = 4.0;
    filterId = 'url(#territory-select-glow)';
    glowColor = '#38bdf8';
  } else if (isTouchSelected || isHovered) {
    strokeColor = isActionable ? '#fde047' : '#f59e0b';
    strokeWidth = isActionable ? 3.6 : 3.2;
    filterId = 'url(#territory-hover-glow)';
    glowColor = isActionable ? '#fde047' : '#f59e0b';
  } else if (isAttackerTerritory) {
    strokeColor = '#f59e0b';
    strokeWidth = 3.1;
    glowColor = ownerColor || '#f59e0b';
  } else if (isDefenderTerritory) {
    strokeColor = '#38bdf8';
    strokeWidth = 3.1;
    glowColor = ownerColor || '#38bdf8';
  } else if (isActionable) {
    strokeColor = '#fbbf24';
    strokeWidth = 2.9;
  }

  return {
    territoryId,
    isHovered,
    isSelected,
    isTouchSelected,
    isActionable,
    isAttackOrigin,
    isAttackTarget,
    isAttackerTerritory,
    isDefenderTerritory,
    isHighlighted,
    strokeColor,
    strokeWidth,
    filterId,
    glowColor,
  };
}

/**
 * Determină în mod pur și determinist teritoriul de origine al atacatorului
 * pentru o țintă vizată în faza de război (cel mai apropiat teritoriu deținut de atacator
 * care este direct învecinat cu ținta). Toți clienții din cameră obțin același rezultat.
 */
export function resolveAttackOriginTerritory(
  attackerId: string,
  targetTerritoryId: string,
  territories: Record<string, Territory>
): Territory | null {
  const target = territories[targetTerritoryId];
  if (!target || !attackerId) return null;

  const ownedByAttacker = Object.values(territories).filter((t) => t.ownerId === attackerId);
  if (ownedByAttacker.length === 0) return null;

  const adjacentOwned = ownedByAttacker.filter((t) =>
    areTerritoriesAdjacent(t.id, targetTerritoryId, territories)
  );

  const pool = adjacentOwned.length > 0 ? adjacentOwned : ownedByAttacker;

  const sorted = [...pool].sort((a, b) => {
    const distA = Math.hypot(a.labelX - target.labelX, a.labelY - target.labelY);
    const distB = Math.hypot(b.labelX - target.labelX, b.labelY - target.labelY);
    if (Math.abs(distA - distB) > 0.5) {
      return distA - distB;
    }
    if (Boolean(a.isBase) !== Boolean(b.isBase)) {
      return a.isBase ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  return sorted[0] || null;
}

export interface AttackVectorVisual {
  battleId: string;
  attackerId: string;
  attackerName: string;
  attackerColor: string;
  defenderId: string;
  defenderName: string;
  defenderColor: string;
  sourceTerritoryId: string;
  sourceTerritoryName: string;
  targetTerritoryId: string;
  targetTerritoryName: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  controlX: number;
  controlY: number;
  midX: number;
  midY: number;
  angleDeg: number;
  roundStatus: WarRoundState['status'];
  battleStatus: WarBattleAssignment['status'];
  outcome?: WarBattleAssignment['outcome'];
}

/**
 * Construiește vectorii vizuali de atac (origine -> țintă) pentru toate bătăliile active
 * din runda de război, sincronizați din starea autoritativă a serverului.
 */
export function buildActiveAttackVectors(
  territories: Record<string, Territory>,
  players: Player[],
  warRound?: WarRoundState | null,
  gamePhase?: GamePhase
): AttackVectorVisual[] {
  if (gamePhase !== 'war' || !warRound || !Array.isArray(warRound.battles)) {
    return [];
  }

  const playersById = new Map<string, Player>(players.map((p) => [p.id, p]));
  const vectors: AttackVectorVisual[] = [];

  for (const battle of warRound.battles) {
    if (!battle.targetTerritoryId) continue;
    const target = territories[battle.targetTerritoryId];
    if (!target) continue;

    const origin = resolveAttackOriginTerritory(
      battle.attackerId,
      battle.targetTerritoryId,
      territories
    );
    if (!origin) continue;

    const attacker = playersById.get(battle.attackerId);
    const defender = playersById.get(battle.defenderId);

    const fromX = origin.labelX;
    const fromY = origin.labelY;
    const toX = target.labelX;
    const toY = target.labelY;

    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.max(1, Math.hypot(dx, dy));
    // Perpendicular offset for a clean tactical arc
    const curveOffset = Math.min(34, Math.max(14, dist * 0.18));
    const nx = -dy / dist;
    const ny = dx / dist;
    const controlX = Number(((fromX + toX) / 2 + nx * curveOffset).toFixed(1));
    const controlY = Number(((fromY + toY) / 2 + ny * curveOffset).toFixed(1));
    // Point on quadratic Bezier at t = 0.5
    const midX = Number((0.25 * fromX + 0.5 * controlX + 0.25 * toX).toFixed(1));
    const midY = Number((0.25 * fromY + 0.5 * controlY + 0.25 * toY).toFixed(1));

    // Tangent angle near the target end (from control point to target)
    const angleDeg = Number(((Math.atan2(toY - controlY, toX - controlX) * 180) / Math.PI).toFixed(1));

    vectors.push({
      battleId: battle.battleId,
      attackerId: battle.attackerId,
      attackerName: attacker?.username || 'Atacator',
      attackerColor: attacker?.color || '#f59e0b',
      defenderId: battle.defenderId,
      defenderName: defender?.username || 'Apărător',
      defenderColor: defender?.color || '#38bdf8',
      sourceTerritoryId: origin.id,
      sourceTerritoryName: origin.name,
      targetTerritoryId: target.id,
      targetTerritoryName: target.name,
      fromX,
      fromY,
      toX,
      toY,
      controlX,
      controlY,
      midX,
      midY,
      angleDeg,
      roundStatus: warRound.status,
      battleStatus: battle.status,
      outcome: battle.outcome,
    });
  }

  return vectors;
}

export type TerritoryMapTransitionType =
  | 'neutral_conquest'
  | 'war_conquest'
  | 'war_defense'
  | 'tower_hit';

export interface TerritoryMapTransition {
  id: string;
  dedupKey: string;
  type: TerritoryMapTransitionType;
  territoryId: string;
  territoryName: string;
  ownerId: string | null;
  ownerName: string;
  color: string;
  previousOwnerId: string | null;
  previousColor: string;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  startedAt: number;
  durationMs: number;
  badgeTextRo: string;
  previousTowers?: number;
  remainingTowers?: number;
  isBaseConquest?: boolean;
}

/**
 * Detectează tranzițiile vizuale autoritative dintre două stări succesive ale hărții:
 * - cucerirea unui teritoriu neutru (`neutral_conquest`): culoarea echipei se răspândește + puls scurt
 * - cucerirea unui teritoriu inamic în război (`war_conquest`): umplerea teritoriului în culoarea câștigătorului
 * - apărarea reușită a unui teritoriu (`war_defense`): efect scurt de scut/impact fără schimbarea proprietarului
 * - lovirea unui turn de cetate (`tower_hit`): impact pe cetate când scade `castleTowers`
 */
export function detectTerritoryMapTransitions(params: {
  prevTerritories: Record<string, Territory> | null | undefined;
  nextTerritories: Record<string, Territory>;
  prevWarRound?: WarRoundState | null;
  nextWarRound?: WarRoundState | null;
  players: Player[];
  nowMs?: number;
  prefersReducedMotion?: boolean;
}): TerritoryMapTransition[] {
  const {
    prevTerritories,
    nextTerritories,
    prevWarRound,
    nextWarRound,
    players,
    nowMs = Date.now(),
    prefersReducedMotion = false,
  } = params;

  if (!prevTerritories) return [];

  const config = getMapAnimationConfig(prefersReducedMotion);
  const playersById = new Map<string, Player>(players.map((p) => [p.id, p]));
  const transitions: TerritoryMapTransition[] = [];
  const handledTerritoryIds = new Set<string>();
  const battleIdKey = nextWarRound?.lastBattleResult?.battleId || nextWarRound?.roundId || '';

  for (const nextT of Object.values(nextTerritories)) {
    const prevT = prevTerritories[nextT.id];
    if (!prevT) continue;

    // 1. Neutral territory conquered -> team color radial spread + completion pulse
    if (prevT.ownerId === null && nextT.ownerId !== null) {
      const winner = playersById.get(nextT.ownerId);
      const originTerritory = resolveAttackOriginTerritory(
        nextT.ownerId,
        nextT.id,
        prevTerritories
      );
      transitions.push({
        id: `tr_neutral_${nextT.id}_${nowMs}`,
        dedupKey: `neutral_${nextT.id}_to_${nextT.ownerId}`,
        type: 'neutral_conquest',
        territoryId: nextT.id,
        territoryName: nextT.name,
        ownerId: nextT.ownerId,
        ownerName: winner?.username || 'Jucător',
        color: winner?.color || '#22c55e',
        previousOwnerId: null,
        previousColor: '#d5c4a1',
        originX: originTerritory ? originTerritory.labelX : nextT.labelX,
        originY: originTerritory ? originTerritory.labelY : nextT.labelY,
        targetX: nextT.labelX,
        targetY: nextT.labelY,
        startedAt: nowMs,
        durationMs: config.conquestSpreadMs + config.conquestPulseMs,
        badgeTextRo: nextT.isBase ? '🏰 Bază stabilită!' : '🚩 Teritoriu cucerit!',
      });
      handledTerritoryIds.add(nextT.id);
      continue;
    }

    // 2. Enemy territory conquered in war -> fill territory in winner's color (including last base tower 1->0)
    if (
      prevT.ownerId !== null &&
      nextT.ownerId !== null &&
      prevT.ownerId !== nextT.ownerId
    ) {
      const winner = playersById.get(nextT.ownerId);
      const prevOwner = playersById.get(prevT.ownerId);
      const originTerritory = resolveAttackOriginTerritory(
        nextT.ownerId,
        nextT.id,
        prevTerritories
      );
      const wasBaseConquered = Boolean(prevT.isBase);
      transitions.push({
        id: `tr_war_conq_${nextT.id}_${nowMs}`,
        dedupKey: `war_conq_${nextT.id}_${prevT.ownerId}_to_${nextT.ownerId}_${battleIdKey}`,
        type: 'war_conquest',
        territoryId: nextT.id,
        territoryName: nextT.name,
        ownerId: nextT.ownerId,
        ownerName: winner?.username || 'Câștigător',
        color: winner?.color || '#f59e0b',
        previousOwnerId: prevT.ownerId,
        previousColor: prevOwner?.color || '#78716c',
        originX: originTerritory ? originTerritory.labelX : nextT.labelX,
        originY: originTerritory ? originTerritory.labelY : nextT.labelY,
        targetX: nextT.labelX,
        targetY: nextT.labelY,
        startedAt: nowMs,
        durationMs: config.conquestSpreadMs + config.conquestPulseMs,
        badgeTextRo: wasBaseConquered
          ? '👑 Atac reușit — Cetate cucerită!'
          : `⚔️ Cucerit de ${winner?.username || 'Atacator'}!`,
        previousTowers: wasBaseConquered ? (prevT.castleTowers ?? 1) : undefined,
        remainingTowers: wasBaseConquered ? 0 : undefined,
        isBaseConquest: wasBaseConquered,
      });
      handledTerritoryIds.add(nextT.id);
      continue;
    }

    // 3. Base tower hit without changing owner (3->2 or 2->1)
    if (
      prevT.ownerId !== null &&
      nextT.ownerId === prevT.ownerId &&
      (prevT.castleTowers ?? 0) > (nextT.castleTowers ?? 0)
    ) {
      const defender = playersById.get(nextT.ownerId);
      const prevTowers = prevT.castleTowers ?? 3;
      const remTowers = nextT.castleTowers ?? 0;
      transitions.push({
        id: `tr_tower_${nextT.id}_${nowMs}`,
        dedupKey: `tower_hit_${nextT.id}_${prevTowers}_to_${remTowers}_${battleIdKey}`,
        type: 'tower_hit',
        territoryId: nextT.id,
        territoryName: nextT.name,
        ownerId: nextT.ownerId,
        ownerName: defender?.username || 'Apărător',
        color: '#f43f5e',
        previousOwnerId: prevT.ownerId,
        previousColor: defender?.color || '#ef4444',
        originX: nextT.labelX,
        originY: nextT.labelY,
        targetX: nextT.labelX,
        targetY: nextT.labelY,
        startedAt: nowMs,
        durationMs: config.defenseShieldMs,
        badgeTextRo: `Turn distrus — ${remTowers}/3 rămase`,
        previousTowers: prevTowers,
        remainingTowers: remTowers,
      });
      handledTerritoryIds.add(nextT.id);
      continue;
    }

    // 4. Successful defense detected via defensiveBonus increase (+100) while owner stays unchanged
    if (
      prevT.ownerId !== null &&
      nextT.ownerId === prevT.ownerId &&
      (nextT.defensiveBonus ?? 0) > (prevT.defensiveBonus ?? 0)
    ) {
      const defender = playersById.get(nextT.ownerId);
      transitions.push({
        id: `tr_def_${nextT.id}_${nowMs}`,
        dedupKey: `war_def_${nextT.id}_${nextT.defensiveBonus ?? 0}_${battleIdKey}`,
        type: 'war_defense',
        territoryId: nextT.id,
        territoryName: nextT.name,
        ownerId: nextT.ownerId,
        ownerName: defender?.username || 'Apărător',
        color: defender?.color || '#10b981',
        previousOwnerId: prevT.ownerId,
        previousColor: defender?.color || '#10b981',
        originX: nextT.labelX,
        originY: nextT.labelY,
        targetX: nextT.labelX,
        targetY: nextT.labelY,
        startedAt: nowMs,
        durationMs: config.defenseShieldMs,
        badgeTextRo: `🛡️ Apărat de ${defender?.username || 'Apărător'}!`,
      });
      handledTerritoryIds.add(nextT.id);
    }
  }

  // 5. Also detect war_defense from warRound battles resolving as defender_won or draw_no_bonus
  if (nextWarRound && Array.isArray(nextWarRound.battles)) {
    const prevBattlesById = new Map(
      (prevWarRound?.battles || []).map((b) => [b.battleId, b])
    );

    for (const nextB of nextWarRound.battles) {
      if (!nextB.targetTerritoryId || handledTerritoryIds.has(nextB.targetTerritoryId)) {
        continue;
      }
      const prevB = prevBattlesById.get(nextB.battleId);
      const justResolved =
        nextB.status === 'resolved' && (!prevB || prevB.status !== 'resolved');

      if (
        justResolved &&
        (nextB.outcome === 'defender_won' || nextB.outcome === 'draw_no_bonus')
      ) {
        const targetT = nextTerritories[nextB.targetTerritoryId];
        if (targetT && targetT.ownerId === nextB.defenderId) {
          const defender = playersById.get(nextB.defenderId);
          transitions.push({
            id: `tr_def_battle_${targetT.id}_${nowMs}`,
            dedupKey: `war_def_battle_${targetT.id}_${nextB.battleId}`,
            type: 'war_defense',
            territoryId: targetT.id,
            territoryName: targetT.name,
            ownerId: targetT.ownerId,
            ownerName: defender?.username || 'Apărător',
            color: defender?.color || '#10b981',
            previousOwnerId: targetT.ownerId,
            previousColor: defender?.color || '#10b981',
            originX: targetT.labelX,
            originY: targetT.labelY,
            targetX: targetT.labelX,
            targetY: targetT.labelY,
            startedAt: nowMs,
            durationMs: config.defenseShieldMs,
            badgeTextRo: `🛡️ Apărat de ${defender?.username || 'Apărător'}!`,
          });
          handledTerritoryIds.add(targetT.id);
        }
      }
    }
  }

  return transitions;
}

// ============================================================================
// SECȚIUNEA V11: ORDINE FIXĂ PENTRU CUCERIRI, VALIDARE TURN PROPRIU ȘI CLASAMENT
// ============================================================================

/**
 * Construiește programul fix de ordine a turelor (round-robin determinist) pentru rundele de cucerire (`conquest`).
 * Pornind de la `turnOrder` stabilită la începutul meciului:
 * - Runda 1: `[p1, p2, p3, ...]`
 * - Runda 2: `[p2, p3, ..., p1]`
 * - Runda k: rotație circulară cu `(k - 1) % n`
 */
export function buildConquestTurnSchedule(playerIds: string[], totalRounds: number): string[][] {
  const cleanIds = playerIds.filter(Boolean);
  const n = cleanIds.length;
  const count = Math.max(1, totalRounds);
  if (n === 0) return Array.from({ length: count }, () => []);

  const schedule: string[][] = [];
  for (let r = 0; r < count; r++) {
    const shift = r % n;
    schedule.push([...cleanIds.slice(shift), ...cleanIds.slice(0, shift)]);
  }
  return schedule;
}

/**
 * Returnează ordinea fixă a jucătorilor pentru o rundă dată (`roundNumber` 1-indexed),
 * folosind `game.conquestTurnSchedule` sau rotația deterministă a `game.turnOrder`.
 */
export function getRoundFixedTurnOrder(
  game: Pick<GameState, 'players' | 'turnOrder' | 'conquestTurnSchedule'>,
  roundNumber: number
): string[] {
  const activeIds = game.players.map((p) => p.id);
  const roundIdx = Math.max(0, (roundNumber || 1) - 1);

  if (
    Array.isArray(game.conquestTurnSchedule) &&
    game.conquestTurnSchedule.length > 0 &&
    Array.isArray(game.conquestTurnSchedule[roundIdx % game.conquestTurnSchedule.length])
  ) {
    const fromSchedule = game.conquestTurnSchedule[roundIdx % game.conquestTurnSchedule.length].filter(
      (id) => activeIds.includes(id)
    );
    for (const id of activeIds) {
      if (!fromSchedule.includes(id)) {
        fromSchedule.push(id);
      }
    }
    return fromSchedule;
  }

  const baseOrder =
    Array.isArray(game.turnOrder) && game.turnOrder.length > 0
      ? game.turnOrder.filter((id) => activeIds.includes(id))
      : [...activeIds];
  for (const id of activeIds) {
    if (!baseOrder.includes(id)) {
      baseOrder.push(id);
    }
  }

  if (baseOrder.length === 0) return [];
  const shift = roundIdx % baseOrder.length;
  return [...baseOrder.slice(shift), ...baseOrder.slice(0, shift)];
}

/**
 * Ordonează jucătorii care au răspuns corect la o întrebare de cucerire (`conquest`)
 * EXCLUSIV după ordinea fixă de tură a rundei (`roundTurnOrder`), NU după timpul de răspuns (`submitTime`).
 */
export function orderConquestWinnersByFixedTurnOrder(
  correctPlayerIds: string[],
  roundTurnOrder: string[]
): string[] {
  const correctSet = new Set(correctPlayerIds);
  const ordered: string[] = [];
  for (const pid of roundTurnOrder) {
    if (correctSet.has(pid) && !ordered.includes(pid)) {
      ordered.push(pid);
    }
  }
  for (const pid of correctPlayerIds) {
    if (!ordered.includes(pid)) {
      ordered.push(pid);
    }
  }
  return ordered;
}

/**
 * Verifică dacă un jucător are dreptul efectiv să selecteze un teritoriu pe hartă CHIAR ACUM:
 * - base_selection: nicio întrebare activă și `players[activePlayerIndex].id === userId`
 * - conquest: nicio întrebare activă (`!currentQuestion`) și `conquestPickerId === userId`
 * - allocation: nicio întrebare activă (`!currentQuestion`), `allocationPickReady === true` și `allocationWinnerId === userId`
 * - war: nicio întrebare activă (`!currentQuestion`), `warRound.status === 'selecting_targets'` și jucătorul are o bătălie activă fără țintă aleasă
 */
export function canPlayerSelectTerritoryNow(
  game: Pick<
    GameState,
    | 'phase'
    | 'currentQuestion'
    | 'pendingTerritoryId'
    | 'players'
    | 'activePlayerIndex'
    | 'conquestPickerId'
    | 'allocationWinnerId'
    | 'allocationPickReady'
    | 'warRound'
  >,
  userId: string | undefined | null
): boolean {
  if (!userId || game.currentQuestion) return false;

  if (game.phase === 'base_selection') {
    const activePlayer = game.players[game.activePlayerIndex];
    return Boolean(activePlayer && activePlayer.id === userId && !activePlayer.baseTerritoryId);
  }

  if (game.phase === 'conquest') {
    if (game.pendingTerritoryId) return false;
    return Boolean(game.conquestPickerId && game.conquestPickerId === userId);
  }

  if (game.phase === 'allocation') {
    return Boolean(game.allocationPickReady && game.allocationWinnerId === userId);
  }

  if (game.phase === 'war') {
    if (!game.warRound || game.warRound.status !== 'selecting_targets') return false;
    return game.warRound.battles.some(
      (b) =>
        b.attackerId === userId &&
        b.status === 'selecting_target' &&
        !b.targetTerritoryId
    );
  }

  return false;
}

/**
 * Aplică o apăsare de tastă de pe dial pad-ul numeric compact fără tastatură virtuală:
 * - cifre '0'..'9' (până la max 9 cifre)
 * - '±' / 'SIGN': comută semnul +/-
 * - '⌫' / 'BACKSPACE': șterge ultima cifră
 * - 'C' / 'CLEAR': șterge tot
 * - '.' / ',': permis doar când `allowDecimals === true`
 */
export function applyNumericKeypadInput(
  currentValue: string,
  key: string,
  allowDecimals: boolean = false
): string {
  const cur = String(currentValue || '');
  const normalizedKey = String(key || '').trim().toUpperCase();

  if (normalizedKey === 'C' || normalizedKey === 'CLEAR') {
    return '';
  }

  if (normalizedKey === '⌫' || normalizedKey === 'BACKSPACE') {
    const next = cur.slice(0, -1);
    return next === '-' ? '' : next;
  }

  if (normalizedKey === '±' || normalizedKey === 'SIGN' || normalizedKey === '-') {
    if (!cur) return '-';
    if (cur === '-') return '';
    return cur.startsWith('-') ? cur.slice(1) : `-${cur}`;
  }

  if (normalizedKey === '.' || normalizedKey === ',') {
    if (!allowDecimals) return cur;
    if (cur.includes('.')) return cur;
    if (cur === '' || cur === '-') return `${cur}0.`;
    return `${cur}.`;
  }

  if (/^[0-9]$/.test(normalizedKey)) {
    const digitCount = cur.replace(/[^0-9]/g, '').length;
    if (digitCount >= 9) return cur;
    if (cur === '0') return normalizedKey;
    if (cur === '-0') return `-${normalizedKey}`;
    return `${cur}${normalizedKey}`;
  }

  return cur;
}

/**
 * Calculează clasamentul jucătorilor ținând cont atât de criteriul de sortare (`rating` / `wins` / `territories` / `score`),
 * cât și de eventualele poziții fixate manual de către administrator (`manualRankOverride`),
 * astfel încât o ajustare manuală să își producă efectul clar și determinist.
 */
export function computeLeaderboardWithManualOverrides<
  T extends {
    id: string;
    rating: number;
    wins: number;
    territoriesConquered: number;
    highestScore: number;
    manualRankOverride?: number | null;
  }
>(
  users: T[],
  type: 'rating' | 'wins' | 'territories' | 'score' = 'rating'
): Array<T & { rank: number }> {
  const metricCompare = (a: T, b: T): number => {
    if (type === 'wins') {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.rating - a.rating;
    }
    if (type === 'territories') {
      if (b.territoriesConquered !== a.territoriesConquered) {
        return b.territoriesConquered - a.territoriesConquered;
      }
      return b.rating - a.rating;
    }
    if (type === 'score') {
      if (b.highestScore !== a.highestScore) return b.highestScore - a.highestScore;
      return b.rating - a.rating;
    }
    if (b.rating !== a.rating) return b.rating - a.rating;
    return b.wins - a.wins;
  };

  // Pentru tab-ul principal ('rating'), aplicăm și manualRankOverride (dacă a fost setat de admin)
  const autoSorted = [...users].sort(metricCompare);
  if (type !== 'rating') {
    return autoSorted.map((u, idx) => ({ ...u, rank: idx + 1 }));
  }

  const withOverride = autoSorted
    .filter(
      (u) =>
        typeof u.manualRankOverride === 'number' &&
        Number.isInteger(u.manualRankOverride) &&
        u.manualRankOverride >= 1
    )
    .sort((a, b) => {
      const ra = a.manualRankOverride as number;
      const rb = b.manualRankOverride as number;
      if (ra !== rb) return ra - rb;
      return metricCompare(a, b);
    });

  if (withOverride.length === 0) {
    return autoSorted.map((u, idx) => ({ ...u, rank: idx + 1 }));
  }

  const overrideSet = new Set(withOverride.map((u) => u.id));
  const regularUsers = autoSorted.filter((u) => !overrideSet.has(u.id));
  const finalOrder: T[] = [...regularUsers];

  for (const pinned of withOverride) {
    const targetIdx = Math.max(
      0,
      Math.min(finalOrder.length, (pinned.manualRankOverride as number) - 1)
    );
    finalOrder.splice(targetIdx, 0, pinned);
  }

  return finalOrder.map((u, idx) => ({ ...u, rank: idx + 1 }));
}


