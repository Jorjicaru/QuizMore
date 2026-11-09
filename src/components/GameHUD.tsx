import React, { useEffect, useState } from 'react';
import { GameState, Player } from '../types/game';
import { Swords, Volume2, VolumeX, LogOut, Scroll, Flag, Users } from 'lucide-react';
import { sound } from '../services/audio';
import { RoundTracker } from './RoundTracker';

interface GameHUDProps {
  game: GameState;
  currentUserId?: string;
  onLeaveGame: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({ game, currentUserId, onLeaveGame }) => {
  const [isMuted, setIsMuted] = useState(sound.getIsMuted());
  const [showLog, setShowLog] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());

  useEffect(() => {
    if (
      !game.turnTimerExpiresAt ||
      game.currentQuestion ||
      game.phase === 'waiting' ||
      game.phase === 'finished'
    )
      return;
    const tick = () => setClockNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 40);
    return () => window.clearInterval(timer);
  }, [game.turnTimerExpiresAt, game.currentQuestion, game.phase]);

  const selectionRemainingMs =
    game.turnTimerExpiresAt && !game.currentQuestion
      ? Math.max(0, game.turnTimerExpiresAt - clockNow)
      : 0;
  const selectionTimerVisible =
    selectionRemainingMs > 0 && game.phase !== 'waiting' && game.phase !== 'finished';
  const selectionProgress =
    game.turnTimeLimit > 0
      ? Math.max(0, Math.min(100, (selectionRemainingMs / (game.turnTimeLimit * 1000)) * 100))
      : 0;

  const myWarBattleAsAttacker =
    game.phase === 'war' && game.warRound
      ? game.warRound.battles.find((b) => b.attackerId === currentUserId)
      : undefined;
  const assignedDefender = myWarBattleAsAttacker
    ? game.players.find((p) => p.id === myWarBattleAsAttacker.defenderId)
    : undefined;

  const selectionActionLabel =
    game.phase === 'base_selection'
      ? 'ALEGE BAZA (1000 PCT)'
      : game.phase === 'conquest'
      ? 'ALEGE TERITORIUL ÎNVECINAT DE CUCERIT (+200 PCT)'
      : game.phase === 'allocation'
      ? 'ALEGE TERITORIUL CÂȘTIGAT (+300 PCT)'
      : myWarBattleAsAttacker && !myWarBattleAsAttacker.targetTerritoryId
      ? `ALEGE ȚINTA DE ATAC CONTRA LUI ${assignedDefender?.username?.toUpperCase() || 'APĂRĂTOR'}`
      : 'ATACATORII ÎȘI ALEG ȚINTELE DE ATAC';

  const selectionSeconds = Math.ceil(selectionRemainingMs / 1000);

  const activePlayer = game.players[game.activePlayerIndex];

  // Determine whether it's the current user's turn to click on the map
  const isMyMapTurn = Boolean(
    currentUserId &&
      !game.currentQuestion &&
      ((game.phase === 'base_selection' && activePlayer?.id === currentUserId) ||
        (game.phase === 'conquest' && game.conquestPickerId === currentUserId) ||
        (game.phase === 'allocation' &&
          game.allocationWinnerId === currentUserId &&
          game.allocationPickReady) ||
        (game.phase === 'war' &&
          game.warRound?.status === 'selecting_targets' &&
          myWarBattleAsAttacker &&
          !myWarBattleAsAttacker.targetTerritoryId))
  );

  // Common question status
  const cq = game.currentQuestion;
  const questionParticipants = cq
    ? cq.participantIds && cq.participantIds.length > 0
      ? cq.participantIds
      : game.players.filter((p) => !p.isEliminated).map((p) => p.id)
    : [];
  const questionAnsweredCount = cq
    ? questionParticipants.filter((pid) => {
        const sub = cq.playerAnswers[pid];
        if (!sub) return false;
        if (!cq.resolved) return true;
        return sub.answer !== null && sub.answerStatus !== 'NO_RESPONSE';
      }).length
    : 0;

  // War target selection progress
  const warTotalBattles = game.warRound?.battles.length || 0;
  const warSelectedTargetsCount =
    game.warRound?.battles.filter((b) => b.targetTerritoryId !== null).length || 0;

  const handleToggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const renderStatusBadge = () => {
    if (cq) {
      return (
        <div
          data-testid="hud-simultaneous-question-status"
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-amber-500/20 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold text-amber-200 shadow"
        >
          <Users className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="truncate">
            TOȚI JUCĂTORII RĂSPUND ({questionAnsweredCount}/{questionParticipants.length})
          </span>
        </div>
      );
    }

    if (isMyMapTurn) {
      return (
        <div
          data-testid="hud-my-turn-badge"
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-500/25 px-2.5 sm:px-3 py-1 font-serif text-[11px] sm:text-xs font-black uppercase tracking-wider text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.5)] animate-pulse"
        >
          <Swords className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {game.phase === 'war' && assignedDefender
              ? `ATACĂ PE ${assignedDefender.username.toUpperCase()}!`
              : 'RÂNDUL TĂU PE HARTĂ!'}
          </span>
        </div>
      );
    }

    if (game.phase === 'war' && game.warRound?.status === 'selecting_targets') {
      return (
        <div
          data-testid="hud-war-targets-status"
          className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-stone-950 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold text-red-300"
        >
          <Swords className="h-3.5 w-3.5 text-red-400 shrink-0" />
          <span className="truncate">
            Ținte alese: {warSelectedTargetsCount} / {warTotalBattles}
          </span>
        </div>
      );
    }

    return (
      <div className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-stone-800 bg-stone-950 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs min-w-0">
        <span className="text-stone-400 shrink-0 hidden sm:inline">Activ:</span>
        <span
          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: activePlayer?.color }}
        />
        <span className="font-bold truncate max-w-[140px]" style={{ color: activePlayer?.color }}>
          {activePlayer?.username || 'Jucător'}
        </span>
      </div>
    );
  };

  const renderPlayerCard = (player: Player, index: number, isCarouselCard = false) => {
    const isActive =
      !cq &&
      game.phase !== 'finished' &&
      ((game.phase === 'war' &&
        game.warRound?.status === 'selecting_targets' &&
        game.warRound.attackerIds.includes(player.id)) ||
        index === game.activePlayerIndex);

    const isMe = currentUserId === player.id;
    const territoriesCount = Object.values(game.territories).filter(
      (t) => t.ownerId === player.id
    ).length;
    const baseTerritory = Object.values(game.territories).find(
      (t) => t.ownerId === player.id && t.isBase
    );

    // Question submission status or War role badge
    let statusTag: React.ReactNode = null;
    if (player.isEliminated) {
      statusTag = <span className="text-[9px] text-red-400 font-bold font-mono">ELIMINAT</span>;
    } else if (cq && questionParticipants.includes(player.id)) {
      const sub = cq.playerAnswers[player.id];
      const hasAns = cq.resolved
        ? Boolean(sub && sub.answer !== null && sub.answerStatus !== 'NO_RESPONSE')
        : Boolean(sub !== undefined);
      statusTag = hasAns ? (
        <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-1 py-0.2 text-[9px] font-bold text-emerald-300">
          ✓ Răspuns
        </span>
      ) : (
        <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1 py-0.2 text-[9px] font-semibold text-amber-300">
          ⏳ Așteaptă
        </span>
      );
    } else if (game.phase === 'war' && game.warRound) {
      if (game.warRound.attackerIds.includes(player.id)) {
        statusTag = (
          <span className="rounded bg-red-500/20 border border-red-500/40 px-1 py-0.2 text-[9px] font-bold text-red-300">
            ⚔️ Atac
          </span>
        );
      } else if (game.warRound.defenderIds.includes(player.id)) {
        statusTag = (
          <span className="rounded bg-sky-500/20 border border-sky-500/40 px-1 py-0.2 text-[9px] font-bold text-sky-300">
            🛡️ Apărare
          </span>
        );
      } else if (game.warRound.byePlayerIds.includes(player.id)) {
        statusTag = (
          <span className="rounded bg-stone-700/50 border border-stone-600 px-1 py-0.2 text-[9px] font-semibold text-stone-300">
            ⏸️ BYE
          </span>
        );
      }
    }

    return (
      <div
        key={player.id}
        data-testid={`player-card-${player.id}`}
        title={`${player.username} — ${player.score} pct (${territoriesCount} teritorii)`}
        className={`relative overflow-hidden rounded-xl border px-2 py-1.5 transition-all backdrop-blur-md ${
          isCarouselCard ? 'snap-start shrink-0 w-[148px] sm:w-[164px]' : 'min-w-0'
        } ${
          isActive
            ? 'border-amber-400 bg-stone-900/98 ring-1 ring-amber-400/60 shadow-md'
            : isMe
            ? 'border-stone-700 bg-stone-900/85'
            : 'border-stone-800/80 bg-stone-950/75 opacity-95'
        }`}
      >
        {/* Top Color Bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ backgroundColor: player.color }}
        />

        {/* Row 1: Icon + Username + Castle Towers / Eliminated */}
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs shrink-0 leading-none">
              {player.isEliminated ? '💀' : player.isAi ? '🤖' : '⚔️'}
            </span>
            <span className="truncate text-[11px] font-bold text-stone-100 leading-tight">
              {player.username}
            </span>
          </div>

          {player.isEliminated ? (
            <span className="text-[9px] text-red-400 font-bold font-mono shrink-0">CĂZUT</span>
          ) : (
            <span
              title={`Cetatea Bază: ${player.castleTowers ?? 3}/3 turnuri intacte`}
              className="text-[10px] font-mono font-bold text-amber-400 flex items-center gap-0.5 shrink-0 tabular-nums"
            >
              🏰{baseTerritory ? `${player.castleTowers ?? 3}/3` : '3/3'}
            </span>
          )}
        </div>

        {/* Row 2: Score, Role/Answer Status & Conquered Territories */}
        <div className="mt-1 flex items-center justify-between border-t border-stone-800/80 pt-0.5 text-[10px] sm:text-[11px] gap-1">
          <div className="font-mono font-black text-amber-300 tabular-nums leading-tight shrink-0">
            {player.score} <span className="text-[9px] text-stone-400 font-normal">pct</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {statusTag}
            {!!player.defensiveBonus && player.defensiveBonus > 0 && !statusTag && (
              <span
                className="text-[9px] text-emerald-400 font-mono font-bold tabular-nums"
                title="Bonus defensiv activ"
              >
                +{player.defensiveBonus}
              </span>
            )}
            <div
              className="flex items-center gap-0.5 text-stone-300 font-mono text-[10px] tabular-nums"
              title="Teritorii deținute"
            >
              <Flag className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
              <span>{territoriesCount}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const playerCount = game.players.length;

  return (
    <div className="w-full shrink-0 space-y-1">
      {/* MOBILE HUD (< 768px): 3 Dedicated Vertical Zones */}
      <div className="flex flex-col gap-1.5 md:hidden rounded-2xl border border-stone-800 bg-stone-900/95 p-2.5 shadow-xl backdrop-blur-xl">
        <div className="w-full border-b border-stone-800/80 pb-1.5">
          <RoundTracker
            phase={game.phase}
            currentRound={game.round}
            maxRounds={game.maxRounds}
            players={game.players}
            activePlayerIndex={game.activePlayerIndex}
          />
        </div>

        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          <div className="min-w-0 flex-1">{renderStatusBadge()}</div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowLog(!showLog)}
              title="Jurnalul Bătăliilor"
              className="flex h-8 items-center gap-1 rounded-xl border border-stone-700 bg-stone-800/90 px-2 text-[11px] font-semibold text-stone-200 hover:bg-stone-700 transition"
            >
              <Scroll className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>Jurnal</span>
            </button>

            <button
              onClick={handleToggleSound}
              aria-label="Comută Sunetul"
              title={isMuted ? 'Activează Sunetul' : 'Dezactivează Sunetul'}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/90 text-stone-200 hover:bg-stone-700 transition"
            >
              {isMuted ? (
                <VolumeX className="h-3.5 w-3.5 text-red-400" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
              )}
            </button>

            <button
              onClick={onLeaveGame}
              title="Părăsește Meciul"
              className="flex h-8 items-center gap-1 rounded-xl border border-red-500/40 bg-red-500/15 px-2 text-[11px] font-bold text-red-300 hover:bg-red-500/25 transition"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span>Ieșire</span>
            </button>
          </div>
        </div>
      </div>

      {/* DESKTOP & TABLET LANDSCAPE HUD (>= 768px) */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-stone-800 bg-stone-900/90 px-4 py-1.5 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-start min-w-0">{renderStatusBadge()}</div>

        <div className="flex justify-center shrink-0">
          <RoundTracker
            phase={game.phase}
            currentRound={game.round}
            maxRounds={game.maxRounds}
            players={game.players}
            activePlayerIndex={game.activePlayerIndex}
          />
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={() => setShowLog(!showLog)}
            className="flex items-center gap-1.5 rounded-xl border border-stone-800 bg-stone-800/80 px-3 py-1 text-xs font-semibold text-stone-300 hover:bg-stone-700 transition whitespace-nowrap"
          >
            <Scroll className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>Jurnal ({game.gameLog.length})</span>
          </button>

          <button
            onClick={handleToggleSound}
            aria-label="Comută Sunetul"
            className="rounded-xl border border-stone-800 bg-stone-800/80 p-1.5 text-stone-300 hover:bg-stone-700 transition"
          >
            {isMuted ? (
              <VolumeX className="h-3.5 w-3.5 text-red-400" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
            )}
          </button>

          <button
            onClick={onLeaveGame}
            className="flex items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-400 hover:bg-red-500/20 transition whitespace-nowrap"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span>Părăsește</span>
          </button>
        </div>
      </div>

      {/* ZONE 3: Full-Width Selection Timer (Mobile & Desktop) */}
      {selectionTimerVisible && (
        <div
          className="w-full rounded-xl border border-amber-500/30 bg-stone-950/95 px-3 py-1 shadow-lg"
          role="timer"
          aria-live="off"
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold uppercase tracking-wider text-amber-200 truncate">
              {selectionActionLabel}
            </span>
            <span
              className={`font-mono text-xs font-black tabular-nums shrink-0 ${
                selectionSeconds <= 3 ? 'text-red-400 animate-pulse' : 'text-amber-300'
              }`}
            >
              {selectionSeconds}s
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-800 shadow-inner">
            <div
              className={`h-full rounded-full ${
                selectionSeconds <= 3
                  ? 'bg-red-500'
                  : selectionSeconds <= 6
                  ? 'bg-amber-400'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${selectionProgress}%`, transition: 'width 40ms linear' }}
            />
          </div>
        </div>
      )}

      {/* PLAYERS STRIP */}
      {playerCount <= 4 ? (
        <div
          className={`grid gap-1.5 ${
            playerCount === 2
              ? 'grid-cols-2'
              : playerCount === 3
              ? 'grid-cols-3'
              : 'grid-cols-2 lg:grid-cols-4'
          }`}
        >
          {game.players.map((player, index) => renderPlayerCard(player, index, false))}
        </div>
      ) : (
        <>
          <div className="lg:hidden">
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-2 pb-1 no-scrollbar">
              {game.players.map((player, index) => renderPlayerCard(player, index, true))}
            </div>
          </div>

          <div className="hidden lg:grid lg:grid-cols-5 gap-1.5">
            {game.players.map((player, index) => renderPlayerCard(player, index, false))}
          </div>
        </>
      )}

      {/* Game Log Drawer */}
      {showLog && (
        <div className="fixed inset-x-3 top-20 z-50 mx-auto max-w-2xl rounded-2xl border border-stone-700 bg-stone-950/98 p-4 shadow-2xl backdrop-blur-xl animate-fadeIn text-left">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2 mb-3">
            <h4 className="flex items-center gap-2 text-xs font-serif font-bold uppercase tracking-wider text-amber-400">
              <Scroll className="h-4 w-4" /> Jurnalul Bătăliilor CONQUIZ
            </h4>
            <button
              onClick={() => setShowLog(false)}
              className="rounded-lg border border-stone-800 bg-stone-900 px-2.5 py-1 text-xs font-bold text-stone-300 hover:text-white"
            >
              Închide
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-2 font-mono text-xs">
            {game.gameLog
              .slice()
              .reverse()
              .map((log) => (
                <div
                  key={log.id}
                  className={`rounded-lg px-2.5 py-1.5 border ${
                    log.type === 'conquest'
                      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                      : log.type === 'battle'
                      ? 'border-red-500/20 bg-red-500/5 text-red-300'
                      : log.type === 'elimination'
                      ? 'border-purple-500/30 bg-purple-500/10 text-purple-200 font-bold'
                      : 'border-stone-800 bg-stone-900/60 text-stone-300'
                  }`}
                >
                  <span className="text-[10px] text-stone-500 mr-2">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  {log.text}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
