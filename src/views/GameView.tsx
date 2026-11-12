import React, { useState, useEffect } from 'react';
import { GameState, UserProfile } from '../types/game';
import { canTargetTerritory, resolveAttackOriginTerritory } from '../game/rules';
import { GameHUD, PlayerSidebar } from '../components/GameHUD';
import { RomaniaMap } from '../components/RomaniaMap';
import { QuestionModal } from '../components/QuestionModal';
import { GameOverModal } from '../components/GameOverModal';
import { CheckCircle2, AlertTriangle, Swords, Shield, Crosshair } from 'lucide-react';

interface GameViewProps {
  game: GameState;
  currentUser: UserProfile;
  onSelectTerritory: (
    territoryId: string,
    cb?: (res: { success: boolean; message?: string; territoryId?: string; pointsAwarded?: number }) => void
  ) => void;
  onSubmitAnswer: (
    answer: number | string,
    cb?: (res: {
      success: boolean;
      message?: string;
      acceptedAnswer?: number;
      code?: string;
      timedOut?: boolean;
    }) => void,
    questionInstanceId?: string
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
        text: '🎯 RĂSPUNS CORECT! Atinge pe hartă un teritoriu liber învecinat cu teritoriile tale (+200 PCT)!',
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
        text: '🏆 CÂȘTIGĂTOR DEPARTAJARE! Atinge pe hartă un teritoriu liber învecinat cu teritoriile tale (+300 PCT)!',
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
    const myPlayer = game.players.find((p) => p.id === currentUser.id);
    const myWarBattle =
      game.phase === 'war' && game.warRound
        ? game.warRound.battles.find((b) => b.attackerId === currentUser.id)
        : undefined;
    const assignedDefenderId =
      game.phase === 'war' && myWarBattle ? myWarBattle.defenderId : null;

    if (myPlayer && game.phase !== 'waiting' && game.phase !== 'finished') {
      const check = canTargetTerritory(
        territoryId,
        myPlayer,
        game.territories,
        game.phase,
        assignedDefenderId
      );
      if (!check.allowed && check.reason) {
        setFeedbackToast({
          type: 'error',
          text: check.reason,
        });
      }
    }

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

  const activeWarPreviewBattles =
    game.phase === 'war' &&
    game.warRound?.status === 'attack_preview' &&
    !game.currentQuestion
      ? game.warRound.battles.filter((b) => b.status === 'ready' && b.targetTerritoryId)
      : [];

  return (
    <div className="relative w-full flex-1 min-h-0 flex flex-col gap-1.5 lg:h-full lg:overflow-hidden animate-fadeIn">
      {/* Compact Top Command Bar (+ Mobile Player Strip on <1024px) */}
      <GameHUD
        game={game}
        currentUserId={currentUser.id}
        onLeaveGame={onLeaveGame}
      />

      {/* Pre-Question War Attack Presentation Stage Banner */}
      {activeWarPreviewBattles.length > 0 && (
        <div
          data-testid="war-attack-preview-banner"
          className="relative z-30 rounded-2xl border-2 border-rose-500/80 bg-gradient-to-r from-stone-950 via-rose-950/90 to-stone-950 px-4 py-2.5 shadow-[0_0_30px_rgba(244,63,94,0.35)] backdrop-blur-xl transition-opacity duration-200 motion-reduce:transition-none"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 border border-rose-400/50 text-rose-300">
                <Swords className="h-4 w-4" />
              </span>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-rose-300">
                  Asediu Declanșat &bull; Prezentare Țintă
                </div>
                <div className="text-xs sm:text-sm font-serif font-bold text-white">
                  Pregătiți-vă! Întrebarea de duel pornește în câteva clipe...
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeWarPreviewBattles.map((b) => {
                const attacker = game.players.find((p) => p.id === b.attackerId);
                const defender = game.players.find((p) => p.id === b.defenderId);
                const terr = b.targetTerritoryId ? game.territories[b.targetTerritoryId] : null;
                const originTerr =
                  b.targetTerritoryId
                    ? resolveAttackOriginTerritory(
                        b.attackerId,
                        b.targetTerritoryId,
                        game.territories
                      )
                    : null;
                if (!attacker || !defender || !terr) return null;
                return (
                  <div
                    key={b.battleId}
                    className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-400/40 bg-stone-950/90 px-3 py-1.5 text-xs shadow-md"
                  >
                    <span className="inline-flex items-center gap-1 font-bold" style={{ color: attacker.color }}>
                      <Swords className="h-3.5 w-3.5" />
                      {attacker.username}
                    </span>
                    {originTerr && (
                      <span className="text-[11px] text-amber-200/90 font-semibold">
                        ({originTerr.name})
                      </span>
                    )}
                    <span className="text-stone-400 font-black">atacă</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 border border-rose-400/40 px-2 py-0.5 font-serif font-black text-amber-200">
                      <Crosshair className="h-3 w-3 text-rose-400" />
                      {terr.isBase ? '🏰 ' : ''}
                      {terr.name}
                    </span>
                    <span className="inline-flex items-center gap-1 text-stone-300">
                      (<Shield className="h-3 w-3 text-sky-400" />
                      <strong style={{ color: defender.color }}>{defender.username}</strong>)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Action Feedback Toast Banner */}
      {feedbackToast && !game.currentQuestion && (
        <div
          data-testid="territory-feedback-toast"
          className={`pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-bold shadow-2xl backdrop-blur-xl transition-opacity duration-150 motion-reduce:transition-none ${
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
            disabled={game.currentQuestion !== null || game.warRound?.status === 'attack_preview'}
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
