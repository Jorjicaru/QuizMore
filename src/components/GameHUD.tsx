import React, { useEffect, useState } from 'react';
import { GameState, Player } from '../types/game';
import { Swords, Volume2, VolumeX, LogOut, Scroll, Flag } from 'lucide-react';
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
    if (!game.turnTimerExpiresAt || game.currentQuestion || game.phase === 'waiting' || game.phase === 'finished') return;
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
  const selectionActionLabel =
    game.phase === 'base_selection'
      ? 'ALEGE BAZA'
      : game.phase === 'conquest'
      ? 'ALEGE TERITORIUL DE CUCERIT'
      : game.phase === 'allocation'
      ? 'ALEGE TERITORIUL CÂȘTIGAT'
      : 'ALEGE ȚINTA ATACULUI';
  const selectionSeconds = Math.ceil(selectionRemainingMs / 1000);

  const activePlayer = game.players[game.activePlayerIndex];
  const isMyTurn = currentUserId && activePlayer?.id === currentUserId;

  const handleToggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const renderPlayerCard = (player: Player, index: number, isCarouselCard = false) => {
    const isActive = index === game.activePlayerIndex && game.phase !== 'finished';
    const isMe = currentUserId === player.id;
    const territoriesCount = Object.values(game.territories).filter(
      (t) => t.ownerId === player.id
    ).length;
    const baseTerritory = Object.values(game.territories).find(
      (t) => t.ownerId === player.id && t.isBase
    );

    return (
      <div
        key={player.id}
        title={`${player.username} — ${player.score} pct (${territoriesCount} teritorii)`}
        className={`relative overflow-hidden rounded-xl border px-2 py-1.5 transition-all backdrop-blur-md ${
          isCarouselCard ? 'snap-start shrink-0 w-[144px] sm:w-[160px]' : 'min-w-0'
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
            <span className="text-[9px] text-red-400 font-bold font-mono shrink-0">
              CĂZUT
            </span>
          ) : (
            <span
              title={`Cetatea Bază: ${player.castleTowers ?? 3}/3 turnuri intacte`}
              className="text-[10px] font-mono font-bold text-amber-400 flex items-center gap-0.5 shrink-0 tabular-nums"
            >
              🏰{ baseTerritory ? `${player.castleTowers ?? 3}/3` : '3/3' }
            </span>
          )}
        </div>

        {/* Row 2: Score & Conquered Territories */}
        <div className="mt-1 flex items-center justify-between border-t border-stone-800/80 pt-0.5 text-[10px] sm:text-[11px]">
          <div className="font-mono font-black text-amber-300 tabular-nums leading-tight">
            {player.score}{' '}
            <span className="text-[9px] text-stone-400 font-normal">pct</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!!player.defensiveBonus && player.defensiveBonus > 0 && (
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
      {/* ============================================================
          MOBILE HUD (< 768px): 3 Dedicated Vertical Zones
          Zone 1: Phase Title & Compact RoundTracker
          Zone 2: Active Player & Accessible Action Buttons
          Zone 3: Full-Width Selection Timer
      ============================================================ */}
      <div className="flex flex-col gap-1.5 md:hidden rounded-2xl border border-stone-800 bg-stone-900/95 p-2.5 shadow-xl backdrop-blur-xl">
        {/* ZONE 1: Phase Title & Round Tracker */}
        <div className="w-full border-b border-stone-800/80 pb-1.5">
          <RoundTracker
            phase={game.phase}
            currentRound={game.round}
            maxRounds={game.maxRounds}
            players={game.players}
            activePlayerIndex={game.activePlayerIndex}
          />
        </div>

        {/* ZONE 2: Active Player Badge + Commands (Jurnal, Sunet, Părăsește) */}
        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          <div className="min-w-0 flex-1">
            {isMyTurn ? (
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-500/25 px-2.5 py-1 font-serif text-[11px] font-black uppercase tracking-wider text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.4)]">
                <Swords className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">RÂNDUL TĂU!</span>
              </div>
            ) : (
              <div className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-stone-800 bg-stone-950 px-2.5 py-1 text-[11px]">
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: activePlayer?.color }}
                />
                <span
                  className="font-bold truncate"
                  style={{ color: activePlayer?.color }}
                >
                  {activePlayer?.username || 'Jucător'}
                </span>
              </div>
            )}
          </div>

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

      {/* ============================================================
          DESKTOP & TABLET LANDSCAPE HUD (>= 768px)
          3-column balanced header: Left Turn | Center Tracker | Right Controls
      ============================================================ */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-stone-800 bg-stone-900/90 px-4 py-1.5 shadow-xl backdrop-blur-xl">
        {/* Left: Turn Status */}
        <div className="flex items-center justify-start min-w-0">
          {isMyTurn ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-500/25 px-3 py-1 font-serif text-xs font-black uppercase tracking-wider text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.5)] animate-pulse whitespace-nowrap">
              <Swords className="h-3.5 w-3.5 shrink-0" /> RÂNDUL TĂU!
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-xl border border-stone-800 bg-stone-950 px-3 py-1 text-xs min-w-0">
              <span className="text-stone-400 shrink-0">Rândul lui:</span>
              <span
                className="font-bold flex items-center gap-1.5 min-w-0"
                style={{ color: activePlayer?.color }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: activePlayer?.color }}
                />
                <span className="truncate max-w-[140px]">
                  {activePlayer?.username || 'Jucător'}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Center: Authentic Conquiztador Round Tracker */}
        <div className="flex justify-center shrink-0">
          <RoundTracker
            phase={game.phase}
            currentRound={game.round}
            maxRounds={game.maxRounds}
            players={game.players}
            activePlayerIndex={game.activePlayerIndex}
          />
        </div>

        {/* Right: Sound & Action Controls */}
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

      {/* ============================================================
          PLAYERS STRIP
          - 2 players: 2-column grid
          - 3 players: 3-column grid
          - 4 players: 2 columns on mobile/tablet, 4 columns on desktop
          - 5–10 players: Horizontal scroll-snap carousel on mobile/tablet,
            adaptive 5-column readable grid on desktop (lg:grid-cols-5)
      ============================================================ */}
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
          {/* Mobile & Tablet Carousel with scroll-snap for 5–10 players */}
          <div className="lg:hidden">
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-2 pb-1 no-scrollbar">
              {game.players.map((player, index) => renderPlayerCard(player, index, true))}
            </div>
          </div>

          {/* Desktop & Laptop Readable Grid for 5–10 players (5 per row -> generous width for usernames & stats) */}
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
