import React, { useState, useEffect } from 'react';
import { GameState, UserProfile } from '../types/game';
import {
  canTargetTerritory,
  resolveAttackOriginTerritory,
  formatWarAttackAnnouncement,
  getLegalNeutralTargetsForPlayer,
} from '../game/rules';
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
      const hasAdjacent =
        getLegalNeutralTargetsForPlayer(currentUser.id, game.territories).length > 0;
      setFeedbackToast({
        type: 'info',
        text: hasAdjacent
          ? '🏆 CÂȘTIGĂTOR DEPARTAJARE! Atinge pe hartă un teritoriu liber învecinat cu teritoriile tale (+300 PCT)!'
          : '🏆 CÂȘTIGĂTOR DEPARTAJARE! Nu mai ai teritorii libere adiacente — alege orice teritoriu liber rămas (+300 PCT)!',
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
    game.territories,
    currentUser.id,
  ]);

  const handleTerritoryAction = (territoryId: string) => {
    const myPlayer = game.players.find((p) => p.id === currentUser.id);
    const myWarBattle =
      game.phase === 'war' && game.warRound
        ? game.warRound.battles.find((b) => b.attackerId === currentUser.id)
        : undefined;
    const assignedDefenderId =
      game.phase === 'war' && myWarBattle && myWarBattle.defenderId
        ? myWarBattle.defenderId
        : null;

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

  const activeWarPreviewBattle =
    game.phase === 'war' &&
    game.warRound?.status === 'attack_preview' &&
    !game.currentQuestion
      ? game.warRound.battles.find(
          (b) => (b.status === 'ready' || b.status === 'auto_selected') && b.targetTerritoryId
        ) || null
      : null;

  const activeBattleResult =
    game.phase === 'war' &&
    game.warRound?.status === 'completed' &&
    !game.currentQuestion &&
    game.warRound.lastBattleResult
      ? game.warRound.lastBattleResult
      : null;

  const previewAnnouncement = activeWarPreviewBattle
    ? (() => {
        const atk = game.players.find((p) => p.id === activeWarPreviewBattle.attackerId);
        const def = game.players.find((p) => p.id === activeWarPreviewBattle.defenderId);
        const terr = activeWarPreviewBattle.targetTerritoryId
          ? game.territories[activeWarPreviewBattle.targetTerritoryId]
          : null;
        const origin =
          activeWarPreviewBattle.targetTerritoryId && atk
            ? resolveAttackOriginTerritory(
                atk.id,
                activeWarPreviewBattle.targetTerritoryId,
                game.territories
              )
            : null;
        return {
          atk,
          def,
          terr,
          origin,
          info: formatWarAttackAnnouncement({
            attacker: atk,
            defender: def,
            targetTerritory: terr,
            originTerritory: origin,
          }),
        };
      })()
    : null;

  return (
    <div className="relative w-full max-w-full flex-1 min-h-0 flex flex-col gap-1 sm:gap-1.5 lg:h-full overflow-x-hidden lg:overflow-hidden animate-fadeIn">
      {/* Compact Top Command Bar (+ Mobile Player Strip on <1024px) */}
      <GameHUD
        game={game}
        currentUserId={currentUser.id}
        onLeaveGame={onLeaveGame}
      />

      {/* Pre-Question War Attack Presentation Stage Banner */}
      {previewAnnouncement && (
        <div
          data-testid="war-attack-preview-banner"
          className="relative z-30 rounded-xl sm:rounded-2xl border-2 border-rose-500/85 bg-gradient-to-r from-stone-950 via-rose-950/95 to-stone-950 px-3 py-2 sm:px-4 sm:py-2.5 shadow-[0_0_28px_rgba(244,63,94,0.38)] backdrop-blur-xl transition-opacity duration-200 motion-reduce:transition-none"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3">
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-500/25 border border-rose-400/60 text-rose-300">
                <Swords className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div
                  data-testid="war-attack-headline"
                  className="text-xs sm:text-sm md:text-base font-serif font-black tracking-wide text-amber-200 leading-snug break-words"
                >
                  {previewAnnouncement.info.headline}
                </div>
                <div className="text-[11px] sm:text-xs font-medium text-stone-200 leading-tight mt-0.5">
                  {previewAnnouncement.info.responderText}
                </div>
              </div>
            </div>

            {previewAnnouncement.atk && previewAnnouncement.def && previewAnnouncement.terr && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-400/40 bg-stone-950/90 px-2.5 py-1 text-[11px] sm:text-xs shrink-0">
                <span
                  className="inline-flex items-center gap-1 font-bold"
                  style={{ color: previewAnnouncement.atk.color }}
                >
                  <Swords className="h-3.5 w-3.5" />
                  {previewAnnouncement.atk.username}
                </span>
                <span className="text-stone-400 font-black">atacă</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 border border-rose-400/40 px-1.5 py-0.5 font-serif font-black text-amber-200">
                  <Crosshair className="h-3 w-3 text-rose-400" />
                  {previewAnnouncement.terr.isBase ? '🏰 ' : ''}
                  {previewAnnouncement.terr.name}
                </span>
                <span className="inline-flex items-center gap-1 text-stone-300">
                  (<Shield className="h-3 w-3 text-sky-400" />
                  <strong style={{ color: previewAnnouncement.def.color }}>
                    {previewAnnouncement.def.username}
                  </strong>
                  )
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Post-Battle Outcome Banner (Atac reușit / Apărare reușită) */}
      {activeBattleResult && (
        <div
          data-testid="war-battle-outcome-banner"
          className={`relative z-30 rounded-xl sm:rounded-2xl border-2 px-3 py-2 sm:px-4 sm:py-2.5 shadow-2xl backdrop-blur-xl transition-opacity duration-200 motion-reduce:transition-none ${
            activeBattleResult.outcome === 'attacker_won'
              ? 'border-amber-400/85 bg-gradient-to-r from-stone-950 via-amber-950/90 to-stone-950'
              : 'border-emerald-400/85 bg-gradient-to-r from-stone-950 via-emerald-950/90 to-stone-950'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3">
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                  activeBattleResult.outcome === 'attacker_won'
                    ? 'bg-amber-500/25 border-amber-400/60 text-amber-300'
                    : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300'
                }`}
              >
                {activeBattleResult.outcome === 'attacker_won' ? (
                  <Swords className="h-4 w-4" />
                ) : (
                  <Shield className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0">
                <div
                  data-testid="war-battle-outcome-headline"
                  className={`text-xs sm:text-sm md:text-base font-serif font-black uppercase tracking-wider ${
                    activeBattleResult.outcome === 'attacker_won'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  }`}
                >
                  {activeBattleResult.headline}
                </div>
                <div className="text-[11px] sm:text-xs font-semibold text-stone-100 leading-snug break-words">
                  {activeBattleResult.details}
                </div>
              </div>
            </div>

            <div className="inline-flex items-center self-start sm:self-center rounded-lg border border-amber-400/40 bg-stone-950/90 px-2.5 py-1 text-[10px] sm:text-xs font-black tracking-wide text-amber-200 shrink-0">
              {activeBattleResult.effectBadge}
            </div>
          </div>
        </div>
      )}

      {/* Action Feedback Toast Banner */}
      {feedbackToast && !game.currentQuestion && (
        <div
          data-testid="territory-feedback-toast"
          className={`pointer-events-none fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 max-w-[94vw] rounded-xl border px-3 py-2 text-xs sm:text-sm font-bold shadow-2xl backdrop-blur-xl transition-opacity duration-150 motion-reduce:transition-none ${
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
          <span className="break-words">{feedbackToast.text}</span>
        </div>
      )}

      {/* Map-First Workspace: Map takes full width on <1280px; on >=1280px (xl) RomaniaMap is on left and PlayerSidebar is on right */}
      <div className="flex-1 min-h-[260px] sm:min-h-[340px] w-full flex flex-col xl:flex-row gap-2 overflow-hidden">
        <div className="flex-1 min-w-0 min-h-[260px] sm:min-h-[340px] flex flex-col">
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
          territories={game.territories}
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

