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
        return 'Alegerea Bazei';
      case 'conquest':
        return 'Cucerire';
      case 'allocation':
        return 'Departajare';
      case 'war':
        return 'Război';
      case 'finished':
        return 'Final de Joc';
      default:
        return 'Pregătire';
    }
  };

  const title = getPhaseTitle();
  // 4 rounds standard as shown in image_866cb06b.png
  const totalRoundsCount = phase === 'base_selection' ? Math.max(1, players.length) : Math.max(1, maxRounds || 1);
  const visualCurrentRound = phase === 'base_selection' ? Math.min(players.length, activePlayerIndex + 1) : currentRound;
  const roundsArray = Array.from({ length: totalRoundsCount }, (_, i) => i + 1);

  return (
    <div className="flex flex-col items-center select-none py-1">
      {/* Phase Title - Matches font & styling from reference screenshot image_866cb06b.png */}
      <h3
        className="font-serif text-lg sm:text-xl font-bold tracking-wider text-amber-100/95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] mb-1.5"
        style={{ fontFamily: 'Cinzel, Georgia, serif' }}
      >
        {title}
      </h3>

      {/* Recessed Brown Bronze Bar with Pill Slots */}
      <div
        className="flex items-center gap-3 sm:gap-4 px-3.5 py-1.5 rounded-sm shadow-2xl border border-stone-800/90"
        style={{
          background: 'linear-gradient(180deg, #3d2516 0%, #28170d 50%, #1a0f08 100%)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.9), 0 3px 6px rgba(0,0,0,0.6)',
        }}
      >
        {roundsArray.map((r) => {
          const isCompleted = r < visualCurrentRound;
          const isActive = r === visualCurrentRound;

          return (
            <div
              key={r}
              className="w-8 sm:w-10 h-3.5 sm:h-4.5 rounded-full transition-all duration-300 flex items-center justify-center"
              style={{
                backgroundColor: isActive
                  ? '#ffffff'
                  : isCompleted
                  ? '#ded7cc'
                  : '#120a05',
                boxShadow: isActive
                  ? '0 0 12px 3px rgba(255, 255, 255, 0.95), inset 0 1px 2px rgba(255,255,255,0.8)'
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

      <div className="mt-1 text-[10px] font-mono font-semibold tracking-wide text-amber-100/80">
        {phase === 'base_selection'
          ? `${Math.max(0, players.length - activePlayerIndex)} alegeri de bază rămase`
          : phase === 'allocation'
          ? `Întrebarea de alocare ${currentRound} din aproximativ ${maxRounds}`
          : phase === 'conquest' || phase === 'war'
          ? `Runda ${Math.min(currentRound, totalRoundsCount)} / ${totalRoundsCount} · ${Math.max(0, totalRoundsCount - Math.min(currentRound, totalRoundsCount) + 1)} runde incluzând-o pe aceasta`
          : ''}
      </div>

      {/* Angled Player Slashes under each round slot (Faithful reproduction of image_866cb06b.png) */}
      <div className="flex items-center gap-3 sm:gap-4 px-3.5 mt-1.5">
        {roundsArray.map((r) => {
          const isCurrentRound = r === visualCurrentRound;

          return (
            <div
              key={`slashes_${r}`}
              className="w-8 sm:w-10 flex items-center justify-center gap-1 sm:gap-1.5"
            >
              {players.map((p, pIdx) => {
                const isThisPlayerTurn = isCurrentRound && pIdx === activePlayerIndex;

                return (
                  <div
                    key={p.id}
                    title={`${p.username} ${isThisPlayerTurn ? '(Rândul activ)' : ''}`}
                    className="relative flex items-center justify-center"
                  >
                    {/* Active player glowing capsule border */}
                    {isThisPlayerTurn && (
                      <div
                        className="absolute -inset-1 rounded-sm border-2 border-cyan-400 bg-cyan-400/25 shadow-[0_0_8px_rgba(34,211,238,0.95)] animate-pulse z-10"
                        style={{
                          transform: 'skewX(-16deg)',
                        }}
                      />
                    )}

                    {/* Angled Slash */}
                    <div
                      className="w-1.5 sm:w-2 h-4 sm:h-5 rounded-xs transition-all shadow-sm"
                      style={{
                        backgroundColor: p.color,
                        transform: 'skewX(-16deg)',
                        opacity: isCurrentRound ? 1 : r < visualCurrentRound ? 0.75 : 0.35,
                        boxShadow: isThisPlayerTurn
                          ? `0 0 6px ${p.color}`
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
  );
};
