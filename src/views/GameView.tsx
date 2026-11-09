import React, { useState, useEffect } from 'react';
import { GameState, UserProfile } from '../types/game';
import { GameHUD, PlayerSidebar } from '../components/GameHUD';
import { RomaniaMap } from '../components/RomaniaMap';
import { QuestionModal } from '../components/QuestionModal';
import { GameOverModal } from '../components/GameOverModal';
import { CheckCircle2, AlertTriangle, Swords } from 'lucide-react';

interface GameViewProps {
  game: GameState;
  currentUser: UserProfile;
  onSelectTerritory: (
    territoryId: string,
    cb?: (res: { success: boolean; message?: string; territoryId?: string; pointsAwarded?: number }) => void
  ) => void;
  onSubmitAnswer: (
    answer: number | string,
    cb?: (res: { success: boolean; message?: string; acceptedAnswer?: number }) => void
  ) => void;
  onLeaveGame: () => void;
  onRematch: () => void;
}

export const GameView: React.FC<GameViewProps> = ({
  game,
  currentUser,
  onSelectTerritory,
  onSubmitAnswer,
  onLeaveGame,
  onRematch,
}) => {
  const activePlayer = game.players[game.activePlayerIndex];
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Show an immediate banner when the current user wins the right to pick a territory
  useEffect(() => {
    if (game.phase === 'conquest' && game.conquestPickerId === currentUser.id && !game.currentQuestion) {
      setFeedbackToast({
        type: 'info',
        text: '🎯 RĂSPUNS CORECT! Atinge pe hartă un teritoriu liber învecinat pentru a-l cuceri (+200 PCT)!',
      });
      const t = setTimeout(() => setFeedbackToast(null), 5000);
      return () => clearTimeout(t);
    }
    if (
      game.phase === 'allocation' &&
      game.allocationWinnerId === currentUser.id &&
      game.allocationPickReady &&
      !game.currentQuestion
    ) {
      setFeedbackToast({
        type: 'info',
        text: '🏆 CÂȘTIGĂTOR DEPARTAJARE! Atinge pe hartă un teritoriu liber pentru a-l revendica (+300 PCT)!',
      });
      const t = setTimeout(() => setFeedbackToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [
    game.phase,
    game.conquestPickerId,
    game.allocationWinnerId,
    game.allocationPickReady,
    game.currentQuestion,
    currentUser.id,
  ]);

  const handleTerritoryAction = (territoryId: string) => {
    onSelectTerritory(territoryId, (res) => {
      if (res && res.message) {
        setFeedbackToast({
          type: res.success ? 'success' : 'error',
          text: res.message,
        });
        setTimeout(() => {
          setFeedbackToast((prev) => (prev?.text === res.message ? null : prev));
        }, 3200);
      }
    });
  };

  return (
    <div className="relative w-full flex-1 min-h-0 flex flex-col gap-1.5 lg:h-full lg:overflow-hidden animate-fadeIn">
      {/* Compact Top Command Bar (+ Mobile Player Strip on <1024px) */}
      <GameHUD
        game={game}
        currentUserId={currentUser.id}
        onLeaveGame={onLeaveGame}
      />

      {/* Action Feedback Toast Banner */}
      {feedbackToast && !game.currentQuestion && (
        <div
          className={`pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-bold shadow-2xl backdrop-blur-xl transition-all ${
            feedbackToast.type === 'success'
              ? 'border-emerald-400 bg-emerald-950/95 text-emerald-200 shadow-emerald-950/60'
              : feedbackToast.type === 'error'
              ? 'border-red-400 bg-red-950/95 text-red-200 shadow-red-950/60'
              : 'border-amber-400 bg-amber-950/95 text-amber-200 shadow-amber-950/60'
          }`}
        >
          {feedbackToast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : feedbackToast.type === 'error' ? (
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          ) : (
            <Swords className="h-4 w-4 text-amber-400 shrink-0" />
          )}
          <span>{feedbackToast.text}</span>
        </div>
      )}

      {/* Map-First Workspace: Map takes full width on <1280px; on >=1280px (xl) RomaniaMap is on left and PlayerSidebar is on right */}
      <div className="flex-1 min-h-0 w-full flex flex-col xl:flex-row gap-2 overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <RomaniaMap
            game={game}
            territories={game.territories}
            players={game.players}
            activePlayerId={activePlayer?.id}
            currentUserId={currentUser.id}
            gamePhase={game.phase}
            selectedTerritoryId={game.currentQuestion?.targetTerritoryId || game.pendingTerritoryId}
            warRound={game.warRound}
            mapPresetPlayerCount={game.mapPresetPlayerCount}
            onSelectTerritory={handleTerritoryAction}
            disabled={game.currentQuestion !== null}
          />
        </div>

        {/* Vertical Right-Hand Scoreboard Roster on Desktop (>= 1280px) */}
        <PlayerSidebar game={game} currentUserId={currentUser.id} />
      </div>

      {/* Active Question Modal */}
      {game.currentQuestion && (
        <QuestionModal
          activeQuestion={game.currentQuestion}
          players={game.players}
          currentUserId={currentUser.id}
          warRound={game.warRound}
          onSubmitAnswer={onSubmitAnswer}
        />
      )}

      {/* Game Over Screen */}
      {game.phase === 'finished' && (
        <GameOverModal
          game={game}
          currentUserId={currentUser.id}
          onRematch={onRematch}
          onGoHome={onLeaveGame}
        />
      )}
    </div>
  );
};
