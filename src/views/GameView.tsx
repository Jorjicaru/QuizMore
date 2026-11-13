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
import {
  CheckCircle2,
  AlertTriangle,
  Swords,
  Shield,
  Crosshair,
  Castle,
  MessageSquare,
  Send,
  X,
} from 'lucide-react';

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
  onRegenerateTower?: (cb?: (res: { success: boolean; message?: string }) => void) => void;
  onSendChat?: (text: string) => void;
  chatMessages?: Array<{ id: string; username: string; text: string; timestamp: number }>;
  onLeaveGame: () => void;
  onRematch: () => void;
}

export const GameView: React.FC<GameViewProps> = ({
  game,
  currentUser,
  onSelectTerritory,
  onSubmitAnswer,
  onRegenerateTower,
  onSendChat,
  chatMessages = [],
  onLeaveGame,
  onRematch,
}) => {
  const activePlayer = game.players[game.activePlayerIndex];
  const isSpectator = !game.players.some((p) => p.id === currentUser.id);
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [chatInput, setChatInput] = useState('');

  // Show an immediate banner when the current user wins the right to pick a territory
  useEffect(() => {
    if (game.phase === 'conquest' && game.conquestPickerId === currentUser.id && !game.currentQuestion) {
      const hasAdjacent =
        getLegalNeutralTargetsForPlayer(currentUser.id, game.territories).length > 0;
      setFeedbackToast({
        type: 'info',
        text: hasAdjacent
          ? '🎯 RĂSPUNS CORECT! Atinge pe hartă un teritoriu liber învecinat cu teritoriile tale (+200 PCT)!'
          : '🎯 RĂSPUNS CORECT! Nu mai ai vecini liberi — alege orice teritoriu liber rămas pe hartă (+200 PCT)!',
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
    if (isSpectator) {
      setFeedbackToast({
        type: 'info',
        text: 'Ești în modul Spectator — poți urmări meciul și folosi chat-ul, dar nu poți ataca sau selecta teritorii.',
      });
      setTimeout(() => setFeedbackToast(null), 3000);
      return;
    }

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

  const handleRegenerateClick = () => {
    if (!onRegenerateTower) return;
    onRegenerateTower((res) => {
      if (res && res.message) {
        setFeedbackToast({
          type: res.success ? 'info' : 'error',
          text: res.message,
        });
        setTimeout(() => {
          setFeedbackToast((prev) => (prev?.text === res.message ? null : prev));
        }, 3200);
      }
    });
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !onSendChat) return;
    onSendChat(chatInput.trim());
    setChatInput('');
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
      {/* Compact Top Command Bar (+ Mobile Player Strip on <1280px) */}
      <GameHUD
        game={game}
        currentUserId={currentUser.id}
        onLeaveGame={onLeaveGame}
        onRegenerateTower={handleRegenerateClick}
        onToggleChat={() => setShowChatDrawer(true)}
        chatCount={chatMessages.length}
      />

      {/* Compact Single War Attack Presentation Banner */}
      {previewAnnouncement && (
        <div
          data-testid="war-attack-preview-banner"
          className="relative z-30 rounded-xl border border-rose-500/85 bg-gradient-to-r from-stone-950 via-rose-950/95 to-stone-950 px-2.5 py-1.5 sm:px-3.5 sm:py-2 shadow-[0_0_20px_rgba(244,63,94,0.3)] backdrop-blur-xl transition-opacity duration-200"
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-500/25 border border-rose-400/60 text-rose-300">
                <Swords className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <div
                  data-testid="war-attack-headline"
                  className="text-xs sm:text-sm font-serif font-black tracking-wide text-amber-200 leading-tight break-words"
                >
                  {previewAnnouncement.info.headline}
                </div>
                <div className="text-[10px] sm:text-xs font-medium text-stone-300 leading-tight">
                  {previewAnnouncement.info.responderText}
                </div>
              </div>
            </div>

            {previewAnnouncement.atk && previewAnnouncement.def && previewAnnouncement.terr && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-stone-950/90 px-2 py-0.5 text-[11px] shrink-0">
                <span className="font-bold" style={{ color: previewAnnouncement.atk.color }}>
                  {previewAnnouncement.atk.username}
                </span>
                <span className="text-stone-400">→</span>
                <span className="inline-flex items-center gap-1 font-serif font-black text-amber-200">
                  <Crosshair className="h-3 w-3 text-rose-400" />
                  {previewAnnouncement.terr.isBase ? '🏰 ' : ''}
                  {previewAnnouncement.terr.name}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Post-Battle Outcome Banner (Atac reușit / Turn distrus / Apărare reușită / Turn regenerat) */}
      {activeBattleResult && (
        <div
          data-testid="war-battle-outcome-banner"
          className={`relative z-30 rounded-xl border px-2.5 py-1.5 sm:px-3.5 sm:py-2 shadow-xl backdrop-blur-xl transition-opacity duration-200 ${
            activeBattleResult.isBaseTarget &&
            activeBattleResult.outcome === 'attacker_won' &&
            !activeBattleResult.isTowerRegenerated
              ? 'animate-castle-shake border-amber-400 bg-gradient-to-r from-stone-950 via-amber-950/95 to-stone-950'
              : activeBattleResult.outcome === 'attacker_won'
              ? 'border-amber-400/85 bg-gradient-to-r from-stone-950 via-amber-950/90 to-stone-950'
              : 'border-emerald-400/85 bg-gradient-to-r from-stone-950 via-emerald-950/90 to-stone-950'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
                  activeBattleResult.outcome === 'attacker_won'
                    ? 'bg-amber-500/25 border-amber-400/60 text-amber-300'
                    : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300'
                }`}
              >
                {activeBattleResult.isBaseTarget || activeBattleResult.isTowerRegenerated ? (
                  <Castle className="h-3.5 w-3.5" />
                ) : activeBattleResult.outcome === 'attacker_won' ? (
                  <Swords className="h-3.5 w-3.5" />
                ) : (
                  <Shield className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="min-w-0">
                <div
                  data-testid="war-battle-outcome-headline"
                  className={`text-xs sm:text-sm font-serif font-black uppercase tracking-wider ${
                    activeBattleResult.outcome === 'attacker_won'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  }`}
                >
                  {activeBattleResult.headline}
                </div>
                <div className="text-[10px] sm:text-xs font-semibold text-stone-100 leading-tight break-words">
                  {activeBattleResult.details}
                </div>
              </div>
            </div>

            <div
              data-testid="war-battle-effect-badge"
              className="inline-flex items-center rounded-lg border border-amber-400/40 bg-stone-950/90 px-2 py-0.5 text-[10px] sm:text-xs font-black tracking-wide text-amber-200 shrink-0"
            >
              {activeBattleResult.effectBadge}
            </div>
          </div>
        </div>
      )}

      {/* Action Feedback Toast Banner */}
      {feedbackToast && !game.currentQuestion && (
        <div
          data-testid="territory-feedback-toast"
          className={`pointer-events-none fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 max-w-[94vw] rounded-xl border px-3 py-2 text-xs sm:text-sm font-bold shadow-2xl backdrop-blur-xl transition-opacity duration-150 ${
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

      {/* Map-First Workspace */}
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
            disabled={
              isSpectator ||
              game.currentQuestion !== null ||
              game.warRound?.status === 'attack_preview'
            }
          />
        </div>

        {/* Vertical Right-Hand Scoreboard Roster on Desktop (>= 1280px) */}
        <PlayerSidebar game={game} currentUserId={currentUser.id} />
      </div>

      {/* Slide-Over Room Chat Drawer (Available to Players & Spectators during match) */}
      {showChatDrawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowChatDrawer(false)}
        >
          <div
            className="relative flex h-full w-full max-w-sm flex-col border-l border-amber-500/30 bg-stone-950 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-amber-400" />
                <h3 className="font-serif text-sm font-bold text-amber-200 tracking-wide uppercase">
                  Chat-ul Camerei (#{game.roomId})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowChatDrawer(false)}
                className="rounded-lg border border-stone-700 bg-stone-900 p-1.5 text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1 text-xs">
              {chatMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-stone-500 italic">
                  Niciun mesaj încă. Trimite primul mesaj!
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-xl border border-stone-800 bg-stone-900/75 p-2.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-stone-400 mb-0.5">
                      <span className="font-bold text-amber-400">{msg.username}</span>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-stone-200 break-words">{msg.text}</p>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handleChatSubmit}
              className="mt-3 flex gap-2 border-t border-stone-800 pt-3"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Scrie un mesaj în cameră..."
                className="flex-1 rounded-xl border border-stone-700 bg-stone-900 px-3 py-2 text-xs text-stone-100 placeholder-stone-500 focus:border-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-xl bg-amber-500 px-3 py-2 text-stone-950 font-bold hover:bg-amber-400 transition cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}

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
