import React from 'react';
import { GamePhase, Player } from '../types/game';

interface RoundTrackerProps {
  phase: GamePhase;
  currentRound: number;
  maxRounds: number;
  players: Player[];
  activePlayerIndex: number;
}

export const RoundTracker: React.FC<RoundTrackerProps> = ({
  phase,
  currentRound,
  maxRounds,
  players,
  activePlayerIndex,
}) => {
  const getPhaseTitle = (): string => {
    switch (phase) {
      case 'base_selection':
        return 'ALEGEREA BAZEI';
      case 'conquest':
        return 'CUCERIRE';
      case 'allocation':
        return 'DEPARTAJARE';
      case 'war':
        return 'RĂZBOI';
      case 'finished':
        return 'FINAL DE JOC';
      default:
        return 'PREGĂTIRE';
    }
  };

  const title = getPhaseTitle();
  const totalRoundsCount =
    phase === 'base_selection'
      ? Math.max(1, players.length)
      : Math.max(1, maxRounds || 1);
  const visualCurrentRound =
    phase === 'base_selection'
      ? Math.min(players.length, activePlayerIndex + 1)
      : Math.min(Math.max(1, currentRound), totalRoundsCount);
  const roundsArray = Array.from({ length: totalRoundsCount }, (_, i) => i + 1);
  const remainingCount =
    phase === 'base_selection'
      ? Math.max(0, players.length - activePlayerIndex)
      : Math.max(0, totalRoundsCount - visualCurrentRound + 1);
  const activePlayer = players[activePlayerIndex];
  const progressPercent = Math.min(
    100,
    Math.max(8, Math.round((visualCurrentRound / totalRoundsCount) * 100))
  );

  // Adaptive sizing for desktop decorative slots & slashes so 10-player matches never overflow
  const isManyRounds = totalRoundsCount > 6;
  const isManyPlayers = players.length > 5;
  const slotWidthClass = isManyRounds
    ? 'w-6 lg:w-7 h-3'
    : 'w-8 lg:w-9 h-3.5';
  const slashWidthClass = isManyPlayers
    ? 'w-1 h-3'
    : 'w-1.5 h-3.5';

  return (
    <div className="w-full select-none">
      {/* ============================================================
          MOBILE & TABLET PORTRAIT VARIANT (< 768px)
          No dozens of slashes; shows full Phase Title, Round X/Y,
          Remaining choices, Active Player, and Visual Progress Bar.
      ============================================================ */}
      <div className="flex flex-col gap-1.5 md:hidden w-full">
        <div className="flex items-center justify-between gap-2">
          <h3
            className="font-serif text-sm sm:text-base font-black tracking-wider text-amber-100 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]"
            style={{ fontFamily: 'Cinzel, Georgia, serif' }}
          >
            {title}
          </h3>

          <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-amber-300 tabular-nums shrink-0">
            <span>
              Runda {visualCurrentRound}/{totalRoundsCount}
            </span>
            <span className="text-stone-500">&bull;</span>
            <span className="text-amber-100/90">
              {remainingCount} {remainingCount === 1 ? 'rămasă' : 'rămase'}
            </span>
          </div>
        </div>

        {/* Visual segmented progress bar */}
        <div
          className="w-full rounded-lg border border-stone-800/90 p-1 shadow-inner"
          style={{
            background: 'linear-gradient(180deg, #3d2516 0%, #28170d 50%, #1a0f08 100%)',
          }}
        >
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${totalRoundsCount}, minmax(0, 1fr))` }}>
            {roundsArray.map((r) => {
              const isCompleted = r < visualCurrentRound;
              const isActive = r === visualCurrentRound;
              return (
                <div
                  key={r}
                  className="h-2 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: isActive
                      ? '#ffffff'
                      : isCompleted
                      ? '#f59e0b'
                      : '#1c1008',
                    boxShadow: isActive
                      ? '0 0 8px 1px rgba(255, 255, 255, 0.9)'
                      : 'none',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Active player summary strip inside tracker */}
        <div className="flex items-center justify-between text-[11px] text-stone-300 px-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-stone-400 shrink-0">Jucător activ:</span>
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: activePlayer?.color || '#f59e0b' }}
            />
            <span
              className="font-bold truncate"
              style={{ color: activePlayer?.color || '#fde68a' }}
            >
              {activePlayer?.username || 'Jucător'}
            </span>
          </div>
          <span className="font-mono text-[10px] text-amber-200/80 shrink-0 tabular-nums">
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* ============================================================
          DESKTOP & LAPTOP DECORATIVE VARIANT (>= 768px)
          Preserves authentic Conquiztador bronze bar + angled slashes
          while staying compact vertically for laptop viewports.
      ============================================================ */}
      <div className="hidden md:flex flex-col items-center py-0.5">
        <div className="flex items-center gap-3 mb-1">
          <h3
            className="font-serif text-sm lg:text-base font-black tracking-wider text-amber-100/95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] whitespace-nowrap"
            style={{ fontFamily: 'Cinzel, Georgia, serif' }}
          >
            {title}
          </h3>
          <span className="text-[10px] font-mono font-semibold tracking-wide text-amber-200/80 whitespace-nowrap tabular-nums">
            {phase === 'base_selection'
              ? `(${remainingCount} alegeri de bază rămase)`
              : phase === 'allocation'
              ? `(Întrebarea ${visualCurrentRound} din ${totalRoundsCount})`
              : `(Runda ${visualCurrentRound}/${totalRoundsCount} · ${remainingCount} rămase)`}
          </span>
        </div>

        {/* Recessed Brown Bronze Bar with Pill Slots */}
        <div
          className="flex items-center gap-2 lg:gap-2.5 px-3 py-1 rounded-sm shadow-xl border border-stone-800/90"
          style={{
            background: 'linear-gradient(180deg, #3d2516 0%, #28170d 50%, #1a0f08 100%)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.6)',
          }}
        >
          {roundsArray.map((r) => {
            const isCompleted = r < visualCurrentRound;
            const isActive = r === visualCurrentRound;

            return (
              <div
                key={r}
                className={`${slotWidthClass} rounded-full transition-all duration-300 flex items-center justify-center`}
                style={{
                  backgroundColor: isActive
                    ? '#ffffff'
                    : isCompleted
                    ? '#ded7cc'
                    : '#120a05',
                  boxShadow: isActive
                    ? '0 0 10px 2px rgba(255, 255, 255, 0.95), inset 0 1px 2px rgba(255,255,255,0.8)'
                    : isCompleted
                    ? 'inset 0 1px 2px rgba(0,0,0,0.4)'
                    : 'inset 0 2px 5px rgba(0,0,0,0.95)',
                  border: isActive
                    ? '1px solid #ffffff'
                    : isCompleted
                    ? '1px solid #9c8e7e'
                    : '1px solid #28160c',
                }}
              />
            );
          })}
        </div>

        {/* Angled Player Slashes under each round slot */}
        <div className="flex items-center gap-2 lg:gap-2.5 px-3 mt-1">
          {roundsArray.map((r) => {
            const isCurrentRound = r === visualCurrentRound;

            return (
              <div
                key={`slashes_${r}`}
                className={`${isManyRounds ? 'w-6 lg:w-7' : 'w-8 lg:w-9'} flex items-center justify-center ${
                  isManyPlayers ? 'gap-0.5' : 'gap-1'
                }`}
              >
                {players.map((p, pIdx) => {
                  const isThisPlayerTurn = isCurrentRound && pIdx === activePlayerIndex;

                  return (
                    <div
                      key={p.id}
                      title={`${p.username} ${isThisPlayerTurn ? '(Rândul activ)' : ''}`}
                      className="relative flex items-center justify-center"
                    >
                      {isThisPlayerTurn && (
                        <div
                          className="absolute -inset-0.5 rounded-xs border border-cyan-400 bg-cyan-400/25 shadow-[0_0_6px_rgba(34,211,238,0.95)] animate-pulse z-10"
                          style={{
                            transform: 'skewX(-16deg)',
                          }}
                        />
                      )}

                      <div
                        className={`${slashWidthClass} rounded-xs transition-all shadow-sm`}
                        style={{
                          backgroundColor: p.color,
                          transform: 'skewX(-16deg)',
                          opacity: isCurrentRound ? 1 : r < visualCurrentRound ? 0.75 : 0.35,
                          boxShadow: isThisPlayerTurn
                            ? `0 0 5px ${p.color}`
                            : '0 1px 2px rgba(0,0,0,0.6)',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
