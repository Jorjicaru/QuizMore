import React from 'react';
import { GameState, RoundTrackerMarkerItem } from '../types/game';
import { buildRoundDisplayItems } from '../game/rules';
import { Check, Clock, Sparkles } from 'lucide-react';

interface RoundTrackerProps {
  game: GameState;
}

export const RoundTracker: React.FC<RoundTrackerProps> = ({ game }) => {
  const model = buildRoundDisplayItems(game);
  const {
    phase,
    phaseLabel,
    subModeLabel,
    currentRound,
    totalRounds,
    items,
    battlePairs,
  } = model;

  const progressSteps = Math.max(1, Math.min(10, totalRounds));
  const completedSteps = Math.max(0, Math.min(progressSteps, currentRound));

  const renderMarkerBadge = (item: RoundTrackerMarkerItem, compact = false) => {
    const isCurrentActive = item.state === 'active' || item.state === 'winner';
    const isDone =
      item.state === 'done' ||
      item.state === 'answered' ||
      item.state === 'correct';
    const isMuted =
      item.state === 'wrong' ||
      item.state === 'no_response' ||
      item.state === 'eliminated' ||
      item.state === 'bye';

    return (
      <div
        key={item.playerId}
        data-testid={`tracker-marker-${item.playerId}`}
        data-marker-state={item.state}
        title={`${item.orderIndex}. ${item.username} — ${item.label}`}
        className={`relative flex items-center justify-center rounded transition-all duration-200 ${
          compact ? 'h-4 w-3.5' : 'h-4.5 w-4'
        } ${
          isCurrentActive
            ? 'ring-2 ring-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.9)] scale-110 z-10'
            : isDone
            ? 'ring-1 ring-white/50 opacity-95'
            : isMuted
            ? 'opacity-40 grayscale-[40%]'
            : 'opacity-80 ring-1 ring-stone-700'
        }`}
        style={{
          backgroundColor: item.color,
        }}
      >
        {item.state === 'active' && (
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
        )}
        {item.state === 'winner' && (
          <Sparkles className="h-2.5 w-2.5 text-stone-950 stroke-[2.5]" />
        )}
        {(item.state === 'done' || item.state === 'answered' || item.state === 'correct') && (
          <Check className="h-2.5 w-2.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] stroke-[3]" />
        )}
        {item.state === 'pending' && (
          <span className="text-[8px] font-black text-white/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] leading-none">
            {item.orderIndex}
          </span>
        )}
      </div>
    );
  };

  const compactPhaseTitle =
    phase === 'base_selection' ? 'ALEGERE BAZĂ' : phaseLabel;
  const compactSubLabel = subModeLabel
    .replace(' alegeri rămase', ' rămase')
    .replace(' alegeri pe hartă', ' alegeri');

  return (
    <div
      data-testid="round-tracker"
      data-phase={phase}
      className="pointer-events-none select-none w-[158px] sm:w-[216px] rounded-xl border border-amber-500/35 bg-stone-950/90 px-2 sm:px-2.5 py-1 sm:py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.85)] backdrop-blur-md flex flex-col gap-1"
    >
      {/* Row 1: Phase Name + Compact Round / Remaining Counter */}
      <div className="flex items-center justify-between gap-1">
        <span className="font-serif text-[9px] sm:text-[11px] font-black tracking-wider text-amber-300 uppercase truncate">
          {compactPhaseTitle}
        </span>
        <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 border border-amber-500/30 px-1 sm:px-1.5 py-0.5 font-mono text-[8px] sm:text-[10px] font-bold text-amber-200 whitespace-nowrap shrink-0">
          <Clock className="h-2.5 w-2.5 text-amber-400 shrink-0" />
          {compactSubLabel}
        </span>
      </div>

      {/* Row 2: Compact Round Progress Segments */}
      <div
        data-testid="round-tracker-progress"
        className="flex items-center gap-1 w-full"
      >
        {Array.from({ length: progressSteps }, (_, idx) => {
          const stepNumber = idx + 1;
          const isCurrent = stepNumber === completedSteps;
          const isPast = stepNumber < completedSteps;
          return (
            <div
              key={stepNumber}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                isCurrent
                  ? 'bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.85)]'
                  : isPast
                  ? 'bg-amber-500/75'
                  : 'bg-stone-800'
              }`}
            />
          );
        })}
      </div>

      {/* Row 3: Authoritative Turn / Pick / Individual War Order (1 marker per player, never displayed as team pairs) */}
      <div
        data-testid="round-tracker-markers"
        className="flex items-center justify-between gap-1 pt-0.5"
      >
        <div
          data-testid={
            phase === 'war' && battlePairs.length > 0
              ? `tracker-battle-${battlePairs[0].battleId}`
              : undefined
          }
          className="flex items-center gap-1 flex-wrap"
        >
          {items.map((item) => renderMarkerBadge(item, items.length > 5))}
        </div>
      </div>
    </div>
  );
};
